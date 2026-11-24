import { isScheduledWord, scheduledId, scheduledImageMetadata, scheduledWordKey } from "../domain/scheduled-images";
import { publishedImageBytes, scheduledImagePreview } from "../domain/scheduled-image-preview";
import { bundledImageWords, imageProposalDigest } from "./scheduled-image-jobs";
import { officialImageExtension } from "../domain/scheduled-catalog";

const leaseMs = 5 * 60 * 1000;
const pending = "status IN ('approved', 'pull_request')";
const unclaimed = "(lease_until IS NULL OR lease_until <= ?)";

type CatalogRow = { id: string; word: string; metadata: string; imageType: string };
type ApprovedRow = { word: string; wordKey: string; metadata: string; image: string; digest: string };

function parseMetadata(word: string, raw: string) {
  try {
    return isScheduledWord(word) ? scheduledImageMetadata(word, JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function readOfficialCatalog(db: D1Database) {
  const { results } = await db.prepare(`SELECT id, word, metadata, image_type AS imageType
    FROM official_catalog_images ORDER BY published_at, id`).all<CatalogRow>();
  return results.flatMap(({ id, word, metadata, imageType }) => {
    const details = parseMetadata(word, metadata);
    const extension = officialImageExtension(imageType);
    return details && extension && scheduledId.test(id) ? [{ assetId: id, word, metadata: details, extension }] : [];
  });
}

export function catalogPublicationAvailable(env: Cloudflare.Env, accountId: string) {
  return Boolean(env.DB && env.BUCKET && accountId && env.SCHEDULED_IMAGES_ACCOUNT_ID === accountId);
}

/** Publish only an already approved proposal. Its exact digest is rechecked before any write to R2. */
export async function publishApprovedCatalogImage(env: Cloudflare.Env, accountId: string, id: string) {
  const { DB: db, BUCKET: bucket } = env;
  if (!db || !bucket || !catalogPublicationAvailable(env, accountId) || !scheduledId.test(id)) return;
  const claim = crypto.randomUUID();
  const now = Date.now();
  const row = await db.prepare(`UPDATE scheduled_image_requests
    SET claim_id = ?, lease_until = ?
    WHERE account_id = ? AND id = ? AND ${pending} AND ${unclaimed}
    RETURNING word, word_key AS wordKey, metadata, image_base64 AS image, proposal_digest AS digest`)
    .bind(claim, now + leaseMs, accountId, id, now).first<ApprovedRow>();
  if (!row) return;

  const active = `account_id = ? AND id = ? AND claim_id = ? AND ${pending}`;
  const bindings = [accountId, id, claim] as const;
  const finished = (status: "'published'" | "'existing'" | "'needs_review'", message = "") => db.prepare(`
    UPDATE scheduled_image_requests SET status = ${status}, message = ?, metadata = NULL,
      image_base64 = NULL, proposal_digest = NULL, claim_id = NULL, lease_until = NULL, updated_at = ?
    WHERE ${active}`).bind(message, Date.now(), ...bindings);

  try {
    if (bundledImageWords.has(row.wordKey)) {
      await finished("'existing'").run();
      return;
    }
    const metadata = parseMetadata(row.word, row.metadata);
    const preview = metadata && scheduledImagePreview(row.image);
    const bytes = preview && publishedImageBytes(preview);
    if (!metadata || !preview || !bytes || scheduledWordKey(row.word) !== row.wordKey ||
      await imageProposalDigest(metadata, row.image) !== row.digest) {
      await finished("'needs_review'", "La proposta approvata non è più utilizzabile. Puoi generarla di nuovo.").run();
      return;
    }

    const objectKey = `official-catalog/${id}/${row.digest}`;
    await bucket.put(objectKey, bytes, { httpMetadata: { contentType: preview.imageType } });
    await db.batch([
      db.prepare(`INSERT INTO official_catalog_images (id, word_key, word, metadata, image_type, object_key, published_at)
        SELECT ?, ?, ?, ?, ?, ?, ? FROM scheduled_image_requests WHERE ${active}
        ON CONFLICT (word_key) DO NOTHING`)
        .bind(id, row.wordKey, row.word, JSON.stringify(metadata), preview.imageType, objectKey, Date.now(), ...bindings),
      db.prepare(`UPDATE scheduled_image_requests SET
        status = CASE WHEN EXISTS (SELECT 1 FROM official_catalog_images WHERE id = ?) THEN 'published' ELSE 'existing' END,
        message = '', metadata = NULL, image_base64 = NULL, proposal_digest = NULL, claim_id = NULL, lease_until = NULL, updated_at = ?
        WHERE ${active}`).bind(id, Date.now(), ...bindings),
    ]);
  } catch {
    // The approved bytes survive storage or database failures. The next pass can resume the same publication.
    await db.prepare(`UPDATE scheduled_image_requests SET
      claim_id = NULL, lease_until = NULL, message = ?, updated_at = ? WHERE ${active}`)
      .bind("Pubblicazione in attesa. Verrà riprovata in automatico.", Date.now(), ...bindings).run();
    console.warn("Official catalog publication will be retried");
  }
}

export async function recoverApprovedCatalogImages(env: Cloudflare.Env) {
  const { DB: db, SCHEDULED_IMAGES_ACCOUNT_ID: accountId } = env;
  if (!db || !accountId || !catalogPublicationAvailable(env, accountId)) return;
  const { results } = await db.prepare(`SELECT id FROM scheduled_image_requests
    WHERE account_id = ? AND ${pending} AND ${unclaimed}
    ORDER BY updated_at, id LIMIT 10`).bind(accountId, Date.now()).all<{ id: string }>();
  for (const { id } of results) await publishApprovedCatalogImage(env, accountId, id);
}
