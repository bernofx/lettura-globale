import assert from "node:assert/strict";
import test from "node:test";
import { appendSaveJournal, readSaveJournal, SAVE_JOURNAL_KEY } from "../app/domain/save-journal.ts";

test("journal stores only approved diagnostic fields and bounds its size", () => {
  let raw = "";
  const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
  for (let index = 0; index < 65; index++) appendSaveJournal(storage, { at: `2026-10-20T00:00:${index}.000Z`, event: "save_failed", httpStatus: 500, errorCode: "database_unavailable", title: "private" } as never);
  const entries = readSaveJournal(storage);
  assert.equal(entries.length, 60);
  assert.equal(entries[0].at, "2026-10-20T00:00:5.000Z");
  assert.equal(raw.includes("private"), false);
  assert.equal(SAVE_JOURNAL_KEY, "lg-save-journal-v1");
});

test("journal distinguishes refresh failures from failed writes", () => {
  let raw = "";
  const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
  appendSaveJournal(storage, { at: "2026-10-21T19:50:00.000Z", event: "refresh_failed", revision: 1377, httpStatus: 503, errorCode: "backend_refresh_failed" });
  assert.deepEqual(readSaveJournal(storage), [{ at: "2026-10-21T19:50:00.000Z", event: "refresh_failed", revision: 1377, httpStatus: 503, errorCode: "backend_refresh_failed" }]);
});

test("journal stores the technical reason for a denied write without accepting arbitrary text", () => {
  let raw = "";
  const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
  const denial = { at: "2026-11-26T16:46:11.870Z", event: "save_failed" as const, httpStatus: 403, errorCode: "state_change_forbidden" };
  appendSaveJournal(storage, { ...denial, reason: "sequence_owner_required", revision: 2540 });
  appendSaveJournal(storage, { ...denial, reason: "any personal context" });
  appendSaveJournal(storage, { ...denial, reason: "technical_token", errorCode: "other" });
  const entries = readSaveJournal(storage);
  assert.equal(entries[0].reason, "sequence_owner_required");
  assert.equal(entries[0].revision, 2540);
  assert.equal(entries[1].reason, undefined);
  assert.equal(entries[2].reason, undefined);
});
