export type LibraryMediaItem = { image?: unknown; emoji?: unknown; remoteImageId?: unknown };

export function hasArtwork(item?: LibraryMediaItem) {
  return Boolean(item?.image || item?.emoji || item?.remoteImageId);
}

export function availableForRecognition<T extends LibraryMediaItem>(items: T[], presentation?: "images" | "words") {
  return presentation === "words" ? items : items.filter(hasArtwork);
}
