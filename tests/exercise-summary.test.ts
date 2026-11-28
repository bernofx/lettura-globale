import assert from "node:assert/strict";
import test from "node:test";
import { exerciseSummary } from "../app/domain/exercise-summary.ts";
import type { Exercise } from "../app/shared/types";

const words: Record<string, string> = { gatto: "gatto", cane: "cane", mela: "mela", pera: "pera", uva: "uva" };
const wordFor = (id: string) => words[id];
const base = { id: "e", title: "T", promptId: "", optionIds: [] } as unknown as Exercise;

test("Trova la parola casuale descrive bersagli, distrattori, presentazione e pronuncia", () => {
  assert.equal(exerciseSummary({ ...base, recognitionMode: "random", rounds: 4, distractorCount: 2, distractorSource: "same-category", recognitionCategories: ["Animali"] }, wordFor),
    "bersagli a caso dalle categorie: Animali · 4 turni · 2 distrattori per turno, della stessa categoria del bersaglio · foto + parole · senza pronuncia");
  assert.equal(exerciseSummary({ ...base, recognitionMode: "random", promptId: "gatto", recognitionTargetIds: ["gatto", "cane", "mela", "pera", "uva"], presentation: "words", recognitionSyllables: "2" }, wordFor),
    "bersagli: gatto, cane, mela e altre 2 · 6 turni · 3 distrattori per turno, a caso · solo parole · pronuncia automatica · 2 sillabe");
});

test("con bersagli casuali le parole scelte sono il gruppo di bersagli e distrattori", () => {
  assert.equal(exerciseSummary({ ...base, recognitionMode: "random", rounds: 12, distractorCount: 2, autoPronounce: false, recognitionItemIds: ["gatto", "cane", "mela"] }, wordFor),
    "bersagli a caso tra: gatto, cane, mela · 12 turni · 2 distrattori per turno, scelti tra le stesse parole · foto + parole · senza pronuncia");
  assert.equal(exerciseSummary({ ...base, recognitionMode: "random", promptId: "gatto", distractorCount: 1, recognitionItemIds: ["cane"] }, wordFor),
    "bersagli: gatto · 6 turni · 1 distrattore per turno, a caso · distrattori preferiti: cane · foto + parole · senza pronuncia");
});

test("Trova la parola manuale elenca bersaglio e alternative in un turno", () => {
  assert.equal(exerciseSummary({ ...base, recognitionMode: "fixed", promptId: "gatto", optionIds: ["gatto", "cane", "mela"], autoPronounce: true }, wordFor),
    "bersaglio: gatto · 1 turno · alternative: cane, mela · foto + parole · pronuncia automatica");
  assert.equal(exerciseSummary({ ...base, recognitionMode: "fixed", promptId: "sparito", optionIds: ["sparito"] }, wordFor),
    "bersaglio: parola non disponibile · 1 turno · foto + parole · senza pronuncia");
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
