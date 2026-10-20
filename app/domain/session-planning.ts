import { matchesSyllableFilter, type SyllableFilter } from "./syllabification.ts";

export type QuickCandidate = {
  id: string;
  category: string;
  syllableCount?: number;
};

export type QuickFilterConfig = {
  activity: "recognition" | "articles" | "word-categories" | "naming";
  selection: "all" | "categories" | "items";
  categoryNames: string[];
  itemIds: string[];
  distractorCount?: 1 | 2 | 3 | 4;
  recognitionSyllables?: SyllableFilter;
};

export function filterQuickCandidates<T extends QuickCandidate>(candidates: T[], config: QuickFilterConfig) {
  const allowedIds = config.selection === "items" ? new Set(config.itemIds) : null;
  const allowedCategories = config.selection === "categories" || config.activity === "word-categories" ? new Set(config.categoryNames) : null;
  return candidates.filter((item) => (!allowedIds || allowedIds.has(item.id)) && (!allowedCategories || allowedCategories.has(item.category)) && (config.activity !== "recognition" || matchesSyllableFilter(item, config.recognitionSyllables)));
}

export function quickStartIsValid(config: QuickFilterConfig, candidateCount: number) {
  if (config.activity === "recognition") return candidateCount >= (config.distractorCount ?? 3) + 1;
  if (config.activity === "articles") return candidateCount >= 1;
  if (config.activity === "naming") return candidateCount >= 1;
  return config.categoryNames.length >= 2 && config.categoryNames.length <= 4 && candidateCount >= 1;
}
