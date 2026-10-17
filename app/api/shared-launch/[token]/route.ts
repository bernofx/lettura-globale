import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sharedLaunches } from "../../../../db/schema";

function validToken(value: string) { return /^[0-9a-f-]{36}$/i.test(value); }

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!validToken(token)) return Response.json({ error: "invalid_preview" }, { status: 400 });
  const row = (await getDb().select({ payload: sharedLaunches.payload }).from(sharedLaunches).where(eq(sharedLaunches.token, token)).limit(1))[0];
  if (!row) return Response.json({ error: "preview_not_found" }, { status: 404 });
  try {
    const payload = JSON.parse(row.payload) as { library?: Array<Record<string, unknown> & { imageKey?: unknown; remoteImageId?: string }> };
    payload.library = (payload.library ?? []).map((entry) => {
      const item = { ...entry };
      const remoteImageId = item.remoteImageId;
      delete item.imageKey;
      delete item.remoteImageId;
      return { ...item, ...(remoteImageId ? { image: `/api/shared-launch/${encodeURIComponent(token)}/media/${encodeURIComponent(remoteImageId)}` } : {}) };
    });
    return Response.json(payload, { headers: { "cache-control": "private, max-age=60" } });
  } catch {
    return Response.json({ error: "invalid_preview" }, { status: 500 });
  }
}
