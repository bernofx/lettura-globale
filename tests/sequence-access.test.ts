import assert from "node:assert/strict";
import test from "node:test";
import { canAccessSequence, canViewAllSequences } from "../app/domain/sequence-access.ts";

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
