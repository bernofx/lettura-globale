export const SAVE_JOURNAL_KEY = "lg-save-journal-v1";

export type SaveJournalEntry = {
  at: string;
  event: "sequence_changed" | "save_started" | "save_succeeded" | "save_failed" | "save_rebased" | "cloud_loaded";
  operationId?: string;
  diagnosticId?: string;
  revision?: number;
  httpStatus?: number;
  errorCode?: string;
  changedSequences?: number;
  sequenceCount?: number;
};

const MAX_ENTRIES = 60;
const SAFE_CODE = /^[a-z0-9_]{1,64}$/;

export function readSaveJournal(storage: Pick<Storage, "getItem">): SaveJournalEntry[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SAVE_JOURNAL_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SaveJournalEntry => Boolean(item && typeof item === "object" && typeof item.at === "string" && typeof item.event === "string")).slice(-MAX_ENTRIES);
  } catch { return []; }
}

export function appendSaveJournal(storage: Pick<Storage, "getItem" | "setItem">, entry: SaveJournalEntry) {
  const safe: SaveJournalEntry = { at: entry.at, event: entry.event };
  if (entry.operationId && /^[a-zA-Z0-9-]{16,80}$/.test(entry.operationId)) safe.operationId = entry.operationId;
  if (entry.diagnosticId && /^[a-zA-Z0-9-]{16,80}$/.test(entry.diagnosticId)) safe.diagnosticId = entry.diagnosticId;
  if (Number.isSafeInteger(entry.revision)) safe.revision = entry.revision;
  if (Number.isSafeInteger(entry.httpStatus)) safe.httpStatus = entry.httpStatus;
  if (entry.errorCode && SAFE_CODE.test(entry.errorCode)) safe.errorCode = entry.errorCode;
  if (Number.isSafeInteger(entry.changedSequences)) safe.changedSequences = entry.changedSequences;
  if (Number.isSafeInteger(entry.sequenceCount)) safe.sequenceCount = entry.sequenceCount;
  try { storage.setItem(SAVE_JOURNAL_KEY, JSON.stringify([...readSaveJournal(storage), safe].slice(-MAX_ENTRIES))); }
  catch { /* Diagnostics must never block saving. */ }
}
