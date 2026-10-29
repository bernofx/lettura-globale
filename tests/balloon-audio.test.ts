import assert from "node:assert/strict";
import test from "node:test";
import { playBalloonPop } from "../app/domain/balloon-audio.ts";

function audio(state = "running", rejectResume = false) {
  const events: { peaks: number[]; starts: number[]; stops: number[]; resumes: number; disconnects: number; sources: { onended?: () => void }[] } = { peaks: [], starts: [], stops: [], resumes: 0, disconnects: 0, sources: [] };
  const node = () => ({ connect() {}, disconnect() { events.disconnects++; } });
  const mock = {
    state, sampleRate: 48000, currentTime: 12, destination: {},
    async resume() { events.resumes++; if (rejectResume) throw new Error("blocked"); mock.state = "running"; },
    createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; },
    createBufferSource() {
      const source = { ...node(), buffer: null, onended: undefined as (() => void) | undefined, start(time: number) { events.starts.push(time); }, stop(time: number) { events.stops.push(time); } };
      events.sources.push(source);
      return source;
    },
    createBiquadFilter() { return { ...node(), frequency: { value: 0 }, Q: { value: 0 } }; },
    createGain() { return { ...node(), gain: { setValueAtTime() {}, linearRampToValueAtTime(value: number) { events.peaks.push(value); }, exponentialRampToValueAtTime() {} } }; },
  };
  return { context: mock as unknown as AudioContext, events };
}

test("lo scoppio è breve, proporzionato al volume e libera i nodi audio", async () => {
  const { context, events } = audio();
  await playBalloonPop(context, 0.5);
  assert.deepEqual(events.peaks, [0.28]);
  assert.deepEqual(events.starts, [12]);
  assert.equal(events.stops[0] - events.starts[0] < 0.15, true);
  events.sources[0].onended?.();
  assert.equal(events.disconnects, 3);
  await playBalloonPop(context, 1);
  assert.equal(events.peaks[1], 0.56);
  assert.equal(events.sources.length, 2, "tocchi diversi possono suonare senza interrompere gli altri");
});

test("l'aumento dello scoppio non supera il massimo quando il volume è fuori intervallo", async () => {
  const { context, events } = audio();
  await playBalloonPop(context, 2);
  assert.deepEqual(events.peaks, [0.56]);
});

test("audio disattivato, non disponibile o bloccato non avvia alcuno scoppio", async () => {
  const { context, events } = audio("suspended");
  for (const volume of [0, -1, NaN]) await playBalloonPop(context, volume);
  assert.equal(events.resumes, 0);
  assert.equal(events.sources.length, 0);
  await playBalloonPop(null, 1);
  const closed = audio("closed");
  await playBalloonPop(closed.context, 1);
  assert.equal(closed.events.sources.length, 0);
  const blocked = audio("suspended", true);
  await playBalloonPop(blocked.context, 1);
  assert.equal(blocked.events.sources.length, 0);
  await playBalloonPop(context, 1);
  assert.equal(events.resumes, 1);
  assert.equal(events.sources.length, 1);
});
