import { parsePendingCloudSave, serializePendingCloudSave } from "./pending-cloud-save.ts";
import type { Exercise } from "../shared/types";

const prefix = (adultId: string) => "lg-exercise-draft:" + encodeURIComponent(adultId) + ":";

export function preserveExerciseDraft(storage: Storage, adultId: string, draft: Exercise) {
  try {
    const content = JSON.stringify(draft);
    if (readExerciseDrafts(storage, adultId).some(entry => JSON.stringify(entry.exercise) === content)) return;
    const key = prefix(adultId) + crypto.randomUUID();
    storage.setItem(key, serializePendingCloudSave(draft));
  } catch {
    throw new Error("exercise_draft_storage_unavailable");
  }
}

export function readExerciseDrafts(storage: Storage, adultId: string) {
  const drafts: { key: string; exercise: Exercise }[] = [];
  const scope = prefix(adultId);
  for (const key of Object.keys(storage)) {
    if (!key.startsWith(scope)) continue;
    const saved = parsePendingCloudSave(storage.getItem(key));
    const exercise = saved?.change as Exercise | undefined;
    if (exercise && typeof exercise.id === "string" && typeof exercise.title === "string" && Array.isArray(exercise.optionIds)) drafts.push({ key, exercise });
    else storage.removeItem(key);
  }
  return drafts;
}
