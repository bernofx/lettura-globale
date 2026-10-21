import assert from "node:assert/strict";
import test from "node:test";
import { filterQuickCandidates, quickStartIsValid } from "../app/domain/session-planning.ts";

const candidates = [
  { id: "mela", category: "Cibi", syllableCount: 2 },
  { id: "pane", category: "Cibi", syllableCount: 2 },
  { id: "gatto", category: "Animali", syllableCount: 2 },
  { id: "cane", category: "Animali", syllableCount: 2 },
  { id: "sole", category: "Natura", syllableCount: 2 },
  { id: "telefono", category: "Oggetti", syllableCount: 4 },
];

test("l'avvio rapido filtra per categorie senza modificare la libreria", () => {
  const filtered = filterQuickCandidates(candidates, { activity: "recognition", selection: "categories", categoryNames: ["Animali"], itemIds: [] });
  assert.deepEqual(filtered.map((item) => item.id), ["gatto", "cane"]);
  assert.equal(candidates.length, 6);
});

test("l'avvio rapido applica il parametro condiviso per il numero di sillabe", () => {
  const filtered = filterQuickCandidates(candidates, { activity: "recognition", selection: "all", categoryNames: [], itemIds: [], recognitionSyllables: "4+" });
  assert.deepEqual(filtered.map((item) => item.id), ["telefono"]);
});

test("la scelta manuale conserva soltanto gli elementi indicati", () => {
  const filtered = filterQuickCandidates(candidates, { activity: "articles", selection: "items", categoryNames: [], itemIds: ["mela", "sole"] });
  assert.deepEqual(filtered.map((item) => item.id), ["mela", "sole"]);
});

test("la classificazione per categoria richiede da due a quattro categorie", () => {
  assert.equal(quickStartIsValid({ activity: "word-categories", selection: "categories", categoryNames: ["Cibi"], itemIds: [] }, 2), false);
  assert.equal(quickStartIsValid({ activity: "word-categories", selection: "categories", categoryNames: ["Cibi", "Animali"], itemIds: [] }, 2), true);
  assert.equal(quickStartIsValid({ activity: "word-categories", selection: "categories", categoryNames: ["A", "B", "C", "D", "E"], itemIds: [] }, 5), false);
});

test("trova la parola richiede abbastanza elementi per tutti i distrattori", () => {
  const base = { activity: "recognition" as const, selection: "all" as const, categoryNames: [], itemIds: [] };
  assert.equal(quickStartIsValid({ ...base, distractorCount: 3 }, 3), false);
  assert.equal(quickStartIsValid({ ...base, distractorCount: 3 }, 4), true);
  assert.equal(quickStartIsValid({ ...base, distractorCount: 1 }, 1), false);
  assert.equal(quickStartIsValid({ ...base, distractorCount: 1 }, 2), true);
  assert.equal(quickStartIsValid({ ...base, distractorCount: 2 }, 2), false);
  assert.equal(quickStartIsValid({ ...base, distractorCount: 2 }, 3), true);
  assert.equal(quickStartIsValid({ ...base, distractorCount: 4 }, 4), false);
  assert.equal(quickStartIsValid({ ...base, distractorCount: 4 }, 5), true);
});

test("mix and vary richiede almeno un'immagine", () => {
  const config = { activity: "naming" as const, selection: "all" as const, categoryNames: [], itemIds: [] };
  assert.equal(quickStartIsValid(config, 0), false);
  assert.equal(quickStartIsValid(config, 1), true);
});

test("numero quantità non dipende dalla libreria", () => {
  assert.equal(quickStartIsValid({ activity: "number-quantity", selection: "all", categoryNames: [], itemIds: [] }, 0), true);
});

test("abbina la frase richiede almeno il numero di scene mostrate", () => {
  const base = { activity: "sentence-matching" as const, selection: "all" as const, categoryNames: [], itemIds: [] };
  assert.equal(quickStartIsValid({ ...base, sentenceOptionCount: 2 }, 1), false);
  assert.equal(quickStartIsValid({ ...base, sentenceOptionCount: 2 }, 2), true);
  assert.equal(quickStartIsValid({ ...base, sentenceOptionCount: 4 }, 3), false);
  assert.equal(quickStartIsValid({ ...base, sentenceOptionCount: 4 }, 4), true);
});
