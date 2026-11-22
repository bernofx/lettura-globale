import assert from "node:assert/strict";
import test from "node:test";
import { deviceEvictions, drawingUploadTimeout } from "../app/domain/coloring-drawings.ts";

test("le copie sincronizzate più vecchie lasciano spazio, quelle non sincronizzate restano sempre", () => {
  const copies = [
    { key: "vecchia", size: 400, pending: false, editedAt: 1 },
    { key: "media", size: 400, pending: false, editedAt: 2 },
    { key: "recente", size: 400, pending: false, editedAt: 3 },
    { key: "in-attesa", size: 5_000, pending: true, editedAt: 0 },
  ];
  assert.deepEqual(deviceEvictions(copies, 900), ["vecchia"]);
  assert.deepEqual(deviceEvictions(copies, 300), ["recente", "media", "vecchia"]);
  assert.deepEqual(deviceEvictions(copies, 10_000), []);
});

test("il timeout di invio cresce con la dimensione del disegno", () => {
  assert.equal(drawingUploadTimeout(1_000), 10_040);
  assert.ok(drawingUploadTimeout(1_000_000) > 40_000, "1 MB su rete lenta");
  assert.equal(drawingUploadTimeout(1_500_000), 60_000);
});
