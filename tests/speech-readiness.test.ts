import assert from "node:assert/strict";
import test from "node:test";
import { waitForSpeechVoices } from "../app/domain/speech-readiness.ts";

test("usa subito le voci già disponibili", async () => {
  let listeners = 0;
  const voices = await waitForSpeechVoices({
    getVoices: () => ["italiano"],
    addEventListener: () => { listeners += 1; },
    removeEventListener: () => { listeners -= 1; },
  }, 5);
  assert.deepEqual(voices, ["italiano"]);
  assert.equal(listeners, 0);
});

test("attende voiceschanged al primo caricamento", async () => {
  let voices: string[] = [];
  let listener: (() => void) | undefined;
  const pending = waitForSpeechVoices({
    getVoices: () => voices,
    addEventListener: (_type, next) => { listener = next; },
    removeEventListener: () => { listener = undefined; },
  }, 50);
  voices = ["italiano"];
  listener?.();
  assert.deepEqual(await pending, ["italiano"]);
  assert.equal(listener, undefined);
});

test("non resta bloccato se il browser non carica le voci", async () => {
  const voices = await waitForSpeechVoices({
    getVoices: () => [],
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }, 1);
  assert.deepEqual(voices, []);
});
