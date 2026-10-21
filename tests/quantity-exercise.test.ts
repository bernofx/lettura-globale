import assert from "node:assert/strict";
import test from "node:test";
import { createQuantityRounds, quantityAnswerId, quantityAnswerLabel, quantityIdleDecision, quantityObjectLabel } from "../app/domain/quantity-exercise.ts";

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
  assert.equal(quantityAnswerLabel(id), "Richiesti 4 · selezionati 4 · completamento dopo inattività");
  assert.equal(quantityAnswerLabel(quantityAnswerId(4, 2, "idle-wrong", 2)), "Richiesti 4 · selezionati 2 · errore dopo inattività");
  assert.equal(quantityAnswerLabel(quantityAnswerId(4, 4, "adult", 3)), "Richiesti 4 · selezionati 4 · conferma adulta");
  assert.equal(quantityAnswerLabel(quantityAnswerId(4, 2, "idle-wrong", "8c229480-17df-4e52-ae87-41cd12ecab99")), "Richiesti 4 · selezionati 2 · errore dopo inattività");
});

test("il timer è escluso dalla verifica e attivo nell'anteprima condivisa", () => {
  assert.equal(quantityIdleDecision("test", 2, 4, true), null);
  assert.deepEqual(quantityIdleDecision("test", 2, 4, false, true), { correct: false, delayMs: 5000, method: "idle-wrong", autoResolve: true });
  assert.deepEqual(quantityIdleDecision("test", 4, 4, false, true, 6), { correct: true, delayMs: 6000, method: "idle-teaching", autoResolve: true });
  assert.deepEqual(quantityIdleDecision("teaching", 2, 4, true), { correct: false, delayMs: 5000, method: "idle-wrong", autoResolve: true });
  assert.deepEqual(quantityIdleDecision("teaching", 4, 4, true), { correct: true, delayMs: 5000, method: "idle-teaching", autoResolve: true });
  assert.deepEqual(quantityIdleDecision("teaching", 2, 4, true, false, 7), { correct: false, delayMs: 7000, method: "idle-wrong", autoResolve: true });
  assert.deepEqual(quantityIdleDecision("teaching", 4, 4, false), { correct: true, delayMs: 5000, method: "idle-teaching", autoResolve: false });
  assert.equal(quantityIdleDecision("teaching", 0, 4, true), null);
});
