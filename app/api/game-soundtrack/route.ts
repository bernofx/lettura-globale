import { env } from "cloudflare:workers";
import { GAME_SOUNDTRACK_URL, MAX_SOUNDTRACK_BYTES, MAX_SOUNDTRACK_SECONDS, mp3Duration } from "../../domain/game-soundtrack";
import { authenticatedAdult, noStoreJson } from "../controller/_shared";
import { ownerStoragePrefix } from "../media-key";

async function soundtrackKey() {
  const adult = await authenticatedAdult();
  return adult ? `game-soundtracks/${await ownerStoragePrefix(adult.userId)}/track.mp3` : null;
}

async function boundedBytes(request: Request) {
  const declaredSize = Number(request.headers.get("content-length"));
  if (declaredSize > MAX_SOUNDTRACK_BYTES || !request.body) return null;
  const reader = request.body.getReader();
  const buffer = new Uint8Array(MAX_SOUNDTRACK_BYTES);
  let offset = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return buffer.subarray(0, offset);
      if (offset + value.byteLength > buffer.byteLength) {
        await reader.cancel();
        return null;
      }
      buffer.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

function metadata(object: R2Object) {
  return { name: object.customMetadata?.name ?? "Colonna sonora dei giochi", etag: object.etag };
}

export async function GET(request: Request) {
  const key = await soundtrackKey();
  if (!key) return noStoreJson({ error: "authentication_required" }, { status: 401 });
  if (!env.BUCKET) return noStoreJson({ error: "storage_unavailable" }, { status: 503 });
  if (new URL(request.url).searchParams.has("info")) {
    const object = await env.BUCKET.head(key);
    return noStoreJson({ soundtrack: object ? metadata(object) : null });
  }
  const object = await env.BUCKET.get(key, { range: request.headers });
  if (!object) return noStoreJson({ error: "soundtrack_not_found" }, { status: 404 });

  const headers = new Headers({
    "content-type": "audio/mpeg", "cache-control": "private, no-store",
    "x-content-type-options": "nosniff", "accept-ranges": "bytes", etag: object.httpEtag,
  });
  const range = object.range;
  if (request.headers.has("range") && range && "offset" in range && range.offset !== undefined && range.length !== undefined) {
    headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    headers.set("content-length", String(range.length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
}

export async function PUT(request: Request) {
  const key = await soundtrackKey();
  if (!key) return noStoreJson({ error: "authentication_required" }, { status: 401 });
  if (!env.BUCKET) return noStoreJson({ error: "storage_unavailable" }, { status: 503 });
  if (request.headers.get("content-type") !== "audio/mpeg") return noStoreJson({ error: "mp3_required" }, { status: 415 });
  const bytes = await boundedBytes(request);
  if (!bytes?.byteLength) return noStoreJson({ error: "size_limit" }, { status: 413 });
  const duration = mp3Duration(bytes);
  if (duration === null) return noStoreJson({ error: "mp3_required" }, { status: 422 });
  if (duration > MAX_SOUNDTRACK_SECONDS) return noStoreJson({ error: "duration_limit" }, { status: 422 });

  let name: string;
  try { name = decodeURIComponent(request.headers.get("x-soundtrack-name")?.slice(0, 1024) ?? "").trim().slice(0, 120); }
  catch { return noStoreJson({ error: "invalid_name" }, { status: 400 }); }
  const object = await env.BUCKET.put(key, bytes, {
    httpMetadata: { contentType: "audio/mpeg", cacheControl: "private, no-store" },
    customMetadata: { name: name || "Colonna sonora dei giochi" },
  });
  return noStoreJson({ soundtrack: metadata(object), url: GAME_SOUNDTRACK_URL });
}

export async function DELETE() {
  const key = await soundtrackKey();
  if (!key) return noStoreJson({ error: "authentication_required" }, { status: 401 });
  if (!env.BUCKET) return noStoreJson({ error: "storage_unavailable" }, { status: 503 });
  await env.BUCKET.delete(key);
  return noStoreJson({ soundtrack: null });
}
