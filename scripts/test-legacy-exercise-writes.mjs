import assert from "node:assert/strict";
import { buildStateChange } from "../app/domain/state-changes.ts";

// Seed a future account in local D1 without enabling copy creation in the application.
export async function checkLegacyExerciseWrites({ db, account, request, adminCookie, read }) {
  const row = await db.prepare("SELECT payload, revision FROM user_states WHERE user_id = ?").bind(account).first();
  const state = JSON.parse(row.payload);
  const sequence = state.sequences[0];
  const model = state.exercises.find(exercise => exercise.id === sequence.exerciseIds[0]);
  const copy = { ...model, id: "fixture-copy", ownerAdultId: sequence.therapistId, sequenceId: sequence.id, templateExerciseId: model.id };
  state.exercises.push(copy);
  sequence.exerciseIds = [copy.id, ...sequence.exerciseIds.slice(1)];
  state.children.push({ id: "fixture-child", firstName: "Test" });
  const revision = row.revision + 1;
  await db.prepare("UPDATE user_states SET payload = ?, revision = ? WHERE user_id = ?")
    .bind(JSON.stringify(state), revision, account).run();
  const initialView = await (await read(adminCookie)).json();
  assert.equal(initialView.dataSource, "relational");
  assert.equal(initialView.revision, revision);
  const headers = { cookie: adminCookie, "content-type": "application/json", "x-base-revision": String(revision) };
  const patch = change => request("/api/state/changes", { method: "PATCH", headers, body: JSON.stringify(change) });
  const delta = next => buildStateChange(state, next, crypto.randomUUID(), revision);
  const withoutCopy = { ...state, exercises: state.exercises.filter(item => item.id !== copy.id) };
  const stripped = { ...state, exercises: state.exercises.map(item => item.id === copy.id ? { ...model, id: copy.id } : item) };
  const detached = { ...state, sequences: [{ ...sequence, exerciseIds: [model.id] }] };
  const finished = { ...state, sequences: [{ ...sequence, lastUsedAt: new Date().toISOString() }],
    sessionHistory: [...state.sessionHistory, { id: "fixture-finished", childId: "fixture-child", therapistId: "adult-a",
      title: "Test", mode: "test", items: [{ id: "fixture-turn", exerciseId: copy.id, kind: "recognition" }] }] };
  for (const response of [
    await request("/api/state", { method: "PUT", headers, body: JSON.stringify(withoutCopy) }),
    await patch(delta(stripped)), await patch(delta(withoutCopy)), await patch(delta(detached)),
    await patch(delta({ ...detached, sessionHistory: finished.sessionHistory })),
  ]) {
    assert.equal(response.status, 412);
    assert.equal((await response.json()).error, "exercise_editor_update_required");
  }
  const unchanged = await db.prepare("SELECT payload, revision FROM user_states WHERE user_id = ?").bind(account).first();
  assert.equal(unchanged.revision, revision);
  assert.deepEqual(JSON.parse(unchanged.payload), state);
  const finish = delta(finished);
  const completion = await patch(finish);
  assert.equal(completion.status, 200);
  assert.equal((await completion.json()).writeMode, "direct");
  assert.equal((await (await patch(finish)).json()).idempotent, true);
  const loaded = await (await read(adminCookie)).json();
  assert.equal(loaded.dataSource, "relational");
  assert.equal(loaded.revision, revision + 1);
  assert.deepEqual(loaded.state.sequences[0].exerciseIds, sequence.exerciseIds);
  assert.equal(loaded.state.exercises.find(exercise => exercise.id === copy.id).ownerAdultId, copy.ownerAdultId);
  assert.deepEqual(loaded.state.sessionHistory.filter(session => session.id === "fixture-finished").map(session => session.items[0].exerciseId), [copy.id]);
  console.log("PASS: an old editor cannot erase copy metadata; session completion and replay keep the original exercise.");
}
