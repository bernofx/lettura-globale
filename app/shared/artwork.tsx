import { BookOpenCheck } from "lucide-react";
import { type LibraryItem } from "./types";

export function Artwork({ item, compact = false, eager = false }: { item: LibraryItem; compact?: boolean; eager?: boolean }) {
  if (item.image) return <img className="artwork-image" src={item.image} alt={item.word} loading={eager ? "eager" : "lazy"} decoding="async" />;
  if (item.emoji) return <span className={compact ? "artwork-emoji compact" : "artwork-emoji"} aria-hidden="true">{item.emoji}</span>;
  return <span className={compact ? "word-only-art compact" : "word-only-art"}><BookOpenCheck aria-hidden="true" /><small>Solo parola</small></span>;
}

const preloadedArtwork = new Map<string, HTMLImageElement>();

const MAX_PRELOADED_ARTWORK = 80;

export function preloadArtwork(items: LibraryItem[]) {
  if (typeof window === "undefined") return;
  items.forEach((item) => {
    if (!item.image || preloadedArtwork.has(item.image)) return;
    while (preloadedArtwork.size >= MAX_PRELOADED_ARTWORK) {
      const oldest = preloadedArtwork.keys().next().value as string | undefined;
      if (!oldest) break;
      const discarded = preloadedArtwork.get(oldest);
      if (discarded) discarded.src = "";
      preloadedArtwork.delete(oldest);
    }
    const image = new window.Image();
    image.decoding = "async";
    image.src = item.image;
    preloadedArtwork.set(item.image, image);
    void image.decode?.().catch(() => undefined);
  });
}
