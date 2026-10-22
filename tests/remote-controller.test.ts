import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { CONTROLLER_HEARTBEAT_WRITE_MS, CONTROLLER_LEASE_MS, controllerIsConnected, controllerSessionView, controllerUrl, parseControllerToken, parseRemoteCommand, REMOTE_CONTROLLER_POLL_MS, REMOTE_HOST_POLL_MS, remoteCommandDisposition, remoteCommandFeedback, remoteCommandNames, sanitizeRemoteSnapshot } from "../app/domain/remote-controller.ts";

test("accetta soltanto comandi remoti noti e idempotenti", () => {
  assert.deepEqual(parseRemoteCommand({ clientEventId: "event-123456", command: "shuffle" }), { clientEventId: "event-123456", command: "shuffle" });
  assert.deepEqual(parseRemoteCommand({ clientEventId: "event-123457", command: "help", payload: { label: "Gesto" } }), { clientEventId: "event-123457", command: "help", payload: { label: "Gesto" } });
  assert.equal(parseRemoteCommand({ clientEventId: "short", command: "next" }), null);
  assert.equal(parseRemoteCommand({ clientEventId: "event-123456", command: "delete" }), null);
});

test("la pausa impedisce di modificare il turno anche con comandi già in coda", () => {
  const allowedDuringPause = new Set(["pause", "resume", "end", "toggle_audio"]);
  for (const command of remoteCommandNames) {
    assert.equal(remoteCommandDisposition(command, true), allowedDuringPause.has(command) ? "execute" : "ignore", command);
    assert.equal(remoteCommandDisposition(command, false), "execute", command);
  }
  assert.equal(remoteCommandDisposition("next", true, true), "ignore", "la pausa prevale anche sulla conferma di una transizione");
});

test("il telefono conferma la transizione senza saltare il primo turno dell'esercizio", () => {
  assert.equal(remoteCommandDisposition("next", false, true), "continue");
  assert.equal(remoteCommandDisposition("next_activity", false, true), "continue");
  assert.equal(remoteCommandDisposition("previous", false, true), "execute");
  const snapshot = sanitizeRemoteSnapshot({ sessionId: "session-1", childName: "Demo", sessionTitle: "Sequenza", exerciseTitle: "Trova", exerciseKind: "recognition", prompt: "Mela", currentIndex: 0, total: 4, answerState: "idle", soundEffects: true, paused: false, awaitingNextExercise: true, updatedAt: 1 });
  assert.equal(snapshot?.awaitingNextExercise, true, "lo stato della transizione arriva alla console");
});

test("la presenza del controller scade dopo il lease", () => {
  const now = 1_000_000;
  assert.equal(controllerIsConnected("connected", now - CONTROLLER_LEASE_MS + 1, now), true);
  assert.equal(controllerIsConnected("connected", now - CONTROLLER_LEASE_MS, now), false);
  assert.equal(controllerIsConnected("pending", now, now), false);
});

test("usa polling rapido ma conserva un lease tollerante e descrive il feedback", () => {
  assert.ok(REMOTE_HOST_POLL_MS <= 500);
  assert.ok(REMOTE_CONTROLLER_POLL_MS <= 750);
  assert.ok(CONTROLLER_LEASE_MS >= REMOTE_CONTROLLER_POLL_MS * 10);
  assert.ok(CONTROLLER_HEARTBEAT_WRITE_MS > REMOTE_CONTROLLER_POLL_MS);
  assert.ok(CONTROLLER_HEARTBEAT_WRITE_MS < CONTROLLER_LEASE_MS);
  assert.equal(remoteCommandFeedback("next"), "Passo successivo");
  assert.equal(remoteCommandFeedback("help", { label: "Gesto" }), "Aiuto: Gesto");
});

test("costruisce e riconosce un link QR senza dati del bambino", () => {
  const token = "a".repeat(64);
  const url = controllerUrl("https://lettura.example/", token);
  assert.equal(url, `https://lettura.example/?controller=${token}`);
  assert.equal(parseControllerToken(`?controller=${token}`), token);
  assert.equal(parseControllerToken("?controller=bad"), null);
  assert.equal(url.includes("child"), false);
});

test("valida lo snapshot minimo mostrato nella console", () => {
  const snapshot = sanitizeRemoteSnapshot({ sessionId: "session-1", childName: "Demo", sessionTitle: "Sequenza", exerciseTitle: "Trova", exerciseKind: "recognition", prompt: "Mela", currentIndex: 0, total: 4, answerState: "idle", soundEffects: true, paused: false, updatedAt: 1 });
  assert.equal(snapshot?.prompt, "Mela");
  assert.equal(sanitizeRemoteSnapshot({ sessionId: "session-1", currentIndex: -1 }), null);
});

test("la console scarta la pausa precedente quando la sessione è chiusa o scollegata", () => {
  const snapshot = sanitizeRemoteSnapshot({ sessionId: "session-1", childName: "Demo", sessionTitle: "Sequenza", exerciseTitle: "Trova", exerciseKind: "recognition", prompt: "Mela", currentIndex: 0, total: 4, answerState: "idle", soundEffects: true, paused: true, updatedAt: 1 });
  assert.ok(snapshot);
  assert.deepEqual(controllerSessionView({ status: "connected", connected: true, snapshot }), { status: "connected", snapshot });
  assert.deepEqual(controllerSessionView({ status: "closed", connected: false, snapshot }), { status: "closed", snapshot: null });
  assert.deepEqual(controllerSessionView({ status: "closed", connected: true, snapshot }), { status: "closed", snapshot: null });
  assert.deepEqual(controllerSessionView({ status: "connected", connected: false, snapshot }), { status: "lost", snapshot: null });
  assert.deepEqual(controllerSessionView({ status: "waiting", connected: false }), { status: "lost", snapshot: null });
});

