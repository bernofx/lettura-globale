import { env } from "cloudflare:workers";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { isMp3Header, isSoundCue, maxSoundBytes, minSoundBytes, normalizeSoundName } from "../../domain/sound-library";
import { getDb } from "../../../db";
import { soundAssets } from "../../../db/schema";

async function ownerPrefix(userId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });
  const rows = await getDb().select({ id: soundAssets.id, name: soundAssets.name, cue: soundAssets.cue, byteLength: soundAssets.byteLength, createdAt: soundAssets.createdAt })
    .from(soundAssets).where(and(eq(soundAssets.accountId, user.userId), isNull(soundAssets.deletedAt))).orderBy(desc(soundAssets.createdAt));
  return Response.json({ sounds: rows }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });
  if (!env.BUCKET) return Response.json({ error: "storage_unavailable" }, { status: 503 });
  if (request.headers.get("x-lg-action") !== "sound-upload") return Response.json({ error: "invalid_action" }, { status: 403 });
  const id = request.headers.get("x-upload-id") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return Response.json({ error: "invalid_upload_id" }, { status: 400 });
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > maxSoundBytes + 20_000) return Response.json({ error: "sound_too_large" }, { status: 413 });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return Response.json({ error: "invalid_form" }, { status: 400 }); }
  const file = form.get("file");
  const name = normalizeSoundName(form.get("name"));
  const cue = form.get("cue");
  if (!name || !isSoundCue(cue)) return Response.json({ error: "invalid_sound_details" }, { status: 400 });
  if (!(file instanceof File) || file.size < minSoundBytes || file.size > maxSoundBytes) return Response.json({ error: "invalid_sound_size" }, { status: 413 });
  if (file.type && file.type !== "audio/mpeg" && file.type !== "audio/mp3" && file.type !== "application/octet-stream") return Response.json({ error: "mp3_required" }, { status: 415 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isMp3Header(bytes)) return Response.json({ error: "mp3_required" }, { status: 415 });

  const db = getDb();
  const prior = await db.select({ id: soundAssets.id, name: soundAssets.name, cue: soundAssets.cue, byteLength: soundAssets.byteLength, createdAt: soundAssets.createdAt, deletedAt: soundAssets.deletedAt })
    .from(soundAssets).where(and(eq(soundAssets.accountId, user.userId), eq(soundAssets.id, id))).limit(1);
  if (prior[0]) {
    if (prior[0].deletedAt === null && prior[0].name === name && prior[0].cue === cue && prior[0].byteLength === bytes.byteLength) return Response.json({ sound: prior[0] }, { headers: { "cache-control": "private, no-store" } });
    return Response.json({ error: "upload_id_conflict" }, { status: 409 });
  }
  const existing = await db.select({ id: soundAssets.id }).from(soundAssets)
    .where(and(eq(soundAssets.accountId, user.userId), isNull(soundAssets.deletedAt))).limit(50);
  if (existing.length >= 50) return Response.json({ error: "sound_library_full" }, { status: 409 });

  const key = `${await ownerPrefix(user.userId)}/sounds/${id}`;
  const createdAt = Date.now();
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: "audio/mpeg", cacheControl: "private, no-store" }, customMetadata: { owner: user.userId } });
  try {
    await db.insert(soundAssets).values({ accountId: user.userId, id, name, cue, contentType: "audio/mpeg", byteLength: bytes.byteLength, r2Key: key, createdAt });
  } catch (error) {
    await env.BUCKET.delete(key).catch(() => undefined);
    throw error;
  }
  return Response.json({ sound: { id, name, cue, byteLength: bytes.byteLength, createdAt } }, { status: 201, headers: { "cache-control": "private, no-store" } });
}
