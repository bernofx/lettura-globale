import assert from "node:assert/strict";
import test from "node:test";
import { startAndroidSpeech, type AndroidBridge } from "../app/domain/android-bridge.ts";

function fixture() {
  const events = new EventTarget();
  const spoken: { text: string; id: string; volume: number }[] = [];
  let stops = 0;
  const bridge: AndroidBridge = { speak: (text, id, volume) => { spoken.push({ text, id, volume }); }, stop: () => { stops++; }, saveCsv: () => {} };
  const end = (id: string, cancelled = false) => events.dispatchEvent(new CustomEvent("lg-native-speech-end", { detail: { id, cancelled } }));
  return { events, spoken, bridge, end, stops: () => stops };
}

test("nel browser normale non cambia la sintesi vocale", () => {
  assert.equal(startAndroidSpeech(undefined, new EventTarget(), "Ciao", 1), null);
});

test("la voce nativa mantiene testo, volume e una sola conferma di fine", () => {
  const f = fixture(); let done = 0;
  startAndroidSpeech(f.bridge, f.events, "Tocca tre caramelle", 0.4, () => { done++; });
  assert.equal(f.spoken[0].text, "Tocca tre caramelle");
  assert.equal(f.spoken[0].volume, 0.4);
  f.end("altra-richiesta"); assert.equal(done, 0);
  f.end(f.spoken[0].id); f.end(f.spoken[0].id); assert.equal(done, 1);
});

test("pausa e cancellazione nativa non provocano avanzamenti", () => {
  const f = fixture(); let done = 0;
  const cancel = startAndroidSpeech(f.bridge, f.events, "Mela", 1, () => { done++; })!;
  cancel(); f.end(f.spoken[0].id); assert.equal(done, 0);
  startAndroidSpeech(f.bridge, f.events, "Pera", 1, () => { done++; });
  f.end(f.spoken[1].id, true); f.end(f.spoken[1].id); assert.equal(done, 0);
});

test("una nuova richiesta interrompe quella precedente senza callback obsolete", () => {
  const f = fixture(); let oldDone = 0; let newDone = 0;
  startAndroidSpeech(f.bridge, f.events, "uno", 1, () => { oldDone++; });
  startAndroidSpeech(f.bridge, f.events, "due", 2, () => { newDone++; });
  f.end(f.spoken[0].id); f.end(f.spoken[1].id);
  assert.equal(oldDone, 0); assert.equal(newDone, 1); assert.ok(f.stops() >= 1);
  assert.equal(f.spoken[1].volume, 1);
});
