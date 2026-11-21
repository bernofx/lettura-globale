import { env } from "cloudflare:workers";
import { validateImageBytes } from "../../domain/image-validation";
import { PUZZLE_IMAGES_URL, type PuzzleImage } from "../../domain/puzzle-library";
import { authenticatedAdult, noStoreJson } from "../controller/_shared";
import { ownerStoragePrefix } from "../media-key";

const imageIdPattern = /^[a-z0-9-]{1,64}$/;
const maxBytes = 2_500_000;

async function catalog(request: Request, write = false) {
  const adult = await authenticatedAdult();
  if (!adult) return noStoreJson({ error: "authentication_required" }, { status: 401 });
  const scope = await ownerStoragePrefix(adult.userId);
  const profile = request.headers.get("x-puzzle-profile");
  if ((profile !== null && profile !== adult.adultProfileId) ||
    (write && (profile !== adult.adultProfileId || request.headers.get("x-puzzle-scope") !== scope))) {
    return noStoreJson({ error: "profile_changed" }, { status: 401 });
  }
  if (!env.BUCKET) return noStoreJson({ error: "storage_unavailable" }, { status: 503 });
  const id = new URL(request.url).searchParams.get("image");
  if ((write || id !== null) && !imageIdPattern.test(id ?? "")) {
    return noStoreJson({ error: "invalid_image_id" }, { status: 400 });
  }
  return { bucket: env.BUCKET, id, scope, prefix: "puzzle-library/" + scope + "/" };
}

function imageEntry(id: string, object: R2Object): PuzzleImage {
  return { id, title: object.customMetadata?.title || "Immagine puzzle", image: PUZZLE_IMAGES_URL + "?image=" + id };
}

export async function GET(request: Request) {
  const current = await catalog(request);
  if (current instanceof Response) return current;
  const { bucket, id, scope, prefix } = current;
  if (id !== null) {
    const object = await bucket.get(prefix + id + ".webp");
    if (!object || object.customMetadata?.removed) return noStoreJson({ error: "image_not_found" }, { status: 404 });
    return new Response(object.body, { headers: {
      "content-type": "image/webp", "cache-control": "private, no-store", "x-content-type-options": "nosniff",
    } });
  }

  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const options = { prefix, cursor, include: ["customMetadata"] };
    const page = await bucket.list(options);
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  const images = objects.sort((left, right) => right.uploaded.getTime() - left.uploaded.getTime()).flatMap(object => {
    const id = object.key.slice(prefix.length, -5);
    return !object.customMetadata?.removed && imageIdPattern.test(id) && object.key.endsWith(".webp") ? [imageEntry(id, object)] : [];
  });
  return noStoreJson({ scope, images });
}

export async function PUT(request: Request) {
  const current = await catalog(request, true);
  if (current instanceof Response) return current;
  if (request.headers.get("x-puzzle-rights") !== "confirmed") {
    return noStoreJson({ error: "confirm_image_rights" }, { status: 400 });
  }
  if (request.headers.get("content-type") !== "image/webp") {
    return noStoreJson({ error: "invalid_image_type" }, { status: 415 });
  }
  let title = "";
  try { title = decodeURIComponent(request.headers.get("x-puzzle-title") ?? "").trim().slice(0, 120); }
  catch { return noStoreJson({ error: "invalid_title" }, { status: 400 }); }
  if (Number(request.headers.get("content-length")) > maxBytes) {
    return noStoreJson({ error: "invalid_image_size" }, { status: 413 });
  }
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > maxBytes) return noStoreJson({ error: "invalid_image_size" }, { status: 413 });
  if (!validateImageBytes(new Uint8Array(bytes), "image/webp").valid) {
    return noStoreJson({ error: "invalid_image" }, { status: 422 });
  }
  const id = current.id!;
  const key = current.prefix + id + ".webp";
  const object = await current.bucket.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "image/webp", cacheControl: "private, no-store" },
    customMetadata: { title: title || "Immagine puzzle", source: "Caricata dall’utente", rights: "Diritto d’uso dichiarato" },
  });
  const saved = object ?? await current.bucket.head(key);
  if (!saved) return noStoreJson({ error: "storage_unavailable" }, { status: 503 });
  if (saved.customMetadata?.removed) return noStoreJson({ error: "image_removed" }, { status: 410 });
  return noStoreJson({ image: imageEntry(id, saved) });
}

export async function DELETE(request: Request) {
  const current = await catalog(request, true);
  if (current instanceof Response) return current;
  const key = current.prefix + current.id + ".webp";
  // A late retry must not restore a deleted image. Keep only a removal marker.
  if (await current.bucket.head(key)) await current.bucket.put(key, "", { customMetadata: { removed: "true" } });
  return noStoreJson({ deleted: true });
}
