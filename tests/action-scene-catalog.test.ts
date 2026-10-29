import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import test from "node:test";
import { actionSceneCatalog } from "../app/domain/action-scene-catalog.ts";

test("il catalogo precaricato contiene quaranta scene con immagini distribuibili", () => {
  assert.equal(actionSceneCatalog.length, 40);
  assert.equal(new Set(actionSceneCatalog.map((item) => item.id)).size, 40);
  for (const item of actionSceneCatalog) {
    const file = new URL(`../public${item.image}`, import.meta.url);
    assert.equal(existsSync(file), true, `immagine mancante per ${item.id}`);
    assert.ok(statSync(file).size > 0, `immagine vuota per ${item.id}`);
  }
  for (const subject of ["Il coniglio", "Il cavallo", "Il panda", "La scimmia"]) {
    const scenes = actionSceneCatalog.filter((item) => item.subject === subject);
    assert.deepEqual(scenes.map((item) => item.verb), ["mangia", "dorme", "corre", "salta", "gioca"]);
    assert.ok(scenes.every((item) => item.contentKind === "sentence" && item.phraseStructure === "subject-verb" && !item.complement));
  }
});
