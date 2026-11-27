import test from "node:test";
import assert from "node:assert/strict";
import { applyStateChange } from "../app/domain/state-changes.ts";
import { buildLibrarySaveChange, rebaseLibrarySaveChange } from "../app/domain/library-save-change.ts";
import { deduplicateLibraryPlaceholders } from "../app/domain/library-deduplication.ts";
import { remapProgramExercises } from "../app/domain/exercise-library-references.ts";
import type { BackendState } from "../app/shared/types";

const id = "library-save-operation-1";
const old = { id: "old", category: "Animali", word: "Gatto", source: "Catalogo demo", license: "Demo", author: "Demo", emoji: "🐈" };
const localPhoto = { ...old, id: "photo", privateUpload: true, imageKey: "local-photo", image: "data:image/webp;base64,AA==" };
const photo = { ...old, id: localPhoto.id, imageKey: localPhoto.imageKey, privateUpload: true, remoteImageId: "remote-photo" };
const model = { id: "model", title: "Demo", updatedAt: "", promptId: old.id, optionIds: [old.id, "altra"] };
const state: BackendState = { schemaVersion: 1, activeChildId: "", therapists: [], children: [], helps: [], attempts: [], sessionHistory: [],
  exercises: [model], sequences: [], library: [old] };
function repair(source: BackendState) {
  const { items, replacements } = deduplicateLibraryPlaceholders(source.library, true);
  return { ...source, library: items, exercises: remapProgramExercises(source.exercises, source.sequences, replacements) };
}

test("la foto offline rimane disponibile sul dispositivo e sostituisce il segnaposto dopo il caricamento", () => {
  const offline = repair({ ...state, library: [old, localPhoto] });
  assert.deepEqual(offline.library, [old, localPhoto]);
  assert.equal(offline.exercises[0].promptId, old.id);
  const online = repair({ ...offline, library: [old, photo] });
  const change = buildLibrarySaveChange(offline, online, id, 2)!;
  assert.deepEqual(change.libraryReplacements, [[old.id, photo.id]]);
  assert.equal(change.collections.exercises, undefined);
  assert.deepEqual(applyStateChange(offline, change), online);
  assert.equal(buildLibrarySaveChange(online, online, id, 3), null);
});

test("la coppia viene inviata anche senza esercizi visibili e conserva le modifiche manuali", () => {
  const hidden = { ...state, exercises: [] };
  const upload = repair({ ...hidden, library: [old, photo] });
  assert.deepEqual(buildLibrarySaveChange(hidden, upload, id, 1)?.libraryReplacements, [[old.id, photo.id]]);
  const next = repair({ ...state, library: [old, photo] });
  next.exercises[0] = { ...next.exercises[0], rounds: 6 };
  const edited = buildLibrarySaveChange(state, next, id, 1)!;
  assert.deepEqual(edited.collections.exercises?.upserts, [{ ...model, rounds: 6 }]);
  assert.deepEqual(applyStateChange(state, edited), next);
});

test("la coda offline conserva foto ed edit indipendenti quando una seconda foto rende ambiguo il ripristino", () => {
  const next = repair({ ...state, library: [old, photo] });
  next.exercises[0] = { ...next.exercises[0], rounds: 3 };
  const pending = JSON.parse(JSON.stringify(buildLibrarySaveChange(state, next, id, 1)));
  const second = { ...photo, id: "other", remoteImageId: "other-media" };
  const latest = { ...state, library: [old, second] };
  const result = rebaseLibrarySaveChange(latest, pending, id, 2);
  assert.equal(result.replacementConflict, true);
  assert.equal(result.change?.libraryReplacements, undefined);
  assert.deepEqual(result.state.exercises, [{ ...model, rounds: 3 }]);
  assert.deepEqual(result.state.library, [old, photo, second]);
  assert.deepEqual(applyStateChange(latest, result.change), result.state);
});
