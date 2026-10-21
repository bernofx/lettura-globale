import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("la migrazione audio conserva le righe esistenti e aggiunge valori predefiniti", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE account_preferences (
      account_id text PRIMARY KEY NOT NULL,
      active_child_id text,
      active_sequence_id text,
      theme_palette text NOT NULL DEFAULT 'violet',
      control_shape text NOT NULL DEFAULT 'soft',
      revision integer NOT NULL DEFAULT 1,
      updated_at integer NOT NULL
    );
    INSERT INTO account_preferences(account_id, theme_palette, control_shape, revision, updated_at)
      VALUES ('a1', 'ocean', 'round', 7, 123);
  `);

  database.exec(readFileSync(new URL("../drizzle/0013_sound_preferences.sql", import.meta.url), "utf8"));

  assert.deepEqual({ ...database.prepare("SELECT sound_wrong, sound_correct, sound_finish, sound_select, revision FROM account_preferences WHERE account_id = ?").get("a1") }, {
    sound_wrong: "classic",
    sound_correct: "classic",
    sound_finish: "fanfare",
    sound_select: "plin",
    revision: 7,
  });
  database.prepare("UPDATE account_preferences SET sound_wrong = ?, sound_correct = ?, sound_finish = ?, sound_select = ? WHERE account_id = ?")
    .run("naaa", "chime", "applause", "select", "a1");
  assert.deepEqual({ ...database.prepare("SELECT sound_wrong, sound_correct, sound_finish, sound_select FROM account_preferences WHERE account_id = ?").get("a1") }, {
    sound_wrong: "naaa",
    sound_correct: "chime",
    sound_finish: "applause",
    sound_select: "select",
  });
});
