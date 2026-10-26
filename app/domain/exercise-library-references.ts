type References = {
  promptId?: string; optionIds?: string[]; articleItemIds?: string[];
  categoryItemIds?: string[]; recognitionItemIds?: string[]; namingItemIds?: string[]; sentenceItemIds?: string[];
};

/** Only remap explicit IDs; never change random/fixed mode, filters or history. */
export function remapExerciseReferences<T extends References>(exercise: T, replacements: Map<string, string>): T {
  const keys = ["optionIds", "articleItemIds", "categoryItemIds", "recognitionItemIds", "namingItemIds", "sentenceItemIds"] as const;
  const next = { ...exercise };
  let changed = false;
  if (exercise.promptId && replacements.has(exercise.promptId)) { next.promptId = replacements.get(exercise.promptId)!; changed = true; }
  for (const key of keys) {
    const ids = exercise[key];
    if (!ids?.some((id) => replacements.has(id))) continue;
    next[key] = [...new Set(ids.map((id) => replacements.get(id) ?? id))];
    changed = true;
  }
  return changed ? next : exercise;
}
