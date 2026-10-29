import { hasArtwork, type LibraryMediaItem } from "./library-availability.ts";
import { availableForWordCategories, wordCategoryNames } from "./word-category-content.ts";

export type CategorySymbols = Record<string, string>;
type Item = LibraryMediaItem & { id: string; category: string; deleted?: boolean; categorySymbolOnly?: boolean; contentKind?: "word" | "sentence"; phraseStructure?: string };
type Options = { kind?: string; categoryNames?: string[]; categoryItemIds?: string[]; categoryShowSymbols?: boolean; categoryShowTargetImage?: boolean; categorySymbolIds?: CategorySymbols };

/** Associations are explicit and stable; never choose a random representative. */
export function categoryImageError(exercise: Options, library: Item[], symbols: CategorySymbols = exercise.categorySymbolIds ?? {}): string | null {
  if (exercise.kind !== "word-categories") return null;
  const active = library.filter((item) => !item.deleted);
  if (exercise.categoryShowSymbols) {
    const missing = wordCategoryNames(active, exercise.categoryNames ?? []).filter((name) => !active.some((item) => item.id === symbols[name] && hasArtwork(item)));
    if (missing.length) return `Assegna un’immagine nella sezione Categorie della libreria: ${missing.join(", ")}.`;
  }
  if (exercise.categoryShowTargetImage) {
    const ids = exercise.categoryItemIds?.length ? new Set(exercise.categoryItemIds) : null;
    if (availableForWordCategories(active).some((item) => (ids ? ids.has(item.id) : exercise.categoryNames?.includes(item.category)) && !hasArtwork(item))) return "Le parole selezionate devono avere un’immagine: correggi la selezione o disattiva l’immagine della parola.";
  }
  return null;
}

export function snapshotCategorySymbols(names: string[] = [], symbols: CategorySymbols = {}): CategorySymbols {
  return Object.fromEntries(names.filter((name) => Object.hasOwn(symbols, name) && typeof symbols[name] === "string" && symbols[name]).map((name) => [name, symbols[name]]));
}
