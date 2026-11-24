import { scheduledAssetUrl, scheduledId, scheduledWordKey } from "../../../domain/scheduled-images";
import { stockItems } from "../../../shared/seed-data";
import { noStoreJson } from "../../controller/_shared";
import { readQueueBody, scheduledLeaseMs, scheduledWorker, wordsWithImages } from "../_shared";

export async function POST(request: Request) {
  const access = await scheduledWorker(request, "publisher");
  if (access instanceof Response) return access;
  const { db, accountId, tokenHash, stillAuthorized } = access;
  const body = await readQueueBody(request).catch(() => null);
  if (!body) return noStoreJson({ error: "invalid_body" }, { status: 400 });
  const now = Date.now();

  if (body.action === "claim") {
    const claimId = crypto.randomUUID();
    const proposal = await db.prepare(`UPDATE scheduled_image_requests
      SET claim_id = ?, lease_until = ?
      WHERE ${stillAuthorized} AND id = (
        SELECT id FROM scheduled_image_requests WHERE account_id = ? AND status IN ('approved', 'pull_request')
          AND (lease_until IS NULL OR lease_until <= ?)
        ORDER BY updated_at, id LIMIT 1
      )
      RETURNING id, word, status, metadata, proposal_digest AS digest, image_base64 AS image, pr_number AS prNumber, pr_head AS prHead`)
      .bind(claimId, now + scheduledLeaseMs, accountId, tokenHash, accountId, now)
      .first<{ id: string; word: string; status: string; metadata: string; digest: string; image: string; prNumber: number | null; prHead: string | null }>();
    if (proposal?.status === "approved" && (await wordsWithImages(db, accountId)).has(scheduledWordKey(proposal.word))) {
      const existing = await db.prepare(`UPDATE scheduled_image_requests
        SET status = 'existing', image_base64 = NULL, claim_id = NULL, lease_until = NULL, updated_at = ?
        WHERE id = ? AND account_id = ? AND status = 'approved' AND claim_id = ? AND ${stillAuthorized}`)
        .bind(now, proposal.id, accountId, claimId, accountId, tokenHash).run();
      if (existing.meta.changes) return noStoreJson({ proposal: null });
      return noStoreJson({ error: "claim_changed" }, { status: 409 });
    }
    return noStoreJson({ claimId, proposal });
  }

  if (typeof body.id !== "string" || !scheduledId.test(body.id) || typeof body.claimId !== "string" || !scheduledId.test(body.claimId)) {
    return noStoreJson({ error: "invalid_action" }, { status: 400 });
  }

  const active = `account_id = ? AND id = ? AND claim_id = ? AND lease_until > ? AND ${stillAuthorized}`;
  const bindings = [accountId, body.id, body.claimId, now, accountId, tokenHash] as const;
  let result: D1Result;
  switch (body.action) {
    case "link": {
      if (typeof body.prNumber !== "number" || !Number.isSafeInteger(body.prNumber) || body.prNumber < 1 ||
        typeof body.prHead !== "string" || !/^[a-f0-9]{40}(?![\s\S])/.test(body.prHead)) {
        return noStoreJson({ error: "invalid_pull_request" }, { status: 400 });
      }
      result = await db.prepare(`UPDATE scheduled_image_requests
        SET status = 'pull_request', pr_number = ?, pr_head = ?, message = '', updated_at = ?
        WHERE status = 'approved' AND ${active}`).bind(body.prNumber, body.prHead, now, ...bindings).run();
      break;
    }
    case "renew": {
      result = await db.prepare(`UPDATE scheduled_image_requests SET lease_until = ?
        WHERE status = 'pull_request' AND pr_number = ? AND pr_head = ? AND ${active}`)
        .bind(now + scheduledLeaseMs, body.prNumber ?? null, body.prHead ?? null, ...bindings).run();
      break;
    }
    case "confirm": {
      const url = scheduledAssetUrl(body.id);
      if (!stockItems.some(item => item.image === url)) return noStoreJson({ error: "deployment_pending" }, { status: 425 });
      result = await db.prepare(`UPDATE scheduled_image_requests
        SET status = 'published', image_base64 = NULL, claim_id = NULL, lease_until = NULL, updated_at = ?
        WHERE status = 'pull_request' AND ${active}`).bind(now, ...bindings).run();
      break;
    }
    case "existing": {
      const item = await db.prepare(`SELECT word_key FROM scheduled_image_requests WHERE status = 'approved' AND ${active}`)
        .bind(...bindings).first<{ word_key: string }>();
      if (!item || !(await wordsWithImages(db, accountId)).has(item.word_key)) {
        return noStoreJson({ error: "catalog_pending" }, { status: 425 });
      }
      result = await db.prepare(`UPDATE scheduled_image_requests
        SET status = 'existing', image_base64 = NULL, claim_id = NULL, lease_until = NULL, updated_at = ?
        WHERE status = 'approved' AND ${active}`).bind(now, ...bindings).run();
      break;
    }
    case "release": {
      const messages = { check_failed: "Controlli GitHub da verificare.", deployment_pending: "In attesa del deploy.", unavailable: "Pubblicazione da riprovare." } as const;
      if (typeof body.reason !== "string" || !Object.hasOwn(messages, body.reason)) return noStoreJson({ error: "invalid_reason" }, { status: 400 });
      result = await db.prepare(`UPDATE scheduled_image_requests
        SET message = ?, claim_id = NULL, lease_until = NULL, updated_at = ?
        WHERE status IN ('approved', 'pull_request') AND ${active}`)
        .bind(messages[body.reason as keyof typeof messages], now, ...bindings).run();
      break;
    }
    default:
      return noStoreJson({ error: "invalid_action" }, { status: 400 });
  }
  return result.meta.changes ? noStoreJson({ ok: true }) : noStoreJson({ error: "claim_changed" }, { status: 409 });
}
