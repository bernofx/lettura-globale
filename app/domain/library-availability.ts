export type LibraryMediaItem = { categorySymbolOnly?: boolean; image?: unknown; emoji?: unknown; remoteImageId?: unknown };

export function hasArtwork(item?: LibraryMediaItem) {
  return Boolean(item?.image || item?.emoji || item?.remoteImageId);
}

export function availableForRecognition<T extends LibraryMediaItem>(items: T[], presentation?: "images" | "words") {
  return items.filter((item) => !item.categorySymbolOnly && (presentation === "words" || hasArtwork(item)));
}
