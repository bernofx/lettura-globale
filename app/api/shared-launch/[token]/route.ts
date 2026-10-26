import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sharedLaunches } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { sharedLaunchIsAvailable } from "../../../domain/shared-launch-policy";
import { validateSharedExercises } from "../../../domain/shared-preview-validation";
import type { SessionExercise, SessionPlanLibraryItem } from "../../../domain/session-compilation";

function validToken(value: string) { return /^[0-9a-f-]{36}$/i.test(value); }

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!validToken(token)) return Response.json({ error: "invalid_preview" }, { status: 400 });
  const row = (await getDb().select({ payload: sharedLaunches.payload, expiresAt: sharedLaunches.expiresAt, revokedAt: sharedLaunches.revokedAt }).from(sharedLaunches).where(eq(sharedLaunches.token, token)).limit(1))[0];
  if (!row || !sharedLaunchIsAvailable(row)) return Response.json({ error: "preview_not_found" }, { status: 404 });
  try {
    const payload = JSON.parse(row.payload) as { schemaVersion?: number; exercises?: SessionExercise[]; library?: Array<Record<string, unknown> & { imageKey?: unknown; remoteImageId?: string }> };
    payload.library = (payload.library ?? []).map((entry) => {
      const item = { ...entry };
      const remoteImageId = item.remoteImageId;
      delete item.imageKey;
      delete item.remoteImageId;
      return { ...item, ...(remoteImageId ? { image: `/api/shared-launch/${encodeURIComponent(token)}/media/${encodeURIComponent(remoteImageId)}` } : {}) };
    });
    if (payload.schemaVersion !== 1 || !Array.isArray(payload.exercises) || !payload.exercises.length || validateSharedExercises(payload.exercises, payload.library as SessionPlanLibraryItem[])) return Response.json({ error: "incomplete_preview" }, { status: 422, headers: { "cache-control": "no-store" } });
    return Response.json(payload, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "invalid_preview" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ token: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });
  const { token } = await context.params;
  if (!validToken(token)) return Response.json({ error: "invalid_preview" }, { status: 400 });
  const now = Date.now();
  const result = await getDb().update(sharedLaunches).set({ revokedAt: now, updatedAt: now }).where(and(eq(sharedLaunches.token, token), eq(sharedLaunches.ownerUserId, user.userId)));
  if (!result.meta.changes) return Response.json({ error: "preview_not_found" }, { status: 404 });
  return Response.json({ ok: true, revokedAt: now });
}
