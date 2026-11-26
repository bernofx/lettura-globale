import assert from "node:assert/strict";
import test from "node:test";
import { authorizeStateTransition } from "../app/domain/state-authorization.ts";
import { buildStateChange, rebaseStateChange } from "../app/domain/state-changes.ts";
import { canAccessSequence, canEditSequence, canViewAllSequences, discardForeignNewSequences, removeExerciseFromOwnedSequences } from "../app/domain/sequence-access.ts";

test("a therapist can access only their own sequences", () => {
  assert.equal(canAccessSequence("therapist-a", "therapist-a", "Terapista"), true);
  assert.equal(canAccessSequence("therapist-b", "therapist-a", "Terapista"), false);
});

test("supervisors and administrators can access every sequence", () => {
  assert.equal(canViewAllSequences("Supervisore"), true);
  assert.equal(canAccessSequence("therapist-b", "supervisor-a", "Supervisore"), true);
  assert.equal(canAccessSequence("therapist-b", "admin-a", "Amministratore"), true);
});

test("unknown roles do not receive global access", () => {
  assert.equal(canViewAllSequences("Genitore"), false);
  assert.equal(canAccessSequence("therapist-b", "parent-a", "Genitore"), false);
});

test("foreign sequences injected outside the visible baseline are discarded", () => {
  const own = { id: "own", therapistId: "therapist-1" };
  const visibleForeign = { id: "visible", therapistId: "therapist-2" };
  const injectedForeign = { id: "demo", therapistId: "admin" };
  assert.deepEqual(
    discardForeignNewSequences([own, visibleForeign], [own, visibleForeign, injectedForeign], "therapist-1", "Terapista"),
    [own, visibleForeign],
  );
});

test("own additions and administrator additions are preserved", () => {
  const own = { id: "own", therapistId: "therapist-1" };
  const foreign = { id: "foreign", therapistId: "therapist-2" };
  assert.deepEqual(discardForeignNewSequences([], [own], "therapist-1", "Terapista"), [own]);
  assert.deepEqual(discardForeignNewSequences([], [foreign], "admin", "Amministratore"), [foreign]);
});

test("deleting an exercise does not change foreign or unrelated sequences when saving after a conflict", () => {
  const own = { id: "own", therapistId: "supervisor", exerciseIds: ["exercise", "keep"], updatedAt: "before" };
  const otherOwn = { id: "other-own", therapistId: "supervisor", exerciseIds: ["keep"], updatedAt: "before" };
  const foreign = { id: "foreign", therapistId: "owner", exerciseIds: ["exercise"], updatedAt: "before" };
  const cloud = {
    schemaVersion: 1, therapists: [{ id: "supervisor", role: "Supervisore", childIds: ["child"] }],
    children: [{ id: "child" }], activeChildId: "child", sequences: [own, otherOwn, foreign],
    exercises: [{ id: "exercise" }],
  };
  assert.equal(canEditSequence("owner", "supervisor", "Supervisore"), false);
  assert.equal(canEditSequence("owner", "admin", "Amministratore"), true);
  const removed = removeExerciseFromOwnedSequences(cloud.sequences, "exercise", "supervisor", "Supervisore", "after");
  const patch = buildStateChange(cloud, { ...cloud, exercises: [{ id: "exercise", deleted: true }], sequences: removed }, "00000000-0000-4000-8000-000000000001", 7);
  assert.ok(patch);
  assert.deepEqual(patch.collections.sequences?.upserts, [{ ...own, exerciseIds: ["keep"], updatedAt: "after" }]);
  const latest = { ...cloud, sequences: [own, otherOwn, { ...foreign, updatedAt: "changed in cloud" }] };
  const rebased = rebaseStateChange(latest, patch, "00000000-0000-4000-8000-000000000002", 8);
  assert.deepEqual((rebased.state.sequences as typeof cloud.sequences).find((sequence) => sequence.id === "foreign"), latest.sequences[2]);
  assert.deepEqual(authorizeStateTransition(latest, rebased.state, "supervisor"), { allowed: true });
});
