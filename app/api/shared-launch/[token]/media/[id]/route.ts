import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../../../db";
import { sharedLaunches } from "../../../../../../db/schema";
import { ownerStoragePrefix, validMediaId } from "../../../../media-key";
import { sharedLaunchIsAvailable } from "../../../../../domain/shared-launch-policy";

function validToken(value: string) { return /^[0-9a-f-]{36}$/i.test(value); }

export async function GET(_request: Request, context: { params: Promise<{ token: string; id: string }> }) {
  if (!env.BUCKET) return new Response("Storage unavailable", { status: 503 });
  const { token, id } = await context.params;
  if (!validToken(token) || !validMediaId(id)) return new Response("Invalid request", { status: 400 });
  const row = (await getDb().select({ ownerUserId: sharedLaunches.ownerUserId, payload: sharedLaunches.payload, expiresAt: sharedLaunches.expiresAt, revokedAt: sharedLaunches.revokedAt }).from(sharedLaunches).where(eq(sharedLaunches.token, token)).limit(1))[0];
  if (!row || !sharedLaunchIsAvailable(row)) return new Response("Not found", { status: 404 });
  let isShared = false;
  try {
    const payload = JSON.parse(row.payload) as { library?: Array<{ remoteImageId?: string }> };
    isShared = (payload.library ?? []).some((item) => item.remoteImageId === id);
  } catch { return new Response("Not found", { status: 404 }); }
  if (!isShared) return new Response("Not found", { status: 404 });
  const object = await env.BUCKET.get(`${await ownerStoragePrefix(row.ownerUserId)}/${id}`);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, no-store");
  return new Response(object.body, { headers });
}
