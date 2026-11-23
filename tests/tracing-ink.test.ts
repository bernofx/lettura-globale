import assert from "node:assert/strict";
import test from "node:test";
import { nextTracingGlyph, tracingDigits, tracingGlyphs, tracingLetters } from "../app/domain/tracing-glyphs.ts";
import { createTraceInk, orderedStrokeCompleted, paintOrderedTrace, paintTrace, startOrderedTrace, traceInkCompleted, traceInkPath, tracePrefixPath, TRACE_TOLERANCE } from "../app/domain/tracing-ink.ts";

const horizontal = (y: number) => Array.from({ length: 26 }, (_, index) => ({ x: index * 4, y }));

test("il gioco include 26 lettere, 10 numeri e le tre direzioni della A", () => {
  assert.equal(tracingLetters.length, 26);
  assert.equal(tracingDigits.length, 10);
  assert.equal(new Set([...tracingLetters, ...tracingDigits]).size, Object.keys(tracingGlyphs).length);
  assert.equal(tracingGlyphs.A.length, 3);
  for (const glyph of [...tracingLetters, ...tracingDigits]) assert.ok(tracingGlyphs[glyph].length);
});

test("il ripasso procede in ordine nella serie scelta e termina all’ultimo simbolo", () => {
  assert.equal(nextTracingGlyph("letters", "A"), "B");
  assert.equal(nextTracingGlyph("letters", "Z"), null, "the letters end with Z");
  assert.equal(nextTracingGlyph("digits", "4"), "5");
  assert.equal(nextTracingGlyph("digits", "9"), "0", "0 comes after 9");
  assert.equal(nextTracingGlyph("digits", "0"), null, "the numbers end with 0");
  assert.equal(tracingDigits[0], "1", "the numbers start from 1");
  assert.equal(nextTracingGlyph("digits", "A"), null, "a glyph outside the set does not continue");
});

test("il ripasso accetta un piccolo scostamento e ignora il dito lontano dalla guida", () => {
  const ink = createTraceInk([horizontal(0)]);
  assert.equal(paintTrace(ink, { x: 0, y: TRACE_TOLERANCE + 1 }, { x: 100, y: TRACE_TOLERANCE + 1 }), false);
  assert.equal(traceInkPath(ink), "");
  assert.equal(paintTrace(ink, { x: 0, y: TRACE_TOLERANCE - 2 }, { x: 100, y: TRACE_TOLERANCE - 2 }), true);
  assert.match(traceInkPath(ink), /^M0 0L4 0/);
  assert.equal(traceInkCompleted(ink), true);
});

test("un gesto che esce e rientra lascia un'interruzione tra le zone ripassate", () => {
  const ink = createTraceInk([horizontal(0)]);
  const drag = [{ x: 0, y: 0 }, { x: 12, y: 70 }, { x: 85, y: 70 }, { x: 100, y: 0 }];
  for (let index = 1; index < drag.length; index++) paintTrace(ink, drag[index - 1], drag[index]);
  assert.equal(traceInkPath(ink).match(/M/g)?.length, 2);
  assert.equal(traceInkCompleted(ink), false);
});

test("un gesto veloce e preciso ripassa tutto il tratto anche con punti arrotondati", () => {
  const vertical = Array.from({ length: 72 }, (_, index) => ({ x: 232, y: Math.round((36 + 283 * index / 71) * 10) / 10 }));
  const ink = createTraceInk([vertical]);
  paintTrace(ink, { x: 232, y: 36 }, { x: 232, y: 319 });
  assert.equal(ink[0].paintedCount, vertical.length - 1);
  assert.equal(traceInkCompleted(ink), true);
});

test("un singolo tratto non completa un carattere con più tratti", () => {
  const ink = createTraceInk([horizontal(0), horizontal(100)]);
  paintTrace(ink, { x: 0, y: 0 }, { x: 100, y: 0 });
  assert.equal(traceInkCompleted(ink), false);
  paintTrace(ink, { x: 0, y: 100 }, { x: 100, y: 100 });
  assert.equal(traceInkCompleted(ink), true);
});

test("il ripasso libero collega i segmenti saltati da un gesto veloce senza salti verso una zona distante", () => {
  const points = [0, 4, 8, 8.1, 8.2, 12, 16, 20].map(x => ({ x, y: 0 }));
  const ink = createTraceInk([points, horizontal(100)]);
  paintTrace(ink, { x: 20, y: 3 }, { x: 0, y: 3 });
  assert.equal(traceInkPath(ink), "M0 0L4 0L8 0L8.1 0L8.2 0L12 0L16 0L20 0");
  assert.equal(ink[1].paintedCount, 0);
});

test("con ordine obbligatorio un tratto parziale si può riprendere dal punto raggiunto", () => {
  const points = horizontal(0);
  const origin = { x: 0, y: 0 };
  const middle = { x: 48, y: 0 };
  const first = startOrderedTrace(points, 0, origin);
  paintOrderedTrace(points, first, origin, middle);
  assert.equal(first.invalid, false);
  assert.equal(orderedStrokeCompleted(points, first.covered), false);
  const last = startOrderedTrace(points, first.covered, middle);
  paintOrderedTrace(points, last, middle, { x: 100, y: 0 });
  assert.equal(last.invalid, false);
  assert.equal(last.covered, points.length - 1);
  assert.equal(orderedStrokeCompleted(points, last.covered), true);
  assert.equal(tracePrefixPath(points, last.covered), "M0 0" + points.slice(1).map(point => `L${point.x} 0`).join(""));
});

test("con ordine obbligatorio vengono rifiutati un altro tratto, il verso inverso e una vera uscita", () => {
  const points = horizontal(0);
  const origin = points[0];
  assert.equal(startOrderedTrace(points, 0, { x: 0, y: 100 }).invalid, true);
  assert.equal(startOrderedTrace(points, 0, points.at(-1)!).invalid, true);
  const backward = startOrderedTrace(points, 0, origin);
  paintOrderedTrace(points, backward, origin, points[15]);
  paintOrderedTrace(points, backward, points[15], points[7]);
  assert.equal(backward.invalid, true);
  const outside = startOrderedTrace(points, 0, origin);
  paintOrderedTrace(points, outside, origin, { x: 25, y: TRACE_TOLERANCE + 2 });
  assert.equal(outside.invalid, true);
});
