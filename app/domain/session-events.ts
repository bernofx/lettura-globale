export type SessionMode = "teaching" | "test";

export type AttemptEvent = {
  id: string;
  sessionId?: string;
  sessionItemId?: string;
  exerciseId: string;
  wordId?: string;
  answerId: string;
  correct: boolean;
  firstAttempt: boolean;
  mode: SessionMode;
  createdAt: string;
  childId?: string;
  therapistId?: string;
};

export type HelpEventRecord = {
  id: string;
  sessionId?: string;
  sessionItemId?: string;
  exerciseId: string;
  wordId?: string;
  mode?: SessionMode;
  label: string;
  createdAt: string;
  childId?: string;
  therapistId?: string;
};

type AttemptDraft = Omit<AttemptEvent, "firstAttempt">;

export function appendAttempt(events: AttemptEvent[], draft: AttemptDraft) {
  const itemAttempts = draft.sessionItemId
    ? events.filter((event) => event.sessionItemId === draft.sessionItemId)
    : [];
  const duplicate = itemAttempts.some((event) => event.answerId === draft.answerId);
  if (duplicate) return { events, added: null };

  const added: AttemptEvent = { ...draft, firstAttempt: itemAttempts.length === 0 };
  return { events: [...events, added], added };
}

export function appendHelp(events: HelpEventRecord[], event: HelpEventRecord) {
  return [...events, event];
}

export function shouldRecordSessionEvents(fromSharedPreview: boolean) {
  return !fromSharedPreview;
}
