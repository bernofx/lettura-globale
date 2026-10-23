import assert from "node:assert/strict";
import test from "node:test";
import { createCorrectMatchFeedback, correctMatchSpeech } from "../app/domain/correct-match-feedback.ts";
import { compileSessionPlan } from "../app/domain/session-compilation.ts";
import { projectLegacyState, rebuildLegacyState } from "../app/domain/relational-state.ts";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

function setup(text: string | null, manual = false) {
  const timers = new Map<number, () => void>();
  let timerId = 0, advances = 0, stops = 0;
  let done: (() => void) | undefined;
  const spoken: string[] = [];
  const feedback = createCorrectMatchFeedback({
    text, manual, soundEffects: true,
    schedule(callback) { timers.set(++timerId, callback); return timerId; },
    clear(id) { timers.delete(id); },
    speak(value, callback) { spoken.push(value); done = callback; return () => { stops++; }; },
    advance() { advances++; },
  });
  const tick = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach((callback) => callback()); };
  return { feedback, spoken, tick, endSpeech: () => done?.(), get advances() { return advances; }, get stops() { return stops; } };
}

test("correct match text is article + noun or category, opt-in only", () => {
  assert.equal(correctMatchSpeech("articles", true, "gatto", "IL"), "il gatto");
  assert.equal(correctMatchSpeech("articles", true, "mela", "LA"), "la mela");
  assert.equal(correctMatchSpeech("word-categories", true, "gatto", "Animali"), "Animali");
  assert.equal(correctMatchSpeech("articles", false, "gatto", "IL"), null);
  assert.equal(correctMatchSpeech("word-categories", undefined, "gatto", "Animali"), null);
});

test("automatic advance waits for speech and tolerates duplicate completion", () => {
  const run = setup("il gatto");
  run.tick(); run.tick();
  assert.deepEqual(run.spoken, ["il gatto"]);
  assert.equal(run.advances, 0);
  run.endSpeech(); run.endSpeech(); run.tick(); run.endSpeech(); run.tick();
  assert.equal(run.advances, 1);
});

test("controller connection holds advance, disconnect resumes without replaying voice", () => {
  const run = setup("Animali", true);
  run.tick(); run.endSpeech(); run.tick();
  assert.equal(run.advances, 0);
  run.feedback.setManual(false);
  run.feedback.setManual(true);
  run.tick();
  assert.equal(run.advances, 0);
  run.feedback.setManual(false); run.tick();
  assert.equal(run.advances, 1);
  assert.deepEqual(run.spoken, ["Animali"]);
});

test("navigation cancels timers and late speech callbacks", () => {
  const run = setup("il gatto");
  run.tick(); run.feedback.cancel(); run.endSpeech(); run.tick();
  assert.equal(run.stops, 1);
  assert.equal(run.advances, 0);
  const early = setup("Animali");
  early.feedback.cancel(); early.tick();
  assert.deepEqual(early.spoken, []);
});

test("disabled speech keeps the ordinary feedback delay and manual mode", () => {
  const run = setup(null);
  run.tick(); run.tick();
  assert.equal(run.advances, 1);
  assert.deepEqual(run.spoken, []);
  const manual = setup(null, true);
  manual.tick(); manual.tick();
  assert.equal(manual.advances, 0);
});

test("both options persist through deployed D1 schema and compiled turns", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as { entries: { tag: string }[] };
    for (const entry of journal.entries) db.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
    db.exec("INSERT INTO accounts (id, email, display_name, created_at, updated_at) VALUES ('demo', 'demo@example.test', 'Demo', 1, 1)");
    const exercises = [true, false, undefined].flatMap((autoPronounce, index) => [
      { id: `article-${index}`, kind: "articles" as const, title: "Articoli", optionIds: [], articleItemIds: ["gatto"], autoPronounce, rounds: 1, updatedAt: "2026-10-23T12:00:00Z" },
      { id: `category-${index}`, kind: "word-categories" as const, title: "Categorie", optionIds: [], categoryNames: ["Animali", "Cibi"], categoryItemIds: ["gatto"], autoPronounce, rounds: 1, updatedAt: "2026-10-23T12:00:00Z" },
    ]);
    const library = [{ id: "gatto", word: "gatto", category: "Animali", article: "IL" as const, emoji: "🐈", source: "Test", license: "CC0" }];
    const projection = projectLegacyState({ schemaVersion: 1, exercises, library }, "demo");
    for (const [table, rows] of Object.entries(projection.tables)) for (const row of rows) {
      const columns = Object.keys(row);
      db.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...Object.values(row));
    }
    projection.tables.exercises = db.prepare("SELECT * FROM exercises WHERE account_id = 'demo' ORDER BY position").all() as typeof projection.tables.exercises;
    const rebuilt = rebuildLegacyState(projection);
    assert.deepEqual(rebuilt.exercises.map((exercise) => exercise.autoPronounce), [true, true, false, false, undefined, undefined]);
    const turns = compileSessionPlan(exercises, library, { articleFor: (item) => item.article });
    assert.deepEqual(turns.map((turn) => turn.autoPronounce), [true, true, false, false, undefined, undefined]);
  } finally { db.close(); }
});
