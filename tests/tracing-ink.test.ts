import assert from "node:assert/strict";
import test from "node:test";
import { tracingDigits, tracingGlyphs, tracingLetters } from "../app/domain/tracing-glyphs.ts";
import { createTraceInk, paintTrace, traceInkCompleted, traceInkPath, TRACE_TOLERANCE } from "../app/domain/tracing-ink.ts";

const horizontal = (y: number) => Array.from({ length: 26 }, (_, index) => ({ x: index * 4, y }));

test("il gioco include 26 lettere, 10 numeri e le tre direzioni della A", () => {
  assert.equal(tracingLetters.length, 26);
  assert.equal(tracingDigits.length, 10);
  assert.equal(new Set([...tracingLetters, ...tracingDigits]).size, Object.keys(tracingGlyphs).length);
  assert.equal(tracingGlyphs.A.length, 3);
  for (const glyph of [...tracingLetters, ...tracingDigits]) assert.ok(tracingGlyphs[glyph].length);
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

test("un singolo tratto non completa un carattere con più tratti", () => {
  const ink = createTraceInk([horizontal(0), horizontal(100)]);
  paintTrace(ink, { x: 0, y: 0 }, { x: 100, y: 0 });
  assert.equal(traceInkCompleted(ink), false);
  paintTrace(ink, { x: 0, y: 100 }, { x: 100, y: 100 });
  assert.equal(traceInkCompleted(ink), true);
});
