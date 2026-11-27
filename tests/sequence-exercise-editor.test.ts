import test from "node:test";
import assert from "node:assert/strict";
import type { Exercise } from "../app/shared/types.ts";
import { applyExerciseForm, copyExerciseForSequence } from "../app/domain/sequence-exercise-editor.ts";

const legacy: Exercise = { id: "template", title: "Demo", kind: "recognition", optionIds: ["visible", "unavailable"], updatedAt: "2026-01-01" };

test("il modulo conserva opzioni storiche filtrate e valori impliciti quando si cambia soltanto il titolo", () => {
  const form: Exercise = { ...legacy, optionIds: ["visible"], recognitionMode: "fixed", autoPronounce: false };
  assert.equal(applyExerciseForm(legacy, form, { ...form, updatedAt: "today" }), legacy);
  assert.deepEqual(applyExerciseForm(legacy, form, { ...form, title: "Aggiornato", updatedAt: "today" }),
    { ...legacy, title: "Aggiornato", updatedAt: "today" });
});

test("ogni inserimento ha identità, provenienza e configurazione indipendente", () => {
  const first = copyExerciseForSequence(legacy, "sequence-a", "author-a");
  const second = copyExerciseForSequence(legacy, "sequence-a", "author-a");
  const other = copyExerciseForSequence(legacy, "sequence-b", "author-b");
  assert.equal(new Set([legacy.id, first.id, second.id, other.id]).size, 4);
  assert.deepEqual([first.sequenceId, first.ownerAdultId, first.templateExerciseId], ["sequence-a", "author-a", legacy.id]);
  assert.deepEqual([other.sequenceId, other.ownerAdultId, other.templateExerciseId], ["sequence-b", "author-b", legacy.id]);
  first.optionIds.pop();
  assert.deepEqual(second.optionIds, ["visible", "unavailable"]);
  legacy.optionIds.push("new");
  assert.deepEqual(other.optionIds, ["visible", "unavailable"]);
});
