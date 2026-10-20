export const PENDING_CLOUD_SAVE_STORAGE_KEY = "lg-pending-cloud-save-v1";

export type PendingCloudSave = {
  schemaVersion: 1;
  createdAt: string;
  change: unknown;
};

const MAX_PENDING_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function serializePendingCloudSave(change: unknown, now = new Date()) {
  return JSON.stringify({ schemaVersion: 1, createdAt: now.toISOString(), change } satisfies PendingCloudSave);
}

export function parsePendingCloudSave(value: string | null, now = new Date()): PendingCloudSave | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PendingCloudSave>;
    const createdAt = typeof parsed.createdAt === "string" ? Date.parse(parsed.createdAt) : Number.NaN;
    if (parsed.schemaVersion !== 1 || !parsed.change || typeof parsed.change !== "object" || !Number.isFinite(createdAt) || createdAt > now.getTime() + 60_000 || now.getTime() - createdAt > MAX_PENDING_AGE_MS) return null;
    return parsed as PendingCloudSave;
  } catch {
    return null;
  }
}
