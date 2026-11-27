import type { StateChangeRequest } from "./state-changes.ts";

// The database can store ADR 0028 metadata before the copy-aware editor and permissions ship.
export function containsExerciseCopyMetadata(exercises: unknown): boolean {
  return Array.isArray(exercises) && exercises.some(exercise =>
    exercise && typeof exercise === "object" &&
    (exercise.ownerAdultId != null || exercise.sequenceId != null || exercise.templateExerciseId != null)
  );
}

// Until the copy-aware writer ships, only session events, preferences and other
// changes that preserve the exercise catalogue and sequence membership may pass.
export function legacyEditNeedsUpdate(state: unknown, change: StateChangeRequest) {
  if (!state || typeof state !== "object") return false;
  const { exercises, sequences } = change.collections;
  if (!exercises && !sequences) return false;
  const stored = state as { exercises?: unknown; sequences?: { id: string; exerciseIds?: unknown; deleted?: boolean }[] };
  if (!containsExerciseCopyMetadata(stored.exercises)) return false;
  if (exercises || sequences?.removedIds.length) return true;
  if (!sequences?.upserts.length) return false;
  const existing = new Map(stored.sequences?.map(sequence => [sequence.id, sequence]));
  return sequences.upserts.some(sequence => {
    const previous = existing.get(sequence.id);
    return !previous || Boolean(previous.deleted) !== Boolean(sequence.deleted) ||
      JSON.stringify(previous.exerciseIds) !== JSON.stringify(sequence.exerciseIds);
  });
}
