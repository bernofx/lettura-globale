import assert from "node:assert/strict";
import test from "node:test";
import { decodeUpdateValue, readUpdateCheckpoint, UpdateRegistry } from "../app/domain/update-checkpoint.ts";

test("explicit update handoff is same identity, URL and tab, with a short expiry", () => {
  const checkpoint = JSON.stringify({ schema: 1, at: 1000, identity: "adult-demo", path: "/?preview=demo", values: { turn: 2 } });
  assert.equal(readUpdateCheckpoint(checkpoint, "adult-demo", "/?preview=demo", 2000)?.values.turn, 2);
  assert.equal(readUpdateCheckpoint(checkpoint, "different-adult", "/?preview=demo", 2000), null);
  assert.equal(readUpdateCheckpoint(checkpoint, "adult-demo", "/", 2000), null);
  assert.equal(readUpdateCheckpoint(checkpoint, "adult-demo", "/?preview=demo", 301001), null);
  assert.equal(readUpdateCheckpoint(checkpoint, "adult-demo", "/?preview=demo", 999), null);
  for (const raw of [null, "broken", "{}", JSON.stringify({ schema: 2 })]) assert.equal(readUpdateCheckpoint(raw, "adult-demo", "/", 2000), null);
});

test("capture preserves run, random order, quantity selection and immutable outcome without recording an attempt", () => {
  const registry = new UpdateRegistry();
  registry.register("run", () => "run-demo");
  registry.register("turn", () => 2);
  registry.register("options", () => ["dog", "cat"]);
  registry.register("quantity", () => new Set([1, 3, 5]));
  registry.register("judgement", () => "correct");
  registry.register("remaining", () => ["cat", "bird"]);
  registry.register("hostSequence", () => 15);
  const next = new UpdateRegistry();
  next.restore(JSON.parse(JSON.stringify(registry.capture())));
  assert.equal(next.initial("run", ""), "run-demo");
  assert.equal(next.initial("turn", 0), 2);
  assert.deepEqual(next.initial("options", []), ["dog", "cat"]);
  assert.deepEqual(next.initial("quantity", new Set()), new Set([1, 3, 5]));
  assert.equal(next.initial<string | null>("judgement", null), "correct");
  assert.deepEqual(next.initial("remaining", []), ["cat", "bird"]);
  assert.equal(next.initial("hostSequence", 0), 15);
  // An initializer may run twice before commit; consume only once committed.
  assert.equal(next.initial("turn", 0), 2);
  next.consume("turn");
  assert.equal(next.initial("turn", 0), 0, "later activity cannot reuse old progress");
  assert.deepEqual(decodeUpdateValue({ broken: true }, new Set([2])), new Set([2]));
});

test("only mounted state is captured; stale cleanup cannot remove a newer reader", () => {
  const registry = new UpdateRegistry();
  const removeOld = registry.register("exercise", () => "old");
  const removeNew = registry.register("exercise", () => "new");
  removeOld();
  assert.deepEqual(registry.capture(), { exercise: "new" });
  removeNew();
  assert.deepEqual(registry.capture(), {});
});

test("cloud must settle before capture, and failure aborts the update without losing state", async () => {
  const registry = new UpdateRegistry();
  let saved = false;
  registry.register("saved", () => saved);
  registry.before("cloud", async () => { saved = true; });
  await registry.prepare();
  assert.deepEqual(registry.capture(), { saved: true });
  const remove = registry.before("cloud", async () => { throw new Error("offline"); });
  await assert.rejects(registry.prepare(), /offline/);
  assert.deepEqual(registry.capture(), { saved: true });
  remove();
  await registry.prepare();
});
