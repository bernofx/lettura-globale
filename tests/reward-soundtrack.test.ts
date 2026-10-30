import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRewardMusic, REWARD_SOUNDTRACK } from "../app/domain/reward-soundtrack.ts";

function fixture(state = "running") {
  const sources: Array<{ loop: boolean; buffer: unknown; starts: number; stops: number; disconnects: number; connect: () => void; disconnect: () => void; start: () => void; stop: () => void }> = [];
  const gains: Array<{ gain: { value: number }; connect: () => void; disconnect: () => void }> = [];
  const context = {
    state, destination: {}, resumes: 0,
    resume: async () => { context.resumes++; context.state = "running"; },
    createBufferSource: () => {
      const node = { loop: false, buffer: null as unknown, starts: 0, stops: 0, disconnects: 0, connect: () => {}, disconnect: () => { node.disconnects++; }, start: () => { node.starts++; }, stop: () => { node.stops++; } };
      sources.push(node); return node;
    },
    createGain: () => { const node = { gain: { value: 0 }, connect: () => {}, disconnect: () => {} }; gains.push(node); return node; },
  };
  return { context, sources, gains, audio: context as unknown as AudioContext };
}
const buffer = {} as AudioBuffer;
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("provided soundtrack is a small bundled asset with source metadata and a fixed URL", () => {
  const bytes = readFileSync(new URL(`../public${REWARD_SOUNDTRACK.url}`, import.meta.url));
  assert.ok(bytes.length < 300_000 && bytes.length > 100_000);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "e3ed3d13de387ce14c16a65c0e5fa165d2a9c78346c85729816f1c666c21828e");
  assert.ok(REWARD_SOUNDTRACK.source.includes("untitled.wav"));
  assert.ok(REWARD_SOUNDTRACK.license);
});

test("loops independently, adjusts volume/mute live and releases only its own source", async () => {
  const f = fixture();
  const player = createRewardMusic(f.audio, async () => buffer, 1);
  await flush();
  assert.equal(f.sources.length, 1);
  assert.equal(f.sources[0].loop, true);
  assert.equal(f.sources[0].starts, 1);
  assert.equal(f.gains[0].gain.value, 0.45);
  player.retry(); player.setVolume(0.5); await flush();
  assert.equal(f.sources.length, 1);
  assert.equal(f.gains[0].gain.value, 0.225);
  player.setVolume(0); assert.equal(f.gains[0].gain.value, 0);
  player.setVolume(Number.NaN); assert.equal(f.gains[0].gain.value, 0);
  player.setVolume(3); assert.equal(f.gains[0].gain.value, 0.45);
  player.stop(); player.stop(); player.retry(); await flush();
  assert.equal(f.sources[0].stops, 1);
  assert.equal(f.sources[0].disconnects, 1);
  assert.equal(f.sources.length, 1);
});

test("muted opening loads nothing and unmute starts music, without recreating a suspended loop", async () => {
  const f = fixture("suspended");
  let loads = 0;
  const player = createRewardMusic(f.audio, async () => { loads++; return buffer; }, 0);
  await flush(); assert.equal(loads, 0);
  player.setVolume(1); await flush();
  assert.equal(f.context.resumes, 1); assert.equal(f.sources.length, 1);
  f.context.state = "suspended";
  player.retry(); await flush();
  assert.equal(f.context.resumes, 2); assert.equal(f.sources.length, 1);
  player.stop();
});

test("closing while decoding cannot start music later; missing/closed audio is harmless", async () => {
  const f = fixture();
  let resolve!: (buffer: AudioBuffer) => void;
  const pending = new Promise<AudioBuffer>((done) => { resolve = done; });
  const player = createRewardMusic(f.audio, () => pending, 1);
  player.stop(); resolve(buffer); await flush();
  assert.equal(f.sources.length, 0);
  createRewardMusic(null, async () => buffer, 1).stop();
  const closed = fixture("closed"); createRewardMusic(closed.audio, async () => buffer, 1).stop();
  assert.equal(closed.sources.length, 0);
});

test("autoplay rejection and failed decode can retry on the next gesture without blocking the game", async () => {
  const f = fixture("suspended");
  let blocked = true;
  f.context.resume = async () => { if (blocked) throw new Error("NotAllowedError"); f.context.state = "running"; };
  let decoded = false;
  const player = createRewardMusic(f.audio, async () => decoded ? buffer : null, 1);
  await flush(); assert.equal(f.sources.length, 0);
  blocked = false; player.retry(); await flush(); assert.equal(f.sources.length, 0);
  decoded = true; player.retry(); await flush(); assert.equal(f.sources.length, 1);
  player.stop();
});

test("a gesture can release an indefinitely pending resume without creating duplicate loops", async () => {
  const f = fixture("suspended");
  let release!: () => void;
  const suspended = new Promise<void>((resolve) => { release = resolve; });
  f.context.resume = async () => {
    f.context.resumes++;
    if (f.context.resumes === 2) { f.context.state = "running"; release(); }
    await suspended;
  };
  const player = createRewardMusic(f.audio, async () => buffer, 1);
  await flush(); assert.equal(f.sources.length, 0);
  player.retry(); await flush();
  assert.equal(f.context.resumes, 2); assert.equal(f.sources.length, 1);
  player.stop();
});
