import { env } from "cloudflare:workers";
import { compareColoringDrawings, MAX_DRAWING_BYTES, parseColoringDrawing } from "../../domain/coloring-drawings";
import { coloringPages } from "../../domain/coloring-pages";
import { authenticatedAdult, noStoreJson } from "../controller/_shared";
import { ownerStoragePrefix } from "../media-key";

async function drawingContext(request: Request) {
  const adult = await authenticatedAdult();
  if (!adult || adult.adultProfileId !== request.headers.get("x-coloring-profile")) {
    return noStoreJson({ error: "authentication_required" }, { status: 401 });
  }
  if (!env.BUCKET) return noStoreJson({ error: "storage_unavailable" }, { status: 503 });
  const scope = await ownerStoragePrefix(JSON.stringify([adult.userId, adult.adultProfileId]));
  const requestedScope = request.headers.get("x-coloring-scope");
  if (requestedScope !== null && requestedScope !== scope) return noStoreJson({ error: "profile_changed" }, { status: 401 });
  return { bucket: env.BUCKET, scope, prefix: `coloring-drawings/${scope}/` };
}

async function readDrawing(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_DRAWING_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > MAX_DRAWING_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function GET(request: Request) {
  const context = await drawingContext(request);
  if (context instanceof Response) return context;
  const params = new URL(request.url).searchParams;
  const id = params.get("drawing");
  if (id === null) {
    if (params.get("gallery") !== "1") return noStoreJson({ scope: context.scope });
    try {
      const { objects } = await context.bucket.list({ prefix: context.prefix });
      const drawings = objects.flatMap(object => {
        const pageId = object.key.slice(context.prefix.length, -5);
        return object.key.endsWith(".json") && coloringPages.some(page => page.id === pageId)
          ? [{ id: pageId, etag: object.etag }]
          : [];
      });
      return noStoreJson({ scope: context.scope, drawings });
    } catch {
      return noStoreJson({ error: "drawing_unavailable" }, { status: 503 });
    }
  }
  const page = coloringPages.find(item => item.id === id);
  if (!page) return noStoreJson({ error: "invalid_drawing" }, { status: 400 });
  try {
    const object = await context.bucket.get(`${context.prefix}${page.id}.json`);
    const drawing = object ? parseColoringDrawing(await object.json(), page.areas.length) : null;
    return noStoreJson({ scope: context.scope, drawing, etag: object?.etag });
  } catch {
    return noStoreJson({ error: "drawing_unavailable" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const context = await drawingContext(request);
  if (context instanceof Response) return context;
  if (request.headers.get("x-coloring-scope") !== context.scope) return noStoreJson({ error: "profile_changed" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("drawing");
  const page = coloringPages.find(item => item.id === id);
  if (!page) return noStoreJson({ error: "invalid_drawing" }, { status: 400 });

  let drawing;
  try {
    const body = await readDrawing(request);
    if (body === null) return noStoreJson({ error: "drawing_too_large" }, { status: 413 });
    drawing = parseColoringDrawing(JSON.parse(body), page.areas.length);
  } catch {
    return noStoreJson({ error: "invalid_drawing" }, { status: 400 });
  }
  if (!drawing) return noStoreJson({ error: "invalid_drawing" }, { status: 400 });

  const key = `${context.prefix}${page.id}.json`;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const previous = await context.bucket.get(key);
      const current = previous ? parseColoringDrawing(await previous.json(), page.areas.length) : null;
      if (previous && current && compareColoringDrawings(drawing, current) <= 0) return noStoreJson({ drawing: current, etag: previous.etag });
      const saved = await context.bucket.put(key, JSON.stringify(drawing), {
        onlyIf: previous ? { etagMatches: previous.etag } : { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
      });
      if (saved) return noStoreJson({ written: true, etag: saved.etag });
    }
    return noStoreJson({ error: "drawing_conflict" }, { status: 409 });
  } catch {
    return noStoreJson({ error: "drawing_save_failed" }, { status: 503 });
  }
}
