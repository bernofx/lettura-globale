import assert from "node:assert/strict";
import test from "node:test";
import { createQuantityRounds, quantityAnswerId, quantityAnswerLabel, quantityIdleDecision, quantityObjectLabel, quantitySelectionDecision } from "../app/domain/quantity-exercise.ts";

test("genera quantità entro l'intervallo e risolve gli oggetti misti", () => {
  const values = [0, 0, 0, 0.99];
  let index = 0;
  const rounds = createQuantityRounds({ rounds: 2, min: 3, max: 5, objectSet: "mixed" }, () => values[index++]);
  assert.deepEqual(rounds, [{ target: 3, object: "candy" }, { target: 5, object: "stone" }]);
});

test("usa l'oggetto configurato e limita quantità e turni", () => {
  const rounds = createQuantityRounds({ rounds: 1, min: -3, max: 30, objectSet: "ladybug" }, () => 0.99);
  assert.deepEqual(rounds, [{ target: 10, object: "ladybug" }]);
});

test("non ripete quantità finché esaurisce l'intervallo, né al confine tra due giri", () => {
  for (const random of [() => 0, () => 0.99, Math.random]) {
    const targets = createQuantityRounds({ rounds: 30, min: 3, max: 7 }, random).map((round) => round.target);
    for (let index = 0; index < targets.length; index += 5) {
      assert.deepEqual([...targets.slice(index, index + 5)].sort(), [3, 4, 5, 6, 7]);
    }
    for (let index = 1; index < targets.length; index++) assert.notEqual(targets[index], targets[index - 1]);
  }
  const unique = createQuantityRounds({ rounds: 10, min: 1, max: 10 }).map((round) => round.target);
  assert.equal(new Set(unique).size, 10);
  assert.deepEqual(createQuantityRounds({ rounds: 3, min: 4, max: 4 }).map((round) => round.target), [4, 4, 4]);
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

test("pronuncia il conteggio aggiornato anche togliendo spunte e blocca la quantità senza errori", () => {
  let selected = new Set<number>();
  for (let index = 0; index < 3; index++) {
    const decision = quantitySelectionDecision(selected, index, 3, true)!;
    assert.equal(decision.spokenNumber, index + 1);
    assert.equal(decision.correct, index === 2);
    selected = decision.selected;
  }
  assert.equal(quantitySelectionDecision(selected, 3, 3, true), null, "nessun oggetto aggiuntivo anche prima del render");
  assert.equal(quantitySelectionDecision(selected, 0, 3, true), null, "non si può togliere un oggetto dopo il successo");
  const normal = quantitySelectionDecision(selected, 3, 3, false)!;
  assert.equal(normal.selected.size, 4, "la modalità normale conserva la selezione libera");
  const deselected = quantitySelectionDecision(new Set([0, 1]), 1, 3, true)!;
  assert.equal(deselected.spokenNumber, 1);
  assert.equal(quantitySelectionDecision(new Set([0]), 0, 3, false)?.spokenNumber, 0);
  assert.deepEqual([...deselected.selected], [0]);
  assert.equal(quantitySelectionDecision(new Set(), 0, 3, false, true), null);
});

test("senza errori non usa timer, nemmeno in anteprima o valutazione", () => {
  for (const mode of ["teaching", "test"] as const) for (const preview of [false, true]) {
    assert.equal(quantityIdleDecision(mode, 2, 3, true, preview, 1, true), null);
    assert.equal(quantityIdleDecision(mode, 3, 3, true, preview, 1, true), null);
  }
  assert.match(quantityAnswerLabel(quantityAnswerId(3, 3, "selection", "test-123"))!, /apprendimento senza errori/);
});
