import assert from "node:assert/strict";
import test from "node:test";
import { buildWordProgress } from "../app/domain/progress-data.ts";
import { buildProgressCsv } from "../app/domain/progress-csv.ts";
import { stateViewForAdult } from "../app/domain/state-visibility.ts";

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
  const visible = stateViewForAdult(state, "therapist-1")?.state as typeof state;
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
  assert.equal(stateViewForAdult(state, "admin")?.state, state);
});

test("le copie seguono la sequenza e gli esiti visibili espongono soltanto il tipo per Progressi e CSV", () => {
  const model = { id: "model", title: "Modello", kind: "naming" as const, ownerAdultId: "therapist-2" };
  const exercises = [
    model,
    { ...model, id: "own", sequenceId: "s1" },
    { ...model, id: "private", title: "Titolo privato", sequenceId: "s2", templateExerciseId: "model", promptId: "private-target" },
    { ...model, id: "unused", sequenceId: "s2" },
  ];
  const event = { id: "a", exerciseId: "private", wordId: "word", childId: "child-1", answerId: "word",
    createdAt: "2026-01-01", firstAttempt: true, correct: true, mode: "test" as const };
  const source = { ...state, exercises, activeSequenceId: "s2", attempts: [event, { ...event, id: "b", exerciseId: "unused", childId: "child-2" }],
    therapists: [...state.therapists, { id: "supervisor", role: "Supervisore" }, { id: "parent", role: "Genitore" }] };
  const view = stateViewForAdult(source, "therapist-1")!;
  const visible = view.state as typeof source;
  assert.deepEqual(visible.exercises.map(item => item.id), ["model", "own"]);
  assert.equal(visible.activeSequenceId, undefined);
  assert.deepEqual(view.progressReferences, { adultProfileId: "therapist-1", exercises: [{ id: "private", kind: "naming" }] });
  const progress = { exercises: [...visible.exercises, ...view.progressReferences!.exercises], histories: [],
    library: [{ id: "word", word: "Gatto", category: "Animali" }] };
  const table = buildWordProgress({ ...progress, attempts: visible.attempts, helps: [], mode: "test" });
  assert.equal(table.rows[0].scores.naming.correct, 1);
  assert.match(buildProgressCsv(visible.attempts, progress), /"private";"private";"Mix and vary";"Gatto"/);
  for (const profile of ["admin", "supervisor", "therapist-2"]) {
    const other = stateViewForAdult(source, profile)!;
    assert.ok((other.state as typeof source).exercises.some(exercise => exercise.id === "private"));
    assert.equal(other.progressReferences, undefined);
  }
  const parent = stateViewForAdult(source, "parent")!;
  assert.deepEqual((parent.state as typeof source).exercises, [model]);
  assert.equal(parent.progressReferences, undefined);
  assert.equal(stateViewForAdult(source, "removed-profile"), null);
});
