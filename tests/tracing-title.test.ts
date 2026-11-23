import assert from "node:assert/strict";
import test from "node:test";
import { tracingTitle } from "../app/domain/tracing-glyphs.ts";

test("il titolo del ripasso usa l’articolo italiano corretto", () => {
  assert.equal(tracingTitle("B"), "Ripassa la B");
  assert.equal(tracingTitle("A"), "Ripassa l’A");
  assert.equal(tracingTitle("S"), "Ripassa l’S");
  assert.equal(tracingTitle("3"), "Ripassa il 3");
  assert.equal(tracingTitle("1"), "Ripassa l’1");
  assert.equal(tracingTitle("8"), "Ripassa l’8");
  assert.equal(tracingTitle("0"), "Ripassa lo 0");
});
