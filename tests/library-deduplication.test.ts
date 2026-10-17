import assert from "node:assert/strict";
import test from "node:test";
import { deduplicateLibraryPlaceholders, remapLibraryId, remapLibraryIds, type DeduplicableLibraryItem } from "../app/domain/library-deduplication.ts";

test("mantiene la foto caricata e disattiva il placeholder omonimo", () => {
  const result = deduplicateLibraryPlaceholders<DeduplicableLibraryItem>([
    { id: "rana", word: "Rana", emoji: "🐸", source: "Immagine da aggiungere" },
    { id: "upload-rana", word: " RANA ", privateUpload: true, remoteImageId: "media-rana" },
  ]);

  assert.equal(result.items.find((item) => item.id === "rana")?.deleted, true);
  assert.equal(result.items.find((item) => item.id === "upload-rana")?.deleted, undefined);
  assert.equal(remapLibraryId("rana", result.replacements), "upload-rana");
  assert.deepEqual(remapLibraryIds(["rana", "upload-rana"], result.replacements), ["upload-rana"]);
});

test("non elimina immagini reali o caricamenti senza doppione placeholder", () => {
  const result = deduplicateLibraryPlaceholders<DeduplicableLibraryItem>([
    { id: "mela", word: "Mela", image: "/images/mela.webp", source: "Wikimedia Commons" },
    { id: "upload-mela", word: "Mela", privateUpload: true, remoteImageId: "media-mela" },
    { id: "upload-sole", word: "Sole", privateUpload: true, imageKey: "sole-key" },
  ]);

  assert.equal(result.replacements.size, 0);
  assert.equal(result.items.some((item) => item.deleted), false);
});
