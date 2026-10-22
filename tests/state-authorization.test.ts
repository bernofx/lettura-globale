import assert from "node:assert/strict";
import test from "node:test";
import { authorizeStateTransition } from "../app/domain/state-authorization.ts";

const state = {
  schemaVersion: 1,
  therapists: [
    { id: "admin", role: "Amministratore", childIds: ["child-a", "child-b"], firstName: "Ada" },
    { id: "adult-a", role: "Terapista", childIds: ["child-a"], firstName: "Tina", email: "t@example.test", pinHash: "old" },
    { id: "adult-b", role: "Terapista", childIds: ["child-b"], firstName: "Bruno" },
  ],
  children: [{ id: "child-a", firstName: "A" }, { id: "child-b", firstName: "B" }],
  library: [], exercises: [], sequences: [], attempts: [], helps: [], sessionHistory: [], activeChildId: "child-a",
};

test("un amministratore può aggiornare l'intero stato", () => {
  assert.deepEqual(authorizeStateTransition(state, { ...state, children: [] }, "admin"), { allowed: true });
});

test("un terapista può aggiornare solo i campi modificabili del proprio profilo", () => {
  const next = structuredClone(state);
  next.therapists[1].firstName = "Valentina";
  next.therapists[1].pinHash = "new";
  assert.deepEqual(authorizeStateTransition(state, next, "adult-a"), { allowed: true });
  next.therapists[1].role = "Supervisore";
  assert.deepEqual(authorizeStateTransition(state, next, "adult-a"), { allowed: false, reason: "own_profile_scope_exceeded" });
});

test("un terapista non può modificare altri adulti o bambini non assegnati", () => {
  const otherAdult = structuredClone(state);
  otherAdult.therapists[2].firstName = "Modificato";
  assert.deepEqual(authorizeStateTransition(state, otherAdult, "adult-a"), { allowed: false, reason: "therapist_admin_required" });
  const otherChild = structuredClone(state);
  otherChild.children[1].firstName = "Modificato";
  assert.deepEqual(authorizeStateTransition(state, otherChild, "adult-a"), { allowed: false, reason: "child_access_forbidden" });
});

test("tentativi e aiuti sono append-only e vincolati al terapista e al bambino", () => {
  const ownAttempt = structuredClone(state);
  ownAttempt.attempts.push({ id: "attempt-1", therapistId: "adult-a", childId: "child-a" } as never);
  assert.deepEqual(authorizeStateTransition(state, ownAttempt, "adult-a"), { allowed: true });
  const foreignAttempt = structuredClone(state);
  foreignAttempt.attempts.push({ id: "attempt-2", therapistId: "adult-a", childId: "child-b" } as never);
  assert.deepEqual(authorizeStateTransition(state, foreignAttempt, "adult-a"), { allowed: false, reason: "attempts_access_forbidden" });
});

test("un terapista non può modificare sequenze altrui", () => {
  const previous = { ...structuredClone(state), sequences: [{ id: "sequence-b", therapistId: "adult-b", title: "B" }] };
  const next = structuredClone(previous);
  next.sequences[0].title = "Rubata";
  assert.deepEqual(authorizeStateTransition(previous, next, "adult-a"), { allowed: false, reason: "sequence_owner_required" });
});
