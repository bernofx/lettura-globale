import { env } from "cloudflare:workers";
import { and, eq, isNull } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { soundAssets } from "../../../../db/schema";

type Context = { params: Promise<{ id: string }> };

async function ownedSound(accountId: string, id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  const rows = await getDb().select().from(soundAssets).where(and(eq(soundAssets.accountId, accountId), eq(soundAssets.id, id), isNull(soundAssets.deletedAt))).limit(1);
  return rows[0] ?? null;
}

export async function GET(_request: Request, context: Context) {
  const user = await getChatGPTUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!env.BUCKET) return new Response("Storage unavailable", { status: 503 });
  const sound = await ownedSound(user.userId, (await context.params).id);
  if (!sound) return new Response("Not found", { status: 404 });
  const object = await env.BUCKET.get(sound.r2Key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "content-type": "audio/mpeg", "content-length": String(sound.byteLength), "cache-control": "private, no-store", "x-content-type-options": "nosniff", etag: object.httpEtag } });
}

export async function DELETE(request: Request, context: Context) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });
  if (request.headers.get("x-lg-action") !== "sound-delete") return Response.json({ error: "invalid_action" }, { status: 403 });
  const sound = await ownedSound(user.userId, (await context.params).id);
  if (!sound) return Response.json({ error: "sound_not_found" }, { status: 404 });
  await getDb().update(soundAssets).set({ deletedAt: Date.now() }).where(and(eq(soundAssets.accountId, user.userId), eq(soundAssets.id, sound.id)));
  return Response.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
}
