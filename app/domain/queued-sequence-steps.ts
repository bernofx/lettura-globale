import { mergeSequenceSteps } from "./sequence-step-merge.ts";
import { legacySequenceOwnerId } from "./sequence-access.ts";
import type { DraftRecovery } from "./queued-exercise-edits.ts";
import type { StateChangeRequest } from "./state-changes.ts";
import type { Exercise, Sequence } from "../shared/types";

export type SequenceStepDraft = { id: string; title: string; steps: { id: string; title: string }[] };
export type SequenceStepBase = { adultId: string; ownerId: string; ids: string[]; titles: Record<string, string> };

export function sameSequenceScope(base: SequenceStepBase, cloud: Sequence | undefined, recovery?: DraftRecovery): cloud is Sequence {
  if (!cloud || cloud.deleted || recovery?.adultId !== base.adultId) return false;
  return (cloud.therapistId || legacySequenceOwnerId((cloud as { ownerAdultId?: string }).ownerAdultId)) === base.ownerId;
}

export function reconcileSequenceSteps(change: StateChangeRequest, base: SequenceStepBase, local: Sequence, cloud: Sequence | undefined,
  cloudExercises: Exercise[], recovery?: DraftRecovery) {
  const accessible = sameSequenceScope(base, cloud, recovery);
  const merged = accessible ? mergeSequenceSteps(base.ids, local.exerciseIds, cloud.exerciseIds) : null;
  if (merged && cloud) {
    const kept = new Set(cloud.exerciseIds);
    const available = new Set([...cloudExercises, ...(change.collections.exercises?.upserts ?? [])].filter(item => !item.deleted).map(item => item.id));
    if (merged.every(id => kept.has(id) || available.has(id))) return { ...local, exerciseIds: merged };
  }
  if (!recovery?.preserveSequence) throw new Error("sequence_draft_recovery_required");
  recovery.preserveSequence(base.adultId, { id: local.id, title: local.title,
    steps: local.exerciseIds.map(id => ({ id, title: base.titles[id] || "Esercizio non disponibile" })) });

  // A new private copy and the sequence slot that owns it are a single edit.
  // If the slot needs review, retain the definition with the adult's other drafts.
  const edits = change.collections.exercises;
  if (edits) {
    const known = new Set(cloudExercises.map(item => item.id));
    const held = new Set<string>();
    edits.upserts = edits.upserts.filter(row => {
      if (row.sequenceId !== local.id || known.has(row.id)) return true;
      recovery.preserve(base.adultId, row as Exercise);
      held.add(row.id);
      return false;
    });
    if (held.size) edits.order = edits.order.filter(id => !held.has(id));
    if (!edits.upserts.length && !edits.order.length && !edits.removedIds.length) delete change.collections.exercises;
  }
  return null;
}
