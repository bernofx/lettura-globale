import { canAccessSequence, legacySequenceOwnerId } from "./sequence-access.ts";
import type { StateChangeRequest } from "./state-changes.ts";

type Exercise = { id: string; ownerAdultId?: string; sequenceId?: string; templateExerciseId?: string; sourceExerciseId?: string; deleted?: boolean };
type Sequence = { id: string; exerciseIds?: string[]; therapistId?: string; ownerAdultId?: string; deleted?: boolean };
type Program = { sequences?: Sequence[]; exercises?: Exercise[]; therapists?: { id: string; role: string }[] };

function index<T extends { id: string }>(rows: T[] = []) {
  return new Map(rows.map(row => [row.id, row]));
}

// The current account snapshot contains sequences omitted from the editor's view.
// Restrict explicit edits here. A validated library command may separately repair hidden copies.
export function validateExerciseCopyWrite(before: Program, after: Program, change: StateChangeRequest, adultId: string): string | undefined {
  const { exercises, sequences } = change.collections;
  if (!exercises && !sequences) return;
  const oldExercises = index(before.exercises);
  const nextExercises = index(after.exercises);
  const oldSequences = index(before.sequences);
  const nextSequences = index(after.sequences);
  const role = before.therapists?.find(adult => adult.id === adultId)?.role;

  if (sequences?.upserts.some(sequence => !Array.isArray(sequence.exerciseIds))) return "invalid_sequence_members";

  // Keep the definitions used by previous sessions, including detached copies.
  if (exercises?.removedIds.length || sequences?.removedIds.some(id =>
    after.exercises?.some(exercise => exercise.sequenceId === id))) return "archive_required";

  for (const { id } of exercises?.upserts ?? []) {
    const previous = oldExercises.get(id);
    const next = nextExercises.get(id)!;
    if (previous) {
      if ((previous.ownerAdultId ?? null) !== (next.ownerAdultId ?? null) || (previous.sequenceId ?? null) !== (next.sequenceId ?? null) ||
        (previous.templateExerciseId ?? null) !== (next.templateExerciseId ?? null)) return "exercise_identity_changed";
    } else if (next.ownerAdultId !== adultId) return "exercise_author_required";

    if (next.sequenceId == null && next.templateExerciseId == null) {
      if (next.deleted && !previous?.deleted && after.sequences?.some(seq =>
        !seq.deleted && seq.exerciseIds?.includes(id))) return "template_in_use";
      continue;
    }
    if (typeof next.sequenceId !== "string" || typeof next.templateExerciseId !== "string") return "invalid_exercise_copy";
    const sequence = nextSequences.get(next.sequenceId);
    const model = nextExercises.get(next.templateExerciseId);
    if (!sequence || sequence.deleted || !sequence.exerciseIds?.includes(id) ||
      !canAccessSequence(sequence.therapistId || legacySequenceOwnerId(sequence.ownerAdultId), adultId, role)) return "copy_sequence_required";
    if (next.deleted || next.sourceExerciseId != null || !model || model.sequenceId != null ||
      model.templateExerciseId != null || (!previous && model.deleted)) return "invalid_exercise_copy";
  }

  for (const { id } of sequences?.upserts ?? []) {
    const next = nextSequences.get(id)!;
    const previous = oldSequences.get(id);
    // Historical entries (including repetitions) may be kept, reordered or removed.
    // Each new slot must have its own active copy.
    const remaining = new Map<string, number>();
    for (const member of previous?.exerciseIds ?? []) remaining.set(member, (remaining.get(member) ?? 0) + 1);
    const seenCopies = new Set<string>();
    for (const member of next.exerciseIds ?? []) {
      const exercise = nextExercises.get(member);
      if (exercise?.sequenceId != null) {
        if (exercise.sequenceId !== id || exercise.deleted || seenCopies.has(member)) return "invalid_sequence_copy";
        if (oldExercises.has(member) && !remaining.has(member)) return "detached_copy";
        seenCopies.add(member);
      } else {
        const count = remaining.get(member) ?? 0;
        if (count < 1) return "sequence_copy_required";
        remaining.set(member, count - 1);
      }
    }
  }
}
