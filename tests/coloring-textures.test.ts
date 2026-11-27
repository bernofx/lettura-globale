import assert from "node:assert/strict";
import test from "node:test";
import { parseColoringDrawing } from "../app/domain/coloring-drawings.ts";

const drawing = (areas: unknown[]) => ({ version: 1, editedAt: 1_764_000_000_000, operation: "0b7f6f8e-3d4c-4c1a-9d2e-7a1b2c3d4e5f", areas });
const point = { x: 10, y: 20 };

test("trame accettate su zone e tratti del pennello, con il colore di base conservato", () => {
  const parsed = parseColoringDrawing(drawing([
    { index: -1, fill: "#fff4c2", fillTexture: "dots", strokes: [] },
    { index: 0, fill: "#e2401c", fillTexture: "lava", strokes: [{ tool: "brush", color: "#dcaa2a", texture: "glitter", points: [point] }] },
    { index: 1, strokes: [{ tool: "brush", color: "#26337a", texture: "stars", points: [point, { x: 30, y: 40 }] }] },
  ]), 4);
  assert.ok(parsed);
  assert.equal(parsed.areas[0].fillTexture, "dots");
  assert.equal(parsed.areas[1].fill, "#e2401c");
  assert.equal(parsed.areas[1].strokes[0].texture, "glitter");
  assert.equal(parsed.areas[2].strokes[0].texture, "stars");
});

test("trame sconosciute, trame senza colore di base o sul pastello sono rifiutate", () => {
  assert.equal(parseColoringDrawing(drawing([{ index: 0, fill: "#e2401c", fillTexture: "fuoco", strokes: [] }]), 2), null);
  assert.equal(parseColoringDrawing(drawing([{ index: 0, fillTexture: "lava", strokes: [] }]), 2), null);
  assert.equal(parseColoringDrawing(drawing([{ index: 0, strokes: [{ tool: "crayon", color: "#e2401c", texture: "lava", points: [point] }] }]), 2), null);
  assert.equal(parseColoringDrawing(drawing([{ index: 0, strokes: [{ tool: "brush", color: "#e2401c", texture: 3, points: [point] }] }]), 2), null);
});

test("i disegni salvati prima delle trame restano validi e identici", () => {
  const legacy = drawing([{ index: 0, fill: "#e84252", strokes: [{ tool: "crayon", color: "#2b9b58", points: [point] }] }]);
  const parsed = parseColoringDrawing(legacy, 2);
  assert.deepEqual(parsed?.areas, [{ index: 0, fill: "#e84252", strokes: [{ tool: "crayon", color: "#2b9b58", points: [point] }] }]);
  assert.equal("fillTexture" in (parsed?.areas[0] ?? {}), false);
});
