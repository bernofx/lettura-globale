import assert from "node:assert/strict";
import test from "node:test";
import { activityNavigation } from "../app/domain/session-navigation.ts";

test("limiti alle sezioni: prima, intermedia e ultima, anche con esercizi dello stesso tipo", () => {
  const plan = ["a", "a", "b", "b", "c", "c"].map((sourceExerciseId, index) => ({ id: `turn-${index}`, sourceExerciseId }));
  assert.deepEqual(activityNavigation(plan, 0), { previous: null, next: 2 });
  assert.deepEqual(activityNavigation(plan, 1), { previous: null, next: 2 });
  assert.deepEqual(activityNavigation(plan, 2), { previous: 0, next: 4 });
  assert.deepEqual(activityNavigation(plan, 3), { previous: 0, next: 4 });
  assert.deepEqual(activityNavigation(plan, 4), { previous: 2, next: null });
  assert.deepEqual(activityNavigation(plan, 5), { previous: 2, next: null });
});

test("una sola sezione non ha precedente/successiva; nessun indice oltre il piano", () => {
  const plan = [0, 1].map((index) => ({ id: `${index}`, sourceExerciseId: "only" }));
  for (const index of [0, 1, -1, 2, NaN]) assert.deepEqual(activityNavigation(plan, index), { previous: null, next: null });
  assert.deepEqual(activityNavigation([], 0), { previous: null, next: null });
  assert.deepEqual(activityNavigation([{ id: "a" }, { id: "b" }], 0), { previous: null, next: 1 });
});
