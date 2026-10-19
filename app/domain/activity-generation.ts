import { matchesSyllableFilter, type SyllableFilter } from "./syllabification.ts";

export type ActivityCandidate = {
  id: string;
  word: string;
  category: string;
  syllableCount?: number;
};

export type RandomRecognitionConfig = {
  rounds: number;
  distractorCount: 1 | 2 | 3 | 4;
  distractorSource?: "mixed" | "same-category";
  allowedIds?: string[];
  categories?: string[];
  syllables?: SyllableFilter;
};

export type RecognitionRound = {
  promptId: string;
  optionIds: string[];
};

const learningCategoryAliases: Record<string, string> = {
  Cibo: "Cibi",
  Corpo: "Parti del corpo",
  Abbigliamento: "Vestiti",
  Natura: "Oggetti della natura",
};

export function normalizeLearningCategory(category: string) {
  return learningCategoryAliases[category] ?? category;
}

export function recognitionModeFor(exercise: { recognitionMode?: "fixed" | "random" }) {
  return exercise.recognitionMode ?? "fixed";
}

export function hasSameCategoryDistractors(candidates: ActivityCandidate[], distractorCount: number) {
  const categoryCounts = candidates.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.category]: (counts[item.category] ?? 0) + 1 }), {});
  return Object.values(categoryCounts).some((count) => count >= distractorCount + 1);
}

function shuffledWith<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function promptOrder(candidates: ActivityCandidate[], rounds: number, random: () => number) {
  const result: ActivityCandidate[] = [];
  while (result.length < rounds && candidates.length) {
    const cycle = shuffledWith(candidates, random);
    if (result.length && cycle.length > 1 && cycle[0].id === result.at(-1)?.id) {
      [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
    }
    result.push(...cycle.slice(0, rounds - result.length));
  }
  return result;
}

export function createRandomRecognitionRounds(candidates: ActivityCandidate[], config: RandomRecognitionConfig, random: () => number = Math.random): RecognitionRound[] {
  const allowed = config.allowedIds?.length ? new Set(config.allowedIds) : null;
  const categories = config.categories?.length ? new Set(config.categories) : null;
  const pool = candidates.filter((item) => (!allowed || allowed.has(item.id)) && (!categories || categories.has(item.category)) && matchesSyllableFilter(item, config.syllables));
  const promptPool = config.distractorSource === "same-category"
    ? pool.filter((prompt) => pool.filter((item) => item.id !== prompt.id && item.category === prompt.category).length >= config.distractorCount)
    : pool;
  if (promptPool.length < 1 || pool.length < 2) return [];

  return promptOrder(promptPool, Math.max(1, config.rounds), random).map((prompt) => {
    const alternatives = pool.filter((item) => item.id !== prompt.id);
    const eligibleDistractors = config.distractorSource === "same-category" ? alternatives.filter((item) => item.category === prompt.category) : alternatives;
    const distractors = shuffledWith(eligibleDistractors, random).slice(0, Math.min(config.distractorCount, eligibleDistractors.length));
    return { promptId: prompt.id, optionIds: shuffledWith([prompt, ...distractors].map((item) => item.id), random) };
  });
}

export function pickCategoryRoundIds(candidates: ActivityCandidate[], allowedIds: string[] | undefined, rounds: number, random: () => number = Math.random) {
  const allowed = allowedIds?.length ? new Set(allowedIds) : null;
  const pool = candidates.filter((item) => !allowed || allowed.has(item.id));
  return promptOrder(pool, Math.min(Math.max(1, rounds), pool.length), random).map((item) => item.id);
}
