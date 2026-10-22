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
  sequences?: Array<Record<string, unknown> & { therapistId?: string; ownerAdultId?: string }>;
  attempts?: Array<Record<string, unknown> & { childId?: string; therapistId?: string; adultId?: string }>;
  helps?: Array<Record<string, unknown> & { childId?: string; therapistId?: string; adultId?: string }>;
  sessionHistory?: Array<Record<string, unknown> & { childId?: string; therapistId?: string; adultId?: string }>;
  activeChildId?: string;
};

export function adultRoleInState(state: unknown, adultProfileId: string) {
  if (!state || typeof state !== "object") return undefined;
  return (state as StateRecord).therapists?.find((adult) => adult.id === adultProfileId)?.role;
}

export function stateVisibleToAdult(state: unknown, adultProfileId: string) {
  if (!state || typeof state !== "object") return state;
  const source = state as StateRecord;
  const adult = source.therapists?.find((item) => item.id === adultProfileId);
  if (!adult || adult.role === "Amministratore") return state;

  const childIds = new Set(adult.childIds ?? []);
  const visibleChildren = (source.children ?? []).filter((child) => child.id && childIds.has(child.id));
  const visibleSequences = adult.role === "Supervisore"
    ? source.sequences
    : source.sequences?.filter((sequence) => (sequence.therapistId ?? sequence.ownerAdultId) === adultProfileId);
  const ownSession = (event: { therapistId?: string; adultId?: string }) => (event.therapistId ?? event.adultId) === adultProfileId;
  const visibleHistory = source.sessionHistory?.filter((session) => session.childId && childIds.has(session.childId) && (adult.role !== "Terapista" || ownSession(session)));

  return {
    ...source,
    therapists: source.therapists?.map((item) => item.id === adultProfileId ? { ...item, pin: undefined } : { ...item, pinHash: undefined, pin: undefined }),
    children: visibleChildren,
    sequences: visibleSequences,
    attempts: source.attempts?.filter((attempt) => !attempt.childId || childIds.has(attempt.childId)),
    helps: source.helps?.filter((help) => !help.childId || childIds.has(help.childId)),
    sessionHistory: visibleHistory,
    activeChildId: source.activeChildId && childIds.has(source.activeChildId) ? source.activeChildId : visibleChildren[0]?.id,
  };
}

