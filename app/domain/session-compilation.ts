import { createRandomRecognitionRounds, pickCategoryRoundIds, recognitionModeFor } from "./activity-generation.ts";
import { availableForWordCategories, wordCategoryNames } from "./word-category-content.ts";
import { availableForRecognition, hasArtwork, type LibraryMediaItem } from "./library-availability.ts";
import type { SyllableFilter } from "./syllabification.ts";
import { createQuantityRounds, type QuantityObject, type QuantityObjectSet } from "./quantity-exercise.ts";
import { createSentenceMatchingRounds, type PhraseStructure, type SentenceDifficulty, type SentenceOptionCount } from "./sentence-matching.ts";

import { categoryImageError, snapshotCategorySymbols, type CategorySymbols } from "./category-images.ts";

export type SessionActivity = "recognition" | "articles" | "word-categories" | "naming" | "number-quantity" | "sentence-matching";
export type SessionExercise = {
  id: string;
  title: string;
  kind?: SessionActivity;
  promptId?: string;
  optionIds: string[];
  articleItemIds?: string[];
  categoryItemIds?: string[];
  categoryNames?: string[];
  categorySpeakWord?: boolean;
  categoryShowTargetImage?: boolean;
  categoryShowSymbols?: boolean;
  categorySymbolIds?: CategorySymbols;
  recognitionMode?: "fixed" | "random";
  recognitionItemIds?: string[];
  recognitionCategories?: string[];
  recognitionSyllables?: SyllableFilter;
  namingItemIds?: string[];
  namingCategories?: string[];
  quantityMin?: number;
  quantityMax?: number;
  quantityObjectSet?: QuantityObjectSet;
  quantityAutoComplete?: boolean;
  quantitySpeakNumbers?: boolean;
  quantityErrorless?: boolean;
  quantityIdleSeconds?: number;
  quantityTarget?: number;
  quantityObject?: QuantityObject;
  sentenceItemIds?: string[];
  sentenceOptionCount?: SentenceOptionCount;
  sentenceDifficulty?: SentenceDifficulty;
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
  categorySymbolOnly?: boolean;
  contentKind?: "word" | "sentence";
  phraseStructure?: PhraseStructure;
  subject?: string;
  verb?: string;
  complement?: string;
};

export function completesSequenceExercise(current: SessionExercise | undefined, next: SessionExercise | undefined) {
  if (!current) return false;
  return !next || (current.sourceExerciseId ?? current.id) !== (next.sourceExerciseId ?? next.id);
}

type CompileOptions<T extends SessionPlanLibraryItem> = {
  categorySymbols?: CategorySymbols;
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
  const allLibrary = library;
  library = library.filter((item) => !item.categorySymbolOnly);
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
      const categoryNames = wordCategoryNames(library, exercise.categoryNames ?? []);
      if (categoryNames.length < 2) return [];
      const categorySymbolIds = snapshotCategorySymbols(categoryNames, options.categorySymbols ?? exercise.categorySymbolIds);
      if (categoryImageError({ ...exercise, categoryNames }, allLibrary, categorySymbolIds)) return [];
      const categories = new Set(categoryNames);
      const candidates = availableForWordCategories(library).filter((item) => categories.has(item.category));
      return pickCategoryRoundIds(candidates, exercise.categoryItemIds, exercise.rounds ?? 6, random)
        .map((id, index) => round(index, { categoryNames, categoryItemIds: [id], ...(exercise.categoryShowSymbols ? { categorySymbolIds } : {}) }));
    }

    if (kind === "number-quantity") {
      return createQuantityRounds({ rounds: exercise.rounds, min: exercise.quantityMin, max: exercise.quantityMax, objectSet: exercise.quantityObjectSet }, random)
        .map((item, index) => round(index, { quantityTarget: item.target, quantityObject: item.object }));
    }

    if (kind === "sentence-matching") {
      return createSentenceMatchingRounds(library, {
        rounds: exercise.rounds ?? 6,
        optionCount: exercise.sentenceOptionCount ?? 2,
        difficulty: exercise.sentenceDifficulty ?? 1,
        allowedIds: exercise.sentenceItemIds,
      }, random).map((item, index) => round(index, { promptId: item.promptId, optionIds: item.optionIds }));
    }

    const allowedIds = exercise.namingItemIds?.length ? new Set(exercise.namingItemIds) : null;
    const categories = exercise.namingCategories?.length ? new Set(exercise.namingCategories) : null;
    const ids = shuffled(library.filter((item) => hasArtwork(item) && (!allowedIds || allowedIds.has(item.id)) && (!categories || categories.has(item.category))).map((item) => item.id), random)
      .slice(0, Math.max(1, exercise.rounds ?? 6));
    return ids.map((id, index) => round(index, { namingItemIds: [id], namingCategories: [] }));
  });
}
