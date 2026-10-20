import assert from "node:assert/strict";
import test from "node:test";
import { applyStateChange, buildStateChange, parseStateChangeRequest } from "../app/domain/state-changes.ts";

test("builds and applies entity-level changes while preserving collection order", () => {
  const previous = { schemaVersion: 1, therapists: [], children: [], library: [{ id: "a", word: "A" }, { id: "b", word: "B" }], exercises: [], sequences: [], attempts: [], helps: [], sessionHistory: [], activeChildId: "one", appearance: { palette: "ocean" } };
  const next = { ...previous, library: [{ id: "b", word: "Bee" }, { id: "c", word: "C" }], activeChildId: "two" };
  const change = buildStateChange(previous, next, "12345678-1234-1234-1234-123456789abc", 7);
  assert.ok(change);
  assert.deepEqual(change.collections.library?.removedIds, ["a"]);
  assert.deepEqual(change.collections.library?.upserts.map((item) => item.id), ["b", "c"]);
  assert.deepEqual(change.collections.library?.order, ["b", "c"]);
  assert.deepEqual(applyStateChange(previous, change), next);
});

test("returns no operation when state did not change", () => {
  const state = { schemaVersion: 1, therapists: [], children: [], library: [], exercises: [], sequences: [], attempts: [], helps: [], sessionHistory: [] };
  assert.equal(buildStateChange(state, structuredClone(state), "12345678-1234-1234-1234-123456789abc", 1), null);
});

test("rejects an order that does not cover the resulting collection", () => {
  const state = { schemaVersion: 1, library: [{ id: "a" }] };
  const change = { schemaVersion: 1, operationId: "12345678-1234-1234-1234-123456789abc", baseRevision: 1, collections: { library: { upserts: [], removedIds: [], order: [] } }, values: {} };
  assert.throws(() => applyStateChange(state, change), /invalid_collection_order/);
});

test("rejects unknown top-level values", () => {
  assert.throws(() => parseStateChangeRequest({ schemaVersion: 1, operationId: "12345678-1234-1234-1234-123456789abc", baseRevision: 1, collections: {}, values: { payload: "bad" } }), /invalid_state_value/);
});

test("rejects empty operations and invalid active profiles", () => {
  const base = { schemaVersion: 1, operationId: "12345678-1234-1234-1234-123456789abc", baseRevision: 1, collections: {} };
  assert.throws(() => parseStateChangeRequest({ ...base, values: {} }), /empty_state_change/);
  assert.throws(() => parseStateChangeRequest({ ...base, values: { activeChildId: null } }), /invalid_active_child/);
});
