import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("la migrazione dei temi conserva le preferenze e accetta le nuove opzioni", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE accounts (id text PRIMARY KEY NOT NULL);
    CREATE TABLE account_preferences (
      account_id text PRIMARY KEY NOT NULL,
      active_child_id text,
      active_sequence_id text,
      theme_palette text NOT NULL DEFAULT 'violet' CHECK (theme_palette IN ('violet', 'ocean', 'forest', 'sunset')),
      control_shape text NOT NULL DEFAULT 'soft' CHECK (control_shape IN ('compact', 'soft', 'round')),
      revision integer NOT NULL DEFAULT 1,
      updated_at integer NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE CASCADE
    );
    INSERT INTO accounts(id) VALUES ('a1'), ('a2');
    INSERT INTO account_preferences(account_id, theme_palette, control_shape, revision, updated_at)
      VALUES ('a1', 'ocean', 'round', 7, 123);
  `);

  database.exec(readFileSync(new URL("../drizzle/0010_appearance_options.sql", import.meta.url), "utf8"));

  assert.deepEqual({ ...database.prepare("SELECT theme_palette, control_shape, revision, updated_at FROM account_preferences WHERE account_id = ?").get("a1") }, {
    theme_palette: "ocean",
    control_shape: "round",
    revision: 7,
    updated_at: 123,
  });
  database.prepare("INSERT INTO account_preferences(account_id, theme_palette, control_shape, updated_at) VALUES (?, ?, ?, ?)").run("a2", "brand", "square", 456);
  assert.deepEqual({ ...database.prepare("SELECT theme_palette, control_shape FROM account_preferences WHERE account_id = ?").get("a2") }, {
    theme_palette: "brand",
    control_shape: "square",
  });
  assert.throws(() => database.prepare("UPDATE account_preferences SET theme_palette = ? WHERE account_id = ?").run("invalid", "a2"));
});
