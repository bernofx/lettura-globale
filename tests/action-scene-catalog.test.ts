import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import test from "node:test";
import { actionSceneCatalog } from "../app/domain/action-scene-catalog.ts";

test("il catalogo precaricato contiene venti scene con immagini distribuibili", () => {
  assert.equal(actionSceneCatalog.length, 20);
  assert.equal(new Set(actionSceneCatalog.map((item) => item.id)).size, 20);
  for (const item of actionSceneCatalog) {
    const file = new URL(`../public${item.image}`, import.meta.url);
    assert.equal(existsSync(file), true, `immagine mancante per ${item.id}`);
    assert.ok(statSync(file).size > 0, `immagine vuota per ${item.id}`);
  }
});
