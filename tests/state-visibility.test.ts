import assert from "node:assert/strict";
import test from "node:test";
import { stateVisibleToAdult } from "../app/domain/state-visibility.ts";

const state = {
  schemaVersion: 1,
  activeChildId: "child-2",
  therapists: [
    { id: "admin", role: "Amministratore", pinHash: "admin-hash", childIds: ["child-1", "child-2"] },
    { id: "therapist-1", role: "Terapista", pinHash: "own-hash", childIds: ["child-1"] },
    { id: "therapist-2", role: "Terapista", pinHash: "other-hash", pin: "1234", childIds: ["child-1", "child-2"] },
  ],
  children: [{ id: "child-1" }, { id: "child-2" }],
  sequences: [{ id: "s1", therapistId: "therapist-1" }, { id: "s2", therapistId: "therapist-2" }],
  attempts: [{ id: "a1", childId: "child-1" }, { id: "a2", childId: "child-2" }],
  helps: [{ id: "h1", childId: "child-1" }, { id: "h2", childId: "child-2" }],
  sessionHistory: [
    { id: "history-own", childId: "child-1", therapistId: "therapist-1" },
    { id: "history-other", childId: "child-1", therapistId: "therapist-2" },
    { id: "history-hidden-child", childId: "child-2", therapistId: "therapist-1" },
  ],
};

test("un terapista riceve solo bambini, sequenze e storici autorizzati", () => {
  const visible = stateVisibleToAdult(state, "therapist-1") as typeof state;
  assert.deepEqual(visible.children.map((item) => item.id), ["child-1"]);
  assert.deepEqual(visible.sequences.map((item) => item.id), ["s1"]);
  assert.deepEqual(visible.attempts.map((item) => item.id), ["a1"]);
  assert.deepEqual(visible.helps.map((item) => item.id), ["h1"]);
  assert.deepEqual(visible.sessionHistory.map((item) => item.id), ["history-own"]);
  assert.equal(visible.activeChildId, "child-1");
  assert.equal(visible.therapists.find((item) => item.id === "therapist-1")?.pinHash, "own-hash");
  assert.equal(visible.therapists.find((item) => item.id === "therapist-2")?.pinHash, undefined);
  assert.equal(visible.therapists.find((item) => item.id === "therapist-2")?.pin, undefined);
});

test("l'amministratore riceve lo stato completo senza copie inutili", () => {
  assert.equal(stateVisibleToAdult(state, "admin"), state);
});
