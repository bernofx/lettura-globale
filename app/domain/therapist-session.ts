export const THERAPIST_SESSION_STORAGE_KEY = "lg-therapist-session";
export const THERAPIST_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

type PersistentTherapistSession = {
  therapistId: string;
  expiresAt: number;
};

export function createPersistentTherapistSession(therapistId: string, now = Date.now()): string {
  return JSON.stringify({ therapistId, expiresAt: now + THERAPIST_SESSION_DURATION_MS } satisfies PersistentTherapistSession);
}

export function parsePersistentTherapistSession(value: string | null, now = Date.now()): string | null {
  if (!value) return null;
  try {
    const session = JSON.parse(value) as Partial<PersistentTherapistSession>;
    if (typeof session.therapistId !== "string" || !session.therapistId || typeof session.expiresAt !== "number" || session.expiresAt <= now) return null;
    return session.therapistId;
  } catch {
    return null;
  }
}
