import { snapshotCategorySymbols, type CategorySymbols } from "../../domain/category-images";
import { and, eq, gt, isNotNull, isNull, lte, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { sharedLaunches, userStates } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import { matchesSyllableFilter, type SyllableFilter } from "../../domain/syllabification";
import { hasArtwork } from "../../domain/library-availability";
import { sharedLaunchExpiresAt } from "../../domain/shared-launch-policy";
import { deduplicateLibraryPlaceholders, type DeduplicableLibraryItem } from "../../domain/library-deduplication";
import { remapExerciseReferences } from "../../domain/exercise-library-references";
import { validateSharedExercises } from "../../domain/shared-preview-validation";
import type { SessionExercise, SessionPlanLibraryItem } from "../../domain/session-compilation";

type LaunchKind = "exercise" | "sequence";
type SharedExercise = Record<string, unknown> & {
  id?: string;
  kind?: "recognition" | "articles" | "word-categories" | "naming" | "number-quantity" | "sentence-matching";
  deleted?: boolean;
  promptId?: string;
  optionIds?: string[];
  articleItemIds?: string[];
  categoryItemIds?: string[];
  categoryNames?: string[];
  recognitionMode?: "fixed" | "random";
  recognitionItemIds?: string[];
  recognitionCategories?: string[];
  recognitionSyllables?: SyllableFilter;
  namingItemIds?: string[];
  namingCategories?: string[];
  sentenceItemIds?: string[];
};
type StoredState = {
  categorySymbols?: CategorySymbols;
  library?: Array<Record<string, unknown> & { id?: string; category?: string; syllableCount?: number; image?: unknown; emoji?: unknown; deleted?: boolean }>;
  exercises?: SharedExercise[];
  sequences?: Array<{ id?: string; title?: string; exerciseIds?: string[]; deleted?: boolean }>;
};

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });
  const rows = await getDb().select({
    token: sharedLaunches.token,
    kind: sharedLaunches.kind,
    contentId: sharedLaunches.contentId,
    payload: sharedLaunches.payload,
    createdAt: sharedLaunches.createdAt,
    expiresAt: sharedLaunches.expiresAt,
  }).from(sharedLaunches).where(and(
    eq(sharedLaunches.ownerUserId, user.userId),
    isNull(sharedLaunches.revokedAt),
    gt(sharedLaunches.expiresAt, Date.now()),
  ));
  return Response.json({ links: rows.map(({ payload, ...row }) => {
    let title = row.kind === "sequence" ? "Sequenza condivisa" : "Esercizio condiviso";
    try { title = String((JSON.parse(payload) as { title?: unknown }).title ?? title); } catch { /* keep the safe fallback */ }
    return { ...row, title };
  }).sort((left, right) => right.createdAt - left.createdAt) });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });

  let input: { kind?: LaunchKind; id?: string; revision?: number };
  try { input = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  if ((input.kind !== "exercise" && input.kind !== "sequence") || !input.id?.trim()) return Response.json({ error: "invalid_launch" }, { status: 400 });
  if (input.revision !== undefined && (!Number.isSafeInteger(input.revision) || input.revision < 1)) return Response.json({ error: "invalid_revision" }, { status: 400 });

  const db = getDb();
  const row = (await db.select({ payload: userStates.payload, revision: userStates.revision }).from(userStates).where(eq(userStates.userId, user.userId)).limit(1))[0];
  if (!row) return Response.json({ error: "content_not_found" }, { status: 404 });
  if (input.revision !== undefined && input.revision !== row.revision) return Response.json({ error: "share_revision_conflict" }, { status: 409 });

  let state: StoredState;
  try { state = JSON.parse(row.payload) as StoredState; } catch { return Response.json({ error: "invalid_saved_state" }, { status: 500 }); }
  const exercises = (state.exercises ?? []).filter((exercise) => !exercise.deleted);
  const sequence = input.kind === "sequence" ? (state.sequences ?? []).find((item) => item.id === input.id && !item.deleted) : undefined;
  const selectedExercises = input.kind === "exercise"
    ? exercises.filter((exercise) => exercise.id === input.id)
    : (sequence?.exerciseIds ?? []).map((id) => exercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise));
  if (!selectedExercises.length) return Response.json({ error: "content_not_found" }, { status: 404 });

  if (input.kind === "sequence" && selectedExercises.length !== sequence?.exerciseIds?.length) return Response.json({ error: "incomplete_exercise" }, { status: 422 });
  const repaired = deduplicateLibraryPlaceholders((state.library ?? []) as (SessionPlanLibraryItem & DeduplicableLibraryItem)[]);
  for (let index = 0; index < selectedExercises.length; index++) selectedExercises[index] = remapExerciseReferences(selectedExercises[index], repaired.replacements);
  const availableLibrary = repaired.items.filter((item) => !item.deleted);
  const targetLibrary = availableLibrary.filter((item) => !item.categorySymbolOnly);
  const referencedIds = new Set<string>();
  for (const exercise of selectedExercises) {
    if (exercise.kind === "articles") exercise.articleItemIds?.forEach((id) => referencedIds.add(id));
    else if (exercise.kind === "word-categories") {
      if (exercise.categoryShowSymbols) {
        const symbols = snapshotCategorySymbols(exercise.categoryNames, state.categorySymbols);
        exercise.categorySymbolIds = symbols;
        Object.values(symbols).forEach((id) => referencedIds.add(id));
      }
      if (exercise.categoryItemIds?.length) exercise.categoryItemIds.forEach((id) => referencedIds.add(id));
      else availableLibrary.filter((item) => !item.categorySymbolOnly && exercise.categoryNames?.includes(item.category)).forEach((item) => referencedIds.add(item.id));
    }
    else if (exercise.kind === "naming") {
      if (exercise.namingItemIds?.length) exercise.namingItemIds.forEach((id) => referencedIds.add(id));
      else targetLibrary.filter((item) => hasArtwork(item) && (!exercise.namingCategories?.length || exercise.namingCategories.includes(item.category ?? ""))).forEach((item) => { if (item.id) referencedIds.add(item.id); });
    }
    else if (exercise.kind === "number-quantity") {
      // This exercise uses vector objects and needs no library assets.
    }
    else if (exercise.kind === "sentence-matching") {
      if (exercise.sentenceItemIds?.length) exercise.sentenceItemIds.forEach((id) => referencedIds.add(id));
      else targetLibrary.forEach((item) => { if (item.id && item.contentKind === "sentence") referencedIds.add(item.id); });
    }
    else if (exercise.recognitionMode === "random") {
      if (exercise.promptId) referencedIds.add(exercise.promptId);
      if (!exercise.promptId && exercise.recognitionItemIds?.length) exercise.recognitionItemIds.forEach((id) => referencedIds.add(id));
      else targetLibrary.filter((item) => (exercise.presentation === "words" || hasArtwork(item)) && (!exercise.recognitionCategories?.length || exercise.recognitionCategories.includes(item.category ?? "")) && matchesSyllableFilter(item, exercise.recognitionSyllables)).forEach((item) => { if (item.id) referencedIds.add(item.id); });
    } else {
      if (exercise.promptId) referencedIds.add(exercise.promptId);
      exercise.optionIds?.forEach((id) => referencedIds.add(id));
    }
  }

  const sharedLibrary = availableLibrary.filter((item) => item.id && referencedIds.has(item.id));
  const issue = validateSharedExercises(selectedExercises as SessionExercise[], sharedLibrary);
  if (issue) return Response.json({ error: "incomplete_exercise", exerciseId: issue.exerciseId, reason: issue.code }, { status: 422 });
  const token = crypto.randomUUID();
  const payload = JSON.stringify({
    schemaVersion: 1,
    kind: input.kind,
    title: sequence?.title ?? String(selectedExercises[0].title ?? "Anteprima esercizio"),
    exercises: selectedExercises,
    library: sharedLibrary,
  });
  const now = Date.now();
  // The media remain owned by the private library, so cleanup only removes the
  // obsolete public snapshot. Revoked rows are kept briefly for diagnostics.
  await db.delete(sharedLaunches).where(and(
    eq(sharedLaunches.ownerUserId, user.userId),
    or(lte(sharedLaunches.expiresAt, now), and(isNotNull(sharedLaunches.revokedAt), lte(sharedLaunches.revokedAt, now - 7 * 24 * 60 * 60 * 1000))),
  ));
  const expiresAt = sharedLaunchExpiresAt(now);
  await db.insert(sharedLaunches).values({ token, ownerUserId: user.userId, kind: input.kind, contentId: input.id, payload, expiresAt, revokedAt: null, createdAt: now, updatedAt: now });
  return Response.json({ token, expiresAt }, { status: 201 });
}
