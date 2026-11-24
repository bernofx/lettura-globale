import { env } from "cloudflare:workers";
import { officialImageExtension } from "../../../domain/scheduled-catalog";
import { scheduledId } from "../../../domain/scheduled-images";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { DB: db, BUCKET: bucket } = env;
  if (!db || !bucket) return new Response(null, { status: 503 });
  const { file } = await params;
  const separator = file.indexOf(".");
  const id = file.slice(0, separator);
  if (separator !== 36 || !scheduledId.test(id)) return new Response(null, { status: 404 });
  const entry = await db.prepare("SELECT image_type AS imageType, object_key AS objectKey FROM official_catalog_images WHERE id = ?")
    .bind(id).first<{ imageType: string; objectKey: string }>();
  if (!entry || file.slice(separator + 1) !== officialImageExtension(entry.imageType)) return new Response(null, { status: 404 });
  const object = await bucket.get(entry.objectKey);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, { headers: {
    "content-type": entry.imageType,
    "x-content-type-options": "nosniff",
    "cache-control": "public, max-age=86400, immutable",
    etag: object.httpEtag,
  } });
}
