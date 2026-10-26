import { compileSessionPlan, type SessionExercise, type SessionPlanLibraryItem } from "./session-compilation.ts";
import { articleFor } from "./article-classification.ts";
import { hasArtwork } from "./library-availability.ts";

export type SharedPreviewIssue = { exerciseId: string; code: "missing_reference" | "invalid_configuration" | "empty_exercise" };

/** Validate every activity, not only the first compiled turn. Do not skip broken activities. */
export function validateSharedExercises(exercises: SessionExercise[], library: SessionPlanLibraryItem[]): SharedPreviewIssue | null {
  const active = library.filter((item) => !(item as { deleted?: boolean }).deleted);
  const byId = new Map(active.map((item) => [item.id, item]));
  for (const exercise of exercises) {
    const fail = (code: SharedPreviewIssue["code"]) => ({ exerciseId: exercise.id, code });
    if (exercise.rounds !== undefined && (!Number.isInteger(exercise.rounds) || exercise.rounds < 1 || exercise.rounds > 50)) return fail("invalid_configuration");
    const kind = exercise.kind ?? "recognition";
    if (!["recognition", "articles", "word-categories", "naming", "number-quantity", "sentence-matching"].includes(kind)) return fail("invalid_configuration");
    const references = kind === "recognition"
      ? [exercise.promptId, ...(exercise.recognitionMode === "random" ? exercise.promptId ? [] : exercise.recognitionItemIds ?? [] : exercise.optionIds ?? [])]
      : kind === "articles" ? exercise.articleItemIds ?? []
      : kind === "word-categories" ? exercise.categoryItemIds ?? []
      : kind === "naming" ? exercise.namingItemIds ?? []
      : kind === "sentence-matching" ? exercise.sentenceItemIds ?? [] : [];
    if (references.some((id) => id && !byId.has(id))) return fail("missing_reference");
    if (kind !== "word-categories" && kind !== "number-quantity" && (kind !== "recognition" || exercise.presentation !== "words") && references.some((id) => id && !hasArtwork(byId.get(id)))) return fail("missing_reference");
    if (kind === "articles" && references.some((id) => id && !articleFor(byId.get(id)!))) return fail("invalid_configuration");
    if (kind === "word-categories" && references.some((id) => id && !exercise.categoryNames?.includes(byId.get(id)!.category))) return fail("invalid_configuration");
    if (kind === "recognition" && exercise.recognitionMode !== "random" && (!exercise.promptId || !exercise.optionIds?.includes(exercise.promptId))) return fail("invalid_configuration");
    if (kind === "word-categories" && (!exercise.categoryNames || exercise.categoryNames.length < 2 || exercise.categoryNames.length > 4)) return fail("invalid_configuration");
    try {
      let serial = 0;
      const plan = compileSessionPlan([exercise], active, { articleFor, random: () => 0.42, createId: () => String(++serial) });
      if (!plan.length) return fail("empty_exercise");
      for (const turn of plan) {
        if (kind !== "recognition" && kind !== "sentence-matching") continue;
        const ids = [turn.promptId, ...(turn.optionIds ?? [])];
        if (!turn.promptId || !turn.optionIds?.includes(turn.promptId) || new Set(turn.optionIds).size !== turn.optionIds.length || turn.optionIds.length < 2 || ids.some((id) => !id || !byId.has(id))) return fail("missing_reference");
        if (exercise.presentation !== "words" && ids.some((id) => !hasArtwork(byId.get(id!)))) return fail("missing_reference");
        if (kind === "recognition" && exercise.recognitionMode === "random" && turn.optionIds.length !== (exercise.distractorCount ?? 3) + 1) return fail("invalid_configuration");
      }
    } catch { return fail("invalid_configuration"); }
  }
  return null;
}
