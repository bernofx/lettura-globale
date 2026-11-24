import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";
import { MAX_SCHEDULED_WEBP_BYTES, isScheduledWebp, scheduledAssetUrl, scheduledId, scheduledWebpFromBase64, scheduledWordKey } from "../app/domain/scheduled-images.ts";
import { readScheduledCatalog } from "../app/domain/scheduled-catalog.ts";
import { stockItems } from "../app/shared/seed-data.ts";

const repo = "bernofx/lettura-globale";
const api = "https://lettura-globale.bernofx.workers.dev/api/scheduled-images/publisher";
const catalogPath = "app/domain/scheduled-catalog.json";
const shaPattern = /^[0-9a-f]{40}(?![\s\S])/;

function run(command, args, options) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000, ...options }).trim();
}

const git = (...args) => run("git", args);
const gh = (...args) => run("gh", args);
const pull = number => JSON.parse(gh("api", `repos/${repo}/pulls/${number}`));

async function command(body, pending = false) {
  const response = await fetch(api, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.SCHEDULED_IMAGES_PUBLISHER_TOKEN}` },
    body: JSON.stringify(body),
  });
  if (pending && response.status === 425) return false;
  if (!response.ok) throw new Error(`queue_http_${response.status}`);
  return response.json();
}

function normalizeImage(image) {
  const bytes = scheduledWebpFromBase64(image);
  if (!bytes) throw new Error("invalid_approved_image");
  const scratch = mkdtempSync(join(tmpdir(), "scheduled-image-"));
  // The decoders receive fixed local filenames and no publisher credentials.
  const env = { PATH: process.env.PATH };
  try {
    const input = join(scratch, "input.webp");
    const pixels = join(scratch, "image.png");
    const output = join(scratch, "output.webp");
    writeFileSync(input, bytes);
    run("dwebp", ["-quiet", input, "-o", pixels], { env, timeout: 15_000 });
    run("cwebp", ["-quiet", "-q", "86", "-metadata", "none", pixels, "-o", output], { env, timeout: 15_000 });
    const encoded = readFileSync(output);
    if (!isScheduledWebp(encoded)) throw new Error("invalid_normalized_image");
    return encoded;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function createCatalogCommit(proposal, entry, branch) {
  const assetPath = "public" + scheduledAssetUrl(proposal.id);
  const entries = readScheduledCatalog([...JSON.parse(readFileSync(catalogPath, "utf8")), entry]);
  if (existsSync(assetPath) || git("status", "--porcelain")) throw new Error("catalog_checkout_changed");
  const pixels = normalizeImage(proposal.image);
  git("switch", "-c", branch);
  mkdirSync("public/images/scheduled", { recursive: true });
  writeFileSync(assetPath, pixels, { flag: "wx" });
  writeFileSync(catalogPath, JSON.stringify(entries, null, 2) + "\n");
  git("add", "--", catalogPath, assetPath);
  const staged = git("diff", "--name-status", "--cached").split("\n").sort();
  if (staged.join("\n") !== expectedPaths(assetPath)) throw new Error("unexpected_catalog_diff");
  git("-c", "user.name=lettura-globale-publisher", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "commit", "-m", "feat(libreria): pubblica un'immagine approvata");
  git("push", "origin", `HEAD:refs/heads/${branch}`);
}

function openOrResume(proposal, entry, branch) {
  const existing = JSON.parse(gh("api", "--method", "GET", `repos/${repo}/pulls`, "-f", `head=bernofx:${branch}`,
    "-f", "base=main", "-f", "state=all", "-F", "per_page=2"));
  if (existing.length > 1) throw new Error("ambiguous_pull_request");
  if (existing[0]) return { prNumber: existing[0].number, prHead: existing[0].head.sha };
  const remote = git("ls-remote", "origin", `refs/heads/${branch}`);
  if (!remote) createCatalogCommit(proposal, entry, branch);
  const prHead = git("ls-remote", "origin", `refs/heads/${branch}`).split("\t")[0];
  if (!shaPattern.test(prHead)) throw new Error("invalid_catalog_commit");
  verifyCommit({ ...proposal, prHead }, entry, branch);
  const created = JSON.parse(gh("api", "--method", "POST", `repos/${repo}/pulls`, "-f", `head=${branch}`, "-f", "base=main",
    "-f", "title=Libreria: immagine approvata", "-f", "body=Aggiornamento del catalogo da una proposta approvata in Lettura Globale."));
  if (created.head.sha !== prHead) throw new Error("pull_request_changed");
  return { prNumber: created.number, prHead };
}

function expectedPaths(assetPath) {
  return [`A\t${assetPath}`, `M\t${catalogPath}`].join("\n");
}

function verifyCommit(proposal, entry, branch) {
  git("fetch", "--no-tags", "origin", "refs/heads/main:refs/remotes/origin/main", `refs/heads/${branch}`);
  verifyCatalogCommit(proposal.prHead, entry, normalizeImage(proposal.image));
}

export function verifyCatalogCommit(head, entry, normalizedImage, cwd = process.cwd()) {
  if (!shaPattern.test(head) || !scheduledId.test(entry.assetId)) throw new Error("invalid_catalog_commit");
  const git = (...args) => run("git", args, { cwd });
  const assetPath = "public" + scheduledAssetUrl(entry.assetId);
  const parents = git("rev-list", "--parents", "-n", "1", head).split(" ");
  if (parents.length !== 2) throw new Error("invalid_catalog_commit");
  const [, parent] = parents;
  git("merge-base", "--is-ancestor", parent, "origin/main");
  if (git("diff-tree", "--no-commit-id", "--name-status", "-r", parent, head).split("\n").sort().join("\n") !== expectedPaths(assetPath) ||
    !git("ls-tree", head, "--", assetPath).startsWith("100644 blob ") ||
    !git("ls-tree", head, "--", catalogPath).startsWith("100644 blob ")) throw new Error("unexpected_catalog_diff");
  const base = JSON.parse(git("show", `${parent}:${catalogPath}`));
  const expected = JSON.stringify(readScheduledCatalog([...base, entry]), null, 2);
  if (git("show", `${head}:${catalogPath}`) !== expected) throw new Error("unexpected_catalog_contents");
  const image = execFileSync("git", ["show", `${head}:${assetPath}`], { cwd, maxBuffer: MAX_SCHEDULED_WEBP_BYTES + 1 });
  if (!image.equals(normalizedImage)) throw new Error("unexpected_catalog_image");
}

function verifiedPullRequest(proposal, branch) {
  if (!Number.isSafeInteger(proposal.prNumber) || proposal.prNumber < 1 || !shaPattern.test(proposal.prHead ?? "")) throw new Error("invalid_link");
  const pr = pull(proposal.prNumber);
  if (pr.head.sha !== proposal.prHead || pr.base.repo.full_name !== repo || pr.base.ref !== "main" ||
    pr.head.repo?.full_name !== repo || pr.head.ref !== branch) {
    throw new Error("pull_request_changed");
  }
  return pr;
}

async function waitForCi(head, branch) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const runs = JSON.parse(gh("run", "list", "--repo", repo, "--workflow", "ci.yml", "--event", "pull_request", "--commit", head,
      "--limit", "10", "--json", "headSha,headBranch,status,conclusion"));
    const latest = runs.find(run => run.headSha === head && run.headBranch === branch);
    if (latest?.status === "completed") return latest.conclusion === "success";
    await setTimeout(15_000);
  }
  return false;
}

async function publish() {
  if (process.env.GITHUB_REPOSITORY !== repo || process.env.GITHUB_REF !== "refs/heads/main" ||
    !process.env.GH_TOKEN || !/^[a-f0-9]{64}$/.test(process.env.SCHEDULED_IMAGES_PUBLISHER_TOKEN ?? "")) throw new Error("publisher_not_configured");
  const { claimId, proposal } = await command({ action: "claim" });
  if (!proposal) return;
  if (typeof proposal.id !== "string" || !scheduledId.test(proposal.id) || typeof claimId !== "string" || !scheduledId.test(claimId)) {
    throw new Error("invalid_claim");
  }
  const queue = (action, fields = {}, pending = false) => command({ action, id: proposal.id, claimId, ...fields }, pending);
  try {
    if (!/^[a-f0-9]{64}(?![\s\S])/.test(proposal.digest ?? "")) throw new Error("invalid_proposal_digest");
    const branch = `automation/immagine-${proposal.id}-${proposal.digest.slice(0, 16)}`;
    gh("auth", "setup-git");
    const entry = readScheduledCatalog([{ assetId: proposal.id, word: proposal.word, metadata: JSON.parse(proposal.metadata) }])[0];
    const computed = createHash("sha256").update(JSON.stringify([entry.metadata, proposal.image])).digest("hex");
    if (computed !== proposal.digest) throw new Error("proposal_changed");
    if (proposal.status === "approved") {
      const key = scheduledWordKey(entry.word);
      if (stockItems.some(item => item.image && !item.categorySymbolOnly && item.contentKind !== "sentence" && scheduledWordKey(item.word) === key)) {
        if (!await queue("existing", {}, true)) await queue("release", { reason: "deployment_pending" });
        return;
      }
      Object.assign(proposal, openOrResume(proposal, entry, branch));
      await queue("link", { prNumber: proposal.prNumber, prHead: proposal.prHead });
    } else if (proposal.status !== "pull_request") {
      throw new Error("invalid_publication_status");
    }

    const pr = verifiedPullRequest(proposal, branch);
    if (!pr.merged) {
      if (pr.draft || pr.state !== "open" || !await waitForCi(proposal.prHead, pr.head.ref)) {
        await queue("release", { reason: "check_failed" });
        return;
      }
      verifyCommit(proposal, entry, pr.head.ref);
      await queue("renew", { prNumber: proposal.prNumber, prHead: proposal.prHead });
      const merged = JSON.parse(gh("api", "--method", "PUT", `repos/${repo}/pulls/${proposal.prNumber}/merge`,
        "-f", `sha=${proposal.prHead}`, "-f", "merge_method=squash", "-f", "commit_title=Libreria: immagine approvata",
        "-f", "commit_message=Catalogo aggiornato dalla coda di generazione."));
      if (!merged.merged) throw new Error("merge_pending");
      if (!verifiedPullRequest(proposal, branch).merged) throw new Error("merge_pending");
    }
    if (!await queue("confirm", {}, true)) await queue("release", { reason: "deployment_pending" });
    console.log(`Verificata PR #${proposal.prNumber}.`);
  } catch (error) {
    await queue("release", { reason: "unavailable" }).catch(() => {});
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  publish().catch(error => {
    // Do not print tool errors, response bodies, draft text or secrets to Actions logs.
    console.error(error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : "publication_failed");
    process.exitCode = 1;
  });
}
