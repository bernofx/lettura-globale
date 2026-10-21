export type PhraseStructure = "subject-verb" | "subject-verb-complement";
export type SentenceDifficulty = 1 | 2;
export type SentenceOptionCount = 2 | 4;

export type SentenceScene = {
  id: string;
  contentKind?: "word" | "sentence";
  subject?: string;
  verb?: string;
  complement?: string;
  phraseStructure?: PhraseStructure;
  image?: unknown;
  emoji?: unknown;
  remoteImageId?: unknown;
};

export type SentenceMatchingConfig = {
  rounds: number;
  optionCount: SentenceOptionCount;
  difficulty: SentenceDifficulty;
  allowedIds?: string[];
};

export type SentenceMatchingRound = { promptId: string; optionIds: string[] };

function normalized(value: string | undefined) {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("it-IT");
}

function shuffled<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function isSimpleSentenceScene(scene: SentenceScene) {
  return scene.contentKind === "sentence"
    && (scene.phraseStructure ?? "subject-verb") === "subject-verb"
    && Boolean(normalized(scene.subject) && normalized(scene.verb))
    && Boolean(scene.image || scene.emoji || scene.remoteImageId);
}

function eligibleOptions(prompt: SentenceScene, pool: SentenceScene[], config: SentenceMatchingConfig) {
  const subject = normalized(prompt.subject);
  const verb = normalized(prompt.verb);
  if (config.difficulty === 1) {
    const alternatives = pool.filter((item) => normalized(item.subject) === subject && normalized(item.verb) !== verb);
    return alternatives.length >= config.optionCount - 1
      ? [prompt, ...alternatives.slice(0, config.optionCount - 1)]
      : null;
  }
  if (config.optionCount !== 4) return null;
  const subjects = [...new Set(pool.map((item) => normalized(item.subject)).filter((value) => value && value !== subject))];
  const verbs = [...new Set(pool.map((item) => normalized(item.verb)).filter((value) => value && value !== verb))];
  for (const otherSubject of subjects) {
    for (const otherVerb of verbs) {
      const sameSubjectOtherVerb = pool.find((item) => normalized(item.subject) === subject && normalized(item.verb) === otherVerb);
      const otherSubjectSameVerb = pool.find((item) => normalized(item.subject) === otherSubject && normalized(item.verb) === verb);
      const otherSubjectOtherVerb = pool.find((item) => normalized(item.subject) === otherSubject && normalized(item.verb) === otherVerb);
      if (sameSubjectOtherVerb && otherSubjectSameVerb && otherSubjectOtherVerb) {
        return [prompt, sameSubjectOtherVerb, otherSubjectSameVerb, otherSubjectOtherVerb];
      }
    }
  }
  return null;
}

export function sentenceMatchingAvailability(scenes: SentenceScene[], config: SentenceMatchingConfig) {
  const allowed = config.allowedIds?.length ? new Set(config.allowedIds) : null;
  const pool = scenes.filter((scene) => isSimpleSentenceScene(scene) && (!allowed || allowed.has(scene.id)));
  const eligiblePrompts = pool.filter((prompt) => Boolean(eligibleOptions(prompt, pool, config)));
  return { poolCount: pool.length, eligiblePromptCount: eligiblePrompts.length, valid: eligiblePrompts.length > 0 };
}

export function createSentenceMatchingRounds(scenes: SentenceScene[], config: SentenceMatchingConfig, random: () => number = Math.random): SentenceMatchingRound[] {
  const allowed = config.allowedIds?.length ? new Set(config.allowedIds) : null;
  const pool = scenes.filter((scene) => isSimpleSentenceScene(scene) && (!allowed || allowed.has(scene.id)));
  const eligible = pool.map((prompt) => ({ prompt, options: eligibleOptions(prompt, pool, config) })).filter((entry): entry is { prompt: SentenceScene; options: SentenceScene[] } => Boolean(entry.options));
  if (!eligible.length) return [];
  const result: SentenceMatchingRound[] = [];
  while (result.length < Math.max(1, config.rounds)) {
    const cycle = shuffled(eligible, random);
    if (result.length > 0 && cycle.length > 1 && cycle[0].prompt.id === result.at(-1)?.promptId) [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
    for (const entry of cycle) {
      result.push({ promptId: entry.prompt.id, optionIds: shuffled(entry.options.map((item) => item.id), random) });
      if (result.length >= Math.max(1, config.rounds)) break;
    }
  }
  return result;
}
