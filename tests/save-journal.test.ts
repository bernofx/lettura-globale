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
