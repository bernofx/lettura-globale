import { hashText } from "../../../chatgpt-auth";
import { MAX_SCHEDULED_IMAGE_BODY, scheduledId, scheduledImageMetadata, scheduledWebpFromBase64 } from "../../../domain/scheduled-images";
import { noStoreJson } from "../../controller/_shared";
import { readQueueBody, scheduledLeaseMs, scheduledWorker, wordsWithImages } from "../_shared";

export async function POST(request: Request) {
  const access = await scheduledWorker(request, "generator");
  if (access instanceof Response) return access;
  const { db, accountId, tokenHash, stillAuthorized } = access;
  const body = await readQueueBody(request, MAX_SCHEDULED_IMAGE_BODY).catch(() => null);
  if (!body) return noStoreJson({ error: "invalid_body" }, { status: 400 });
  const now = Date.now();

  if (body.action === "claim") {
    const claimId = crypto.randomUUID();
    const { results } = await db.prepare(`
      UPDATE scheduled_image_requests
      SET status = 'processing', claim_id = ?, lease_until = ?, updated_at = ?
      WHERE ${stillAuthorized} AND id IN (
        SELECT id FROM scheduled_image_requests
        WHERE account_id = ? AND status IN ('queued', 'processing') AND (lease_until IS NULL OR lease_until <= ?)
        ORDER BY created_at, id LIMIT 3
      )
      RETURNING id, word, detail, word_key AS wordKey
    `).bind(claimId, now + scheduledLeaseMs, now, accountId, tokenHash, accountId, now)
      .all<{ id: string; word: string; detail: string; wordKey: string }>();
    if (!results.length) return noStoreJson({ requests: [] });
    const images = await wordsWithImages(db, accountId);
    const requests = [];
    for (const item of results) {
      if (images.has(item.wordKey)) {
        await db.prepare(`UPDATE scheduled_image_requests SET status = 'existing', claim_id = NULL, lease_until = NULL
          WHERE account_id = ? AND id = ? AND claim_id = ? AND ${stillAuthorized}`)
          .bind(accountId, item.id, claimId, accountId, tokenHash).run();
      } else {
        requests.push({ id: item.id, word: item.word, detail: item.detail });
      }
    }
    return noStoreJson({ claimId, requests });
  }

  if (typeof body.id !== "string" || !scheduledId.test(body.id) || typeof body.claimId !== "string" || !scheduledId.test(body.claimId)) {
    return noStoreJson({ error: "invalid_action" }, { status: 400 });
  }
  const active = `account_id = ? AND id = ? AND claim_id = ? AND status = 'processing' AND lease_until > ? AND ${stillAuthorized}`;
  const bindings = [accountId, body.id, body.claimId, now, accountId, tokenHash] as const;

  if (body.action === "submit" && Object.keys(body).length === 5) {
    const item = await db.prepare(`SELECT word FROM scheduled_image_requests WHERE ${active}`).bind(...bindings).first<{ word: string }>();
    if (!item) return noStoreJson({ error: "claim_changed" }, { status: 409 });
    const metadata = scheduledImageMetadata(item.word, body.metadata);
    if (!metadata || !scheduledWebpFromBase64(body.image)) return noStoreJson({ error: "invalid_proposal" }, { status: 422 });
    const result = await db.prepare(`UPDATE scheduled_image_requests
      SET status = 'generated', metadata = ?, image_base64 = ?, proposal_digest = ?, claim_id = NULL, lease_until = NULL, updated_at = ?
      WHERE ${active}`).bind(JSON.stringify(metadata), body.image, await hashText(JSON.stringify([metadata, body.image])), now, ...bindings).run();
    if (result.meta.changes) return noStoreJson({ ok: true });
  } else if (body.action === "report" && Object.keys(body).length === 4 && (body.status === "needs_review" || body.status === "failed")) {
    const result = await db.prepare(`UPDATE scheduled_image_requests
      SET status = ?, claim_id = NULL, lease_until = NULL, updated_at = ?
      WHERE ${active}`).bind(body.status, now, ...bindings).run();
    if (result.meta.changes) return noStoreJson({ ok: true });
  } else {
    return noStoreJson({ error: "invalid_action" }, { status: 400 });
  }
  return noStoreJson({ error: "claim_changed" }, { status: 409 });
}
