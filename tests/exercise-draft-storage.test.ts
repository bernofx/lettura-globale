import assert from "node:assert/strict";
import test from "node:test";
import { preserveExerciseDraft, readExerciseDrafts } from "../app/domain/exercise-draft-storage.ts";

function memoryStorage(): Storage {
  const records: Record<string, string> = {};
  return Object.assign(records, {
    setItem(key: string, value: string) { records[key] = value; },
    getItem(key: string) { return records[key] ?? null; },
    removeItem(key: string) { delete records[key]; },
    clear() {}, key() { return null; }, length: 0,
  });
}

test("bozze separate per profilo, retry idempotente e due modifiche con la stessa data conservate", () => {
  const storage = memoryStorage();
  const draft = { id: "demo", title: "Bozza", optionIds: [], updatedAt: "2026-11-27T10:00:00Z" };
  preserveExerciseDraft(storage, "adult-demo", draft);
  preserveExerciseDraft(storage, "adult-demo", draft);
  preserveExerciseDraft(storage, "adult-demo", { ...draft, rounds: 8 });
  assert.equal(readExerciseDrafts(storage, "adult-demo").length, 2);
  assert.deepEqual(readExerciseDrafts(storage, "adult"), []);
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.throws(() => preserveExerciseDraft(storage, "adult-demo", { ...draft, rounds: 9 }), /exercise_draft_storage_unavailable/);
});
