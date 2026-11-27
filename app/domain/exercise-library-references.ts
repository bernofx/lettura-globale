type References = {
  promptId?: string; optionIds?: string[]; articleItemIds?: string[];
  categoryItemIds?: string[]; recognitionItemIds?: string[]; recognitionTargetIds?: string[]; namingItemIds?: string[]; sentenceItemIds?: string[];
};

const listKeys = ["optionIds", "articleItemIds", "categoryItemIds", "recognitionItemIds", "recognitionTargetIds", "namingItemIds", "sentenceItemIds"] as const;

export function exerciseLibraryIds(exercise: References) {
  return [...(exercise.promptId ? [exercise.promptId] : []), ...listKeys.flatMap(key => exercise[key] ?? [])];
}

// Keep manual exercise edits independent from the substitution command, so a
// conflicting photo choice can be dropped without undoing those edits.
export function withoutDerivedReferences<T extends References>(before: T, derived: T, edited: T) {
  const result = { ...edited };
  for (const key of ["promptId", ...listKeys] as const) {
    if (before[key] !== derived[key] && JSON.stringify(edited[key]) === JSON.stringify(derived[key])) {
      Object.assign(result, { [key]: before[key] });
    }
  }
  return result;
}

/** Only remap explicit IDs; never change random/fixed mode, filters or history. */
export function remapExerciseReferences<T extends References>(exercise: T, replacements: Map<string, string>): T {
  const next = { ...exercise };
  let changed = false;
  if (exercise.promptId && replacements.has(exercise.promptId)) { next.promptId = replacements.get(exercise.promptId)!; changed = true; }
  for (const key of listKeys) {
    const ids = exercise[key];
    if (!ids?.some((id) => replacements.has(id))) continue;
    next[key] = [...new Set(ids.map((id) => replacements.get(id) ?? id))];
    changed = true;
  }
  return changed ? next : exercise;
}

/** A detached copy is retained for history and no longer belongs to the live program. */
export function remapProgramExercises<T extends References & { id: string; deleted?: boolean; sequenceId?: string }>(
  exercises: T[], sequences: { id: string; exerciseIds?: string[]; deleted?: boolean }[], replacements: Map<string, string>,
) {
  const members = new Map(sequences.filter(sequence => !sequence.deleted)
    .map(sequence => [sequence.id, new Set(sequence.exerciseIds)]));
  return exercises.map(exercise =>
    exercise.deleted || (exercise.sequenceId && !members.get(exercise.sequenceId)?.has(exercise.id))
      ? exercise : remapExerciseReferences(exercise, replacements));
}
