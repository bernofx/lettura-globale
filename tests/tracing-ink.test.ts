import assert from "node:assert/strict";
import test from "node:test";
import { sampleGlyphPath } from "./helpers/glyph-sampler.ts";
import { nextTracingGlyph, tracingDigits, tracingGlyphs, tracingLetters } from "../app/domain/tracing-glyphs.ts";
import { createTraceInk, orderedStrokeCompleted, orderedTraceEntry, paintOrderedTrace, paintTrace, startOrderedTrace, traceInkCompleted, traceInkPath, tracePrefixPath, ORDER_TOLERANCE, TRACE_TOLERANCE } from "../app/domain/tracing-ink.ts";

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
  paintOrderedTrace(points, outside, origin, { x: 25, y: ORDER_TOLERANCE + 2 });
  assert.equal(outside.invalid, true);
});

test("un raccordo già tracciato consente di raggiungere l’inizio senza avanzare sul tratto successivo", () => {
  const junction = { x: 100, y: 80 };
  const previous = [
    ...Array.from({ length: 20 }, (_, i) => ({ x: 100, y: i * 4 })),
    ...horizontal(80).reverse(),
  ];
  const points = horizontal(80).map(point => ({ ...point, x: point.x + junction.x }));
  const stem = Array.from({ length: 30 }, (_, i) => ({ x: 0, y: i * 4 }));
  const entry = orderedTraceEntry([stem, previous], points);
  const origin = { x: 0, y: 80 };
  assert.deepEqual(entry[0], origin);
  const gesture = startOrderedTrace(points, 0, origin, entry);
  paintOrderedTrace(points, gesture, origin, { x: 60, y: 80 });
  assert.equal(gesture.invalid, false);
  assert.equal(gesture.covered, 0);
  paintOrderedTrace(points, gesture, { x: 60, y: 80 }, points.at(-1)!);
  assert.equal(gesture.invalid, false);
  assert.equal(orderedStrokeCompleted(points, gesture.covered), true);

  assert.equal(startOrderedTrace(points, 0, points.at(-1)!, entry).invalid, true);
  assert.equal(startOrderedTrace(points, 10, origin, entry).invalid, true);
  const shortcut = startOrderedTrace(points, 0, origin, entry);
  paintOrderedTrace(points, shortcut, origin, { x: 60, y: 20 });
  assert.equal(shortcut.invalid, true);
});

test("un incrocio lontano dall’inizio o un intero tratto al contrario non creano un raccordo", () => {
  const stem = Array.from({ length: 30 }, (_, i) => ({ x: 100, y: i * 4 }));
  const previous = horizontal(80);
  const at = (x: number, y: number) => horizontal(y).map(point => ({ ...point, x: point.x + x }));
  assert.deepEqual(orderedTraceEntry([stem, previous], at(0, 80)), []);
  assert.deepEqual(orderedTraceEntry([stem, previous], at(50, 0)), []);
});

const glyphStrokes = (glyph: keyof typeof tracingGlyphs) => tracingGlyphs[glyph].map(path => sampleGlyphPath(path));
function traceAlong(points: readonly { x: number; y: number }[], route: readonly { x: number; y: number }[]) {
  const gesture = startOrderedTrace(points, 0, route[0]);
  for (let index = 1; index < route.length; index++) paintOrderedTrace(points, gesture, route[index - 1], route[index]);
  return gesture;
}

test("con ordine obbligatorio ogni tratto si completa seguendo la guida, anche smussando gli angoli", () => {
  for (const glyph of [...tracingLetters, ...tracingDigits]) {
    for (const [index, points] of glyphStrokes(glyph).entries()) {
      const exact = traceAlong(points, points);
      assert.equal(exact.invalid, false, `${glyph} stroke ${index}`);
      assert.equal(exact.covered, points.length - 1, `${glyph} stroke ${index}`);
      // A finger that rounds every corner by about 28 units, as children do on N, M, Z, 7 and 1.
      const rounded = points.map((_, at) => {
        const near = points.slice(Math.max(0, at - 7), at + 8);
        return { x: near.reduce((sum, point) => sum + point.x, 0) / near.length, y: near.reduce((sum, point) => sum + point.y, 0) / near.length };
      });
      rounded[0] = points[0];
      const cut = traceAlong(points, rounded);
      assert.equal(cut.invalid, false, `${glyph} stroke ${index} with rounded corners`);
      assert.ok(orderedStrokeCompleted(points, cut.covered), `${glyph} stroke ${index} with rounded corners`);
    }
  }
});

