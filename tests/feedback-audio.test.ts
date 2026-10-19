import assert from "node:assert/strict";
import test from "node:test";
import { feedbackStartOffset } from "../app/domain/feedback-audio.ts";

test("salta il silenzio iniziale mantenendo un breve preroll", () => {
  const channel = new Float32Array(500);
  channel[200] = 0.4;

  assert.equal(feedbackStartOffset([channel], 1000), 0.195);
});

test("usa il primo segnale presente su qualsiasi canale", () => {
  const left = new Float32Array(500);
  const right = new Float32Array(500);
  right[80] = -0.3;

  assert.equal(feedbackStartOffset([left, right], 1000), 0.075);
});

test("non taglia un suono che inizia subito", () => {
  const channel = new Float32Array([0.2, 0, 0]);

  assert.equal(feedbackStartOffset([channel], 44100), 0);
});

test("restituisce zero per una traccia silenziosa o parametri non validi", () => {
  assert.equal(feedbackStartOffset([new Float32Array(10)], 48000), 0);
  assert.equal(feedbackStartOffset([], 48000), 0);
  assert.equal(feedbackStartOffset([new Float32Array([1])], 0), 0);
});
