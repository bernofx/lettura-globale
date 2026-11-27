import assert from "node:assert/strict";
import test from "node:test";
import { mergeSequenceSteps, canRestoreStepOrder } from "../app/domain/sequence-step-merge.ts";
import { buildCloudSaveChange, rebaseCloudSaveChange } from "../app/domain/cloud-save-change.ts";
import { parseStateChangeRequest } from "../app/domain/state-changes.ts";
import type { BackendState, Exercise, Sequence } from "../app/shared/types";

test("riordino e aggiunta, due inserimenti nello stesso intervallo e retry conservano tutti i passi", () => {
  assert.deepEqual(mergeSequenceSteps(["a", "b"], ["a", "b", "c"], ["b", "a"]), ["b", "a", "c"]);
  assert.deepEqual(mergeSequenceSteps(["a"], ["a", "l"], ["a", "r"]), ["a", "r", "l"]);
  assert.deepEqual(mergeSequenceSteps(["a"], ["a", "l"], ["a", "r", "l"]), ["a", "r", "l"]);
  assert.deepEqual(mergeSequenceSteps(["a", "b", "c"], ["x", "b", "c"], ["a", "b", "y"]), ["x", "b", "y"]);
  assert.deepEqual(mergeSequenceSteps(["a", "b", "c"], ["b", "c"], ["a", "b"]), ["b"]);
  assert.deepEqual(mergeSequenceSteps(["a"], [], ["a"]), []);
});

test("riordini sovrapposti, sostituzione contro rimozione e posizioni storiche ambigue richiedono una scelta", () => {
  assert.equal(mergeSequenceSteps(["a", "b", "c"], ["b", "a", "c"], ["a", "c", "b"]), null);
  assert.equal(mergeSequenceSteps(["a", "b"], ["a", "copy"], ["a"]), null);
  assert.equal(mergeSequenceSteps(["m", "m"], ["m"], ["copy", "m"]), null);
});

const op = "operation-synthetic";
const program: Sequence = { id: "s", title: "Demo", therapistId: "adult", exerciseIds: ["a", "b", "c"] };
const items: Exercise[] = program.exerciseIds.map(id => ({ id, title: id.toUpperCase(), optionIds: [], updatedAt: "2026-01-01" }));
const baseline: BackendState = { schemaVersion: 1, activeChildId: "synthetic", sequences: [program], exercises: items,
  therapists: [], children: [], attempts: [], helps: [], sessionHistory: [], library: [] };

test("conflitto in coda: bozza solo per l’autore e altri dati sincronizzati, anche se la sequenza è scomparsa", () => {
  const edit = { ...program, exerciseIds: ["b", "a", "c"] };
  const change = buildCloudSaveChange(baseline, { ...baseline, sequences: [edit], tracingOrderRequired: true }, op, 2, "adult")!;
  assert.ok(!("sequenceEdits" in parseStateChangeRequest(change)));
  for (const sequences of [[], [{ ...program, deleted: true }], [{ ...program, therapistId: "other" }], [{ ...program, exerciseIds: ["a", "c", "b"] }]]) {
    const latest = { ...baseline, sequences };
    const held: unknown[] = [];
    const result = rebaseCloudSaveChange(latest, JSON.parse(JSON.stringify(change)), op, 3, {
      adultId: "adult", preserve() {}, preserveSequence: (...args) => held.push(args),
    });
    assert.deepEqual(result.state, { ...latest, tracingOrderRequired: true });
    assert.deepEqual(held, [["adult", { id: "s", title: "Demo", steps: edit.exerciseIds.map(id => ({ id, title: id.toUpperCase() })) }]]);
  }
});

test("un’aggiunta concorrente conserva il riordino del collega e resta idempotente dopo la conferma", () => {
  const newItem = { ...items[0], id: "d" };
  const before = { ...baseline, exercises: [...items, newItem] };
  const change = buildCloudSaveChange(before, { ...before, sequences: [{ ...program, exerciseIds: [...program.exerciseIds, "d"], updatedAt: "2026-01-02" }] }, op, 2, "adult")!;
  const latest = { ...before, sequences: [{ ...program, exerciseIds: ["b", "a", "c"], title: "Aggiornata" }] };
  const recovery = { adultId: "adult", preserve() {}, preserveSequence() { assert.fail(); } };
  const result = rebaseCloudSaveChange(latest, change, op, 4, recovery);
  assert.deepEqual(result.state.sequences, [{ ...latest.sequences[0], exerciseIds: ["b", "a", "c", "d"], updatedAt: "2026-01-02" }]);
  assert.equal(rebaseCloudSaveChange(result.state as BackendState, change, op, 5, recovery).change, null);
});

test("la bozza di una copia nuova resta sul dispositivo se la posizione è stata sostituita da un collega", () => {
  const copy = { ...items[1], id: "copy", sequenceId: "s", templateExerciseId: "b", ownerAdultId: "adult" };
  const edit = { ...program, exerciseIds: ["a", "copy", "c"] };
  const change = buildCloudSaveChange(baseline, { ...baseline, exercises: [...items, copy], sequences: [edit] }, op, 2, "adult")!;
  const latest = { ...baseline, sequences: [{ ...program, exerciseIds: ["a", "c"] }] };
  const held: unknown[] = [];
  const result = rebaseCloudSaveChange(latest, change, op, 4, { adultId: "adult", preserveSequence() {}, preserve: (_, draft) => held.push(draft) });
  assert.deepEqual(held, [copy]);
  assert.deepEqual(result.state, latest);
});

test("il ripristino esplicito di un ordine conserva ogni occorrenza ed esclude aggiunte o rimozioni", () => {
  assert.ok(canRestoreStepOrder(["a", "a", "b"], ["b", "a", "a"]));
  assert.equal(canRestoreStepOrder(["a", "a", "b"], ["a", "b", "b"]), false);
  assert.equal(canRestoreStepOrder(["a"], ["a"]), false);
});
