import type { Exercise, Sequence, Therapist } from "../shared/types";
import { canAccessSequence, canViewAllSequences, legacySequenceOwnerId } from "./sequence-access.ts";
import type { SessionExercise } from "./session-compilation.ts";

type StoredSequence = Sequence & { ownerAdultId?: string };

export function shareableContent(state: {
  therapists?: Pick<Therapist, "id" | "role">[];
  sequences?: StoredSequence[];
  exercises?: Exercise[];
}, adultId: string | undefined) {
  const adult = state.therapists?.find(profile => profile.id === adultId);
  if (!adultId || !adult) return null;
  const sequences = new Map((state.sequences ?? [])
    .filter(sequence => canAccessSequence(sequence.therapistId || legacySequenceOwnerId(sequence.ownerAdultId), adultId, adult.role))
    .map(sequence => [sequence.id, sequence]));
  const exercises = new Map((state.exercises ?? [])
    .filter(exercise => !exercise.sequenceId || sequences.has(exercise.sequenceId))
    .map(exercise => [exercise.id, exercise]));
  return { sequences, exercises, seesAllSequences: canViewAllSequences(adult.role) };
}

// Only session settings belong in the public snapshot. Unknown fields stay private.
const publicExerciseFields = [
  "id", "title", "kind", "promptId", "optionIds", "updatedAt", "rounds", "autoPronounce", "presentation",
  "recognitionMode", "recognitionItemIds", "recognitionTargetIds", "recognitionCategories", "recognitionSyllables",
  "distractorCount", "distractorSource", "articleItemIds", "categoryItemIds", "categoryNames", "categorySpeakWord",
  "categoryShowTargetImage", "categoryShowSymbols", "categorySymbolIds", "namingItemIds", "namingCategories",
  "quantityMin", "quantityMax", "quantityObjectSet", "quantityAutoComplete", "quantitySpeakNumbers", "quantityErrorless",
  "quantityIdleSeconds", "quantityTarget", "quantityObject", "sentenceItemIds", "sentenceOptionCount", "sentenceDifficulty",
] as const satisfies readonly (keyof SessionExercise)[];

export function publicExerciseSnapshot(exercise: SessionExercise) {
  return Object.fromEntries(publicExerciseFields.map(key => [key, exercise[key]]));
}
