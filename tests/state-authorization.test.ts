import { INITIAL_ADMINISTRATOR_ID } from "../app/domain/sequence-access.ts";
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

test("il supervisore cambia solo le voci delle sequenze attive con il protocollo esplicito", () => {
  const sequence = { id: "s", therapistId: "adult-b", title: "Prova", exerciseIds: ["historical"] };
  const previous = { ...state, sequences: [sequence], exercises: [{ id: "model" }], therapists: [
    ...state.therapists, { id: "supervisor", role: "Supervisore", childIds: [] },
  ] };
  const updated = { ...sequence, exerciseIds: ["model", "historical"], updatedAt: "2026-01-01T00:00:00Z" };
  const permits = (sequences: unknown[], profile = "supervisor", enabled = true) =>
    authorizeStateTransition(previous, { ...previous, sequences }, profile, { allowSupervisorContentEdits: enabled }).allowed;
  assert.ok(permits([updated]));
  assert.ok(permits([{ ...updated, exerciseIds: [] }]));
  assert.equal(permits([updated], "supervisor", false), false);
  assert.equal(permits([updated], "adult-a"), false);
  for (const fields of [{ title: "Altro" }, { deleted: true }, { lastUsedAt: updated.updatedAt },
    { updatedAt: 1 }, { exerciseIds: ["unknown"] }, { exerciseIds: null }]) {
    assert.equal(permits([{ ...updated, ...fields }]), false);
  }
  assert.equal(permits([]), false);
  assert.equal(permits([sequence, { ...sequence, id: "new" }]), false);
  for (const profile of ["supervisor", "adult-b", "admin"]) {
    assert.equal(permits([{ ...updated, therapistId: "adult-a" }], profile), false);
  }
  const archived = { ...previous, sequences: [{ ...sequence, deleted: true }] };
  assert.equal(authorizeStateTransition(archived, { ...archived, sequences: [updated] }, "supervisor",
    { allowSupervisorContentEdits: true }).allowed, false);
  assert.equal(authorizeStateTransition(previous, { ...previous, activeChildId: "child-b" }, "supervisor").allowed, false);
});

test("solo un amministratore può esplicitare il proprietario già implicito delle sequenze storiche", () => {
  for (const historical of [{ id: "s" }, { id: "s", ownerAdultId: "adult-b" }]) {
    const previous = { ...state, sequences: [historical] };
    const owner = historical.ownerAdultId ?? INITIAL_ADMINISTRATOR_ID;
    const saved = { ...previous, sequences: [{ id: "s", therapistId: owner }] };
    assert.equal(authorizeStateTransition(previous, saved, "admin").allowed, true);
    assert.equal(authorizeStateTransition(previous, saved, "adult-a").allowed, false);
    for (const other of [{ id: "s", therapistId: "other" }, { id: "s", ownerAdultId: "other" }]) {
      assert.equal(authorizeStateTransition(previous, { ...previous, sequences: [other] }, "admin").allowed, false);
    }
    assert.equal(authorizeStateTransition(saved, previous, "admin").allowed, false);
  }
});
