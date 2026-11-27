import type { Exercise } from "../shared/types";

// Ignore serialization order and save timestamps. The order of targets and options matters.
export function differentExerciseSettings(left: Exercise, right: Exercise) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)] as (keyof Exercise)[]);
  for (const key of ["id", "updatedAt", "deleted", "ownerAdultId", "sequenceId", "templateExerciseId", "sourceExerciseId"] as const) keys.delete(key);
  return [...keys].filter(key => {
    if (key === "categorySymbolIds") {
      const a = left[key] ?? {}, b = right[key] ?? {};
      return Object.keys(a).length !== Object.keys(b).length || Object.keys(a).some(name => a[name] !== b[name]);
    }
    return JSON.stringify(left[key]) !== JSON.stringify(right[key]);
  });
}

export function exerciseEditStatus(opened: Exercise, current?: Exercise) {
  if (!current || current.deleted || opened.id !== current.id || opened.sequenceId !== current.sequenceId ||
    opened.templateExerciseId !== current.templateExerciseId || opened.ownerAdultId !== current.ownerAdultId ||
    opened.sourceExerciseId !== current.sourceExerciseId) return "unavailable";
  return differentExerciseSettings(opened, current).length ? "changed" : "current";
}
