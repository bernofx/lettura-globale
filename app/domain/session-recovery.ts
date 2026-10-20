import type { SessionExercise } from "./session-compilation.ts";
import type { SessionMode } from "./session-events.ts";

export const ACTIVE_SESSION_STORAGE_KEY = "lg-active-session-v1";
export const ACTIVE_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type RecoverableSession = {
  schemaVersion: 1;
  savedAt: string;
  plan: SessionExercise[];
  runId: string;
  therapistId: string;
  childId: string;
  startedAt: string;
  descriptor: { title: string; source: "sequence" | "quick" };
  mode: SessionMode;
  presentation: "images" | "words";
  currentIndex: number;
  furthestIndex: number;
  isTrial: boolean;
  returnView: "session" | "exercises";
};

export function parseRecoverableSession(raw: string | null, now = Date.now()): RecoverableSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RecoverableSession>;
    const savedAt = Date.parse(value.savedAt ?? "");
    if (value.schemaVersion !== 1 || !Number.isFinite(savedAt) || now - savedAt > ACTIVE_SESSION_MAX_AGE_MS || now < savedAt - 60_000) return null;
    if (!Array.isArray(value.plan) || !value.plan.length || !value.plan.every((item) => item && typeof item.id === "string" && Array.isArray(item.optionIds))) return null;
    if (!value.runId || !value.therapistId || !value.childId || !value.startedAt || !value.descriptor?.title) return null;
    const currentIndex = Math.min(Math.max(0, Number(value.currentIndex) || 0), value.plan.length - 1);
    const furthestIndex = Math.min(Math.max(currentIndex, Number(value.furthestIndex) || 0), value.plan.length - 1);
    return {
      schemaVersion: 1,
      savedAt: value.savedAt!,
      plan: value.plan,
      runId: value.runId,
      therapistId: value.therapistId,
      childId: value.childId,
      startedAt: value.startedAt,
      descriptor: { title: value.descriptor.title, source: value.descriptor.source === "quick" ? "quick" : "sequence" },
      mode: value.mode === "teaching" ? "teaching" : "test",
      presentation: value.presentation === "words" ? "words" : "images",
      currentIndex,
      furthestIndex,
      isTrial: Boolean(value.isTrial),
      returnView: value.returnView === "exercises" ? "exercises" : "session",
    };
  } catch {
    return null;
  }
}

export function serializeRecoverableSession(value: Omit<RecoverableSession, "schemaVersion" | "savedAt">, now = new Date()) {
  return JSON.stringify({ ...value, schemaVersion: 1, savedAt: now.toISOString() } satisfies RecoverableSession);
}