test("la migrazione conserva un solo controller e rende idempotenti i comandi", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(readFileSync(new URL("../drizzle/0011_remote_session_controller.sql", import.meta.url), "utf8"));
  database.prepare(`INSERT INTO remote_controller_sessions
    (account_id, session_id, child_id, owner_adult_id, pairing_token_hash, pairing_expires_at, status, controller_key_hash, latest_sequence, snapshot_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'connected', ?, 0, '{}', ?, ?)`)
    .run("account-1", "session-1", "child-1", "adult-1", "token-1", 99_999, "phone-1", 1, 1);

  database.prepare("UPDATE remote_controller_sessions SET status = 'connected', controller_key_hash = ?, controller_last_seen_at = ? WHERE account_id = ? AND session_id = ?")
    .run("phone-2", 2, "account-1", "session-1");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM remote_controller_sessions WHERE controller_key_hash = ?").get("phone-1")?.count, 0);
  assert.equal(database.prepare("SELECT controller_key_hash FROM remote_controller_sessions WHERE account_id = ? AND session_id = ?").get("account-1", "session-1")?.controller_key_hash, "phone-2");

  database.prepare(`INSERT INTO remote_controller_events
    (account_id, session_id, server_sequence, client_event_id, adult_id, origin, command, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, 'mobile', 'next', '{}', ?)`)
    .run("account-1", "session-1", 1, "event-1", "adult-1", 2);
  assert.throws(() => database.prepare(`INSERT INTO remote_controller_events
    (account_id, session_id, server_sequence, client_event_id, adult_id, origin, command, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, 'mobile', 'next', '{}', ?)`)
    .run("account-1", "session-1", 2, "event-1", "adult-1", 3));
  database.close();
});

test("il join conserva l'adulto autenticato e l'ultimo telefono può inviare comandi", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(readFileSync(new URL("../drizzle/0011_remote_session_controller.sql", import.meta.url), "utf8"));
    database.prepare(`INSERT INTO remote_controller_sessions
      (account_id, session_id, child_id, owner_adult_id, pairing_token_hash, pairing_expires_at, status, latest_sequence, snapshot_json, created_at, updated_at)
      VALUES ('account-1', 'session-1', 'child-1', 'host-adult', 'token-1', 99999, 'waiting', 0, '{}', 1, 1)`).run();
    const pairingRoute = readFileSync(new URL("../app/api/controller/pairing/route.ts", import.meta.url), "utf8");
    const joinSql = pairingRoute.match(/prepare\(`(UPDATE remote_controller_sessions SET status = 'connected'[\s\S]*?)`\)/)?.[1];
    assert.ok(joinSql, "esegue lo stesso UPDATE del join di produzione");
    const sessionRoute = readFileSync(new URL("../app/api/controller/session/[id]/route.ts", import.meta.url), "utf8");
    const commandSql = sessionRoute.match(/prepare\(`(INSERT INTO remote_controller_events[\s\S]*?)`\)/)?.[1];
    assert.ok(commandSql);

    database.prepare(joinSql).run("controller-adult", "phone-1-hash", 2, 2, "account-1", "session-1");
    const row = database.prepare("SELECT * FROM remote_controller_sessions").get();
    assert.equal(row?.pending_adult_id, "controller-adult", "validateController richiede l'adulto associato al telefono");
    assert.equal(row?.controller_key_hash, "phone-1-hash");
    assert.equal(row?.status, "connected");
    database.prepare(commandSql).run("event-1", "controller-adult", "next", "{}", 3, "account-1", "session-1", "phone-1-hash");
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM remote_controller_events").get()?.count, 1);
    database.prepare("UPDATE remote_controller_sessions SET latest_sequence = 1 WHERE account_id = ? AND session_id = ?").run("account-1", "session-1");

    database.prepare(joinSql).run("second-adult", "phone-2-hash", 4, 4, "account-1", "session-1");
    const replacement = database.prepare("SELECT * FROM remote_controller_sessions").get();
    assert.equal(replacement?.pending_adult_id, "second-adult");
    assert.equal(replacement?.controller_key_hash, "phone-2-hash");
    database.prepare(commandSql).run("event-old-phone", "controller-adult", "next", "{}", 5, "account-1", "session-1", "phone-1-hash");
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM remote_controller_events").get()?.count, 1, "il telefono sostituito non può inviare comandi");
    database.prepare(commandSql).run("event-2", "second-adult", "next", "{}", 5, "account-1", "session-1", "phone-2-hash");
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM remote_controller_events").get()?.count, 2);

    const disconnectSql = sessionRoute.match(/prepare\(`(UPDATE remote_controller_sessions SET status = 'waiting'[\s\S]*?)`\)/)?.[1];
    assert.ok(disconnectSql);
    assert.equal(database.prepare(disconnectSql).run(6, "account-1", "session-1", "phone-1-hash").changes, 0, "il telefono sostituito non può scollegare il nuovo");
    assert.equal(database.prepare(disconnectSql).run(6, "account-1", "session-1", "phone-2-hash").changes, 1);
    const disconnected = database.prepare("SELECT * FROM remote_controller_sessions").get();
    assert.equal(disconnected?.status, "waiting");
    assert.equal(disconnected?.controller_key_hash, null);
    assert.equal(disconnected?.pending_adult_id, null);
    assert.equal(disconnected?.controller_last_seen_at, null);
  } finally {
    database.close();
  }
});
