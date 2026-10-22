import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadRelationalProjection, relationalShadowMatches, repairRelationalShadow, stateChecksum } from "../db/relational-state.ts";
import { RELATIONAL_MIGRATION_KEY, relationalParityReport } from "../app/domain/relational-state.ts";

test("repairs a verified-but-empty relational shadow in bounded D1 batches", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (let index = 0; index <= 7; index++) {
    const file = `drizzle/${String(index).padStart(4, "0")}_${["initial", "auth_sessions", "therapist_credentials", "shared_launches", "relational_data", "relational_fidelity", "relational_order", "granular_state_operations"][index]}.sql`;
    sqlite.exec(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
  }
  const now = Date.UTC(2026, 9, 20);
  const accountId = "account-test";
  const state = {
    schemaVersion: 1, therapists: [{ id: "adult-1", email: "adult@example.test" }], children: [],
    library: Array.from({ length: 120 }, (_, index) => ({ id: `word-${index}`, word: `Word ${index}`, category: "Test" })),
    exercises: [{ id: "exercise-1", title: "Test", kind: "recognition", recognitionMode: "random", presentation: "words" }],
    sequences: [{ id: "sequence-1", title: "Sequence", therapistId: "adult-1", exerciseIds: ["exercise-1"] }],
    sessionHistory: [], attempts: [], helps: [],
  };
  const rawState = JSON.stringify(state);
  const checksum = await stateChecksum(rawState);
  // A legacy account may contain the same therapist email. The old global
  // unique index made an otherwise valid second account impossible to repair.
  sqlite.prepare("INSERT INTO accounts (id, email, display_name, created_at, updated_at) VALUES (?, ?, '', ?, ?)")
    .run("legacy-account", "legacy@example.test", now, now);
  sqlite.prepare("INSERT INTO accounts (id, email, display_name, created_at, updated_at) VALUES (?, ?, '', ?, ?)")
    .run(accountId, "adult@example.test", now, now);
  sqlite.prepare("INSERT INTO adult_profiles (account_id, id, first_name, last_name, email_normalized, role, position, created_at, updated_at) VALUES (?, ?, '', '', ?, 'Terapista', 0, ?, ?)")
    .run("legacy-account", "legacy-adult", "adult@example.test", now, now);
  assert.throws(() => sqlite.prepare("INSERT INTO adult_profiles (account_id, id, first_name, last_name, email_normalized, role, position, created_at, updated_at) VALUES (?, ?, '', '', ?, 'Terapista', 0, ?, ?)")
    .run(accountId, "adult-1", "adult@example.test", now, now));
  sqlite.exec(readFileSync(new URL("../drizzle/0008_account_scoped_adult_email.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0009_number_quantity.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0010_appearance_options.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0011_remote_session_controller.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0012_sentence_matching.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0013_sound_preferences.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0015_quantity_learning_options.sql", import.meta.url), "utf8"));
  sqlite.prepare("INSERT INTO user_states (user_id, email, payload, schema_version, revision, created_at, updated_at) VALUES (?, ?, ?, 1, 4, ?, ?)")
    .run(accountId, "adult@example.test", rawState, now, now);
  sqlite.prepare("INSERT INTO data_migrations (account_id, migration_key, source_revision, source_checksum, status, details, started_at, completed_at) VALUES (?, ?, 4, ?, 'verified', '{}', ?, ?)")
    .run(accountId, RELATIONAL_MIGRATION_KEY, checksum, now, now);

  const batchSizes: number[] = [];
  const database = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            first: () => sqlite.prepare(sql).get(...values as []),
            all: () => ({ results: sqlite.prepare(sql).all(...values as []) }),
            run: () => sqlite.prepare(sql).run(...values as []),
          };
        },
      };
    },
    batch(statements: Array<{ run: () => unknown }>) {
      batchSizes.push(statements.length);
      assert.ok(statements.length <= 100);
      sqlite.exec("BEGIN");
      try {
        for (const statement of statements) statement.run();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const before = await loadRelationalProjection(database as never, accountId);
  assert.deepEqual(relationalParityReport(state, before, 4, 4, true).mismatches, ["adult_profiles", "library_items", "exercises", "sequences"]);
  assert.equal(relationalShadowMatches(state, before, accountId), false);

  await repairRelationalShadow({ database: database as never, accountId, email: "adult@example.test", displayName: "Adult", rawState, state, sourceRevision: 4, now });

  const after = await loadRelationalProjection(database as never, accountId);
  assert.equal(relationalParityReport(state, after, 4, 4, true).ready, true);
  assert.equal(relationalShadowMatches(state, after, accountId), true);
  assert.equal(after.tables.library_items.length, 120);
  assert.equal(after.tables.sequence_exercises.length, 1);
  assert.ok(batchSizes.length >= 2);
  sqlite.close();
});
