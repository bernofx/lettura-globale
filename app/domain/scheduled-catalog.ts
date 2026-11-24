import entries from "./scheduled-catalog.json" with { type: "json" };
import { isScheduledWord, scheduledAssetUrl, scheduledId, scheduledImageMetadata, scheduledWordKey } from "./scheduled-images.ts";
import { countSyllables } from "./syllabification.ts";
import { commonsLicenses, type CommonsCredit } from "./openverse-catalog.ts";
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

export const OFFICIAL_CATALOG_URL = "/api/official-catalog";

export type OfficialCatalogEntry = ReturnType<typeof readScheduledCatalog>[number] & { extension: "webp" | "png" | "jpeg"; credit?: CommonsCredit };

export function officialImageExtension(imageType: string): OfficialCatalogEntry["extension"] | null {
  if (imageType === "image/webp") return "webp";
  if (imageType === "image/png") return "png";
  if (imageType === "image/jpeg") return "jpeg";
  return null;
}

export function officialCatalogImageUrl(id: string, extension: OfficialCatalogEntry["extension"]) {
  return `/images/catalog/${id}.${extension}`;
}

export function addOfficialCatalog(base: LibraryItem[], source: OfficialCatalogEntry[]) {
  return applyCatalog(base, source, (entry) => officialCatalogImageUrl(entry.assetId, entry.extension));
}

export function addScheduledCatalog(base: LibraryItem[], source: unknown = entries) {
  return applyCatalog(base, readScheduledCatalog(source), entry => scheduledAssetUrl(entry.assetId));
}

function applyCatalog<T extends ReturnType<typeof readScheduledCatalog>[number] & { credit?: CommonsCredit }>(base: LibraryItem[], source: T[], imagePath: (entry: T) => string) {
  const catalog = [...base];
  for (const entry of source) {
    const { assetId, word, metadata } = entry;
    const key = scheduledWordKey(word);
    const existingIndex = catalog.findIndex(item => !item.categorySymbolOnly && item.contentKind !== "sentence" && scheduledWordKey(item.word) === key);
    const existing = catalog[existingIndex];
    if (existing?.image) continue;
    const id = existing?.id ?? `scheduled-${assetId}`;
    const credit = entry.credit;
    const item: LibraryItem = {
      id, word, image: imagePath(entry), ...metadata,
      syllableCount: countSyllables(metadata.syllabification), syllableStatus: "verified",
      ...(credit ? {
        source: `Wikimedia Commons · ${credit.title}`, sourceUrl: credit.sourceUrl, author: credit.author,
        license: commonsLicenses[credit.license].name, licenseUrl: commonsLicenses[credit.license].url,
      } : { source: "OpenAI ImageGen", author: "OpenAI ImageGen", license: "Uso interno del progetto" }),
    };
    if (existing) catalog[existingIndex] = item;
    else catalog.push(item);
  }
  return catalog;
}
