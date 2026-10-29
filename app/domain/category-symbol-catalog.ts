import type { CategorySymbols } from "./category-images.ts";

const categories = [
  ["animali", "Animali"], ["cibi", "Cibi"], ["trasporti", "Trasporti"], ["scuola", "Scuola"],
  ["vestiti", "Vestiti"], ["corpo", "Parti del corpo"], ["natura", "Oggetti della natura"], ["casa", "Casa"],
  ["giochi", "Giochi"], ["persone", "Persone"], ["oggetti", "Oggetti"], ["luoghi", "Luoghi"],
] as const;

export const categorySymbolCatalog = categories.map(([slug, category]) => ({
  id: `simbolo-generico-${slug}`,
  word: `Simbolo ${category}`,
  category,
  image: `/images/categories/${slug}.webp`,
  categorySymbolOnly: true as const,
  contentKind: "word" as const,
  source: "OpenAI ImageGen",
  license: "Uso interno del progetto",
  author: "OpenAI ImageGen",
}));

/** One-time catalog introduction, not a runtime fallback or a random choice.
 * Persisting the catalog entries marks introduction, so later explicit removals
 * and archived symbols remain respected on every device and after reload.
 */
export function seedDefaultCategorySymbols(saved: CategorySymbols, previousLibrary: { id: string }[]) {
  const previousIds = new Set(previousLibrary.map((item) => item.id));
  let next = saved;
  for (const symbol of categorySymbolCatalog) {
    if (previousIds.has(symbol.id) || Object.hasOwn(saved, symbol.category)) continue;
    if (next === saved) next = { ...saved };
    next[symbol.category] = symbol.id;
  }
  return next;
}
