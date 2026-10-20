import assert from "node:assert/strict";
import test from "node:test";
import { parsePendingCloudSave, serializePendingCloudSave } from "../app/domain/pending-cloud-save.ts";
import { buildStateChange, rebaseStateChange } from "../app/domain/state-changes.ts";

test("round-trips a pending cloud save", () => {
  const now = new Date("2026-10-20T10:00:00.000Z");
  const value = serializePendingCloudSave({ baseRevision: 4, collections: { library: { upserts: [{ id: "mela" }] } } }, now);
  assert.deepEqual(parsePendingCloudSave(value, now), {
    schemaVersion: 1,
    createdAt: now.toISOString(),
    change: { baseRevision: 4, collections: { library: { upserts: [{ id: "mela" }] } } },
  });
});

test("rejects malformed, future, and expired pending saves", () => {
  const now = new Date("2026-10-20T10:00:00.000Z");
  assert.equal(parsePendingCloudSave("not-json", now), null);
  assert.equal(parsePendingCloudSave(JSON.stringify({ schemaVersion: 1, createdAt: "2026-12-01T10:00:00.000Z", change: {} }), now), null);
  assert.equal(parsePendingCloudSave(JSON.stringify({ schemaVersion: 1, createdAt: "2026-01-01T10:00:00.000Z", change: {} }), now), null);
});

test("a pending delta can be rebased without dropping concurrent cloud data", () => {
  type TestState = { schemaVersion: number; library: Array<{ id: string; word: string }>; exercises: Array<{ id: string; title: string }>; sequences: unknown[]; therapists: unknown[]; children: unknown[]; attempts: unknown[]; helps: unknown[]; sessionHistory: unknown[] };
  const baseline: TestState = { schemaVersion: 1, library: [{ id: "mela", word: "Mela" }], exercises: [], sequences: [], therapists: [], children: [], attempts: [], helps: [], sessionHistory: [] };
  const local = { ...baseline, library: [...baseline.library, { id: "pera", word: "Pera" }] };
  const remote = { ...baseline, exercises: [{ id: "lettura", title: "Lettura" }] };
  const change = buildStateChange(baseline, local, "12345678-1234-1234-1234-123456789abc", 4);
  assert.ok(change);
  const stored = parsePendingCloudSave(serializePendingCloudSave(change));
  assert.ok(stored);
  const recovered = rebaseStateChange(remote, stored.change, "abcdefab-1234-1234-1234-123456789abc", 5).state as TestState;
  assert.deepEqual(recovered.library.map((item) => item.id), ["mela", "pera"]);
  assert.deepEqual(recovered.exercises.map((item) => item.id), ["lettura"]);
});
