import test from "node:test";
import assert from "node:assert/strict";
import { applyStateChange, parseStateChangeRequest, rebaseStateChange } from "../app/domain/state-changes.ts";

const placeholder = { id: "old", word: "Rana", category: "Animali", emoji: "🐸", source: "Catalogo demo" };
const archived = { ...placeholder, deleted: true };
const photo = { id: "new", word: "RANA", category: "Animali", privateUpload: true, remoteImageId: "photo" };
const model = { id: "model", promptId: "old", recognitionMode: "random", recognitionTargetIds: ["a", "old"], sentenceItemIds: ["old", "b"] };
const copy = { ...model, id: "copy", templateExerciseId: model.id, sequenceId: "s" };
const detached = { ...copy, id: "detached" };
const previous = { library: [archived, photo], exercises: [model, copy, detached, { ...model, id: "removed", deleted: true }],
  sequences: [{ id: "s", exerciseIds: [copy.id] }] };
const request = { operationId: "repair-operation-123", schemaVersion: 1, baseRevision: 1, collections: {}, values: {}, libraryReplacements: [["old", "new"]] };

test("ripara modelli e copie nella programmazione corrente mantenendo ordine e identità", () => {
  const result = applyStateChange(previous, request);
  const expected = { promptId: "new", recognitionTargetIds: ["a", "new"], sentenceItemIds: ["new", "b"] };
  assert.deepEqual(result.exercises, [{ ...model, ...expected }, { ...copy, ...expected }, detached, previous.exercises[3]]);
  const concurrent = { ...previous, exercises: [model, { ...copy, rounds: 4 }, detached], sequences: [{ id: "s", exerciseIds: [copy.id] }] };
  const rebased = rebaseStateChange(concurrent, request, "another-operation-123", 2);
  assert.deepEqual(rebased.state.exercises, [{ ...model, ...expected }, { ...copy, ...expected, rounds: 4 }, detached]);
  assert.deepEqual(applyStateChange(rebased.state, request), rebased.state);
  assert.deepEqual(applyStateChange({ ...previous, sequences: [{ ...previous.sequences[0], deleted: true }] }, request).exercises,
    [{ ...model, ...expected }, copy, detached, previous.exercises[3]]);
});

test("la sostituzione richiede una foto equivalente unica e una sorgente archiviata già nota", () => {
  for (const library of [[placeholder, photo], [archived, { ...photo, word: "Rosa" }], [archived, { ...photo, category: "Cibi" }],
    [archived, photo, { ...photo, id: "seconda" }], [archived, { ...photo, deleted: true }], [photo],
    [archived, { ...photo, remoteImageId: undefined, imageKey: "solo-locale" }]]) {
    assert.throws(() => applyStateChange({ ...previous, library }, request), /library_replacement_conflict/);
  }
  const archive = { ...request, collections: { library: { upserts: [archived], order: [], removedIds: [] } } };
  for (const old of [{ ...placeholder, image: "/foto.webp" }, { ...placeholder, word: "Altra" }, { ...placeholder, contentKind: "sentence" }]) {
    assert.throws(() => applyStateChange({ ...previous, library: [old, photo] }, archive), /library_replacement_conflict/);
  }
  for (const pairs of [[], [["old", "old"]], [["old", "new"], ["old", "altro"]], [["old"]], [["old", 4]]]) {
    assert.throws(() => parseStateChangeRequest({ ...request, libraryReplacements: pairs }), /invalid_library_replacements/);
  }
});
