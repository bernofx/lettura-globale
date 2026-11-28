import { quantityObjectLabel } from "./quantity-exercise.ts";
import type { SyllableFilter } from "./syllabification.ts";
import type { Exercise } from "../shared/types";

const syllableLabel = (filter?: SyllableFilter) =>
  filter === "2-3" ? "2 o 3 sillabe" : filter === "4+" ? "4 o più sillabe" : filter && filter !== "all" ? `${filter} sillabe` : "";

const turns = (count: number) => `${count} ${count === 1 ? "turno" : "turni"}`;

/** Up to `max` names, then "e altre N"; unknown IDs are skipped. */
function names(ids: readonly string[], wordFor: (id: string) => string | undefined, max = 3) {
  const found = ids.flatMap(id => wordFor(id) ?? []);
  if (!found.length) return "";
  return found.slice(0, max).join(", ") + (found.length > max ? ` e altre ${found.length - max}` : "");
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
  const pronunciation = exercise.autoPronounce ?? exercise.presentation === "words" ? "pronuncia automatica" : "senza pronuncia";
  if (exercise.recognitionMode !== "random") {
    const alternatives = names(exercise.optionIds.filter(id => id !== exercise.promptId), wordFor);
    return [`bersaglio: ${(exercise.promptId && wordFor(exercise.promptId)) || "parola non disponibile"}`, "1 turno",
      alternatives && `alternative: ${alternatives}`, display, pronunciation].filter(Boolean).join(" · ");
  }
  // Mirrors createRandomRecognitionRounds: with chosen targets the listed words are
  // preferred distractors; with random targets they are the pool for both roles.
  const targetIds = exercise.recognitionTargetIds?.length ? exercise.recognitionTargetIds : exercise.promptId ? [exercise.promptId] : [];
  const categories = exercise.recognitionCategories ?? [];
  const listed = names(exercise.recognitionItemIds ?? [], wordFor, 6);
  const sameCategory = exercise.distractorSource === "same-category";
  const count = exercise.distractorCount ?? 3;
  const perTurn = `${count} ${count === 1 ? "distrattore" : "distrattori"} per turno`;
  let targets: string;
  let distractors: string;
  let preferred = "";
  if (targetIds.length) {
    targets = `bersagli: ${names(targetIds, wordFor) || "parole non disponibili"}`;
    distractors = `${perTurn}, ${sameCategory ? "della stessa categoria del bersaglio" : "a caso"}${categories.length ? ` dalle categorie ${categories.join(", ")}` : ""}`;
    preferred = listed && `distrattori preferiti: ${listed}`;
  } else if (listed) {
    targets = `bersagli a caso tra: ${listed}`;
    distractors = `${perTurn}, scelti tra le stesse parole${sameCategory ? " e della stessa categoria" : ""}`;
  } else {
    targets = categories.length ? `bersagli a caso dalle categorie: ${categories.join(", ")}` : "bersagli a caso da tutta la libreria";
    distractors = `${perTurn}, ${sameCategory ? "della stessa categoria del bersaglio" : categories.length ? "dalle stesse categorie" : "a caso dalla libreria"}`;
  }
  return [targets, turns(rounds), distractors, preferred, display, pronunciation,
    syllableLabel(exercise.recognitionSyllables)].filter(Boolean).join(" · ");
}
