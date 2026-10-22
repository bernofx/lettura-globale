import assert from "node:assert/strict";
import test from "node:test";
import { canAccessSequence, canViewAllSequences, discardForeignNewSequences } from "../app/domain/sequence-access.ts";

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
