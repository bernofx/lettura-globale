import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("la migrazione audio separa gli account e permette la rimozione logica", () => {
  const db = new DatabaseSync(":memory:");
  const sql = readFileSync(new URL("../drizzle/0010_spicy_glorian.sql", import.meta.url), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) if (statement.trim()) db.exec(statement);
  const insert = db.prepare("INSERT INTO sound_assets (account_id, id, name, cue, content_type, byte_length, r2_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  insert.run("account-a", "sound", "Naaa", "wrong", "audio/mpeg", 123, "a/sounds/sound", 1);
  insert.run("account-b", "sound", "Altro", "wrong", "audio/mpeg", 456, "b/sounds/sound", 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sound_assets WHERE account_id = ? AND deleted_at IS NULL").get("account-a")?.n, 1);
  db.prepare("UPDATE sound_assets SET deleted_at = ? WHERE account_id = ? AND id = ?").run(2, "account-a", "sound");
  assert.equal(db.prepare("SELECT count(*) AS n FROM sound_assets WHERE account_id = ? AND deleted_at IS NULL").get("account-a")?.n, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM sound_assets WHERE account_id = ? AND deleted_at IS NULL").get("account-b")?.n, 1);
  db.close();
});
