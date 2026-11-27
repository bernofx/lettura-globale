// Called by test:auth with its local D1 binding, before the final schema upgrade.
import { hasExerciseCopyColumns } from "../db/exercise-copy-schema.ts";
import assert from "node:assert/strict";
import { buildStateChange } from "../app/domain/state-changes.ts";
import { loadRelationalState, persistRelationalShadow, prepareRelationalChange, repairRelationalShadow } from "../db/relational-state.ts";

export async function checkExerciseCopyMigration(database, migrate) {
  const accountId = "fixture-copies", now = Date.UTC(2026, 10, 27);
  const kinds = ["recognition", "articles", "word-categories", "naming", "number-quantity", "sentence-matching"];
  const originals = kinds.map(kind => ({ id: kind, kind, title: kind, optionIds: [], updatedAt: new Date(now).toISOString() }));
  Object.assign(originals[0], { recognitionMode: "random", promptId: "b", recognitionTargetIds: ["b", "a"] });
  Object.assign(originals[4], { quantityMin: 2, quantityMax: 5, quantityErrorless: true });
  const sequence = { id: "sequence", title: "Prova", therapistId: "adult", exerciseIds: kinds };
  const state = {
    schemaVersion: 1, therapists: [{ id: "adult", email: "adult@example.test", role: "Terapista" }],
    children: [{ id: "fixture-child" }], library: ["a", "b"].map(id => ({ id, word: id, category: "Test" })),
    exercises: originals, sequences: [sequence], attempts: [], helps: [],
    sessionHistory: [{
      id: "old-session", childId: "fixture-child", therapistId: "adult", title: "Prova", mode: "test",
      items: [{
        id: "turn", exerciseId: "number-quantity", kind: "number-quantity", exerciseTitle: "Conta", quantityErrorless: true,
        responses: [{ answerId: "quantity:2:2:manual:1", label: "Due", correct: true, firstAttempt: true }],
      }],
    }],
  };
  const options = { database, accountId, now, email: "copies@example.test", displayName: "Fixture" };
  await persistRelationalShadow({ ...options, state, rawState: JSON.stringify(state), sourceRevision: 1 });
  const legacy = await loadRelationalState(database, accountId);
  assert.equal(await hasExerciseCopyColumns(database), false);
  await migrate();
  assert.equal(await hasExerciseCopyColumns(database), true);
  assert.deepEqual(await loadRelationalState(database, accountId), legacy);
  for (const exercise of legacy.exercises) {
    for (const field of ["ownerAdultId", "sequenceId", "templateExerciseId"]) assert.equal(Object.hasOwn(exercise, field), false);
  }

  const copies = originals.map(model => ({
    ...model, id: "copy-" + model.id, templateExerciseId: model.id, sequenceId: sequence.id, ownerAdultId: "adult",
  }));
  const authoredModel = { ...originals[0], id: "authored-model", ownerAdultId: "archived-author" };
  const next = { ...state, exercises: [...originals, ...copies, authoredModel], sequences: [{ ...sequence, exerciseIds: copies.map(copy => copy.id) }] };
  const operationId = crypto.randomUUID();
  const change = buildStateChange(state, next, operationId, 1);
  const { statements } = await prepareRelationalChange({
    ...options, state: next, rawState: JSON.stringify(next), change, sourceRevision: 2, operationId,
  });
  await database.batch([
    database.prepare("INSERT INTO state_operations VALUES (?, ?, 1, 2, 'fixture', ?)").bind(accountId, operationId, now),
    ...statements,
  ]);
  const rebuilt = await loadRelationalState(database, accountId);
  assert.deepEqual(rebuilt.sequences[0].exerciseIds, copies.map(copy => copy.id));
  assert.deepEqual(rebuilt.exercises.slice(0, originals.length), legacy.exercises);
  for (const [index, model] of legacy.exercises.entries()) {
    const copy = rebuilt.exercises[originals.length + index];
    assert.deepEqual(copy, { ...model, id: copies[index].id, templateExerciseId: model.id, sequenceId: sequence.id, ownerAdultId: "adult" });
    assert.equal(copy.kind, kinds[index]);
  }
  assert.equal(rebuilt.exercises.at(-1).ownerAdultId, "archived-author");
  assert.equal(rebuilt.therapists.some(adult => adult.id === "archived-author"), false);
  assert.deepEqual(rebuilt.sessionHistory, legacy.sessionHistory);

  // Rebuild missing shadow rows from the same JSON mirror used by a pending cloud save.
  const rawState = JSON.stringify(next);
  await database.prepare("INSERT INTO user_states (user_id,email,payload,schema_version,revision,created_at,updated_at) VALUES (?,?,?,1,2,?,?)")
    .bind(accountId, options.email, rawState, now, now).run();
  await database.prepare("DELETE FROM sequence_exercises WHERE account_id = ? AND sequence_id = ?")
    .bind(accountId, sequence.id).run();
  await repairRelationalShadow({ ...options, state: next, rawState, sourceRevision: 2 });
  assert.deepEqual(await loadRelationalState(database, accountId), rebuilt);
  assert.deepEqual((await database.prepare("PRAGMA foreign_key_check").all()).results, []);
}
