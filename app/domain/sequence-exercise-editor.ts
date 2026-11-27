import type { Exercise } from "../shared/types";
import { differentExerciseSettings } from "./exercise-edit-version.ts";

export function copyExerciseForSequence(model: Exercise, sequenceId: string, adultId: string): Exercise {
  return { ...structuredClone(model), id: crypto.randomUUID(), templateExerciseId: model.templateExerciseId ?? model.id,
    sequenceId, ownerAdultId: adultId, sourceExerciseId: undefined, updatedAt: new Date().toISOString(), deleted: false };
}

// Compare the two form outputs, so opening a legacy record does not materialize defaults
// or remove currently unavailable assets when the adult changes an unrelated field.
export function applyExerciseForm(original: Exercise, initialForm: Exercise, submitted: Exercise): Exercise {
  const changed = differentExerciseSettings(initialForm, submitted);
  if (!changed.length) return original;
  const result = { ...original, updatedAt: submitted.updatedAt };
  for (const key of changed) {
    if (submitted[key] === undefined) delete result[key];
    else Object.assign(result, { [key]: submitted[key] });
  }
  return result;
}
