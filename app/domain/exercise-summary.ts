import { quantityObjectLabel } from "./quantity-exercise.ts";
import type { SyllableFilter } from "./syllabification.ts";
import type { Exercise } from "../shared/types";

const syllableLabel = (filter?: SyllableFilter) =>
  filter === "2-3" ? "2 o 3 sillabe" : filter === "4+" ? "4 o più sillabe" : filter && filter !== "all" ? `${filter} sillabe` : "";

const turns = (count: number) => `${count} ${count === 1 ? "turno" : "turni"}`;

/** Up to three names, then "e altre N"; unknown IDs are skipped. */
function names(ids: readonly string[], wordFor: (id: string) => string | undefined) {
  const found = ids.flatMap(id => wordFor(id) ?? []);
  if (!found.length) return "";
  return found.slice(0, 3).join(", ") + (found.length > 3 ? ` e altre ${found.length - 3}` : "");
}

/**
 * One-line description of how an exercise will run, shown in the catalogue and for each
 * step of a sequence. Only reads the saved fields: defaults match the session compiler.
 */
export function exerciseSummary(exercise: Exercise, wordFor: (id: string) => string | undefined): string {
  const kind = exercise.kind ?? "recognition";
  const rounds = exercise.rounds ?? 6;
  const display = exercise.presentation === "words" ? "solo parole" : "foto + parole";
  if (kind === "sentence-matching") {
    const freedom = exercise.sentenceDifficulty === 2 ? "variano soggetto e azione" : "varia l’azione";
    return `Frase → immagine · ${turns(rounds)} · ${exercise.sentenceOptionCount ?? 2} immagini · ${freedom}`;
  }
  if (kind === "articles") {
    const chosen = exercise.articleItemIds?.length ?? 0;
    return `IL / LA · ${turns(Math.min(rounds, chosen))} · ${chosen} immagini scelte`;
  }
  if (kind === "word-categories") {
    const categories = exercise.categoryNames ?? [];
    return `Parola → categoria · ${turns(rounds)} · ${categories.length ? categories.join(", ") : "nessuna categoria"}`;
  }
  if (kind === "naming") {
    const scope = exercise.namingItemIds?.length ? `${exercise.namingItemIds.length} immagini scelte`
      : exercise.namingCategories?.length ? exercise.namingCategories.join(", ") : "tutte le immagini";
    return `Nomina l’immagine · ${turns(rounds)} · ${scope}`;
  }
  if (kind === "number-quantity") {
    const objects = exercise.quantityObjectSet && exercise.quantityObjectSet !== "mixed" ? quantityObjectLabel(exercise.quantityObjectSet, 2) : "oggetti casuali";
    const outcome = exercise.quantityErrorless ? "senza errori" : exercise.quantityAutoComplete ? `auto dopo ${exercise.quantityIdleSeconds ?? 3} s` : "conferma adulta";
    return `Numero quantità · ${turns(rounds)} · da ${exercise.quantityMin ?? 1} a ${exercise.quantityMax ?? 10} · ${objects} · ${outcome}`;
  }
  if (exercise.recognitionMode !== "random") {
    const alternatives = names(exercise.optionIds.filter(id => id !== exercise.promptId), wordFor);
    return [`Trova: ${(exercise.promptId && wordFor(exercise.promptId)) || "parola non disponibile"}`, "1 turno",
      alternatives && `alternative: ${alternatives}`, display].filter(Boolean).join(" · ");
  }
  const targetIds = exercise.recognitionTargetIds?.length ? exercise.recognitionTargetIds : exercise.promptId ? [exercise.promptId] : [];
  const categories = exercise.recognitionCategories ?? [];
  const targets = targetIds.length ? `Trova: ${names(targetIds, wordFor) || "parole non disponibili"}`
    : categories.length ? `Parole casuali da ${categories.join(", ")}` : "Parole casuali";
  const count = exercise.distractorCount ?? 3;
  const source = exercise.distractorSource === "same-category" ? "stessa categoria" : "da tutte le parole";
  return [targets, turns(rounds), `${count} ${count === 1 ? "distrattore" : "distrattori"} ${source}`, display,
    syllableLabel(exercise.recognitionSyllables)].filter(Boolean).join(" · ");
}
