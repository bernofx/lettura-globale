import assert from "node:assert/strict";
import test from "node:test";
import { relationalTablesForChange } from "../db/relational-state.ts";
import type { StateChangeRequest } from "../app/domain/state-changes.ts";

function change(collections: StateChangeRequest["collections"], values: StateChangeRequest["values"] = {}): StateChangeRequest {
  return { schemaVersion: 1, operationId: "12345678-1234-1234-1234-123456789abc", baseRevision: 4, collections, values };
}

test("a library operation touches its relational dependencies but not session data", () => {
  const tables = relationalTablesForChange(change({ library: { upserts: [{ id: "mela", word: "Mela" }], removedIds: [], order: ["mela"] } }));
  assert.deepEqual(new Set(tables), new Set(["categories", "media_assets", "library_items", "exercise_items"]));
  assert.equal(tables.includes("sessions"), false);
  assert.equal(tables.includes("attempts"), false);
});

test("a session-history operation includes snapshots and referenced profile parents", () => {
  const tables = relationalTablesForChange(change({ sessionHistory: { upserts: [{ id: "session-1" }], removedIds: [], order: ["session-1"] } }));
  assert.deepEqual(new Set(tables), new Set([
    "adult_profiles", "children", "sessions", "session_items", "session_item_content", "session_item_responses", "session_item_help_labels",
  ]));
});

test("a sequence operation writes its header and ordered exercises", () => {
  const tables = relationalTablesForChange(change({ sequences: { upserts: [{ id: "sequence-1", title: "Mattina", exerciseIds: ["exercise-2", "exercise-1"] }], removedIds: [], order: ["sequence-1"] } }));
  assert.deepEqual(new Set(tables), new Set(["adult_profiles", "sequences", "sequence_exercises"]));
});

test("preference-only changes write only account preferences", () => {
  assert.deepEqual(relationalTablesForChange(change({}, { activeChildId: "child-2" })), ["account_preferences"]);
});
