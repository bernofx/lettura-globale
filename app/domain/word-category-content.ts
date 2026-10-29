type CategoryContent = { category?: string; contentKind?: unknown; phraseStructure?: unknown; categorySymbolOnly?: boolean };

/** Sentence scenes and dedicated category symbols are not words to classify. */
export function isWordCategoryContent(item: CategoryContent) {
  const category = item.category?.trim().toLocaleLowerCase("it-IT");
  return !item.categorySymbolOnly && item.contentKind !== "sentence" && !item.phraseStructure && category !== "azione" && category !== "azioni";
}

export function availableForWordCategories<T extends CategoryContent>(items: T[]) {
  return items.filter(isWordCategoryContent);
}

export function wordCategoryNames(items: CategoryContent[], requested?: string[]) {
  const names = new Set(availableForWordCategories(items).map((item) => item.category).filter((name): name is string => Boolean(name)));
  // A frozen shared turn may contain only the target's assets: an absent
  // distractor category is still valid. Remove only reserved/scene-only names.
  return requested ? requested.filter((name) => !["azione", "azioni"].includes(name.trim().toLocaleLowerCase("it-IT")) &&
    (names.has(name) || !items.some((item) => !item.categorySymbolOnly && item.category === name))) : [...names].sort((a, b) => a.localeCompare(b, "it"));
}
