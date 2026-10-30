import assert from "node:assert/strict";
import test from "node:test";
import { listenForAudioGestures, unlockAudioContext } from "../app/domain/audio-activation.ts";

test("activation includes release/click and retries later gestures, with cleanup", () => {
  const events = new EventTarget();
  let calls = 0;
  const remove = listenForAudioGestures(events, () => { calls++; });
  for (const type of ["pointerdown", "pointerup", "click", "pointerup", "keydown"]) events.dispatchEvent(new Event(type));
  assert.equal(calls, 5, "a failed first pointerdown must not consume the only opportunity");
  remove(); events.dispatchEvent(new Event("click")); assert.equal(calls, 5);
});

test("resume and a silent frame are issued synchronously before any asynchronous work", async () => {
  const calls: string[] = [];
  const source = { buffer: null as unknown, onended: null as (() => void) | null, connect: () => calls.push("connect"), disconnect: () => calls.push("disconnect"), start: () => calls.push("start") };
  const context = { state: "suspended", sampleRate: 48000, destination: {}, resume: () => { calls.push("resume"); return Promise.resolve(); }, createBufferSource: () => source, createBuffer: () => { calls.push("buffer"); return {}; } };
  unlockAudioContext(context as unknown as AudioContext);
  assert.deepEqual(calls, ["resume", "buffer", "connect", "start"]);
  unlockAudioContext(context as unknown as AudioContext);
  assert.equal(calls.filter((call) => call === "start").length, 1, "at most one pending silent source per context");
  source.onended?.(); assert.equal(calls.at(-1), "disconnect");
  context.state = "running"; unlockAudioContext(context as unknown as AudioContext);
  assert.equal(calls.filter((call) => call === "resume").length, 2);
  context.state = "closed"; unlockAudioContext(context as unknown as AudioContext);
  unlockAudioContext(null);
  assert.equal(calls.filter((call) => call === "resume").length, 2);
});
