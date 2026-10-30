import assert from "node:assert/strict";
import test from "node:test";
import { BALLOON_COUNT, BALLOON_WAVE_COUNT, BALLOON_WAVE_INTERVAL_MS, CELEBRATION_DURATION_MS, celebrationBalloons, popCelebrationBalloon } from "../app/domain/celebration.ts";

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
  for (let index = 0; index < BALLOON_COUNT; index++) popped = popCelebrationBalloon(popped, index);
  assert.equal(popped.size, 80);
  for (const invalid of [-1, BALLOON_COUNT, 1.5, Number.NaN]) assert.equal(popCelebrationBalloon(popped, invalid), popped);
  assert.equal(CELEBRATION_DURATION_MS, 20_000);
});

test("nuove ondate fino agli ultimi secondi con ID unici e al massimo 32 elementi montati", () => {
  const all = new Set<number>();
  for (let wave = 0; wave < BALLOON_WAVE_COUNT; wave++) {
    const balloons = celebrationBalloons(wave);
    assert.ok(balloons.length <= 32);
    const fresh = balloons.filter((item) => item.wave === wave);
    assert.equal(fresh.length, 8);
    for (const item of fresh) { assert.equal(all.has(item.id), false); all.add(item.id); }
  }
  assert.equal(all.size, BALLOON_COUNT);
  assert.equal((BALLOON_WAVE_COUNT - 1) * BALLOON_WAVE_INTERVAL_MS, 18_000);
  assert.deepEqual(celebrationBalloons(1000), celebrationBalloons(BALLOON_WAVE_COUNT - 1));
  assert.deepEqual(celebrationBalloons(-1), celebrationBalloons(0));
});

test("premio continuo: altre ondate oltre venti secondi, senza accumulare palloncini montati", () => {
  for (const wave of [10, 30, 300, 3000]) {
    const balloons = celebrationBalloons(wave, true);
    assert.equal(balloons.length, 32);
    const last = balloons.at(-1)!;
    assert.equal(last.wave, wave);
    const popped = popCelebrationBalloon(new Set(), last.id, true);
    assert.ok(popped.has(last.id));
    assert.equal(popCelebrationBalloon(popped, last.id, true), popped);
    assert.equal(popCelebrationBalloon(new Set(), last.id).size, 0, "il gioco finale mantiene il limite di 20 secondi");
  }
});
