import assert from "node:assert/strict";
import test from "node:test";
import { createRandomRecognitionRounds, recognitionTargetsFor } from "../app/domain/activity-generation.ts";
import { projectLegacyState, rebuildLegacyState } from "../app/domain/relational-state.ts";

const candidates = [
  { id: "mela", word: "Mela", category: "Cibi" }, { id: "pera", word: "Pera", category: "Cibi" }, { id: "pane", word: "Pane", category: "Cibi" },
  { id: "gatto", word: "Gatto", category: "Animali" }, { id: "cane", word: "Cane", category: "Animali" }, { id: "casa", word: "Casa", category: "Luoghi" },
];
let seed = 7;
const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

test("più bersagli precisi: ogni turno propone uno dei bersagli, a rotazione", () => {
  const rounds = createRandomRecognitionRounds(candidates, { rounds: 6, distractorCount: 2, fixedPromptIds: ["mela", "gatto"] }, random);
  assert.equal(rounds.length, 6);
  assert.deepEqual(new Set(rounds.map((round) => round.promptId)), new Set(["mela", "gatto"]));
  assert.equal(rounds.filter((round) => round.promptId === "mela").length, 3, "i bersagli si alternano in modo equilibrato");
  rounds.forEach((round) => {
    assert.ok(round.optionIds.includes(round.promptId));
    assert.equal(new Set(round.optionIds).size, 3);
  });
});

test("i distrattori restano quelli di oggi: libreria filtrata per categoria, con le parole preferite prima", () => {
  const filtered = createRandomRecognitionRounds(candidates, { rounds: 4, distractorCount: 2, fixedPromptIds: ["mela", "gatto"], categories: ["Cibi"] }, random);
  filtered.forEach((round) => round.optionIds.filter((id) => id !== round.promptId).forEach((id) => assert.ok(["mela", "pera", "pane"].includes(id), `${id} rispetta il filtro`)));
  const preferred = createRandomRecognitionRounds(candidates, { rounds: 4, distractorCount: 1, fixedPromptIds: ["mela", "pera"], allowedIds: ["casa"] }, random);
  preferred.forEach((round) => assert.deepEqual(round.optionIds.filter((id) => id !== round.promptId), ["casa"]));
});

test("compatibilità: un esercizio con il solo promptId ha un bersaglio, e la lista vince sul promptId", () => {
  assert.deepEqual(recognitionTargetsFor({ promptId: "mela" }), ["mela"]);
  assert.deepEqual(recognitionTargetsFor({ promptId: "mela", recognitionTargetIds: ["mela", "gatto", "mela"] }), ["mela", "gatto"]);
  assert.deepEqual(recognitionTargetsFor({ promptId: "" }), []);
});

const state = (exercise: Record<string, unknown>) => ({
  schemaVersion: 1, therapists: [], children: [], sequences: [], attempts: [], helps: [], sessionHistory: [],
  library: candidates.map((item) => ({ ...item, source: "Test", license: "CC0", author: "Autore" })),
  exercises: [{ id: "trova", title: "Trova", kind: "recognition", recognitionMode: "random", optionIds: [], distractorCount: 2, rounds: 6, updatedAt: "2026-11-27T10:00:00.000Z", ...exercise }],
});
// Roles accepted by the CHECK constraint deployed with drizzle/0004_relational_data.sql.
const deployedItemRoles = ["prompt", "option", "recognition_pool", "article_pool", "category_pool", "naming_pool"];

test("i bersagli multipli si salvano come righe prompt ordinate, compatibili con lo schema già distribuito", () => {
  const projection = projectLegacyState(state({ promptId: "gatto", recognitionTargetIds: ["gatto", "mela", "casa"] }), "account-1");
  const prompts = projection.tables.exercise_items.filter((row) => row.role === "prompt");
  assert.deepEqual(prompts.map((row) => [row.library_item_id, row.position]), [["gatto", 0], ["mela", 1], ["casa", 2]]);
  assert.ok(projection.tables.exercise_items.every((row) => deployedItemRoles.includes(String(row.role))), "nessun ruolo nuovo nel vincolo CHECK");
  // D1 returns rows without ORDER BY: the read must not depend on row order.
  projection.tables.exercise_items.reverse();
  const rebuilt = rebuildLegacyState(projection).exercises[0];
  assert.equal(rebuilt.promptId, "gatto");
  assert.deepEqual(rebuilt.recognitionTargetIds, ["gatto", "mela", "casa"]);
});

test("un esercizio storico con un solo bersaglio resta identico dopo il round trip", () => {
  const rebuilt = rebuildLegacyState(projectLegacyState(state({ promptId: "mela", recognitionItemIds: ["pera"] }), "account-1")).exercises[0];
  assert.equal(rebuilt.promptId, "mela");
  assert.equal(rebuilt.recognitionTargetIds, undefined);
  assert.deepEqual(rebuilt.recognitionItemIds, ["pera"]);
});
