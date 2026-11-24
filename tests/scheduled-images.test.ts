import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SCHEDULED_IMAGES, parseScheduledWords, scheduledWordKey } from "../app/domain/scheduled-images.ts";

test("la coda unifica maiuscole, spazi, apostrofi e forme Unicode equivalenti", () => {
  assert.deepEqual(parseScheduledWords(" Clessidra \n CLESSIDRA \n Pesca | il frutto \n L’acqua \n l'acqua"), [
    { word: "Clessidra", key: "clessidra", detail: "" },
    { word: "Pesca", key: "pesca", detail: "il frutto" },
    { word: "L’acqua", key: "l'acqua", detail: "" },
  ]);
  assert.equal(scheduledWordKey(" Citta\u0300 "), "città");
  assert.notEqual(scheduledWordKey("pesca"), scheduledWordKey("pèsca"));
});

test("la coda accetta termini e precisazioni entro i limiti previsti", () => {
  for (const value of [null, "", " | nota", "nave@esempio.it", "nave | nota | extra", "nave | " + "a".repeat(201),
    Array.from({ length: MAX_SCHEDULED_IMAGES + 1 }, () => "parola").join("\n")]) {
    assert.throws(() => parseScheduledWords(value), /invalid_words/);
  }
});
