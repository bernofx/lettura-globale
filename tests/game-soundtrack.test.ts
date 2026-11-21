import assert from "node:assert/strict";
import test from "node:test";
import { mp3Duration } from "../app/domain/game-soundtrack.ts";

// MPEG-1 Layer III, 128 kbit/s, 44.1 kHz, no padding: 417 bytes and 1152 samples per frame.
const FRAME_LENGTH = 417;
const FRAME_SECONDS = 1152 / 44100;
function frames(count: number) {
  const bytes = new Uint8Array(count * FRAME_LENGTH);
  for (let index = 0; index < count; index++) bytes.set([0xff, 0xfb, 0x90, 0x00], index * FRAME_LENGTH);
  return bytes;
}
const concat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let at = 0; for (const part of parts) { out.set(part, at); at += part.length; } return out; };
const text = (value: string) => new TextEncoder().encode(value);
const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

test("un MP3 senza tag ha la durata dei suoi frame", () => close(mp3Duration(frames(10)), 10 * FRAME_SECONDS));

test("tag e riempimenti finali comuni non rendono invalido un MP3", () => {
  const id3v1 = concat(text("TAG"), new Uint8Array(125));
  close(mp3Duration(concat(frames(10), id3v1)), 10 * FRAME_SECONDS);
  close(mp3Duration(concat(frames(10), text("APETAGEX"), new Uint8Array(24))), 10 * FRAME_SECONDS);
  close(mp3Duration(concat(frames(10), text("LYRICSBEGIN"), text("ciao"))), 10 * FRAME_SECONDS);
  close(mp3Duration(concat(frames(10), new Uint8Array(37))), 10 * FRAME_SECONDS);
});

test("un ultimo frame troncato è accettato", () => close(mp3Duration(frames(10).subarray(0, 10 * FRAME_LENGTH - 100)), 10 * FRAME_SECONDS));

test("un tag ID3v2 iniziale seguito da zeri viene saltato", () => {
  const id3 = concat(text("ID3"), new Uint8Array([3, 0, 0, 0, 0, 0, 20]), new Uint8Array(20), new Uint8Array(6));
  close(mp3Duration(concat(id3, frames(5))), 5 * FRAME_SECONDS);
});

test("file che non sono MP3 restano rifiutati", () => {
  assert.equal(mp3Duration(text("RIFF....WAVEfmt ")), null);
  assert.equal(mp3Duration(frames(1)), null);
  assert.equal(mp3Duration(concat(frames(10), text("dati qualsiasi non audio"))), null);
  assert.equal(mp3Duration(new Uint8Array(0)), null);
});
