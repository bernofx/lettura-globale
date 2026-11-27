import { queuedExerciseBases, reconcileQueuedExercises, type ExerciseEditBases, type DraftRecovery } from "./queued-exercise-edits.ts";
import { buildLibrarySaveChange, rebaseLibrarySaveChange } from "./library-save-change.ts";
import { parseStateChangeRequest, type StateChangeRequest } from "./state-changes.ts";
import type { BackendState } from "../shared/types";

// Record the fields edited on this device alongside the full rows in the offline queue.
// The Worker continues to receive the ordinary revision-checked PATCH.
type ClientChange = StateChangeRequest & { exerciseEditBases?: ExerciseEditBases; sequenceEdits?: { id: string; fields: string[] }[] };

export function buildCloudSaveChange(previous: BackendState, next: BackendState, operationId: string, revision: number, adultId?: string | null): ClientChange | null {
  const change: ClientChange | null = buildLibrarySaveChange(previous, next, operationId, revision);
  if (!change) return null;
  const exercises = change.collections.exercises;
  if (exercises && previous.exercises.length === exercises.order.length && previous.exercises.every((item, index) => item.id === exercises.order[index])) {
    exercises.order = [];
  }
  const bases = queuedExerciseBases(previous, change, adultId);
  if (bases) change.exerciseEditBases = bases;
  const sequences = change.collections.sequences;
  if (!sequences) return change;

  const prior = new Map<string, Record<string, unknown>>(previous.sequences.map(sequence => [sequence.id, sequence]));
  if (previous.sequences.length === sequences.order.length && previous.sequences.every((seq, i) => seq.id === sequences.order[i])) {
    sequences.order = [];
  }
  const sequenceEdits = sequences.upserts.flatMap(seq => {
    const original = prior.get(seq.id);
    if (!original) return [];
    const keys = new Set([...Object.keys(original), ...Object.keys(seq)]);
    const fields = [...keys].filter(key => JSON.stringify(original[key]) !== JSON.stringify(seq[key]));
    return [{ id: seq.id, fields }];
  });
  return sequenceEdits.length ? { ...change, sequenceEdits } : change;
}

export function rebaseCloudSaveChange(latest: BackendState, raw: unknown, operationId: string, revision: number, recovery?: DraftRecovery) {
  const change = parseStateChangeRequest(raw);
  reconcileQueuedExercises(latest, change, (raw as ClientChange).exerciseEditBases, recovery);
  const sequences = change.collections.sequences;
  if (sequences) {
    const edits = (raw as ClientChange).sequenceEdits;
    const fieldsById = new Map((Array.isArray(edits) ? edits : [])
      .filter(edit => typeof edit?.id === "string" && Array.isArray(edit.fields))
      .map(edit => [edit.id, new Set(edit.fields)]));
    const current = new Map((latest.sequences ?? []).map(sequence => [sequence.id, sequence]));
    sequences.upserts = sequences.upserts.flatMap(local => {
      const cloud = current.get(local.id);
      const localTime = typeof local.lastUsedAt === "string" ? Date.parse(local.lastUsedAt) : NaN;
      const cloudTime = cloud?.lastUsedAt ? Date.parse(cloud.lastUsedAt) : NaN;
      const fields = fieldsById.get(local.id);
      if (fields?.size === 1 && fields.has("lastUsedAt")) {
        if (!cloud || cloud.deleted) {
          if (change.values.activeSequenceId === local.id) {
            change.values = { ...change.values };
            delete change.values.activeSequenceId;
          }
          return [];
        }
        if (!Number.isFinite(localTime) || cloudTime >= localTime) return [];
        return [{ ...cloud, lastUsedAt: local.lastUsedAt }];
      }
      if (fields && cloud) {
        // An omitted field can also be an intentional removal.
        const kept = Object.entries(cloud).filter(([key]) => !fields.has(key));
        const edited = Object.entries(local).filter(([key]) => fields.has(key));
        local = { ...Object.fromEntries(kept), ...Object.fromEntries(edited), id: local.id };
      }
      // An ordinary edit may also have been prepared before another device ran the session.
      return [cloud && Number.isFinite(cloudTime) && !(localTime >= cloudTime) ? { ...local, lastUsedAt: cloud.lastUsedAt } : local];
    });
    if (!sequences.upserts.length && !sequences.order.length && !sequences.removedIds.length) delete change.collections.sequences;
  }
  if (!Object.keys(change.collections).length && !Object.keys(change.values).length && !change.libraryReplacements) {
    return { state: latest, change: null, replacementConflict: false };
  }
  return rebaseLibrarySaveChange(latest, change, operationId, revision);
}

// Replay only edits made after the submitted snapshot. A queued snapshot still
// contains the old program even when the preceding save has already reconciled it.
export function replayEditsAfterSave(submitted: BackendState, local: BackendState, confirmed: BackendState, revision: number, recovery?: DraftRecovery): BackendState {
  const operationId = crypto.randomUUID();
  const edits = buildCloudSaveChange(submitted, local, operationId, revision, recovery?.adultId);
  return edits ? rebaseCloudSaveChange(confirmed, edits, operationId, revision, recovery).state as BackendState : confirmed;
}
