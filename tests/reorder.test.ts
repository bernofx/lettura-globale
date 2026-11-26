import assert from "node:assert/strict";
import test from "node:test";
import { dropIndex, moveItem, reorderVisible } from "../app/domain/reorder.ts";

test("moveItem sposta un elemento in avanti, indietro e limita l’indice", () => {
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 3, 1), ["a", "d", "b", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 1, 9), ["a", "c", "b"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 5, 0), ["a", "b", "c"]);
});

test("dropIndex supera una riga solo oltre la sua metà", () => {
  const midpoints = [30, 90, 150, 210];
  assert.equal(dropIndex(85, midpoints, 0), 0);
  assert.equal(dropIndex(95, midpoints, 0), 1);
  assert.equal(dropIndex(215, midpoints, 0), 3);
  assert.equal(dropIndex(25, midpoints, 3), 0);
  assert.equal(dropIndex(155, midpoints, 3), 3);
  assert.equal(dropIndex(145, midpoints, 3), 2);
});

test("reorderVisible lascia al loro posto gli esercizi non visibili", () => {
  assert.deepEqual(reorderVisible(["a", "hidden", "b", "c"], ["c", "a", "b"]), ["c", "hidden", "a", "b"]);
  assert.deepEqual(reorderVisible(["a", "b"], ["b", "a"]), ["b", "a"]);
});
