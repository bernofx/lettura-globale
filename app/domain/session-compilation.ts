import { createRandomRecognitionRounds, pickCategoryRoundIds, recognitionModeFor } from "./activity-generation.ts";
import { availableForRecognition, hasArtwork, type LibraryMediaItem } from "./library-availability.ts";
import type { SyllableFilter } from "./syllabification.ts";

export type SessionActivity = "recognition" | "articles" | "word-categories" | "naming";
export type SessionExercise = {
  id: string;
  title: string;
  kind?: SessionActivity;
  promptId?: string;
  optionIds: string[];
  articleItemIds?: string[];
  categoryItemIds?: string[];
  categoryNames?: string[];
  recognitionMode?: "fixed" | "random";
  recognitionItemIds?: string[];
  recognitionCategories?: string[];
  recognitionSyllables?: SyllableFilter;
  namingItemIds?: string[];
  namingCategories?: string[];
  distractorCount?: 1 | 2 | 3 | 4;
  distractorSource?: "mixed" | "same-category";
  presentation?: "images" | "words";
  autoPronounce?: boolean;
  rounds?: number;
  sourceExerciseId?: string;
  updatedAt: string;
  deleted?: boolean;
};

export type SessionPlanLibraryItem = LibraryMediaItem & {
  id: string;
  word: string;
  category: string;
  article?: "IL" | "LA" | null;
  syllableCount?: number;
};

type CompileOptions<T extends SessionPlanLibraryItem> = {
  articleFor: (item: T) => "IL" | "LA" | null | undefined;
  random?: () => number;
  createId?: () => string;
};

function shuffled<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1));
    [result[index], result[swapWith]] = [result[swapWith], result[index]];
  }
  return result;
}

export function compileSessionPlan<T extends SessionPlanLibraryItem>(exercises: SessionExercise[], library: T[], options: CompileOptions<T>) {
  const random = options.random ?? Math.random;
  const createId = options.createId ?? (() => crypto.randomUUID());

  return exercises.flatMap((exercise) => {
    const kind = exercise.kind ?? "recognition";
    const sourceExerciseId = exercise.sourceExerciseId ?? exercise.id;
    const round = (index: number, overrides: Partial<SessionExercise>): SessionExercise => ({
      ...exercise,
      ...overrides,
      id: `${sourceExerciseId}:round:${index}:${createId()}`,
      sourceExerciseId,
      rounds: 1,
    });

    if (kind === "recognition") {
      if (recognitionModeFor(exercise) !== "random") return [exercise];
      return createRandomRecognitionRounds(availableForRecognition(library, exercise.presentation), {
        rounds: exercise.rounds ?? 6,
        distractorCount: exercise.distractorCount ?? 3,
        fixedPromptId: exercise.promptId || undefined,
        distractorSource: exercise.distractorSource ?? "mixed",
        allowedIds: exercise.recognitionItemIds,
        categories: exercise.recognitionCategories,
        syllables: exercise.recognitionSyllables,
      }, random).map((item, index) => round(index, { recognitionMode: "fixed", promptId: item.promptId, optionIds: item.optionIds }));
    }

    if (kind === "articles") {
      const ids = shuffled((exercise.articleItemIds ?? []).filter((id) => library.some((item) => item.id === id && hasArtwork(item) && options.articleFor(item))), random)
        .slice(0, Math.max(1, exercise.rounds ?? 6));
      return ids.map((id, index) => round(index, { articleItemIds: [id] }));
    }

    if (kind === "word-categories") {
      const categories = new Set(exercise.categoryNames ?? []);
      const candidates = library.filter((item) => categories.has(item.category));
      return pickCategoryRoundIds(candidates, exercise.categoryItemIds, exercise.rounds ?? 6, random)
        .map((id, index) => round(index, { categoryItemIds: [id] }));
    }

    const allowedIds = exercise.namingItemIds?.length ? new Set(exercise.namingItemIds) : null;
    const categories = exercise.namingCategories?.length ? new Set(exercise.namingCategories) : null;
    const ids = shuffled(library.filter((item) => hasArtwork(item) && (!allowedIds || allowedIds.has(item.id)) && (!categories || categories.has(item.category))).map((item) => item.id), random)
      .slice(0, Math.max(1, exercise.rounds ?? 6));
    return ids.map((id, index) => round(index, { namingItemIds: [id], namingCategories: [] }));
  });
}
