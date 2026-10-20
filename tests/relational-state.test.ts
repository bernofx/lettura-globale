import assert from "node:assert/strict";
import test from "node:test";
import { projectLegacyState, projectionCounts, rebuildLegacyState } from "../app/domain/relational-state.ts";

const now = Date.UTC(2026, 9, 20);

test("projects the legacy snapshot into relational rows without losing exercise rules or history", () => {
  const projection = projectLegacyState({
    schemaVersion: 1,
    therapists: [{ id: "adult-1", firstName: "Ada", lastName: "Rossi", email: "ADA@example.test", role: "Terapista", pinHash: "hash", childIds: ["child-1"] }],
    children: [{ id: "child-1", firstName: "Luca", lastName: "Bianchi", birthYear: "2019", notes: "", avatarColor: "#fff" }],
    activeChildId: "child-1",
    activeSequenceId: "sequence-1",
    appearance: { palette: "ocean", shape: "round" },
    library: [
      { id: "mela", word: "Mela", category: "Cibi", article: "LA", syllabification: "me-la", syllableCount: 2, syllableStatus: "confirmed", remoteImageId: "media-1", source: "Test", license: "CC0", author: "Autore" },
      { id: "pane", word: "Pane", category: "Cibi", syllableCount: 2, source: "Test", license: "CC0", author: "Autore" },
    ],
    exercises: [{ id: "exercise-1", title: "Trova", kind: "recognition", recognitionMode: "random", optionIds: [], recognitionItemIds: ["mela", "pane"], recognitionCategories: ["Cibi"], recognitionSyllables: "2", presentation: "words", autoPronounce: true, rounds: 4, distractorCount: 1, distractorSource: "same-category", updatedAt: "2026-10-20T10:00:00.000Z" }],
    sequences: [{ id: "sequence-1", title: "Mattina", exerciseIds: ["exercise-1"], therapistId: "adult-1", updatedAt: "2026-10-20T10:00:00.000Z" }],
    attempts: [
      { id: "attempt-1", sessionId: "session-1", sessionItemId: "item-1", exerciseId: "exercise-1", wordId: "mela", answerId: "pane", optionIds: ["mela", "pane"], correct: false, firstAttempt: true, mode: "test", childId: "child-1", therapistId: "adult-1", createdAt: "2026-10-20T10:01:00.000Z" },
      { id: "attempt-2", sessionId: "session-1", sessionItemId: "item-1", exerciseId: "exercise-1", wordId: "mela", answerId: "mela", optionIds: ["mela", "pane"], correct: true, firstAttempt: false, mode: "test", childId: "child-1", therapistId: "adult-1", createdAt: "2026-10-20T10:01:02.000Z" },
    ],
    helps: [{ id: "help-1", sessionId: "session-1", sessionItemId: "item-1", exerciseId: "exercise-1", wordId: "mela", mode: "test", label: "Indicazione", childId: "child-1", therapistId: "adult-1", createdAt: "2026-10-20T10:01:01.000Z" }],
    sessionHistory: [{
      id: "session-1", childId: "child-1", therapistId: "adult-1", title: "Mattina", source: "sequence", mode: "test", presentation: "words", startedAt: "2026-10-20T10:00:00.000Z", completedAt: "2026-10-20T10:02:00.000Z", comment: "Bene",
      items: [{ id: "item-1", exerciseId: "exercise-1", exerciseTitle: "Trova", kind: "recognition", presentation: "words", target: { itemId: "mela", word: "Mela", category: "Cibi", remoteImageId: "media-1" }, options: [{ itemId: "mela", word: "Mela", category: "Cibi" }, { itemId: "pane", word: "Pane", category: "Cibi" }], responses: [{ answerId: "pane", label: "Pane", correct: false, firstAttempt: true, createdAt: "2026-10-20T10:01:00.000Z" }, { answerId: "mela", label: "Mela", correct: true, firstAttempt: false, createdAt: "2026-10-20T10:01:02.000Z" }], helpLabels: ["Indicazione"], firstCorrect: false }],
    }],
  }, "account-1", now);

  assert.deepEqual(projectionCounts(projection), {
    adult_profiles: 1, children: 1, adult_child_access: 1, account_preferences: 1, categories: 2, media_assets: 1, library_items: 2,
    exercises: 1, exercise_items: 2, exercise_categories: 1, sequences: 1, sequence_exercises: 1, sessions: 1, session_items: 1,
    session_item_content: 3, session_item_responses: 2, session_item_help_labels: 1, attempts: 2, attempt_options: 4, help_events: 1,
  });
  assert.deepEqual(projection.tables.attempts.map((row) => row.attempt_ordinal), [1, 2]);
  assert.deepEqual(projection.tables.attempts.map((row) => row.answer_label_snapshot), ["Pane", "Mela"]);
  assert.equal(projection.tables.exercises[0].auto_pronounce, 1);
  assert.equal(projection.tables.exercises[0].syllable_filter, "2");
  assert.deepEqual(projection.warnings, []);

  const rebuilt = rebuildLegacyState(projection);
  assert.equal(rebuilt.therapists[0].email, "ada@example.test");
  assert.deepEqual(rebuilt.therapists[0].childIds, ["child-1"]);
  assert.deepEqual(rebuilt.library.map((item) => item.word), ["Mela", "Pane"]);
  assert.equal(rebuilt.library[1].source, "Test");
  assert.deepEqual(rebuilt.exercises[0].recognitionItemIds, ["mela", "pane"]);
  assert.deepEqual(rebuilt.attempts[0].optionIds, ["mela", "pane"]);
  assert.deepEqual(rebuilt.sessionHistory[0].items[0].responses, [
    { answerId: "pane", label: "Pane", correct: false, firstAttempt: true, createdAt: "2026-10-20T10:01:00.000Z" },
    { answerId: "mela", label: "Mela", correct: true, firstAttempt: false, createdAt: "2026-10-20T10:01:02.000Z" },
  ]);
  assert.deepEqual(rebuilt.sessionHistory[0].items[0].helpLabels, ["Indicazione"]);
});

test("creates deleted tombstones for profiles still referenced by history", () => {
  const projection = projectLegacyState({
    schemaVersion: 1, therapists: [], children: [], library: [], exercises: [], sequences: [], attempts: [], helps: [],
    sessionHistory: [{ id: "session-1", childId: "removed-child", therapistId: "removed-adult", title: "Storico", source: "quick", mode: "teaching", presentation: "images", startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:01:00Z", comment: "", items: [] }],
  }, "account-1", now);

  assert.equal(projection.tables.adult_profiles[0].deleted_at, now);
  assert.equal(projection.tables.children[0].deleted_at, now);
  assert.deepEqual(projection.warnings.sort(), ["archived_adult:removed-adult", "archived_child:removed-child"]);
});

test("rejects payloads outside the supported legacy schema", () => {
  assert.throws(() => projectLegacyState({ schemaVersion: 2 }, "account-1", now), /invalid_legacy_state/);
});
