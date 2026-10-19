import assert from "node:assert/strict";
import test from "node:test";
import { analyzeItalianSyllables, countSyllables, hydrateSyllables, matchesSyllableFilter } from "../app/domain/syllabification.ts";

test("usa la sillabazione verificata per il catalogo iniziale", () => {
  assert.deepEqual(analyzeItalianSyllables("Telefono"), { syllabification: "te-le-fo-no", syllableCount: 4, syllableStatus: "verified" });
  assert.deepEqual(analyzeItalianSyllables("Maiale"), { syllabification: "ma-ia-le", syllableCount: 3, syllableStatus: "verified" });
});

test("propone automaticamente le parole semplici e segnala le grafie dubbie", () => {
  assert.deepEqual(analyzeItalianSyllables("rametto"), { syllabification: "ra-met-to", syllableCount: 3, syllableStatus: "automatic" });
  assert.deepEqual(analyzeItalianSyllables("bicchiere"), { syllabification: "bic-chie-re", syllableCount: 3, syllableStatus: "needs-review" });
  assert.equal(analyzeItalianSyllables("paesino").syllableStatus, "needs-review");
  assert.equal(analyzeItalianSyllables("t-shirt").syllableStatus, "needs-review");
});

test("non sovrascrive una correzione salvata", () => {
  const item = hydrateSyllables({ word: "parola", syllabification: "pa-ro-la", syllableCount: 3, syllableStatus: "verified" as const });
  assert.deepEqual(item, { word: "parola", syllabification: "pa-ro-la", syllableCount: 3, syllableStatus: "verified" });
});

test("filtra per gruppi di sillabe", () => {
  assert.equal(countSyllables("te-le-fo-no"), 4);
  assert.equal(matchesSyllableFilter({ syllableCount: 2 }, "2-3"), true);
  assert.equal(matchesSyllableFilter({ syllableCount: 4 }, "4+"), true);
  assert.equal(matchesSyllableFilter({ syllableCount: 3 }, "2"), false);
  assert.equal(matchesSyllableFilter({}, "all"), true);
});
