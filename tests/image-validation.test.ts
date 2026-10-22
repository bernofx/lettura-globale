import assert from "node:assert/strict";
import test from "node:test";
import { validateImageBytes } from "../app/domain/image-validation.ts";

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  bytes.set([73, 72, 68, 82], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

test("riconosce il formato reale e le dimensioni PNG", () => {
  assert.deepEqual(validateImageBytes(pngHeader(640, 480), "image/png"), { valid: true, width: 640, height: 480 });
  assert.deepEqual(validateImageBytes(new TextEncoder().encode("not an image"), "image/png"), { valid: false, reason: "invalid_png" });
});

test("rifiuta immagini con dimensioni eccessive", () => {
  assert.deepEqual(validateImageBytes(pngHeader(5000, 100), "image/png"), { valid: false, reason: "image_dimensions_too_large" });
});

test("non accetta byte PNG dichiarati come JPEG", () => {
  assert.deepEqual(validateImageBytes(pngHeader(100, 100), "image/jpeg"), { valid: false, reason: "invalid_jpeg" });
});
