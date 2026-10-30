import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { storeRealtimeCommand } from "../realtime/command-store.ts";

test("un solo batch atomico registra, ordina e deduplica i comandi prima della conferma", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../drizzle/0011_remote_session_controller.sql", import.meta.url), "utf8"));
  sqlite.exec("INSERT INTO remote_controller_sessions (account_id,session_id,child_id,owner_adult_id,pairing_token_hash,pairing_expires_at,status,controller_key_hash,created_at,updated_at) VALUES ('demo','session','child','adult','token',99999,'connected','key',1,1)");
  let batches = 0, fail = false;
  const db = {
    prepare(sql: string) { return { bind(...args: unknown[]) { return { sql, args }; } }; },
    async batch(statements: { sql: string; args: (string | number | null)[] }[]) {
      batches++;
      sqlite.exec("BEGIN");
      try {
        const result = statements.map(({ sql, args }) => {
          if (fail && sql.startsWith("UPDATE")) throw new Error("synthetic-storage-failure");
          const statement = sqlite.prepare(sql);
          if (sql.startsWith("SELECT")) return { results: statement.all(...args), meta: { changes: 0 } };
          const written = statement.run(...args);
          return { results: [], meta: { changes: Number(written.changes) } };
        });
        sqlite.exec("COMMIT"); return result;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  } as unknown as D1Database;
  const session = { accountId: "demo", sessionId: "session", keyHash: "key" };
  try {
    const first = await storeRealtimeCommand(db, session, "adult", { clientEventId: "command-1", command: "pause" }, true, 2);
    assert.equal(batches, 1); assert.equal(first?.event.serverSequence, 1); assert.equal(first?.inserted, true);
    const duplicate = await storeRealtimeCommand(db, session, "adult", { clientEventId: "command-1", command: "pause" }, false, 3);
    assert.equal(duplicate?.inserted, false); assert.deepEqual(duplicate?.event, first?.event);
    assert.equal(await storeRealtimeCommand(db, session, "adult", { clientEventId: "blocked-command", command: "next" }, false, 4), null);
    const second = await storeRealtimeCommand(db, session, "adult", { clientEventId: "command-2", command: "resume" }, true, 5);
    assert.equal(second?.event.serverSequence, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM remote_controller_events").get()?.n, 2);
    fail = true;
    await assert.rejects(storeRealtimeCommand(db, session, "adult", { clientEventId: "command-3", command: "next" }, true, 6), /synthetic-storage-failure/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM remote_controller_events").get()?.n, 2, "un guasto non lascia un evento parziale");
    assert.equal(sqlite.prepare("SELECT latest_sequence FROM remote_controller_sessions").get()?.latest_sequence, 2);
  } finally { sqlite.close(); }
});
