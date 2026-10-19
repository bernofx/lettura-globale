export function canViewAllSequences(role: string | undefined) {
  const normalizedRole = role?.trim().toLocaleLowerCase("it-IT") ?? "";
  return normalizedRole === "amministratore" || normalizedRole === "supervisore";
}

export function canAccessSequence(sequenceTherapistId: string, therapistId: string | undefined, role: string | undefined) {
  return Boolean(therapistId && (sequenceTherapistId === therapistId || canViewAllSequences(role)));
}
