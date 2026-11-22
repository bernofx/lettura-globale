import assert from "node:assert/strict";
import test from "node:test";
import { coloringPages, detailStrokes } from "../app/domain/coloring-pages.ts";

test("i dettagli separano i punti (occhi) dalle linee indipendentemente dall'ordine", () => {
  const strokes = detailStrokes(["M344 117 Q318 68 292 75", "M352 145 h.1 M368 145 h.1"]);
  assert.equal(strokes.dots, "M352 145 h.1 M368 145 h.1");
  assert.equal(strokes.lines, "M344 117 Q318 68 292 75");
});

test("una stringa mista con occhi e bocca viene divisa per sotto-tracciato", () => {
  const strokes = detailStrokes(["M248 258 h.1 M281 255 h.1 M246 280 Q264 297 281 277"]);
  assert.equal(strokes.dots, "M248 258 h.1 M281 255 h.1");
  assert.equal(strokes.lines, "M246 280 Q264 297 281 277");
});

test("ogni disegno conserva tutti i suoi dettagli", () => {
  for (const page of coloringPages) {
    const strokes = detailStrokes(page.details);
    const count = (text: string) => (text.match(/M/g) ?? []).length;
    assert.equal(count(strokes.dots) + count(strokes.lines), count(page.details.join(" ")), page.id);
  }
});

test("la Coccinella sorridente dichiara fonte e licenza", async () => {
  const { smilingLadybug } = await import("../app/domain/coloring-smiling-ladybug.ts");
  assert.ok(smilingLadybug.source.length > 0);
  assert.ok(smilingLadybug.license.length > 0);
});
