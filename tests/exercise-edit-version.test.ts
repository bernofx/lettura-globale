import assert from "node:assert/strict";
import test from "node:test";
import { differentExerciseSettings, exerciseEditStatus } from "../app/domain/exercise-edit-version.ts";
import type { Exercise } from "../app/shared/types.ts";

const opened: Exercise = {
  id: "model", title: "Esercizio demo", optionIds: ["a", "b"], updatedAt: "2026-01-01",
  categorySymbolIds: { Giochi: "c", Frutta: "d" },
};

test("la versione del modulo ignora data di salvataggio e ordine di serializzazione dei simboli", () => {
  assert.equal(exerciseEditStatus(opened, { ...opened, updatedAt: "2026-01-02", categorySymbolIds: { Frutta: "d", Giochi: "c" } }), "current");
});

test("il confronto rileva campi aggiunti, simboli rimossi e bersagli riordinati", () => {
  const changed = { ...opened, optionIds: ["b", "a"], categorySymbolIds: { Giochi: "c" }, rounds: 4 };
  assert.equal(exerciseEditStatus(opened, changed), "changed");
  assert.deepEqual(differentExerciseSettings(opened, changed).sort(), ["categorySymbolIds", "optionIds", "rounds"]);
});

test("l’editor blocca la scrittura quando il record o la sua identità non è più disponibile", () => {
  assert.equal(exerciseEditStatus(opened), "unavailable");
  for (const edit of [{ deleted: true }, { id: "replacement" }, { ownerAdultId: "other" }, { sequenceId: "sequence" }, { templateExerciseId: "template" }, { sourceExerciseId: "source" }]) {
    assert.equal(exerciseEditStatus(opened, { ...opened, ...edit }), "unavailable");
  }
});
