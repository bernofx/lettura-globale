import entries from "./scheduled-catalog.json" with { type: "json" };
import { isScheduledWord, scheduledAssetUrl, scheduledId, scheduledImageMetadata, scheduledWordKey } from "./scheduled-images.ts";
import { countSyllables } from "./syllabification.ts";
import type { LibraryItem } from "../shared/types";

type CatalogEntry = { assetId: string; word: string; metadata: unknown };

export function readScheduledCatalog(source: unknown) {
  if (!Array.isArray(source)) throw new Error("invalid_scheduled_catalog");
  const assetIds = new Set<string>();
  const words = new Set<string>();
  return source.map(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("invalid_scheduled_entry");
    const { assetId, word, metadata } = entry as CatalogEntry;
    const info = isScheduledWord(word) ? scheduledImageMetadata(word, metadata) : null;
    if (Object.keys(entry).length !== 3 || typeof assetId !== "string" || !scheduledId.test(assetId) ||
      !info || assetIds.has(assetId) || words.has(scheduledWordKey(word))) throw new Error("invalid_scheduled_entry");
    assetIds.add(assetId);
    words.add(scheduledWordKey(word));
    return { assetId, word, metadata: info };
  });
}

export function addScheduledCatalog(base: LibraryItem[], source: unknown = entries) {
  const catalog = [...base];
  for (const { assetId, word, metadata } of readScheduledCatalog(source)) {
    const key = scheduledWordKey(word);
    const existingIndex = catalog.findIndex(item => !item.categorySymbolOnly && item.contentKind !== "sentence" && scheduledWordKey(item.word) === key);
    const existing = catalog[existingIndex];
    if (existing?.image) continue;
    const id = existing?.id ?? `scheduled-${assetId}`;
    const item: LibraryItem = {
      id, word, image: scheduledAssetUrl(assetId), ...metadata,
      syllableCount: countSyllables(metadata.syllabification), syllableStatus: "verified",
      source: "OpenAI ImageGen", author: "OpenAI ImageGen", license: "Uso interno del progetto",
    };
    if (existing) catalog[existingIndex] = item;
    else catalog.push(item);
  }
  return catalog;
}
