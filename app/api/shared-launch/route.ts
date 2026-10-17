import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { sharedLaunches, userStates } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

type LaunchKind = "exercise" | "sequence";
type SharedExercise = Record<string, unknown> & {
  id?: string;
  kind?: "recognition" | "articles" | "word-categories" | "naming";
  deleted?: boolean;
  promptId?: string;
  optionIds?: string[];
  articleItemIds?: string[];
  categoryItemIds?: string[];
  recognitionMode?: "fixed" | "random";
  recognitionItemIds?: string[];
  recognitionCategories?: string[];
  namingItemIds?: string[];
  namingCategories?: string[];
};
type StoredState = {
  library?: Array<Record<string, unknown> & { id?: string; category?: string; deleted?: boolean }>;
  exercises?: SharedExercise[];
  sequences?: Array<{ id?: string; title?: string; exerciseIds?: string[]; deleted?: boolean }>;
};

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });

  let input: { kind?: LaunchKind; id?: string };
  try { input = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  if ((input.kind !== "exercise" && input.kind !== "sequence") || !input.id?.trim()) return Response.json({ error: "invalid_launch" }, { status: 400 });

  const db = getDb();
  const row = (await db.select({ payload: userStates.payload }).from(userStates).where(eq(userStates.userId, user.userId)).limit(1))[0];
  if (!row) return Response.json({ error: "content_not_found" }, { status: 404 });

  let state: StoredState;
  try { state = JSON.parse(row.payload) as StoredState; } catch { return Response.json({ error: "invalid_saved_state" }, { status: 500 }); }
  const exercises = (state.exercises ?? []).filter((exercise) => !exercise.deleted);
  const sequence = input.kind === "sequence" ? (state.sequences ?? []).find((item) => item.id === input.id && !item.deleted) : undefined;
  const selectedExercises = input.kind === "exercise"
    ? exercises.filter((exercise) => exercise.id === input.id)
    : (sequence?.exerciseIds ?? []).map((id) => exercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is NonNullable<typeof exercise> => Boolean(exercise));
  if (!selectedExercises.length) return Response.json({ error: "content_not_found" }, { status: 404 });

  const availableLibrary = (state.library ?? []).filter((item) => !item.deleted);
  const referencedIds = new Set<string>();
  for (const exercise of selectedExercises) {
    if (exercise.kind === "articles") exercise.articleItemIds?.forEach((id) => referencedIds.add(id));
    else if (exercise.kind === "word-categories") exercise.categoryItemIds?.forEach((id) => referencedIds.add(id));
    else if (exercise.kind === "naming") {
      if (exercise.namingItemIds?.length) exercise.namingItemIds.forEach((id) => referencedIds.add(id));
      else availableLibrary.filter((item) => !exercise.namingCategories?.length || exercise.namingCategories.includes(item.category ?? "")).forEach((item) => { if (item.id) referencedIds.add(item.id); });
    }
    else if (exercise.recognitionMode === "random") {
      if (exercise.recognitionItemIds?.length) exercise.recognitionItemIds.forEach((id) => referencedIds.add(id));
      else availableLibrary.filter((item) => !exercise.recognitionCategories?.length || exercise.recognitionCategories.includes(item.category ?? "")).forEach((item) => { if (item.id) referencedIds.add(item.id); });
    } else {
      if (exercise.promptId) referencedIds.add(exercise.promptId);
      exercise.optionIds?.forEach((id) => referencedIds.add(id));
    }
  }

  const token = crypto.randomUUID();
  const payload = JSON.stringify({
    schemaVersion: 1,
    kind: input.kind,
    title: sequence?.title ?? String(selectedExercises[0].title ?? "Anteprima esercizio"),
    exercises: selectedExercises,
    library: availableLibrary.filter((item) => item.id && referencedIds.has(item.id)),
  });
  const now = Date.now();
  await db.insert(sharedLaunches).values({ token, ownerUserId: user.userId, kind: input.kind, contentId: input.id, payload, createdAt: now, updatedAt: now });
  return Response.json({ token }, { status: 201 });
}
