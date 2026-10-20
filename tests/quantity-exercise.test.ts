import assert from "node:assert/strict";
import test from "node:test";
import { createQuantityRounds, quantityAnswerId, quantityAnswerLabel, quantityObjectLabel } from "../app/domain/quantity-exercise.ts";

test("genera quantità entro l'intervallo e risolve gli oggetti misti", () => {
  const values = [0, 0, 0.99, 0.99];
  let index = 0;
  const rounds = createQuantityRounds({ rounds: 2, min: 3, max: 5, objectSet: "mixed" }, () => values[index++]);
  assert.deepEqual(rounds, [{ target: 3, object: "candy" }, { target: 5, object: "stone" }]);
});

test("usa l'oggetto configurato e limita quantità e turni", () => {
  const rounds = createQuantityRounds({ rounds: 1, min: -3, max: 30, objectSet: "ladybug" }, () => 0.99);
  assert.deepEqual(rounds, [{ target: 10, object: "ladybug" }]);
});

test("produce etichette leggibili per voce e storico", () => {
  assert.equal(quantityObjectLabel("candy", 1), "caramella");
  assert.equal(quantityObjectLabel("candy", 4), "caramelle");
  const id = quantityAnswerId(4, 4, "idle-teaching");
  assert.equal(quantityAnswerLabel(id), "Richiesti 4 · selezionati 4 · completamento automatico");
});
