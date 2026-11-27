import assert from "node:assert/strict";
import { buildStateChange } from "../app/domain/state-changes.ts";

export async function checkExerciseCopyWrites({ request, read, ownerCookie, supervisorCookie, adminCookie }) {
  const view = async cookie => (await read(cookie)).json();
  const patch = (cookie, change) => request("/api/state/changes", { method: "PATCH",
    headers: { cookie, "content-type": "application/json", "x-lg-exercise-copy-version": "1" }, body: JSON.stringify(change) });
  const baseline = await view(supervisorCookie);
  assert.equal(baseline.copyEditorReady, true);
  const sequence = baseline.state.sequences[0];
  const model = baseline.state.exercises.find(exercise => exercise.id === sequence.exerciseIds[1]);
  const copy = { ...model, id: "edited-slot", title: "Solo nella sequenza", ownerAdultId: "supervisor", sequenceId: sequence.id, templateExerciseId: model.id };
  const next = { ...baseline.state, exercises: [...baseline.state.exercises, copy],
    sequences: [{ ...sequence, exerciseIds: [sequence.exerciseIds[0], copy.id] }] };
  const delta = (base, state) => buildStateChange(base.state, state, crypto.randomUUID(), base.revision);
  const change = delta(baseline, next);
  const saved = await patch(supervisorCookie, change);
  const result = await saved.json();
  assert.equal(saved.status, 200, JSON.stringify(result));
  assert.equal(result.writeMode, "direct");
  assert.equal((await (await patch(supervisorCookie, change)).json()).idempotent, true);
  const owner = await view(ownerCookie);
  assert.equal(owner.dataSource, "relational");
  assert.deepEqual(owner.state.sequences[0].exerciseIds, next.sequences[0].exerciseIds);
  assert.deepEqual(owner.state.exercises.find(exercise => exercise.id === model.id), model);
  assert.equal(owner.state.exercises.find(exercise => exercise.id === copy.id).ownerAdultId, "supervisor");
  const updated = { ...owner.state, exercises: owner.state.exercises.map(exercise => exercise.id === copy.id ? { ...exercise, title: "Seconda modifica" } : exercise) };
  assert.equal((await patch(ownerCookie, delta(owner, updated))).status, 200);
  const admin = await view(adminCookie);
  assert.equal(admin.state.exercises.find(exercise => exercise.id === copy.id).title, "Seconda modifica");
  const reassigned = { ...admin.state, exercises: admin.state.exercises.map(exercise =>
    exercise.id === copy.id ? { ...exercise, ownerAdultId: "adult-a" } : exercise) };
  const denied = await patch(adminCookie, delta(admin, reassigned));
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).reason, "exercise_identity_changed");
  assert.equal((await view(ownerCookie)).revision, admin.revision);
  const detached = { ...admin.state, sequences: admin.state.sequences.map(seq => ({ ...seq, exerciseIds: seq.exerciseIds.filter(id => id !== copy.id) })) };
  assert.equal((await patch(adminCookie, delta(admin, detached))).status, 200);
  const final = await view(ownerCookie);
  assert.ok(final.state.exercises.some(exercise => exercise.id === copy.id && exercise.title === "Seconda modifica"));
  assert.deepEqual(final.state.sessionHistory, owner.state.sessionHistory);
  console.log("PASS: copia e posizione salvate insieme, replay, modifica condivisa con il proprietario e rimozione conservativa su D1.");
}
