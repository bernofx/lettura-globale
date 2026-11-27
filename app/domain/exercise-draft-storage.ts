import { parsePendingCloudSave, serializePendingCloudSave } from "./pending-cloud-save.ts";
import type { SequenceStepDraft } from "./queued-sequence-steps.ts";
import type { Exercise } from "../shared/types";

function draftStore<T>(prefix: string, valid: (record: Partial<T>) => boolean) {
  function read(storage: Storage, adultId: string) {
    const entries: { key: string; draft: T }[] = [];
    const scope = prefix + encodeURIComponent(adultId) + ":";
    for (const key of Object.keys(storage)) {
      if (!key.startsWith(scope)) continue;
      const record = parsePendingCloudSave(storage.getItem(key))?.change as T | undefined;
      if (record && valid(record)) entries.push({ key, draft: record });
      else storage.removeItem(key);
    }
    return entries;
  }
  function preserve(storage: Storage, adultId: string, draft: T) {
    try {
      const content = JSON.stringify(draft);
      if (read(storage, adultId).some(entry => JSON.stringify(entry.draft) === content)) return;
      const key = prefix + encodeURIComponent(adultId) + ":" + crypto.randomUUID();
      storage.setItem(key, serializePendingCloudSave(draft));
    } catch {
      throw new Error("exercise_draft_storage_unavailable");
    }
  }
  return { read, preserve };
}

const exercises = draftStore<Exercise>("lg-exercise-draft:", record =>
  typeof record.id === "string" && typeof record.title === "string" && Array.isArray(record.optionIds));
export const preserveExerciseDraft = exercises.preserve;
export function readExerciseDrafts(storage: Storage, adultId: string) {
  return exercises.read(storage, adultId).map(({ key, draft }) => ({ key, exercise: draft }));
}

export const sequenceDrafts = draftStore<SequenceStepDraft>("lg-sequence-step-draft:", record =>
  typeof record.id === "string" && typeof record.title === "string" && Array.isArray(record.steps) &&
  record.steps.every(step => step && typeof step.id === "string" && typeof step.title === "string"));
