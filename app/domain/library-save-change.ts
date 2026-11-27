import { exerciseLibraryIds, remapProgramExercises, withoutDerivedReferences } from "./exercise-library-references.ts";
import { availableLibraryReplacements } from "./library-deduplication.ts";
import { buildStateChange, parseStateChangeRequest, rebaseStateChange } from "./state-changes.ts";
import type { BackendState, LibraryItem } from "../shared/types";

export function buildLibrarySaveChange(previous: BackendState, next: BackendState, operationId: string, revision: number) {
  const change = buildStateChange(previous, next, operationId, revision);
  if (!change || (!change.collections.library && !change.collections.exercises)) return change;
  const replacements = availableLibraryReplacements(previous.library, next.library);
  if (!replacements.size) return change;
  const editedItems = new Set(change.collections.library?.upserts.map(item => item.id));
  const editedExercises = new Set(change.collections.exercises?.upserts.map(exercise => exercise.id));
  const previousRefs = new Set(previous.exercises.filter(exercise => editedExercises.has(exercise.id)).flatMap(exerciseLibraryIds));
  for (const [source, target] of replacements) {
    if (!editedItems.has(source) && !editedItems.has(target) && !previousRefs.has(source)) replacements.delete(source);
  }
  if (!replacements.size) return change;
  // A photo upload may save before React applies the local repair. Send the
  // command when both sides of the visible program agree on the resulting IDs.
  const stillUsing = remapProgramExercises(next.exercises, next.sequences, replacements);
  for (let i = 0; i < stillUsing.length; i++) {
    if (stillUsing[i] !== next.exercises[i]) {
      for (const id of exerciseLibraryIds(next.exercises[i])) replacements.delete(id);
    }
  }
  if (!replacements.size) return change;
  const derived = remapProgramExercises(previous.exercises, next.sequences, replacements);
  const byId = new Map(previous.exercises.map((exercise, i) => [exercise.id, i]));
  const explicit = next.exercises.map(exercise => {
    const i = byId.get(exercise.id);
    return i !== undefined && derived[i] !== previous.exercises[i]
      ? withoutDerivedReferences(previous.exercises[i], derived[i], exercise) : exercise;
  });
  const edits = buildStateChange({ exercises: previous.exercises }, { exercises: explicit }, operationId, revision)?.collections.exercises;
  if (edits) change.collections.exercises = edits;
  else delete change.collections.exercises;
  change.libraryReplacements = [...replacements];
  return change;
}

// On a conflicting library edit keep the new photo and independent work.
// Leave the disputed placeholder as it now exists in the cloud.
export function rebaseLibrarySaveChange(latest: BackendState, raw: unknown, operationId: string, revision: number) {
  try {
    return { ...rebaseStateChange(latest, raw, operationId, revision), replacementConflict: false };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "library_replacement_conflict") throw error;
  }
  const { libraryReplacements, ...ordinary } = parseStateChangeRequest(raw);
  const libraryChange = ordinary.collections.library;
  const library = libraryChange ? rebaseStateChange(latest, { ...ordinary, collections: { library: libraryChange }, values: {} }, operationId, revision).state.library as LibraryItem[] : latest.library;
  const available = availableLibraryReplacements(latest.library, library);
  const valid = (libraryReplacements ?? []).filter(([source, target]) => available.get(source) === target);
  const disputed = new Set(libraryReplacements?.filter(([source, target]) => available.get(source) !== target).map(([source]) => source));
  if (libraryChange) {
    libraryChange.upserts = libraryChange.upserts.filter(item => !disputed.has(item.id));
  }
  const remaining = { ...ordinary, ...(valid.length ? { libraryReplacements: valid } : {}) };
  if (!valid.length && !Object.keys(ordinary.collections).length && !Object.keys(ordinary.values).length) {
    return { state: latest, change: null, replacementConflict: true };
  }
  return { ...rebaseStateChange(latest, remaining, operationId, revision), replacementConflict: true };
}
