import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { projectLegacyState, rebuildLegacyState } from "../app/domain/relational-state.ts";

test("migra lo schema storico e conserva opzioni, tentativi e storico senza errori", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.filter((entry) => entry.idx < 15)) db.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  db.exec("INSERT INTO accounts (id, email, display_name, created_at, updated_at) VALUES ('legacy', 'legacy@example.test', 'Demo', 1, 1)");
  db.exec("INSERT INTO exercises (account_id, id, title, kind, auto_pronounce, position, version, created_at, updated_at) VALUES ('legacy', 'old', 'Legacy', 'recognition', 0, 0, 1, 1, 1)");
  db.exec(readFileSync(new URL("../drizzle/0015_quantity_learning_options.sql", import.meta.url), "utf8"));
  const legacy = db.prepare("SELECT title, quantity_speak_numbers, quantity_errorless FROM exercises WHERE id = 'old'").get();
  assert.deepEqual({ ...legacy }, { title: "Legacy", quantity_speak_numbers: 0, quantity_errorless: 0 });
  for (const entry of journal.entries.filter((entry) => entry.idx > 15)) db.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  const state = {
    schemaVersion: 1, therapists: [{ id: "adult", firstName: "Demo", email: "demo@example.test", role: "Terapista", childIds: ["child"] }], children: [{ id: "child", firstName: "Demo" }], library: [], sequences: [], helps: [],
    exercises: [{ id: "q", title: "Conta", kind: "number-quantity", optionIds: [], quantityMin: 3, quantityMax: 3, quantitySpeakNumbers: true, quantityErrorless: true }],
    attempts: [{ id: "a", sessionId: "s", sessionItemId: "turn", exerciseId: "q", answerId: "quantity:3:3:selection:12345678", correct: true, firstAttempt: true, quantityErrorless: true, mode: "test", childId: "child", therapistId: "adult", createdAt: "2026-10-22T12:00:00Z" }],
    sessionHistory: [{ id: "s", childId: "child", therapistId: "adult", title: "Conta", source: "quick", mode: "test", presentation: "images", startedAt: "2026-10-22T11:59:00Z", completedAt: "2026-10-22T12:00:00Z", items: [{ id: "turn", exerciseId: "q", exerciseTitle: "Conta", kind: "number-quantity", quantityErrorless: true, options: [], responses: [{ answerId: "quantity:3:3:selection:12345678", label: "Quantità raggiunta", correct: true, firstAttempt: true, createdAt: "2026-10-22T12:00:00Z" }], helpLabels: [], firstCorrect: true }] }],
  };
  const projection = projectLegacyState(state, "demo");
  db.exec("INSERT INTO accounts (id, email, display_name, created_at, updated_at) VALUES ('demo', 'demo@example.test', 'Demo', 1, 1)");
  for (const [table, rows] of Object.entries(projection.tables)) for (const row of rows) {
    const columns = Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...Object.values(row));
  }
  for (const table of ["exercises", "attempts", "session_items"] as const) projection.tables[table] = db.prepare(`SELECT * FROM ${table} WHERE account_id = 'demo'`).all() as typeof projection.tables[typeof table];
  const rebuilt = rebuildLegacyState(projection);
  assert.equal(rebuilt.exercises[0].quantitySpeakNumbers, true);
  assert.equal(rebuilt.exercises[0].quantityErrorless, true);
  assert.equal(rebuilt.attempts[0].quantityErrorless, true);
  assert.equal(rebuilt.sessionHistory[0].items[0].quantityErrorless, true);
  assert.equal(rebuilt.sessionHistory[0].items[0].kind, "number-quantity");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});
