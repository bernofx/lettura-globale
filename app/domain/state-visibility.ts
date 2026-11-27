import { legacySequenceOwnerId } from "./sequence-access.ts";
import type { SessionActivity } from "./session-compilation";

export type ProgressReferences = { adultProfileId: string; exercises: { id: string; kind: SessionActivity }[] };

type Adult = {
  id?: string;
  role?: string;
  childIds?: string[];
  pinHash?: string;
  pin?: string;
  [key: string]: unknown;
};

type StateRecord = Record<string, unknown> & {
  therapists?: Adult[];
  children?: Array<Record<string, unknown> & { id?: string }>;
  exercises?: Array<{ id: string; kind?: SessionActivity; sequenceId?: string }>;
  sequences?: Array<Record<string, unknown> & { id: string; therapistId?: string; ownerAdultId?: string }>;
  attempts?: Array<Record<string, unknown> & { childId?: string; exerciseId?: string; therapistId?: string; adultId?: string }>;
  helps?: Array<Record<string, unknown> & { childId?: string; exerciseId?: string; therapistId?: string; adultId?: string }>;
  sessionHistory?: Array<Record<string, unknown> & { childId?: string; therapistId?: string; adultId?: string }>;
  activeChildId?: string;
};

export function adultRoleInState(state: unknown, adultProfileId: string) {
  if (!state || typeof state !== "object") return undefined;
  return (state as StateRecord).therapists?.find((adult) => adult.id === adultProfileId)?.role;
}

export function stateViewForAdult(state: unknown, adultProfileId: string): { state: unknown; progressReferences?: ProgressReferences } | null {
  if (!state || typeof state !== "object") return null;
  const source = state as StateRecord;
  const adult = source.therapists?.find((item) => item.id === adultProfileId);
  if (!adult) return null;
  if (adult.role === "Amministratore") return { state };

  const childIds = new Set(adult.childIds ?? []);
  const visibleChildren = (source.children ?? []).filter((child) => child.id && childIds.has(child.id));
  const visibleSequences = adult.role === "Supervisore"
    ? source.sequences
    : source.sequences?.filter((sequence) => (sequence.therapistId || legacySequenceOwnerId(sequence.ownerAdultId)) === adultProfileId);
  const ownSession = (event: { therapistId?: string; adultId?: string }) => (event.therapistId ?? event.adultId) === adultProfileId;
  const visibleHistory = source.sessionHistory?.filter((session) => session.childId && childIds.has(session.childId) && (adult.role !== "Terapista" || ownSession(session)));

  const visibleSequenceIds = new Set(visibleSequences?.map(sequence => sequence.id));
  const hiddenCopies = new Map<string, SessionActivity>();
  const exercises = source.exercises?.filter(exercise => {
    if (!exercise.sequenceId || visibleSequenceIds.has(exercise.sequenceId)) return true;
    hiddenCopies.set(exercise.id, exercise.kind ?? "recognition");
    return false;
  });
  const attempts = source.attempts?.filter(event => !event.childId || childIds.has(event.childId));
  const helps = source.helps?.filter(event => !event.childId || childIds.has(event.childId));
  const references: ProgressReferences = { adultProfileId, exercises: [] };
  if (hiddenCopies.size) {
    for (const events of [attempts, helps]) {
      for (const { exerciseId } of events ?? []) {
        if (!exerciseId) continue;
        const kind = hiddenCopies.get(exerciseId);
        if (!kind) continue;
        references.exercises.push({ id: exerciseId, kind });
        hiddenCopies.delete(exerciseId);
      }
    }
  }
  const visibleState = {
    ...source,
    therapists: source.therapists?.map((item) => item.id === adultProfileId ? { ...item, pin: undefined } : { ...item, pinHash: undefined, pin: undefined }),
    children: visibleChildren,
    sequences: visibleSequences,
    exercises, attempts, helps,
    activeSequenceId: typeof source.activeSequenceId === "string" && visibleSequenceIds.has(source.activeSequenceId) ? source.activeSequenceId : undefined,
    sessionHistory: visibleHistory,
    activeChildId: source.activeChildId && childIds.has(source.activeChildId) ? source.activeChildId : visibleChildren[0]?.id,
  };
  return references.exercises.length ? { state: visibleState, progressReferences: references } : { state: visibleState };
}
