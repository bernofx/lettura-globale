import assert from "node:assert/strict";
import test from "node:test";
import { createRandomRecognitionRounds, normalizeLearningCategory, pickCategoryRoundIds, recognitionModeFor } from "../app/domain/activity-generation.ts";

const candidates = [
  { id: "mela", word: "Mela", category: "Cibo" },
  { id: "pera", word: "Pera", category: "Cibo" },
  { id: "pane", word: "Pane", category: "Cibo" },
  { id: "gatto", word: "Gatto", category: "Animali" },
  { id: "cane", word: "Cane", category: "Animali" },
  { id: "casa", word: "Casa", category: "Luoghi" },
];

const deterministic = () => 0.42;

test("genera turni senza duplicati e mantiene la risposta corretta", () => {
  const rounds = createRandomRecognitionRounds(candidates, { rounds: 4, distractorCount: 3 }, deterministic);
  assert.equal(rounds.length, 4);
  rounds.forEach((round) => {
    assert.equal(new Set(round.optionIds).size, round.optionIds.length);
    assert.equal(round.optionIds.length, 4);
    assert.ok(round.optionIds.includes(round.promptId));
  });
});

test("evita la stessa parola in due turni consecutivi", () => {
  const rounds = createRandomRecognitionRounds(candidates, { rounds: 12, distractorCount: 3 }, deterministic);
  rounds.slice(1).forEach((round, index) => assert.notEqual(round.promptId, rounds[index].promptId));
});

test("rispetta filtri e categorie e privilegia distrattori della stessa categoria", () => {
  const rounds = createRandomRecognitionRounds(candidates, { rounds: 2, distractorCount: 3, categories: ["Animali"] }, deterministic);
  assert.equal(rounds.length, 2);
  assert.ok(rounds.every((round) => ["gatto", "cane"].includes(round.promptId)));
  assert.ok(rounds.every((round) => round.optionIds.every((id) => ["gatto", "cane"].includes(id))));
});

test("la classificazione non ripete parole nello stesso ciclo", () => {
  const ids = pickCategoryRoundIds(candidates, undefined, 5, deterministic);
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, 5);
});

test("gli esercizi salvati prima della modalità casuale restano fissi", () => {
  assert.equal(recognitionModeFor({}), "fixed");
  assert.equal(recognitionModeFor({ recognitionMode: "random" }), "random");
});

test("normalizza i nomi storici delle categorie senza cambiare quelli nuovi", () => {
  assert.equal(normalizeLearningCategory("Cibo"), "Cibi");
  assert.equal(normalizeLearningCategory("Corpo"), "Parti del corpo");
  assert.equal(normalizeLearningCategory("Abbigliamento"), "Vestiti");
  assert.equal(normalizeLearningCategory("Natura"), "Oggetti della natura");
  assert.equal(normalizeLearningCategory("Animali"), "Animali");
});
