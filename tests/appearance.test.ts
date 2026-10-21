import assert from "node:assert/strict";
import test from "node:test";
import { appearancePresetId, defaultAppearance, hydrateAppearance } from "../app/domain/appearance.ts";

test("ripristina un aspetto valido", () => {
  assert.deepEqual(hydrateAppearance({ palette: "ocean", shape: "round" }), { palette: "ocean", shape: "round" });
  assert.equal(appearancePresetId({ palette: "ocean", shape: "round" }), "mare");
  assert.deepEqual(hydrateAppearance({ palette: "brand", shape: "round" }), { palette: "brand", shape: "round" });
  assert.equal(appearancePresetId({ palette: "brand", shape: "round" }), "lettura-globale");
  assert.deepEqual(hydrateAppearance({ palette: "slate", shape: "square" }), { palette: "slate", shape: "square" });
});

test("scarta valori di tema non riconosciuti", () => {
  assert.deepEqual(hydrateAppearance({ palette: "unknown", shape: "sharp" }), defaultAppearance);
  assert.deepEqual(hydrateAppearance(null), defaultAppearance);
});

