import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { categorySymbolCatalog, seedDefaultCategorySymbols } from "../app/domain/category-symbol-catalog.ts";
import { categoryImageError } from "../app/domain/category-images.ts";
import { availableForWordCategories } from "../app/domain/word-category-content.ts";
import { availableForRecognition } from "../app/domain/library-availability.ts";
import { buildStateChange, applyStateChange } from "../app/domain/state-changes.ts";

test("dodici simboli generici hanno WebP distribuiti, crediti e ID distinti", () => {
  assert.equal(categorySymbolCatalog.length, 12);
  assert.equal(new Set(categorySymbolCatalog.map((item) => item.id)).size, 12);
  for (const item of categorySymbolCatalog) {
    const path = new URL(`../public${item.image}`, import.meta.url);
    assert.ok(existsSync(path));
    const bytes = readFileSync(path);
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assert.ok(item.source && item.license && item.author);
  }
  assert.equal(availableForWordCategories(categorySymbolCatalog).length, 0);
  assert.equal(availableForRecognition(categorySymbolCatalog, "words").length, 0);
});

test("prima introduzione: assegna soltanto simboli mancanti, senza scelte casuali", () => {
  const saved = { Animali: "chosen-dog", "Categoria privata": "chosen-private" };
  const next = seedDefaultCategorySymbols(saved, []);
  assert.equal(next.Animali, "chosen-dog");
  assert.equal(next.Cibi, "simbolo-generico-cibi");
  assert.equal(next["Categoria privata"], "chosen-private");
  assert.equal(next.Azioni, undefined);
  assert.deepEqual(saved, { Animali: "chosen-dog", "Categoria privata": "chosen-private" });
  assert.deepEqual(seedDefaultCategorySymbols(saved, []), next);
});

test("reload e catalogo già introdotto rispettano sostituzioni, rimozioni e archiviazioni", () => {
  const saved = { Animali: "chosen-dog" };
  assert.equal(seedDefaultCategorySymbols(saved, categorySymbolCatalog), saved);
  assert.equal(seedDefaultCategorySymbols(saved, categorySymbolCatalog.map((item) => ({ ...item, deleted: true }))), saved);
  const empty = { Cibi: "" };
  assert.equal(seedDefaultCategorySymbols(empty, []).Cibi, "", "anche una scelta vuota esplicita resta intatta");
});

test("immagini e associazioni passano insieme dalle modifiche cloud e restano validabili", () => {
  const before = { schemaVersion: 1, library: [], exercises: [], sequences: [], therapists: [], children: [], attempts: [], helps: [], sessionHistory: [], categorySymbols: {} };
  const symbols = seedDefaultCategorySymbols({}, []);
  const after = { ...before, library: categorySymbolCatalog, categorySymbols: symbols };
  const change = buildStateChange(before, after, "test-generic-category-symbols", 1)!;
  const restored = applyStateChange(before, change);
  assert.deepEqual(restored.categorySymbols, symbols);
  assert.ok(Array.isArray(restored.library));
  assert.equal(restored.library.length, 12);
  assert.equal(categoryImageError({ kind: "word-categories", categoryNames: ["Animali", "Cibi"], categoryShowSymbols: true }, categorySymbolCatalog, symbols), null);
  assert.match(categoryImageError({ kind: "word-categories", categoryNames: ["Categoria nuova"], categoryShowSymbols: true }, categorySymbolCatalog, symbols)!, /Categoria nuova/);
});
