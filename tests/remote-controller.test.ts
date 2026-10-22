import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { CONTROLLER_HEARTBEAT_WRITE_MS, CONTROLLER_LEASE_MS, controllerIsConnected, controllerUrl, parseControllerToken, parseRemoteCommand, REMOTE_CONTROLLER_POLL_MS, REMOTE_HOST_POLL_MS, remoteCommandFeedback, sanitizeRemoteSnapshot } from "../app/domain/remote-controller.ts";

test("accetta soltanto comandi remoti noti e idempotenti", () => {
  assert.deepEqual(parseRemoteCommand({ clientEventId: "event-123456", command: "shuffle" }), { clientEventId: "event-123456", command: "shuffle" });
  assert.deepEqual(parseRemoteCommand({ clientEventId: "event-123457", command: "help", payload: { label: "Gesto" } }), { clientEventId: "event-123457", command: "help", payload: { label: "Gesto" } });
  assert.equal(parseRemoteCommand({ clientEventId: "short", command: "next" }), null);
  assert.equal(parseRemoteCommand({ clientEventId: "event-123456", command: "delete" }), null);
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
