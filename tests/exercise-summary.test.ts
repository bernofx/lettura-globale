import assert from "node:assert/strict";
import test from "node:test";
import { exerciseSummary } from "../app/domain/exercise-summary.ts";
import type { Exercise } from "../app/shared/types";

const words: Record<string, string> = { gatto: "gatto", cane: "cane", mela: "mela", pera: "pera", uva: "uva" };
const wordFor = (id: string) => words[id];
const base = { id: "e", title: "T", promptId: "", optionIds: [] } as unknown as Exercise;

test("Trova la parola casuale riporta bersagli, turni, distrattori e filtri", () => {
  assert.equal(exerciseSummary({ ...base, recognitionMode: "random", rounds: 4, distractorCount: 2, distractorSource: "same-category", recognitionCategories: ["Animali"] }, wordFor),
    "Parole casuali da Animali · 4 turni · 2 distrattori stessa categoria · foto + parole");
  assert.equal(exerciseSummary({ ...base, recognitionMode: "random", promptId: "gatto", recognitionTargetIds: ["gatto", "cane", "mela", "pera", "uva"], presentation: "words", recognitionSyllables: "2" }, wordFor),
    "Trova: gatto, cane, mela e altre 2 · 6 turni · 3 distrattori da tutte le parole · solo parole · 2 sillabe");
});

test("Trova la parola manuale elenca bersaglio e alternative in un turno", () => {
  assert.equal(exerciseSummary({ ...base, recognitionMode: "fixed", promptId: "gatto", optionIds: ["gatto", "cane", "mela"] }, wordFor),
    "Trova: gatto · 1 turno · alternative: cane, mela · foto + parole");
  assert.equal(exerciseSummary({ ...base, recognitionMode: "fixed", promptId: "sparito", optionIds: ["sparito"] }, wordFor),
    "Trova: parola non disponibile · 1 turno · foto + parole");
});

test("le altre tipologie usano i valori predefiniti del compilatore", () => {
  assert.equal(exerciseSummary({ ...base, kind: "articles", rounds: 10, articleItemIds: ["a", "b", "c"] }, wordFor), "IL / LA · 3 turni · 3 immagini scelte");
  assert.equal(exerciseSummary({ ...base, kind: "word-categories", categoryNames: ["Cibi", "Casa"] }, wordFor), "Parola → categoria · 6 turni · Cibi, Casa");
  assert.equal(exerciseSummary({ ...base, kind: "naming", rounds: 1 }, wordFor), "Nomina l’immagine · 1 turno · tutte le immagini");
  assert.equal(exerciseSummary({ ...base, kind: "number-quantity", quantityObjectSet: "candy", quantityErrorless: true }, wordFor),
    "Numero quantità · 6 turni · da 1 a 10 · caramelle · senza errori");
  assert.equal(exerciseSummary({ ...base, kind: "sentence-matching", sentenceOptionCount: 4, sentenceDifficulty: 2 }, wordFor),
    "Frase → immagine · 6 turni · 4 immagini · variano soggetto e azione");
});
