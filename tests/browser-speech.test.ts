import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserSpeechPlayer } from "../app/domain/browser-speech.ts";

function setup() {
  let now = 0, serial = 0, failed = 0, completed = 0, cancelled = 0, resumed = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const spoken: SpeechSynthesisUtterance[] = [];
  let voices = [{ lang: "it-IT", name: "Demo", localService: true }] as SpeechSynthesisVoice[];
  const listeners = new Set<() => void>();
  const synthesis = {
    speaking: false, paused: false,
    getVoices: () => voices,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    cancel() { cancelled++; }, resume() { resumed++; },
    speak(utterance: SpeechSynthesisUtterance) { spoken.push(utterance); },
  };
  const player = createBrowserSpeechPlayer({
    synthesis: synthesis as unknown as SpeechSynthesis,
    utterance: (text) => ({ text } as SpeechSynthesisUtterance),
    schedule(run, delay) { timers.set(++serial, { at: now + delay, run }); return serial; },
    clear: (id) => { timers.delete(id); }, unavailable: () => { failed++; },
  });
  const tick = (duration: number) => {
    const end = now + duration;
    for (;;) {
      const first = [...timers.entries()].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!first) break;
      now = first[1].at; timers.delete(first[0]); first[1].run();
    }
    now = end;
  };
  const start = (utterance = spoken.at(-1)!) => utterance.onstart?.call(utterance, {} as SpeechSynthesisEvent);
  const end = (utterance = spoken.at(-1)!) => utterance.onend?.call(utterance, {} as SpeechSynthesisEvent);
  const error = (code = "synthesis-failed", utterance = spoken.at(-1)!) => utterance.onerror?.call(utterance, { error: code } as SpeechSynthesisErrorEvent);
  return { player, synthesis, spoken, timers, tick, start, end, error,
    speak: (text = "Mela", volume = 1) => player.speak(text, volume, () => { completed++; }),
    cold() { voices = []; }, warm() { voices = [{ lang: "it-IT", name: "Demo", localService: true }] as SpeechSynthesisVoice[]; listeners.forEach((listener) => listener()); },
    get failed() { return failed; }, get completed() { return completed; }, get cancelled() { return cancelled; }, get resumed() { return resumed; },
  };
}

test("il primo avvio silenzioso viene ritentato una sola volta e poi segnalato", () => {
  const run = setup(); run.speak();
  assert.equal(run.spoken.length, 1);
  run.tick(1760); assert.equal(run.spoken.length, 2);
  run.tick(10000); assert.equal(run.spoken.length, 2);
  assert.equal(run.failed, 1); assert.equal(run.completed, 1);
  assert.equal(run.timers.size, 0);
});
test("avvio confermato o arrivato durante il recupero non ripete la parola", () => {
  for (const beforeRetry of [false, true]) {
    const run = setup(); run.speak();
    if (beforeRetry) run.tick(1650);
    run.start(); run.tick(2000); run.end(); run.end();
    assert.equal(run.spoken.length, 1);
    assert.equal(run.failed, 0); assert.equal(run.completed, 1);
  }
});
test("il secondo tentativo può partire: gli eventi tardivi del primo sono ignorati", () => {
  const run = setup(); run.speak(); const old = run.spoken[0];
  run.tick(1760); run.error("canceled", old); run.end(old);
  assert.equal(run.completed, 0);
  run.start(); run.end(); run.tick(20000);
  assert.equal(run.failed, 0); assert.equal(run.completed, 1); assert.equal(run.spoken.length, 2);
});
test("pausa, uscita e cambio turno annullano anche retry e callback pendenti", () => {
  const run = setup(); const cancel = run.speak(); run.tick(1650); cancel();
  run.start(run.spoken[0]); run.end(run.spoken[0]); run.tick(20000);
  assert.equal(run.spoken.length, 1); assert.equal(run.completed, 0); assert.equal(run.failed, 0);
  assert.equal(run.timers.size, 0);
});
test("una richiesta più recente prevale e la cancellazione vecchia non la ferma", () => {
  const run = setup(); const cancelOld = run.speak("Mela");
  run.speak("Cane"); const stops = run.cancelled; cancelOld();
  assert.equal(run.cancelled, stops); run.start(); run.end(); run.tick(20000);
  assert.equal(run.completed, 1); assert.equal(run.spoken.length, 2);
});
test("motore a freddo: attende le voci ma una richiesta cancellata non riparte", async () => {
  const run = setup(); run.cold(); const cancel = run.speak();
  assert.equal(run.spoken.length, 0); cancel(); run.warm();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(run.spoken.length, 0); assert.equal(run.failed, 0);
  run.speak(); assert.equal(run.spoken.length, 1, "con voci pronte il tap rimane sincrono");
  run.start(); run.end();
});
test("motore a freddo: la voce pronta avvia la prima richiesta una volta", async () => {
  const run = setup(); run.cold(); run.speak(); run.warm();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(run.spoken.length, 1); run.start(); run.end();
  assert.equal(run.completed, 1);
});
test("autoplay vietato richiede un tocco e non avvia un loop di retry", () => {
  const run = setup(); run.speak(); run.error("not-allowed"); run.tick(20000);
  assert.equal(run.spoken.length, 1); assert.equal(run.failed, 1);
  run.speak(); run.start(); run.end(); assert.equal(run.spoken.length, 2);
});
test("non ripete audio forse già attivo se il browser omette l’evento start", () => {
  const run = setup(); run.speak(); run.synthesis.speaking = true;
  run.tick(2000); assert.equal(run.spoken.length, 1); run.end(); run.tick(20000);
  assert.equal(run.spoken.length, 1); assert.equal(run.failed, 0);
});
test("riprende un motore sospeso e rispetta volume e mute", () => {
  const run = setup(); run.synthesis.paused = true; run.speak("Mela", .35);
  assert.equal(run.resumed, 1); assert.equal(run.spoken[0].volume, .35);
  run.start(); run.end(); run.speak("Cane", 0); run.tick(20000);
  assert.equal(run.spoken.length, 1); assert.equal(run.failed, 0); assert.equal(run.completed, 2);
});
test("senza evento end il feedback si sblocca senza doppia pronuncia", () => {
  const run = setup(); run.speak(); run.start(); run.tick(20000);
  assert.equal(run.spoken.length, 1); assert.equal(run.completed, 1); assert.equal(run.failed, 0);
});
