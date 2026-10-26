import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildStateChange } from "../app/domain/state-changes.ts";

const require = createRequire(import.meta.resolve("wrangler/package.json"));
const { Miniflare } = require("miniflare");
const root = resolve("dist/server"), modules = [];
function collect(directory = "") {
  for (const item of readdirSync(join(root, directory), { withFileTypes: true })) {
    const name = directory ? `${directory}/${item.name}` : item.name;
    if (item.isDirectory()) collect(name);
    else if (/\.m?js$/.test(name)) modules.push({ type: "ESModule", path: name, contents: readFileSync(join(root, name), "utf8") });
  }
}
collect();
modules.sort((a, b) => a.path === "index.js" ? -1 : b.path === "index.js" ? 1 : a.path.localeCompare(b.path));
const mf = new Miniflare({ name: "sharing-test", compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"], modules,
  durableObjects: { SESSIONS: { className: "RealtimeSession", useSQLite: true } }, d1Databases: { DB: "synthetic-sharing-d1" } });
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(join("drizzle", file), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) await db.prepare(statement.trim()).run();
    }
  }
  const now = Date.now(), account = "demo-sharing", token = "synthetic-sharing-session";
  const library = [
    { id: "old-dog", word: "Cane", category: "Animali", emoji: "🐕", source: "Catalogo demo", license: "CC0 demo", deleted: true },
    { id: "new-dog", word: "Cane", category: "Animali", article: "IL", remoteImageId: "test-dog", privateUpload: true, source: "Test", license: "CC0" },
    { id: "mela", word: "Mela", category: "Cibi", article: "LA", emoji: "🍎", source: "Test", license: "CC0" },
    { id: "gatto", word: "Gatto", category: "Animali", article: "IL", emoji: "🐈", source: "Test", license: "CC0" },
  ];
  const fixed = { id: "fixed", title: "Trova", kind: "recognition", promptId: "old-dog", optionIds: ["old-dog", "mela"], updatedAt: "2026-10-26T12:00:00Z" };
  const random = { id: "random", title: "Casuale", kind: "recognition", recognitionMode: "random", promptId: "", optionIds: [], distractorCount: 1, distractorSource: "same-category", rounds: 2, updatedAt: "2026-10-26T12:00:00Z" };
  const quantity = { id: "quantity", title: "Conta", kind: "number-quantity", optionIds: [], rounds: 2, updatedAt: "2026-10-26T12:00:00Z" };
  const state = { schemaVersion: 1, therapists: [{ id: "adult", firstName: "Demo", role: "Amministratore", childIds: [] }], children: [],
    library, exercises: [fixed, random, quantity], sequences: [{ id: "sequence", title: "Demo", therapistId: "adult", exerciseIds: ["fixed", "random", "quantity"] }], attempts: [], helps: [], sessionHistory: [] };
  await db.prepare("INSERT INTO user_states (user_id,email,payload,schema_version,revision,created_at,updated_at) VALUES (?,?,?,1,1,?,?)")
    .bind(account, "demo@example.test", JSON.stringify(state), now, now).run();
  await db.prepare("INSERT INTO auth_sessions (token_hash,user_id,email,display_name,expires_at,created_at,adult_profile_id) VALUES (?,?,?,?,?,?,?)")
    .bind(createHash("sha256").update(token).digest("hex"), account, "demo@example.test", "Demo", now + 600000, now, "adult").run();
  const cookie = `lg-cloud-session=${token}`;
  const request = (path, init) => mf.dispatchFetch(`https://app.example${path}`, init);
  const share = (revision, id = "sequence", kind = "sequence") => request("/api/shared-launch", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ kind, id, revision }) });
  const read = () => request("/api/state", { headers: { cookie } });
  assert.equal((await read()).status, 200);
  const first = await share(1);
  assert.equal(first.status, 201);
  const firstToken = (await first.json()).token;
  const publicFirst = await request(`/api/shared-launch/${firstToken}`);
  assert.equal(publicFirst.status, 200, "public preview requires no login");
  const firstPayload = await publicFirst.json();
  assert.equal(firstPayload.exercises[0].promptId, "new-dog");
  assert.deepEqual(firstPayload.exercises[0].optionIds, ["new-dog", "mela"]);
  assert.equal(firstPayload.library.some((item) => item.id === "old-dog"), false);
  const photo = firstPayload.library.find((item) => item.id === "new-dog");
  assert.ok(photo.image.startsWith(`/api/shared-launch/${firstToken}/media/`));
  assert.equal(photo.remoteImageId, undefined);
  assert.equal(firstPayload.therapists, undefined);
  assert.equal(firstPayload.attempts, undefined);
  const count = await db.prepare("SELECT count(*) AS n FROM shared_launches").first("n");
  assert.equal((await share(2)).status, 409, "cannot share an expected revision not yet saved");
  assert.equal(await db.prepare("SELECT count(*) AS n FROM shared_launches").first("n"), count);
  const before = await (await read()).json();
  const updated = { ...before.state,
    exercises: before.state.exercises.map((exercise) => exercise.id === "random" ? { ...exercise, distractorSource: "mixed", distractorCount: 2 } : exercise),
    sequences: before.state.sequences.map((sequence) => ({ ...sequence, exerciseIds: ["random", "quantity"] })),
  };
  const patch = await request("/api/state/changes", { method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(buildStateChange(before.state, updated, crypto.randomUUID(), before.revision)) });
  assert.equal(patch.status, 200);
  const revision = (await patch.json()).revision;
  const fresh = await share(revision);
  assert.equal(fresh.status, 201);
  const freshPayload = await (await request(`/api/shared-launch/${(await fresh.json()).token}`)).json();
  assert.equal(freshPayload.exercises.length, 2);
  assert.equal(freshPayload.exercises[0].id, "random");
  assert.equal(freshPayload.exercises[0].recognitionMode, "random");
  assert.equal(freshPayload.exercises[0].distractorSource, "mixed");
  assert.equal((await share(before.revision)).status, 409, "stale revisions do not mint an old snapshot");
  const oldToken = "00000000-0000-4000-8000-000000000123";
  const brokenPayload = { schemaVersion: 1, kind: "exercise", title: "Incomplete", exercises: [fixed], library: library.filter((item) => !item.deleted) };
  await db.prepare("INSERT INTO shared_launches (token,owner_user_id,kind,content_id,payload,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(oldToken, account, "exercise", "fixed", JSON.stringify(brokenPayload), now, now, now + 600000).run();
  const oldResponse = await request(`/api/shared-launch/${oldToken}`);
  assert.equal(oldResponse.status, 422);
  assert.equal((await oldResponse.json()).error, "incomplete_preview");
  assert.equal(await db.prepare("SELECT payload FROM shared_launches WHERE token=?").bind(oldToken).first("payload"), JSON.stringify(brokenPayload), "old snapshots stay immutable");
  const categoriesBefore = await (await read()).json();
  const categoryExercise = { id: "categories", title: "Categorie visuali", kind: "word-categories", optionIds: [], categoryNames: ["Animali", "Cibi"], categoryItemIds: ["new-dog", "mela"], categoryShowSymbols: true, categoryShowTargetImage: true, categorySpeakWord: true, rounds: 2, updatedAt: new Date().toISOString() };
  const categoryState = { ...categoriesBefore.state,
    categorySymbols: { Animali: "symbol-animals", Cibi: "symbol-food", "Non condivisa": "private-symbol" },
    library: [...categoriesBefore.state.library,
      { id: "symbol-animals", word: "Animali", category: "Simboli", remoteImageId: "test-symbol", categorySymbolOnly: true, source: "Test", license: "CC0", author: "Demo" },
      { id: "symbol-food", word: "Cibi", category: "Simboli", emoji: "🍽", categorySymbolOnly: true, source: "Test", license: "CC0", author: "Demo" },
      { id: "private-symbol", word: "Privato", category: "Privato", emoji: "📕", categorySymbolOnly: true, source: "Test", license: "CC0", author: "Demo" }],
    exercises: [...categoriesBefore.state.exercises, categoryExercise] };
  const categoryWrite = await request("/api/state/changes", { method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(buildStateChange(categoriesBefore.state, categoryState, crypto.randomUUID(), categoriesBefore.revision)) });
  assert.equal(categoryWrite.status, 200);
  const categoryRevision = (await categoryWrite.json()).revision;
  const categoryReload = await (await read()).json();
  assert.deepEqual(categoryReload.state.categorySymbols, categoryState.categorySymbols);
  assert.equal(categoryReload.dataSource, "relational", JSON.stringify(await (await request("/api/state/relational-status", { headers: { cookie } })).json()));
  assert.equal(categoryReload.state.exercises.find((item) => item.id === "categories").categorySpeakWord, true);
  const categoryShare = await share(categoryRevision, "categories", "exercise");
  assert.equal(categoryShare.status, 201);
  const categoryToken = (await categoryShare.json()).token;
  const categoryPublic = await request(`/api/shared-launch/${categoryToken}`);
  assert.equal(categoryPublic.status, 200);
  const categoryPayload = await categoryPublic.json();
  assert.deepEqual(categoryPayload.exercises[0].categorySymbolIds, { Animali: "symbol-animals", Cibi: "symbol-food" });
  assert.equal(categoryPayload.library.some((item) => item.id === "private-symbol"), false);
  assert.ok(categoryPayload.library.find((item) => item.id === "symbol-animals").image.includes(categoryToken));
  const missingSymbols = { ...categoryReload.state, categorySymbols: { Animali: "symbol-animals" } };
  const missingWrite = await request("/api/state/changes", { method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(buildStateChange(categoryReload.state, missingSymbols, crypto.randomUUID(), categoryReload.revision)) });
  assert.equal(missingWrite.status, 200);
  assert.equal((await share((await missingWrite.json()).revision, "categories", "exercise")).status, 422);
  assert.equal((await request(`/api/shared-launch/${categoryToken}`)).status, 200, "old shared category mappings remain frozen");
  const latest = await (await read()).json();
  const invalid = { ...latest.state, exercises: [...latest.state.exercises, { ...fixed, id: "invalid", promptId: "missing", optionIds: ["missing", "mela"] }] };
  const writeInvalid = await request("/api/state/changes", { method: "PATCH", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(buildStateChange(latest.state, invalid, crypto.randomUUID(), latest.revision)) });
  assert.equal(writeInvalid.status, 200);
  const invalidRevision = (await writeInvalid.json()).revision;
  const invalidShare = await share(invalidRevision, "invalid", "exercise");
  assert.equal(invalidShare.status, 422);
  assert.equal((await invalidShare.json()).error, "incomplete_exercise");
  console.log("PASS: flush/revision contract, unique placeholder repair, random settings, exercise removal, public access, invalid-content rejection and immutable old links.");
} finally { await mf.dispose(); }
