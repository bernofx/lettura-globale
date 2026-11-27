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
type PublicExerciseField = Exclude<keyof SessionExercise, "deleted" | "sourceExerciseId">;
const publicExerciseFields = {
  id: true, title: true, kind: true, promptId: true, optionIds: true, updatedAt: true, rounds: true, autoPronounce: true, presentation: true,
  recognitionMode: true, recognitionItemIds: true, recognitionTargetIds: true, recognitionCategories: true, recognitionSyllables: true,
  distractorCount: true, distractorSource: true, articleItemIds: true, categoryItemIds: true, categoryNames: true, categorySpeakWord: true,
  categoryShowTargetImage: true, categoryShowSymbols: true, categorySymbolIds: true, namingItemIds: true, namingCategories: true,
  quantityMin: true, quantityMax: true, quantityObjectSet: true, quantityAutoComplete: true, quantitySpeakNumbers: true, quantityErrorless: true,
  quantityIdleSeconds: true, quantityTarget: true, quantityObject: true, sentenceItemIds: true, sentenceOptionCount: true, sentenceDifficulty: true,
} satisfies Record<PublicExerciseField, true>;

export function publicExerciseSnapshot(exercise: SessionExercise) {
  return Object.fromEntries((Object.keys(publicExerciseFields) as PublicExerciseField[]).map(key => [key, exercise[key]]));
}
