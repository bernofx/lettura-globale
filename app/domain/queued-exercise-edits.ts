import { exerciseEditStatus } from "./exercise-edit-version.ts";
import type { StateChangeRequest } from "./state-changes.ts";
import type { BackendState, Exercise } from "../shared/types";

export type ExerciseEditBases = { adultId: string; exercises: Exercise[] };
export type DraftRecovery = { adultId: string | null; preserve: (adultId: string, draft: Exercise) => void };

export function queuedExerciseBases(previous: BackendState, change: StateChangeRequest, adultId?: string | null) {
  const edits = change.collections.exercises;
  if (!adultId || !edits?.upserts.length) return;
  const ids = new Set(edits.upserts.filter(item => !item.deleted).map(item => item.id));
  const exercises = previous.exercises.filter(item => ids.has(item.id) && !item.deleted);
  if (exercises.length) return { adultId, exercises };
}

// Keep independent writes in the batch. A stale editor must never recreate a removed
// exercise or overwrite a second adult's edit on retry.
export function reconcileQueuedExercises(latest: BackendState, change: StateChangeRequest, bases?: ExerciseEditBases, recovery?: DraftRecovery) {
  const edits = change.collections.exercises;
  if (!bases || !edits) return;
  const originals = new Map(bases.exercises.map(item => [item.id, item]));
  const current = new Map((latest.exercises ?? []).map(item => [item.id, item]));
  edits.upserts = edits.upserts.filter(row => {
    const original = originals.get(row.id);
    if (!original) return true;
    const draft = row as Exercise;
    const remote = current.get(row.id);
    const inScope = recovery?.adultId === bases.adultId && (!original.sequenceId || (latest.sequences ?? []).some(
      seq => !seq.deleted && seq.id === original.sequenceId && seq.exerciseIds.includes(row.id),
    ));
    if (inScope && exerciseEditStatus(draft, remote) === "current") return false;
    if (inScope && exerciseEditStatus(original, remote) === "current") return true;
    if (!recovery) throw new Error("exercise_draft_recovery_required");
    recovery.preserve(bases.adultId, draft);
    return false;
  });
  if (!edits.upserts.length && !edits.order.length && !edits.removedIds.length) delete change.collections.exercises;
}
