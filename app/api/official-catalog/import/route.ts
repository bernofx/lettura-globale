import { env } from "cloudflare:workers";
import { commonsPageId } from "../../../domain/openverse-catalog";
import { parseScheduledWords, scheduledId, scheduledImageMetadata, scheduledWordKey } from "../../../domain/scheduled-images";
import { catalogPublicationAvailable, saveImportedCatalogImage } from "../../../server/official-catalog";
import { CatalogSourceError, prepareCommonsImage, searchCommonsImages } from "../../../server/openverse-catalog";
import { draftMetadata, wordsWithImages } from "../../../server/scheduled-image-jobs";
import { noStoreJson } from "../../controller/_shared";
import { readQueueBody, scheduledImagesAdmin } from "../../scheduled-images/_shared";

function inputWord(value: unknown) {
  if (typeof value !== "string" || /[|\r\n]/.test(value)) return null;
  try {
    return parseScheduledWords(value)[0]?.word ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const access = await scheduledImagesAdmin(request);
  if (access instanceof Response) return access;
  const bucket = env.BUCKET;
  if (!bucket || !catalogPublicationAvailable(env, access.accountId)) return noStoreJson({ error: "catalog_import_unavailable" }, { status: 403 });
  const body = await readQueueBody(request).catch(() => null);
  const word = body && inputWord(body.word);
  if (!body || !word) return noStoreJson({ error: "invalid_search" }, { status: 400 });

  try {
    if (body.action === "search") {
      const detail = body.detail ?? "";
      const page = body.page ?? 1;
      const source = body.source;
      if (source !== undefined && source !== "openverse" && source !== "wikimedia") return noStoreJson({ error: "invalid_search" }, { status: 400 });
      if (typeof detail !== "string" || /[|\r\n]/.test(detail) || typeof page !== "number" ||
        !Number.isInteger(page) || page < 1 || page > 5) return noStoreJson({ error: "invalid_search" }, { status: 400 });
      const [search] = parseScheduledWords(`${word} | ${detail}`);
      return noStoreJson(await searchCommonsImages(search.detail || word, page, source));
    }

    if ((body.action !== "preview" && body.action !== "publish") || typeof body.id !== "string" || (!scheduledId.test(body.id) && !commonsPageId(body.id))) {
      return noStoreJson({ error: "invalid_action" }, { status: 400 });
    }

    if (body.action === "preview") {
      const image = await prepareCommonsImage(body.id, word);
      return noStoreJson({ metadata: draftMetadata(word), credit: image.credit, image: image.image, imageType: image.imageType, digest: image.digest });
    }

    const metadata = scheduledImageMetadata(word, body.metadata);
    if (!metadata || typeof body.digest !== "string" || !/^[0-9a-f]{64}$/.test(body.digest)) {
      return noStoreJson({ error: "invalid_metadata" }, { status: 422 });
    }
    if ((await wordsWithImages(access.db, access.accountId)).has(scheduledWordKey(word))) {
      return noStoreJson({ error: "word_has_image" }, { status: 409 });
    }
    const image = await prepareCommonsImage(body.id, word);
    if (image.digest !== body.digest) return noStoreJson({ error: "source_changed" }, { status: 409 });

    const entry = await saveImportedCatalogImage(access.db, bucket, word, metadata, image);
    return entry ? noStoreJson(entry, { status: 201 }) : noStoreJson({ error: "word_has_image" }, { status: 409 });
  } catch (error) {
    if (error instanceof CatalogSourceError) return noStoreJson({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "invalid_words") return noStoreJson({ error: "invalid_search" }, { status: 400 });
    return noStoreJson({ error: "catalog_import_failed" }, { status: 502 });
  }
}