test("con ordine obbligatorio l’angolo della N tagliato di 30 unità non è un errore", () => {
  const [points] = glyphStrokes("N");
  const route = [points[0], { x: 63, y: 64 }, { x: 81, y: 58 }, ...points.filter(point => point.y > 58 && point.x > 81 && point.x < 277)];
  const gesture = traceAlong(points, route);
  assert.equal(gesture.invalid, false);
  assert.ok(gesture.covered > 140);
});

test("con ordine obbligatorio proseguire oltre un tratto completato non lo annulla (la A fatta a Λ)", () => {
  const [left, right] = glyphStrokes("A");
  const gesture = traceAlong(left, [...left, ...right]);
  assert.equal(gesture.invalid, false);
  assert.equal(gesture.done, true);
  assert.ok(orderedStrokeCompleted(left, gesture.covered));
  const partial = traceAlong(left, [...left.slice(0, 30), { x: 300, y: 300 }]);
  assert.equal(partial.invalid, true, "leaving an unfinished stroke is still a mistake");
});

test("con ordine obbligatorio si riprende un tratto toccando poco prima del punto raggiunto", () => {
  const points = horizontal(0);
  const resumed = startOrderedTrace(points, 12, { x: 28, y: 0 });
  assert.equal(resumed.invalid, false);
  paintOrderedTrace(points, resumed, { x: 28, y: 0 }, { x: 100, y: 0 });
  assert.equal(resumed.invalid, false);
  assert.equal(resumed.covered, points.length - 1);
  const idle = startOrderedTrace(points, 12, { x: 28, y: 0 });
  paintOrderedTrace(points, idle, { x: 28, y: 0 }, { x: 36, y: 0 });
  assert.equal(idle.covered, 12, "progress already reached is never lost");
});

test("il raccordo vale solo dove il tratto precedente porta nel successivo (B e R), non su T, I o K", () => {
  const entries = Object.fromEntries((Object.keys(tracingGlyphs) as (keyof typeof tracingGlyphs)[]).map(glyph => {
    const strokes = glyphStrokes(glyph);
    return [glyph, strokes.flatMap((points, index) => orderedTraceEntry(strokes.slice(0, index), points).length ? [index] : [])];
  }).filter(([, indexes]) => indexes.length));
  assert.deepEqual(entries, { B: [2], R: [2] });
});

test("con ordine obbligatorio si accetta un dito che resta a lato della guida, non uno lontano", () => {
  const sideways = (points: readonly { x: number; y: number }[], offset: number) => points.map((point, index) => {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const length = Math.hypot(after.x - before.x, after.y - before.y) || 1;
    return { x: point.x - (after.y - before.y) / length * offset, y: point.y + (after.x - before.x) / length * offset };
  });
  for (const glyph of [...tracingLetters, ...tracingDigits]) {
    for (const [index, points] of glyphStrokes(glyph).entries()) {
      for (const offset of [-35, 35]) {
        // Inside a sharp corner a parallel line folds back on itself; a real finger skips that fold.
        const route: { x: number; y: number }[] = [];
        for (const [at, point] of sideways(points, offset).entries()) {
          const last = route.at(-1);
          const ahead = points[Math.min(points.length - 1, at + 1)], behind = points[Math.max(0, at - 1)];
          if (!last || (point.x - last.x) * (ahead.x - behind.x) + (point.y - last.y) * (ahead.y - behind.y) >= 0) route.push(point);
        }
        const gesture = traceAlong(points, route);
        assert.equal(gesture.invalid, false, `${glyph} stroke ${index}, ${offset} units aside`);
        assert.ok(orderedStrokeCompleted(points, gesture.covered), `${glyph} stroke ${index}, ${offset} units aside`);
      }
    }
  }
  const line = horizontal(0);
  assert.equal(traceAlong(line, line.map(point => ({ ...point, y: 40 }))).invalid, false, "about 22 units beyond the visible guide edge");
  assert.equal(traceAlong(line, [line[0], ...line.slice(1).map(point => ({ ...point, y: 60 }))]).invalid, true, "well outside the guide");
});
