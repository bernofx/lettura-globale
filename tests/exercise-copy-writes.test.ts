import assert from "node:assert/strict";
import test from "node:test";
import { validateExerciseCopyWrite } from "../app/domain/exercise-copy-writes.ts";
import { buildStateChange } from "../app/domain/state-changes.ts";

const therapists = ["Terapista", "Genitore", "Supervisore", "Amministratore"].map(role => ({ id: role, role }));
const model = { id: "model", title: "Modello" };
const first = { id: "first", therapistId: "Terapista", exerciseIds: ["model", "model"] };
const second = { id: "second", therapistId: "Genitore", exerciseIds: ["model"] };
const base = { therapists, exercises: [model], sequences: [first, second] };
const copy = { ...model, id: "copy", title: "Personalizzato", ownerAdultId: "Terapista", sequenceId: "first", templateExerciseId: model.id };
const saved = { ...base, exercises: [model, copy], sequences: [{ ...first, exerciseIds: ["model", "copy"] }, second] };
type Program = Parameters<typeof validateExerciseCopyWrite>[0];
function validate(before: Program, after: Program, actor = "Terapista") {
  const change = buildStateChange(before, after, "fixture-operation", 1)!;
  return validateExerciseCopyWrite(before, after, change, actor);
}

test("le voci storiche si possono riordinare o staccare una alla volta, anche con modelli ripetuti", () => {
  assert.equal(validate(base, saved), undefined);
  assert.equal(validate(saved, { ...saved, sequences: [{ ...first, exerciseIds: ["copy", "model"] }, second] }), undefined);
  assert.equal(validate(base, { ...base, sequences: [{ ...first, exerciseIds: [...first.exerciseIds, "model"] }, second] }), "sequence_copy_required");
  assert.equal(validate(saved, { ...saved, sequences: [{ ...first, exerciseIds: ["copy", "copy"] }, second] }), "invalid_sequence_copy");
});

test("la copia si modifica con i permessi della sequenza e conserva la sua identità", () => {
  const edit = { ...saved, exercises: [model, { ...copy, title: "Nuovo titolo" }] };
  for (const role of ["Terapista", "Supervisore", "Amministratore"]) assert.equal(validate(saved, edit, role), undefined);
  assert.equal(validate(saved, edit, "Genitore"), "copy_sequence_required");
  for (const role of therapists.map(adult => adult.id)) {
    assert.equal(validate(saved, { ...saved, exercises: [model, { ...copy, ownerAdultId: "Genitore" }] }, role), "exercise_identity_changed");
    assert.equal(validate(saved, { ...saved, sequences: [saved.sequences[0], { ...second, exerciseIds: [copy.id] }] }, role), "invalid_sequence_copy");
  }
  const derived = { ...copy, id: "another", templateExerciseId: copy.id };
  const next = { ...saved, exercises: [...saved.exercises, derived], sequences: [{ ...first, exerciseIds: [copy.id, derived.id] }, second] };
  assert.equal(validate(saved, next), "invalid_exercise_copy");
  assert.equal(validate(base, saved, "Supervisore"), "exercise_author_required");
  assert.equal(validate(base, { ...base, exercises: [model, { ...model, id: "new" }] }), "exercise_author_required");
});

test("le copie rimosse restano nello storico e i modelli nei programmi attivi restano disponibili", () => {
  const detached = { ...saved, sequences: [{ ...first, exerciseIds: [] }, second] };
  assert.equal(validate(saved, detached), undefined);
  assert.equal(validate(detached, { ...saved, sequences: [{ ...first, exerciseIds: [copy.id] }, second] }), "detached_copy");
  assert.equal(validate(detached, { ...detached, exercises: [model, { ...copy, title: "Altro" }] }), "copy_sequence_required");
  assert.equal(validate(detached, { ...detached, exercises: [model] }), "archive_required");
  assert.equal(validate(saved, { ...saved, exercises: [{ ...model, deleted: true }, copy] }), "template_in_use");
  const copiesOnly = { ...saved, sequences: [{ ...first, exerciseIds: [copy.id] }] };
  assert.equal(validate(copiesOnly, { ...copiesOnly, exercises: [{ ...model, deleted: true }, copy] }), undefined);
});
