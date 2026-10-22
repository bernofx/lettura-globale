import assert from "node:assert/strict";
import test from "node:test";
import { BALLOON_COLORS, CELEBRATION_DURATION_MS, popCelebrationBalloon } from "../app/domain/celebration.ts";

test("ogni palloncino scoppia una volta sola senza modificare lo stato precedente", () => {
  const initial = new Set<number>();
  const first = popCelebrationBalloon(initial, 2);
  assert.deepEqual([...initial], []);
  assert.deepEqual([...first], [2]);
  assert.equal(popCelebrationBalloon(first, 2), first, "pointerdown e click non duplicano lo scoppio");
  assert.deepEqual([...popCelebrationBalloon(first, 5)], [2, 5]);
});

test("si possono scoppiare tutti i palloncini, senza cambiare la durata della festa", () => {
  let popped: ReadonlySet<number> = new Set();
  for (let index = 0; index < BALLOON_COLORS.length; index++) popped = popCelebrationBalloon(popped, index);
  assert.equal(popped.size, 8);
  for (const invalid of [-1, 8, 1.5, Number.NaN]) assert.equal(popCelebrationBalloon(popped, invalid), popped);
  assert.equal(CELEBRATION_DURATION_MS, 6_000);
});
