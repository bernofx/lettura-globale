import assert from "node:assert/strict";
import test from "node:test";
import { availableForRecognition, hasArtwork } from "../app/domain/library-availability.ts";

const items = [
  { id: "photo", image: "/photo.webp" },
  { id: "emoji", emoji: "🐕" },
  { id: "word" },
];

test("riconosce gli elementi utilizzabili negli esercizi con immagini", () => {
  assert.equal(hasArtwork(items[0]), true);
  assert.equal(hasArtwork(items[1]), true);
  assert.equal(hasArtwork(items[2]), false);
  assert.deepEqual(availableForRecognition(items, "images").map((item) => item.id), ["photo", "emoji"]);
});

test("gli esercizi con sole parole includono anche gli elementi senza immagine", () => {
  assert.deepEqual(availableForRecognition(items, "words").map((item) => item.id), ["photo", "emoji", "word"]);
});
