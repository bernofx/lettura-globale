import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { statePerformanceFixture } from "../tests/fixtures/state-performance.ts";

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
const mf = new Miniflare({ name: "state-read-test", compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"], modules,
  durableObjects: { SESSIONS: { className: "RealtimeSession", useSQLite: true } }, d1Databases: { DB: "synthetic-state-read-d1" } });
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(join("drizzle", file), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) await db.prepare(statement.trim()).run();
    }
  }
  const now = Date.now(), account = "test-account", token = "synthetic-session-token", otherToken = "synthetic-other-token";
  const state = statePerformanceFixture(30);
  state.therapists.push({ id: "adult-other", firstName: "Other", lastName: "", email: "other@example.test", role: "Terapista", childIds: ["child-other"] });
  state.children.push({ id: "child-other", firstName: "Other", lastName: "", birthYear: "", notes: "", avatarColor: "#fff" });
  await db.prepare("INSERT INTO user_states (user_id,email,payload,schema_version,revision,created_at,updated_at) VALUES (?,?,?,1,1,?,?)")
    .bind(account, "demo@example.test", JSON.stringify(state), now, now).run();
  for (const [key, adult] of [[token, "adult"], [otherToken, "adult-other"]]) {
    await db.prepare("INSERT INTO auth_sessions (token_hash,user_id,email,display_name,expires_at,created_at,adult_profile_id) VALUES (?,?,?,?,?,?,?)")
      .bind(createHash("sha256").update(key).digest("hex"), account, "demo@example.test", "Demo", now + 60000, now, adult).run();
  }
  const read = (key, tag) => mf.dispatchFetch("https://app.example/api/state", { headers: { ...(key ? { cookie: `lg-cloud-session=${key}` } : {}), ...(tag ? { "if-none-match": tag } : {}) } });
  const first = await read(token);
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.relationalStatus, "ready");
  assert.equal(body.dataSource, "relational");
  assert.deepEqual(body.state.children.map((child) => child.id), ["child"]);
  assert.equal(body.state.attempts.length, 30);
  const tag = first.headers.get("etag");
  assert.ok(tag);
  const unchanged = await read(token, tag);
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), "");
  assert.equal(unchanged.headers.get("cache-control"), "private, no-store");
  const differentAdult = await read(otherToken, tag);
  assert.equal(differentAdult.status, 200, "nessun 304 fra adulti diversi alla stessa revisione");
  assert.notEqual(differentAdult.headers.get("etag"), tag);
  assert.deepEqual((await differentAdult.json()).state.children.map((child) => child.id), ["child-other"]);
  assert.equal((await read(null, tag)).status, 401, "un validatore non sostituisce l'autenticazione");
  state.children[0].firstName = "Updated";
  await db.prepare("UPDATE user_states SET payload = ?, revision = 2 WHERE user_id = ?").bind(JSON.stringify(state), account).run();
  const updated = await read(token, tag);
  assert.equal(updated.status, 200);
  let nextTag = updated.headers.get("etag");
  assert.notEqual(nextTag, tag);
  const updatedBody = await updated.json();
  assert.equal(updatedBody.state.children[0].firstName, "Updated");
  assert.equal(updatedBody.revision, 2);
  const change = { schemaVersion: 1, operationId: crypto.randomUUID(), baseRevision: 2,
    collections: { helps: { upserts: [{ id: "help-demo", sessionId: "session-0", sessionItemId: "turn-0", exerciseId: "exercise", wordId: "word-0", mode: "test", label: "Gesto", createdAt: new Date(now).toISOString(), childId: "child", therapistId: "adult" }], removedIds: [], order: ["help-demo"] } }, values: {} };
  const save = () => mf.dispatchFetch("https://app.example/api/state/changes", { method: "PATCH", headers: { cookie: `lg-cloud-session=${token}`, "content-type": "application/json" }, body: JSON.stringify(change) });
  const saved = await save();
  const savedBody = await saved.json();
  assert.equal(saved.status, 200, JSON.stringify(savedBody));
  assert.equal(savedBody.writeMode, "direct");
  const retried = await save();
  assert.equal(retried.status, 200);
  assert.equal((await retried.json()).idempotent, true);
  const afterWrite = await read(token, nextTag);
  assert.equal(afterWrite.status, 200);
  nextTag = afterWrite.headers.get("etag");
  const afterWriteBody = await afterWrite.json();
  assert.equal(afterWriteBody.revision, 3);
  assert.equal(afterWriteBody.dataSource, "relational");
  assert.equal(afterWriteBody.state.helps.length, 1);
  assert.equal(afterWriteBody.state.attempts.length, 30, "la scrittura granulare non modifica i tentativi");
  // A missing relational leaf would break a full read: 304 must only read auth + revision.
  await db.prepare("DROP TABLE session_item_help_labels").run();
  assert.equal((await read(token, nextTag)).status, 304);
  const fallback = await read(token);
  assert.equal(fallback.status, 200);
  assert.equal(fallback.headers.get("etag"), null, "un fallback pending non blocca i futuri tentativi di riparazione");
  assert.equal((await fallback.json()).relationalStatus, "pending");
  console.log("PASS: API completa, dati relazionali, 304 leggero, ruoli isolati, autenticazione, revisioni, scritture idempotenti e fallback riparabile.");
} finally { await mf.dispose(); }
