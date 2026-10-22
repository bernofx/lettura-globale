export function canViewAllSequences(role: string | undefined) {
  const normalizedRole = role?.trim().toLocaleLowerCase("it-IT") ?? "";
  return normalizedRole === "amministratore" || normalizedRole === "supervisore";
}

export function canAccessSequence(sequenceTherapistId: string, therapistId: string | undefined, role: string | undefined) {
  return Boolean(therapistId && (sequenceTherapistId === therapistId || canViewAllSequences(role)));
}

export function discardForeignNewSequences<T extends { id: string; therapistId: string }>(
  baseline: T[],
  candidate: T[],
  therapistId: string | undefined,
  role: string | undefined,
) {
  if (!therapistId || role?.trim().toLocaleLowerCase("it-IT") === "amministratore") return candidate;
  const baselineIds = new Set(baseline.map((sequence) => sequence.id));
  const filtered = candidate.filter((sequence) => baselineIds.has(sequence.id) || sequence.therapistId === therapistId);
  return filtered.length === candidate.length ? candidate : filtered;
}
