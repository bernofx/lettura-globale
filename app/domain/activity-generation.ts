export type ActivityCandidate = {
  id: string;
  word: string;
  category: string;
};

export type RandomRecognitionConfig = {
  rounds: number;
  distractorCount: 3 | 4;
  allowedIds?: string[];
  categories?: string[];
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
  const pool = candidates.filter((item) => (!allowed || allowed.has(item.id)) && (!categories || categories.has(item.category)));
  if (pool.length < 2) return [];

  return promptOrder(pool, Math.max(1, config.rounds), random).map((prompt) => {
    const alternatives = pool.filter((item) => item.id !== prompt.id);
    const sameCategory = shuffledWith(alternatives.filter((item) => item.category === prompt.category), random);
    const similar = shuffledWith(alternatives.filter((item) => item.category !== prompt.category && (item.word[0]?.toLocaleLowerCase("it-IT") === prompt.word[0]?.toLocaleLowerCase("it-IT") || Math.abs(item.word.length - prompt.word.length) <= 2)), random);
    const remaining = shuffledWith(alternatives.filter((item) => !sameCategory.some((candidate) => candidate.id === item.id) && !similar.some((candidate) => candidate.id === item.id)), random);
    const distractors = [...sameCategory, ...similar, ...remaining].slice(0, Math.min(config.distractorCount, alternatives.length));
    return { promptId: prompt.id, optionIds: shuffledWith([prompt, ...distractors].map((item) => item.id), random) };
  });
}

export function pickCategoryRoundIds(candidates: ActivityCandidate[], allowedIds: string[] | undefined, rounds: number, random: () => number = Math.random) {
  const allowed = allowedIds?.length ? new Set(allowedIds) : null;
  const pool = candidates.filter((item) => !allowed || allowed.has(item.id));
  return promptOrder(pool, Math.min(Math.max(1, rounds), pool.length), random).map((item) => item.id);
}
