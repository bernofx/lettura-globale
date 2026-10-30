export const UPDATE_CHECKPOINT_KEY = "lg-update-checkpoint-v1";
const MAX_AGE = 5 * 60_000;
export type UpdateCheckpoint = { schema: 1; at: number; identity: string; path: string; values: Record<string, unknown> };

// Only an explicit update creates this short-lived, same-tab handoff. Not a second
// source of clinical data: attempts/help continue through the existing cloud queue.
export function readUpdateCheckpoint(raw: string | null, identity: string, path: string, now = Date.now()): UpdateCheckpoint | null {
  try {
    const value = JSON.parse(raw ?? "null") as UpdateCheckpoint | null;
    if (!value || value.schema !== 1 || value.identity !== identity || value.path !== path || !Number.isFinite(value.at) || now < value.at || now - value.at > MAX_AGE || !value.values || typeof value.values !== "object" || Array.isArray(value.values)) return null;
    return value;
  } catch { return null; }
}

export function encodeUpdateValue(value: unknown): unknown {
  return value instanceof Set ? { lgSet: [...value] } : value;
}
export function decodeUpdateValue<T>(value: unknown, fallback: T): T {
  if (fallback instanceof Set) return (value && typeof value === "object" && "lgSet" in value && Array.isArray(value.lgSet) ? new Set(value.lgSet) : fallback) as T;
  return value as T;
}

/** Non-rendering registry: only committed values enter the explicit handoff. */
export class UpdateRegistry {
  private restored = new Map<string, unknown>();
  private readers = new Map<string, () => unknown>();
  private guards = new Map<string, () => Promise<void>>();
  restore(values: Record<string, unknown>) { this.restored = new Map(Object.entries(values)); }
  initial<T>(key: string, fallback: T): T { return this.restored.has(key) ? decodeUpdateValue(this.restored.get(key), fallback) : fallback; }
  consume(key: string) { this.restored.delete(key); }
  register(key: string, read: () => unknown) {
    this.readers.set(key, read);
    return () => { if (this.readers.get(key) === read) this.readers.delete(key); };
  }
  before(key: string, prepare: () => Promise<void>) {
    this.guards.set(key, prepare);
    return () => { if (this.guards.get(key) === prepare) this.guards.delete(key); };
  }
  async prepare() { for (const guard of this.guards.values()) await guard(); }
  capture() { return Object.fromEntries([...this.readers].map(([key, read]) => [key, encodeUpdateValue(read())])); }
}
