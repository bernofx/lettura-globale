// The database can store ADR 0028 metadata before the copy-aware editor and permissions ship.
export function containsExerciseCopyMetadata(exercises: unknown): boolean {
  return Array.isArray(exercises) && exercises.some(exercise =>
    exercise && typeof exercise === "object" &&
    (exercise.ownerAdultId != null || exercise.sequenceId != null || exercise.templateExerciseId != null)
  );
}
