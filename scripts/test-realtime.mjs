import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.resolve("wrangler/package.json"));
const { Miniflare } = require("miniflare");
const out = mkdtempSync(join(tmpdir(), "lg-do-test-"));
const build = spawnSync("pnpm", ["exec", "wrangler", "deploy", "--config", "realtime/wrangler.jsonc", "--dry-run", "--outdir", out], {
  stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false" },
});
assert.equal(build.status, 0, "il Worker deve compilare prima delle prove");
const mf = new Miniflare({
  workers: [
    { name: "realtime", compatibilityDate: "2026-05-15", modules: [{ type: "ESModule", path: "worker.js", contents: readFileSync(join(out, "worker.js"), "utf8") }],
      bindings: { ALLOWED_ORIGIN: "https://app.example" }, durableObjects: { SESSIONS: { className: "RealtimeSession", useSQLite: true } }, d1Databases: { DB: "test-controller-d1" } },
    { name: "app", compatibilityDate: "2026-05-15", modules: [{ type: "ESModule", path: "app.js", contents: `export default { async fetch(request, env) { return Response.json(await env.REALTIME.request(await request.json())); } }` }], serviceBindings: { REALTIME: "realtime" } },
  ],
});
const sockets = [];
try {
  const database = await mf.getD1Database("DB", "realtime");
  const migration = readFileSync(new URL("../drizzle/0011_remote_session_controller.sql", import.meta.url), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) await database.prepare(statement.trim()).run();
  await database.prepare("CREATE TABLE audit_events (id TEXT PRIMARY KEY, account_id TEXT, adult_id TEXT, action TEXT, entity_type TEXT, entity_id TEXT, created_at INTEGER)").run();
  const app = await mf.getWorker("app");
  const realtime = { fetch: (...args) => mf.dispatchFetch(...args) };
  const identity = { accountId: "demo-account", adultId: "adult-host" };
  const sessionId = "session-demo-123";
  const call = async (input) => {
    const response = await app.fetch("https://app.example/", { method: "POST", body: JSON.stringify({ identity, sessionId, ...input }) });
    return response.json();
  };
  const snapshot = { sessionId, childName: "Demo", sessionTitle: "Demo", exerciseTitle: "Trova", exerciseKind: "recognition", prompt: "Mela", currentIndex: 0, total: 3, answerState: "idle", soundEffects: true, paused: false, updatedAt: 1 };
  const created = await call({ action: "create", childId: "child-demo", snapshot });
  assert.equal(created.ok, true);
  const controller = { accountId: identity.accountId, adultId: "adult-controller" };
  const key = "a".repeat(64);
  assert.equal((await call({ action: "join", identity: controller, token: "b".repeat(64), controllerKey: key })).ok, false, "un token errato non collega il telefono");
  assert.equal((await call({ action: "join", identity: controller, token: created.token, controllerKey: key })).ok, true);
  assert.equal((await call({ action: "ticket", role: "host", identity: controller })).status, 403, "il controller non può impersonare il PC");
  assert.equal((await call({ action: "inspect", identity: { ...identity, accountId: "other-account" } })).status, 404, "gli account sono isolati");

  const open = async (role, controllerKey, since = 0) => {
    const ticket = await call({ action: "ticket", role, controllerKey, since, identity: role === "host" ? identity : controller });
    assert.equal(ticket.ok, true);
    const url = `https://realtime.example/connect?id=${ticket.objectId}&ticket=${ticket.ticket}`;
    assert.equal((await realtime.fetch(url, { headers: { Upgrade: "websocket", Origin: "https://evil.example" } })).status, 403);
    const response = await realtime.fetch(url, { headers: { Upgrade: "websocket", Origin: "https://app.example" } });
    assert.equal(response.status, 101, response.status === 101 ? undefined : await response.text());
    const ws = response.webSocket;
    sockets.push(ws);
    const messages = [];
    const waiting = new Set();
    ws.addEventListener("message", (event) => { const message = JSON.parse(event.data); messages.push(message); for (const wake of waiting) wake(); });
    const wait = async (predicate, timeoutMs = 3_000) => {
      const existing = messages.find(predicate);
      if (existing) return existing;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { waiting.delete(wake); reject(new Error(`Messaggio non ricevuto: ${JSON.stringify(messages)}`)); }, timeoutMs);
        const wake = () => { const found = messages.find(predicate); if (found) { clearTimeout(timer); waiting.delete(wake); resolve(found); } };
        waiting.add(wake);
      });
    };
    const send = (message) => ws.send(JSON.stringify(message));
    ws.accept();
    assert.equal((await realtime.fetch(url, { headers: { Upgrade: "websocket", Origin: "https://app.example" } })).status, 403, "il ticket è monouso");
    return { ws, wait, send, messages };
  };
  const host = await open("host");
  const phone = await open("controller", key);
  await phone.wait((message) => message.type === "state" && message.connected);
  await database.prepare(`CREATE TRIGGER test_delayed_snapshot BEFORE UPDATE OF snapshot_json ON remote_controller_sessions
    WHEN json_extract(NEW.snapshot_json, '$.prompt') = 'Pera'
    BEGIN SELECT RAISE(ABORT, 'synthetic_snapshot_mirror_unavailable'); END`).run();
  host.send({ type: "sync", snapshot: { ...snapshot, prompt: "Pera", currentIndex: 1, awaitingNextExercise: true } });
  await phone.wait((message) => message.type === "state" && message.snapshot?.prompt === "Pera" && message.snapshot.awaitingNextExercise);
  phone.send({ type: "command", command: { clientEventId: "event-demo-1", command: "next" } });
  const ack = await phone.wait((message) => message.type === "ack" && message.clientEventId === "event-demo-1");
  assert.equal(ack.serverSequence, 1);
  await host.wait((message) => message.type === "events" && message.events.some((event) => event.serverSequence === 1));
  const staleMirror = await database.prepare("SELECT snapshot_json FROM remote_controller_sessions WHERE session_id = ?").bind(sessionId).first();
  assert.equal(JSON.parse(staleMirror.snapshot_json).prompt, "Mela", "un mirror D1 guasto non blocca snapshot realtime, audit o comandi");
  await database.prepare("DROP TRIGGER test_delayed_snapshot").run();
  host.send({ type: "sync", snapshot: { ...snapshot, prompt: "Pera", currentIndex: 1, awaitingNextExercise: true, updatedAt: 2 } });
  await phone.wait((message) => message.type === "state" && message.snapshot?.updatedAt === 2);
  let mirrorRecovered = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const row = await database.prepare("SELECT snapshot_json FROM remote_controller_sessions WHERE session_id = ?").bind(sessionId).first();
    if (JSON.parse(row.snapshot_json).prompt === "Pera") { mirrorRecovered = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(mirrorRecovered, true, "il mirror converge dopo il ripristino D1");
  host.send({ type: "applied", clientEventId: "event-demo-1", serverSequence: 1, hostMs: 7 });
  await phone.wait((message) => message.type === "applied" && message.clientEventId === "event-demo-1" && message.hostMs === 7);
  phone.send({ type: "applied", clientEventId: "forged-applied", serverSequence: 1, hostMs: 0 });
  await phone.wait((message) => message.type === "error" && message.error === "invalid_command");
  phone.send({ type: "command", command: { clientEventId: "event-demo-1", command: "next" } });
  phone.send({ type: "command", command: { clientEventId: "event-pause", command: "pause" } });
  await phone.wait((message) => message.type === "ack" && message.clientEventId === "event-pause");
  phone.send({ type: "command", command: { clientEventId: "event-blocked", command: "previous" } });
  await phone.wait((message) => message.type === "error" && message.clientEventId === "event-blocked");
  phone.send({ type: "command", command: { clientEventId: "event-resume", command: "resume" } });
  await phone.wait((message) => message.type === "ack" && message.clientEventId === "event-resume");
  const count = await database.prepare("SELECT COUNT(*) AS count FROM remote_controller_events").first();
  assert.equal(count.count, 3, "retry idempotente e comando in pausa non duplicano eventi");

  const heartbeat = setInterval(() => host.send({ type: "ping" }), 2_000);
  try {
    await host.wait((message) => message.type === "state" && message.status === "connected" && !message.connected, 12_000);
    phone.messages.length = 0;
    phone.send({ type: "ping" });
    await phone.wait((message) => message.type === "state" && message.connected);
  } finally { clearInterval(heartbeat); }

  const reconnectedHost = await open("host", undefined, 1);
  const replay = await reconnectedHost.wait((message) => message.type === "events" && message.events.length === 2);
  assert.deepEqual(replay.events.map((event) => event.serverSequence), [2, 3]);
  const secondKey = "c".repeat(64);
  assert.equal((await call({ action: "join", identity: controller, token: created.token, controllerKey: secondKey })).ok, true);
  await phone.wait((message) => message.type === "replaced");
  assert.equal((await call({ action: "ticket", role: "controller", identity: controller, controllerKey: key })).status, 403);
  assert.equal((await call({ action: "disconnect", identity: controller, controllerKey: key })).status, 403, "il vecchio telefono non può scollegare il nuovo");
  const secondPhone = await open("controller", secondKey);
  await secondPhone.wait((message) => message.type === "state" && message.connected);
  assert.equal((await call({ action: "disconnect", identity: controller, controllerKey: secondKey })).ok, true);
  await reconnectedHost.wait((message) => message.type === "state" && message.status === "waiting" && !message.connected);
  assert.equal((await call({ action: "ticket", role: "controller", identity: controller, controllerKey: secondKey })).status, 403);
  assert.equal((await call({ action: "join", identity: controller, token: created.token, controllerKey: secondKey })).ok, true);
  const returningPhone = await open("controller", secondKey);
  reconnectedHost.send({ type: "sync", snapshot: { ...snapshot, phase: "ready" } });
  await returningPhone.wait((message) => message.type === "state" && message.snapshot?.phase === "ready");
  for (const command of ["next", "shuffle", "help", "pause", "finish", "toggle_reward"]) {
    returningPhone.send({ type: "command", command: { clientEventId: `not-ready-${command}`, command } });
    await returningPhone.wait((message) => message.type === "error" && message.clientEventId === `not-ready-${command}`);
  }
  returningPhone.send({ type: "command", command: { clientEventId: "start-ready-demo", command: "start" } });
  const started = await returningPhone.wait((message) => message.type === "ack" && message.clientEventId === "start-ready-demo");
  returningPhone.send({ type: "command", command: { clientEventId: "start-ready-demo", command: "start" } });
  await reconnectedHost.wait((message) => message.type === "events" && message.events.some((event) => event.command === "start"));
  reconnectedHost.send({ type: "sync", snapshot: { ...snapshot, canPreviousActivity: true, canNextActivity: false } });
  await returningPhone.wait((message) => message.type === "state" && message.snapshot?.canNextActivity === false);
  returningPhone.send({ type: "command", command: { clientEventId: "already-started-demo", command: "start" } });
  await returningPhone.wait((message) => message.type === "error" && message.clientEventId === "already-started-demo");
  assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM remote_controller_events WHERE command = 'start'").first()).count, 1, "Inizia è idempotente e usa la stessa connessione");
  assert.equal(started.serverSequence, 4);
  returningPhone.messages.length = 0;
  returningPhone.send({ type: "command", command: { clientEventId: "reward-open-demo", command: "toggle_reward" } });
  await returningPhone.wait((message) => message.type === "ack" && message.clientEventId === "reward-open-demo");
  await returningPhone.wait((message) => message.type === "state" && message.snapshot?.rewardActive === true);
  returningPhone.send({ type: "command", command: { clientEventId: "reward-open-demo", command: "toggle_reward" } });
  returningPhone.send({ type: "command", command: { clientEventId: "reward-blocked-next", command: "next" } });
  await returningPhone.wait((message) => message.type === "error" && message.clientEventId === "reward-blocked-next");
  assert.equal((await database.prepare("SELECT COUNT(*) AS count FROM remote_controller_events WHERE command = 'toggle_reward'").first()).count, 1, "un retry non chiude il premio né duplica l'audit");
  returningPhone.messages.length = 0;
  reconnectedHost.send({ type: "sync", snapshot: { ...snapshot, rewardActive: false, canNextActivity: false } });
  await returningPhone.wait((message) => message.type === "state" && message.snapshot?.rewardActive === false);
  for (const [id, active] of [["reward-reopen-demo", true], ["reward-close-demo", false]]) {
    returningPhone.messages.length = 0;
    returningPhone.send({ type: "command", command: { clientEventId: id, command: "toggle_reward" } });
    await returningPhone.wait((message) => message.type === "ack" && message.clientEventId === id);
    await returningPhone.wait((message) => message.type === "state" && message.snapshot?.rewardActive === active);
  }
  returningPhone.send({ type: "command", command: { clientEventId: "event-finish-demo", command: "finish" } });
  await returningPhone.wait((message) => message.type === "ack" && message.clientEventId === "event-finish-demo");
  await reconnectedHost.wait((message) => message.type === "events" && message.events.some((event) => event.command === "finish"));
  assert.equal((await call({ action: "close", role: "host" })).ok, true);
  await returningPhone.wait((message) => message.type === "state" && message.status === "closed" && message.snapshot === null);
  assert.equal((await call({ action: "ticket", role: "controller", identity: controller, controllerKey: secondKey })).status, 410);
  console.log("PASS: DO/WebSocket reale, accesso, ticket monouso, audit atomico, conferma PC protetta, idempotenza, pausa, premio, replay, sostituzione e chiusura.");
} finally {
  for (const socket of sockets) try { socket.close(); } catch { /* Already closed. */ }
  await mf.dispose();
}

