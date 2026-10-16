import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

const ALLOWED_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);
const MAX_IMAGE_BYTES = 2_500_000;

async function ownerPrefix(userId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });
  if (!env.BUCKET) return Response.json({ error: "storage_unavailable" }, { status: 503 });

  const mediaId = request.headers.get("x-media-id")?.trim() ?? "";
  const contentType = request.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "";
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(mediaId)) return Response.json({ error: "invalid_media_id" }, { status: 400 });
  if (!ALLOWED_TYPES.has(contentType)) return Response.json({ error: "invalid_image_type" }, { status: 415 });

  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return Response.json({ error: "invalid_image_size" }, { status: 413 });
  const key = `${await ownerPrefix(user.userId)}/${mediaId}`;
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType, cacheControl: "private, max-age=3600" }, customMetadata: { owner: user.userId } });
  return Response.json({ id: mediaId, url: `/api/media/${encodeURIComponent(mediaId)}` }, { status: 201 });
}
