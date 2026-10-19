import assert from "node:assert/strict";
import test from "node:test";
import { countSyllables } from "../app/domain/syllabification.ts";
import { wordOnlyCatalog } from "../app/domain/word-catalog.ts";

test("il catalogo aggiunge cento parole uniche senza immagini", () => {
  assert.equal(wordOnlyCatalog.length, 100);
  assert.equal(new Set(wordOnlyCatalog.map((item) => item.id)).size, 100);
  assert.equal(new Set(wordOnlyCatalog.map((item) => item.word.toLocaleLowerCase("it-IT"))).size, 100);
});

test("le nuove parole sono distribuite tra due, tre e quattro sillabe", () => {
  const counts = wordOnlyCatalog.reduce<Record<number, number>>((result, item) => {
    const count = countSyllables(item.syllabification);
    result[count] = (result[count] ?? 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, { 2: 34, 3: 33, 4: 33 });
});
