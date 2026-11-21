import assert from "node:assert/strict";
import test from "node:test";
import { resolveByteRange } from "../app/domain/byte-range.ts";

test("intervalli chiusi, aperti e finali vengono risolti sulla dimensione reale", () => {
  assert.deepEqual(resolveByteRange("bytes=0-1", 1000), { offset: 0, length: 2 });
  assert.deepEqual(resolveByteRange("bytes=900-", 1000), { offset: 900, length: 100 });
  assert.deepEqual(resolveByteRange("bytes=-100", 1000), { offset: 900, length: 100 });
  assert.deepEqual(resolveByteRange("bytes=-5000", 1000), { offset: 0, length: 1000 });
  assert.deepEqual(resolveByteRange("bytes=990-5000", 1000), { offset: 990, length: 10 });
});

test("intervalli non soddisfacibili producono 416", () => {
  assert.equal(resolveByteRange("bytes=1000-", 1000), "unsatisfiable");
  assert.equal(resolveByteRange("bytes=-0", 1000), "unsatisfiable");
});

test("intestazioni assenti, malformate o multiple servono l'intero file", () => {
  assert.equal(resolveByteRange(null, 1000), null);
  assert.equal(resolveByteRange("bytes=0-1,5-6", 1000), null);
  assert.equal(resolveByteRange("items=0-1", 1000), null);
  assert.equal(resolveByteRange("bytes=50-10", 1000), null);
});
