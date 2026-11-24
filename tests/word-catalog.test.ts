import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { articleFor } from "../app/domain/article-classification.ts";
import { seedDefaultCategorySymbols } from "../app/domain/category-symbol-catalog.ts";
import { deduplicateLibraryPlaceholders } from "../app/domain/library-deduplication.ts";
import { validateSharedExercises } from "../app/domain/shared-preview-validation.ts";
import { countSyllables } from "../app/domain/syllabification.ts";
import { wordOnlyCatalog } from "../app/domain/word-catalog.ts";
import { compileExercises, hydrateExercises, hydrateLibrary } from "../app/shared/state-hydration.ts";
import type { Exercise, LibraryItem } from "../app/shared/types.ts";

const oldPear: LibraryItem = { id: "pera", word: "Pera", emoji: "🍐", category: "Cibi", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" };
const oldBanana: LibraryItem = { ...oldPear, id: "banana", word: "Banana", emoji: "🍌" };

test("il catalogo aggiunge cento parole uniche senza immagini", () => {
  assert.equal(wordOnlyCatalog.length, 100);
  assert.equal(new Set(wordOnlyCatalog.map((item) => item.id)).size, 100);
  assert.equal(new Set(wordOnlyCatalog.map((item) => item.word.toLocaleLowerCase("it-IT"))).size, 100);
});

test("le nuove parole sono distribuite tra due, tre e quattro sillabe", () => {
  const counts = wordOnlyCatalog.reduce<Record<number, number>>((result, item) => {
    const count = countSyllables(item.syllabification);
    result[count] = (result[count] ?? 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, { 2: 34, 3: 33, 4: 33 });
});

test("le foto aggiornano il catalogo esistente e i tre vocaboli entrano negli esercizi per immagini", () => {
  const library = hydrateLibrary([oldPear, oldBanana]);
  const expected = [
    { id: "pera", category: "Cibi", article: "LA", syllables: "pe-ra" },
    { id: "banana", category: "Cibi", article: "LA", syllables: "ba-na-na" },
    { id: "girasole", category: "Oggetti della natura", article: "IL", syllables: "gi-ra-so-le" },
  ];
  for (const { id, category, article, syllables } of expected) {
    const items = library.filter(item => item.id === id);
    assert.equal(items.length, 1);
    const item = items[0];
    assert.equal(item.image, `/images/demo/${id}.webp`);
    assert.equal(item.emoji, undefined);
    assert.equal(item.category, category);
    assert.equal(item.source, "OpenAI ImageGen");
    assert.equal(item.license, "Uso interno del progetto");
    assert.equal(articleFor(item), article);
    assert.equal(item.syllabification, syllables);
    assert.equal(item.syllableCount, countSyllables(syllables));
    assert.equal(item.syllableStatus, "verified");
    const asset = readFileSync(new URL(`../public${item.image}`, import.meta.url));
    assert.equal(asset.toString("ascii", 8, 12), "WEBP");
  }

  const ids = expected.map(item => item.id);
  const base: Exercise = { id: "catalog-test", title: "Catalogo", promptId: "", optionIds: [], rounds: 3, updatedAt: "Oggi" };
  const categories = ["Cibi", "Oggetti della natura"];
  const symbolMap = seedDefaultCategorySymbols({}, []);
  const rounds = (config: Partial<Exercise>) => compileExercises([{ ...base, ...config }], library, symbolMap);
  assert.deepEqual(new Set(rounds({ kind: "articles", articleItemIds: ids }).flatMap(turn => turn.articleItemIds)), new Set(ids));
  assert.deepEqual(new Set(rounds({ kind: "naming", namingItemIds: ids }).flatMap(turn => turn.namingItemIds)), new Set(ids));
  const categoryRounds = rounds({ kind: "word-categories", categoryItemIds: ids, categoryNames: categories, categoryShowSymbols: true, categoryShowTargetImage: true });
  assert.deepEqual(new Set(categoryRounds.flatMap(turn => turn.categoryItemIds)), new Set(ids));
  assert.deepEqual(categoryRounds[0].categorySymbolIds, { Cibi: "simbolo-generico-cibi", "Oggetti della natura": "simbolo-generico-natura" });
  const recognition = rounds({ kind: "recognition", recognitionMode: "random", recognitionItemIds: ids, distractorCount: 2, presentation: "images" });
  assert.equal(recognition.length, 3);
  for (const turn of recognition) assert.deepEqual(new Set(turn.optionIds), new Set(ids));

  for (const id of ids) {
    const exercise = hydrateExercises([]).find(item => item.promptId === id);
    assert.ok(exercise);
    assert.equal(validateSharedExercises([exercise], library), null);
  }
});

test("una pera archiviata resta associabile alla foto privata che l’ha sostituita", () => {
  const privatePear = { ...oldPear, id: "private-pear", privateUpload: true, image: "/api/media/private-pear" };
  const library = hydrateLibrary([{ ...oldPear, deleted: true }, privatePear]);
  assert.equal(library.find(item => item.id === oldPear.id)?.image, undefined);
  assert.equal(deduplicateLibraryPlaceholders(library).replacements.get(oldPear.id), privatePear.id);
  const privateBanana = { ...oldBanana, privateUpload: true, image: "/api/media/private-banana" };
  assert.equal(hydrateLibrary([privateBanana]).find(item => item.id === oldBanana.id)?.image, privateBanana.image);
});
