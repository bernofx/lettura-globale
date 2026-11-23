import { normalizeLearningCategory } from "../domain/activity-generation";
import { type CategorySymbols } from "../domain/category-images";
import { articleFor } from "../domain/article-classification";
import { remapExerciseReferences } from "../domain/exercise-library-references";
import { discardForeignNewSequences } from "../domain/sequence-access";
import { hydrateSyllables } from "../domain/syllabification";
import { compileSessionPlan } from "../domain/session-compilation";
import { initialAdministrator, initialExercises, stockItems } from "./seed-data";
import { type BackendState, type Exercise, type LibraryItem, type Sequence } from "./types";

export function mergeById<T extends { id: string }>(saved: T[], seeded: T[]) {
  const existingIds = new Set(saved.map((item) => item.id));
  return [...saved, ...seeded.filter((item) => !existingIds.has(item.id))];
}

export function hydrateLibrary(items: LibraryItem[]) {
  return mergeById(items, stockItems).map((item) => {
    const demoItem = stockItems.find((candidate) => candidate.id === item.id);
    const hydratedItem = demoItem?.image && !item.privateUpload ? { ...item, image: demoItem.image, emoji: undefined, source: demoItem.source, sourceUrl: demoItem.sourceUrl, license: demoItem.license, licenseUrl: demoItem.licenseUrl, author: demoItem.author } : item;
    const normalizedItem = { ...hydratedItem, category: normalizeLearningCategory(hydratedItem.category) };
    return normalizedItem.contentKind === "sentence" || normalizedItem.categorySymbolOnly ? normalizedItem : hydrateSyllables(normalizedItem);
  });
}

export function hydrateExercises(items: Exercise[]) {
  return mergeById(items, initialExercises).map((exercise) => ({
    ...exercise,
    categoryNames: exercise.categoryNames?.map(normalizeLearningCategory),
    recognitionCategories: exercise.recognitionCategories?.map(normalizeLearningCategory),
    namingCategories: exercise.namingCategories?.map(normalizeLearningCategory),
  }));
}

export function remapExerciseLibraryIds(exercise: Exercise, replacements: Map<string, string>): Exercise {
  return remapExerciseReferences(exercise, replacements);
}

export function hydrateSequences(items: Sequence[]) {
  return items.map((sequence) => ({
    ...sequence,
    therapistId: sequence.therapistId || initialAdministrator.id,
  }));
}

export function discardUnauthorizedNewSequences(baseline: BackendState, candidate: BackendState, therapistId: string | null) {
  const role = candidate.therapists.find((item) => item.id === therapistId)?.role
    ?? baseline.therapists.find((item) => item.id === therapistId)?.role;
  const sequences = discardForeignNewSequences(baseline.sequences, candidate.sequences, therapistId ?? undefined, role);
  if (sequences === candidate.sequences) return candidate;
  const activeSequenceId = candidate.activeSequenceId && sequences.some((sequence) => sequence.id === candidate.activeSequenceId)
    ? candidate.activeSequenceId
    : sequences[0]?.id;
  return { ...candidate, sequences, activeSequenceId };
}

export function libraryForStorage(items: LibraryItem[]) {
  return items.map((item) => item.imageKey ? { ...item, image: undefined } : item);
}

export function backendStateForStorage(state: BackendState): BackendState {
  return { ...state, library: state.library.map((item) => ({ ...item, image: item.remoteImageId ? undefined : item.image?.startsWith("data:") ? undefined : item.image })) };
}

export function compileExercises(selectedExercises: Exercise[], sourceLibrary: LibraryItem[], categorySymbols?: CategorySymbols) {
  return compileSessionPlan(selectedExercises, sourceLibrary, { articleFor, categorySymbols });
}

/** Fills the optional collections of a cloud state so it can be diffed and applied. */
export function normalizeBackendState(saved: BackendState): BackendState {
  return {
    schemaVersion: 1,
    therapists: saved.therapists ?? [], children: saved.children ?? [], activeChildId: saved.activeChildId ?? "",
    activeSequenceId: saved.activeSequenceId, library: saved.library ?? [], exercises: saved.exercises ?? [], sequences: saved.sequences ?? [],
    attempts: saved.attempts ?? [], helps: saved.helps ?? [], sessionHistory: saved.sessionHistory ?? [], appearance: saved.appearance, soundPreferences: saved.soundPreferences, categorySymbols: saved.categorySymbols,
    tracingOrderRequired: saved.tracingOrderRequired === true,
  };
}