if (process.argv.includes("--app-build")) {
  const root = resolve("dist/server");
  const modules = [];
  const collectModules = (directory = "") => {
    for (const item of readdirSync(join(root, directory), { withFileTypes: true })) {
      const name = directory ? `${directory}/${item.name}` : item.name;
      if (item.isDirectory()) collectModules(name);
      else if (/\.m?js$/.test(name)) modules.push({ type: "ESModule", path: name, contents: readFileSync(join(root, name), "utf8") });
    }
  };
  collectModules();
  modules.sort((a, b) => a.path === "index.js" ? -1 : b.path === "index.js" ? 1 : a.path.localeCompare(b.path));
  const main = new Miniflare({
    name: "full-app", compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
    modules,
    durableObjects: { SESSIONS: { className: "RealtimeSession", useSQLite: true } }, d1Databases: { DB: "full-app-test-d1" },
  });
  try {
    const db = await main.getD1Database("DB");
    const migration = readFileSync(new URL("../drizzle/0011_remote_session_controller.sql", import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) await db.prepare(statement.trim()).run();
    const denied = await main.dispatchFetch("https://app.example/api/controller/realtime", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(denied.status, 401, "l'API della build completa richiede autenticazione");
    const ns = await main.getDurableObjectNamespace("SESSIONS");
    const id = ns.idFromName("full-app-demo-session");
    const stub = ns.get(id);
    const identity = { accountId: "demo", adultId: "adult-demo" };
    const sessionId = "session-built-demo";
    const act = async (input) => (await stub.fetch("https://session.internal/internal", { method: "POST", body: JSON.stringify({ identity, sessionId, ...input }) })).json();
    assert.equal((await act({ action: "create", childId: "child-demo", snapshot: { sessionId, childName: "Demo", sessionTitle: "Demo", exerciseTitle: "Trova", exerciseKind: "recognition", prompt: "Mela", currentIndex: 0, total: 2, answerState: "idle", soundEffects: true, paused: false, updatedAt: 1 } })).ok, true);
    const ticket = await act({ action: "ticket", role: "host" });
    const response = await main.dispatchFetch(`https://app.example/api/controller/realtime/connect?id=${id.toString()}&ticket=${ticket.ticket}`, { headers: { Upgrade: "websocket", Origin: "https://app.example" } });
    assert.equal(response.status, 101);
    const ws = response.webSocket;
    const pong = new Promise((resolvePong, reject) => {
      const timeout = setTimeout(() => reject(new Error("La build completa non risponde al WebSocket")), 3_000);
      ws.addEventListener("message", (event) => { if (JSON.parse(event.data).type === "pong") { clearTimeout(timeout); resolvePong(); } });
    });
    ws.accept(); ws.send(JSON.stringify({ type: "ping" })); await pong; ws.close();
    console.log("PASS: build completa dell'app, classe DO esportata, API protetta e upgrade WebSocket sullo stesso dominio.");
  } finally { await main.dispose(); }
}
