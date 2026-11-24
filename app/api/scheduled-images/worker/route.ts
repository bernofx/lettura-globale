import { env } from "cloudflare:workers";
import { hashText } from "../../../chatgpt-auth";
import { workerReportStatuses, type ScheduledImageRequest, type WorkerReportStatus } from "../../../domain/scheduled-images";
import { noStoreJson } from "../../controller/_shared";
import { readQueueBody, requestFields, wordsWithImages } from "../_shared";

const LEASE_MS = 60 * 60 * 1000;
const CLAIM_SIZE = 3;
const workerStillAuthorized = "EXISTS (SELECT 1 FROM scheduled_image_workers WHERE account_id = ? AND token_hash = ?)";

export async function POST(request: Request) {
  if (!env.DB) return noStoreJson({ error: "queue_unavailable" }, { status: 503 });
  const token = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return noStoreJson({ error: "worker_authentication_required" }, { status: 401 });
  const db = env.DB;
  const tokenHash = await hashText(token);
  const worker = await db.prepare("SELECT account_id FROM scheduled_image_workers WHERE token_hash = ?").bind(tokenHash).first<{ account_id: string }>();
  if (!worker) return noStoreJson({ error: "worker_authentication_required" }, { status: 401 });
  const accountId = worker.account_id;
  const body = await readQueueBody(request).catch(() => null);
  if (!body) return noStoreJson({ error: "invalid_body" }, { status: 400 });
  const now = Date.now();

  if (body.action === "claim") {
    const claimId = crypto.randomUUID();
    const { results } = await db.prepare(`
      WITH available AS MATERIALIZED (
        SELECT item.id, item.batch_id FROM scheduled_image_requests AS item
        WHERE item.account_id = ? AND item.status IN ('queued', 'processing', 'pull_request')
          AND (item.lease_until IS NULL OR item.lease_until <= ?)
          AND (item.batch_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM scheduled_image_requests AS active
            WHERE active.account_id = item.account_id AND active.batch_id = item.batch_id AND active.lease_until > ?
          ))
        ORDER BY CASE WHEN item.batch_id IS NOT NULL THEN 0 ELSE 1 END, item.created_at, item.id
      )
      UPDATE scheduled_image_requests
      SET status = CASE WHEN status = 'queued' THEN 'processing' ELSE status END,
        batch_id = COALESCE(batch_id, ?), claim_id = ?, lease_until = ?, updated_at = ?
      WHERE ${workerStillAuthorized} AND id IN (
        SELECT id FROM available WHERE batch_id IS (SELECT batch_id FROM available LIMIT 1) LIMIT ?
      )
      RETURNING ${requestFields}, word_key AS wordKey, batch_id AS batchId
    `).bind(accountId, now, now, claimId, claimId, now + LEASE_MS, now, accountId, tokenHash, CLAIM_SIZE)
      .all<ScheduledImageRequest & { wordKey: string; batchId: string }>();
    if (!results.length) return noStoreJson({ requests: [] });
    const images = await wordsWithImages(db, accountId);
    return noStoreJson({ claimId, batchId: results[0].batchId,
      requests: results.map(item => ({
        id: item.id, word: item.word, detail: item.detail, status: item.status,
        message: item.message, prNumber: item.prNumber, hasImage: images.has(item.wordKey),
      })),
    });
  }

  if (body.action !== "report" || typeof body.id !== "string" || typeof body.claimId !== "string" ||
    !workerReportStatuses.includes(body.status as WorkerReportStatus)) {
    return noStoreJson({ error: "invalid_action" }, { status: 400 });
  }
  const status = body.status as WorkerReportStatus;
  const linked = status === "pull_request" || status === "published";
  const prNumber = linked && typeof body.prNumber === "number" && Number.isSafeInteger(body.prNumber) && body.prNumber > 0 ? body.prNumber : null;
  if ((linked && !prNumber) || (body.message !== undefined && (typeof body.message !== "string" || body.message.length > 400))) {
    return noStoreJson({ error: "invalid_report" }, { status: 400 });
  }
  const lease = status === "pull_request" && body.release !== true ? now + LEASE_MS : null;
  const result = await db.prepare(`
    UPDATE scheduled_image_requests
    SET status = ?, message = ?, pr_number = ?, lease_until = ?, updated_at = ?
    WHERE account_id = ? AND id = ? AND claim_id = ? AND ${workerStillAuthorized}
      AND (
        (lease_until > ? AND (
          (status = 'processing' AND ? <> 'published') OR
          (status = 'pull_request' AND ? IN ('pull_request', 'published') AND pr_number = ?)
        )) OR
        (lease_until IS NULL AND status = ? AND pr_number IS ? AND ? IS NULL)
      )
    RETURNING ${requestFields}
  `).bind(status, body.message ?? "", prNumber, lease, now, accountId, body.id, body.claimId, accountId, tokenHash,
    now, status, status, prNumber, status, prNumber, lease).first<ScheduledImageRequest>();
  if (!result) return noStoreJson({ error: "claim_changed" }, { status: 409 });
  return noStoreJson({ request: result });
}
