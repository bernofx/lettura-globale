import { env } from "cloudflare:workers";
import { scheduledImagePreview } from "../../domain/scheduled-image-preview";
import { hashText } from "../../domain/sha256";
import { parseScheduledWords, scheduledId, scheduledImageMetadata, type ScheduledImageRequest } from "../../domain/scheduled-images";
import { imageGenerationConfig, imageGenerationUsage, imageProposalDigest, sendImageJobs, wordsWithImages, type ScheduledImageJob } from "../../server/scheduled-image-jobs";
import { noStoreJson } from "../controller/_shared";
import { readQueueBody, requestFields, scheduledImagesAdmin } from "./_shared";

async function queue(db: D1Database, accountId: string) {
  const [items, worker] = await db.batch<ScheduledImageRequest | { enabled: number }>([
    db.prepare(`SELECT ${requestFields} FROM scheduled_image_requests WHERE account_id = ?
      ORDER BY CASE WHEN status IN ('queued', 'processing', 'generated', 'approved', 'pull_request', 'needs_review', 'failed') THEN 0 ELSE 1 END,
        updated_at DESC, id
      LIMIT 100`).bind(accountId),
    db.prepare("SELECT 1 AS enabled FROM scheduled_image_workers WHERE account_id = ?").bind(accountId),
  ]);
  const config = imageGenerationConfig(env);
  const generation = config?.accountId === accountId ? await imageGenerationUsage(db, config.limit) : null;
  return { requests: items.results as ScheduledImageRequest[], publisherConfigured: worker.results.length > 0, generation, accountId };
}

export async function GET(request: Request) {
  const access = await scheduledImagesAdmin(request);
  if (access instanceof Response) return access;
  const id = new URL(request.url).searchParams.get("preview");
  if (id === null) return noStoreJson(await queue(access.db, access.accountId));
  if (!scheduledId.test(id)) return noStoreJson({ error: "invalid_request" }, { status: 400 });
  const proposal = await access.db.prepare(`SELECT word, metadata, image_base64 AS image, proposal_digest AS digest
    FROM scheduled_image_requests WHERE id = ? AND account_id = ? AND status = 'generated'`)
    .bind(id, access.accountId).first<{ word: string; metadata: string; image: string; digest: string }>();
  const preview = proposal && scheduledImagePreview(proposal.image);
  return proposal && preview ? noStoreJson({ ...proposal, imageType: preview.imageType })
    : noStoreJson({ error: "request_changed" }, { status: 409 });
}

export async function POST(request: Request) {
  const access = await scheduledImagesAdmin(request);
  if (access instanceof Response) return access;
  const { db, accountId } = access;
  const body = await readQueueBody(request).catch(() => null);
  if (!body) return noStoreJson({ error: "invalid_body" }, { status: 400 });
  const now = Date.now();

  if (body.action === "rotate_publisher_key") {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    await db.batch([
      db.prepare(`INSERT INTO scheduled_image_workers (account_id, publisher_hash, created_at) VALUES (?, ?, ?)
        ON CONFLICT (account_id) DO UPDATE SET publisher_hash = excluded.publisher_hash, created_at = excluded.created_at`)
        .bind(accountId, await hashText(token), now),
      db.prepare(`UPDATE scheduled_image_requests SET claim_id = NULL, lease_until = NULL
        WHERE account_id = ? AND lease_until IS NOT NULL AND status IN ('approved', 'pull_request')`).bind(accountId),
    ]);
    return noStoreJson({ ...await queue(db, accountId), token });
  }

  if (body.action === "generate") {
    const config = imageGenerationConfig(env);
    if (!config || config.accountId !== accountId) return noStoreJson({ error: "generation_unavailable" }, { status: 503 });
    let words;
    try { words = parseScheduledWords(body.words); }
    catch { return noStoreJson({ error: "invalid_words" }, { status: 400 }); }
    const images = await wordsWithImages(db, accountId);
    const inserts = await db.batch<ScheduledImageJob & { status: string }>(words.map(({ word, key, detail }) => db.prepare(`
      INSERT INTO scheduled_image_requests (id, account_id, word, word_key, detail, status, generation_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (account_id, word_key) DO UPDATE SET
        word = excluded.word, detail = excluded.detail, status = excluded.status, message = '',
        pr_number = NULL, pr_head = NULL, metadata = NULL, image_base64 = NULL, proposal_digest = NULL,
        generation_id = excluded.generation_id, dispatched_at = NULL, claim_id = NULL, lease_until = NULL, updated_at = excluded.updated_at
      WHERE scheduled_image_requests.status IN ('cancelled', 'needs_review', 'failed')
      RETURNING id, generation_id AS generationId, status
    `).bind(crypto.randomUUID(), accountId, word, key, detail, images.has(key) ? "existing" : "queued", crypto.randomUUID(), now, now)));
    const accepted = inserts.flatMap(result => result.results);
    const jobs = accepted.filter(item => item.status === "queued").map(({ id, generationId }) => ({ id, generationId }));
    let dispatchDelayed = false;
    try { await sendImageJobs(db, config.queue, jobs); }
    catch { dispatchDelayed = true; }
    return noStoreJson({ ...await queue(db, accountId), accepted: accepted.length, submitted: words.length, dispatchDelayed });
  }

  if (body.action === "approve" && typeof body.id === "string" && typeof body.digest === "string") {
    const match = "account_id = ? AND id = ? AND status = 'generated' AND proposal_digest = ?";
    const binds = [accountId, body.id, body.digest] as const;
    const proposal = await db.prepare(`SELECT word, image_base64 AS image FROM scheduled_image_requests WHERE ${match}`)
      .bind(...binds).first<{ word: string; image: string }>();
    if (!proposal) return noStoreJson({ error: "request_changed" }, { status: 409 });
    const metadata = scheduledImageMetadata(proposal.word, body.metadata);
    if (!metadata) return noStoreJson({ error: "invalid_metadata" }, { status: 422 });
    const digest = await imageProposalDigest(metadata, proposal.image);
    const result = await db.prepare(`UPDATE scheduled_image_requests
      SET status = 'approved', metadata = ?, proposal_digest = ?, updated_at = ? WHERE ${match}`)
      .bind(JSON.stringify(metadata), digest, now, ...binds).run();
    if (!result.meta.changes) return noStoreJson({ error: "request_changed" }, { status: 409 });
    return noStoreJson(await queue(db, accountId));
  }

  if (body.action === "cancel" && typeof body.id === "string") {
    const result = await db.prepare(`
      UPDATE scheduled_image_requests SET status = 'cancelled', message = '', metadata = NULL, image_base64 = NULL, proposal_digest = NULL,
        claim_id = NULL, lease_until = NULL, updated_at = ?
      WHERE account_id = ? AND id = ? AND status IN ('queued', 'generated', 'approved', 'needs_review', 'failed')
        AND (lease_until IS NULL OR lease_until <= ?)
    `).bind(now, accountId, body.id, now).run();
    if (!result.meta.changes) return noStoreJson({ error: "request_changed" }, { status: 409 });
    return noStoreJson(await queue(db, accountId));
  }

  return noStoreJson({ error: "invalid_action" }, { status: 400 });
}
