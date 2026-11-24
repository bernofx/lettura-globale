import { hashText } from "../../chatgpt-auth";
import { parseScheduledWords, type ScheduledImageRequest } from "../../domain/scheduled-images";
import { noStoreJson } from "../controller/_shared";
import { readQueueBody, requestFields, scheduledImagesAdmin, wordsWithImages } from "./_shared";

async function queue(db: D1Database, accountId: string) {
  const [items, worker] = await db.batch([
    db.prepare(`SELECT ${requestFields} FROM scheduled_image_requests WHERE account_id = ?
      ORDER BY CASE WHEN status IN ('queued', 'processing', 'pull_request', 'needs_review', 'failed') THEN 0 ELSE 1 END,
        updated_at DESC, id
      LIMIT 100`).bind(accountId),
    db.prepare("SELECT 1 FROM scheduled_image_workers WHERE account_id = ?").bind(accountId),
  ]);
  return { requests: items.results as ScheduledImageRequest[], workerConfigured: worker.results.length > 0 };
}

export async function GET(request: Request) {
  const access = await scheduledImagesAdmin(request);
  if (access instanceof Response) return access;
  return noStoreJson(await queue(access.db, access.accountId));
}

export async function POST(request: Request) {
  const access = await scheduledImagesAdmin(request);
  if (access instanceof Response) return access;
  const { db, accountId } = access;
  const body = await readQueueBody(request).catch(() => null);
  if (!body) return noStoreJson({ error: "invalid_body" }, { status: 400 });
  const now = Date.now();

  if (body.action === "rotate_key") {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    await db.batch([
      db.prepare(`INSERT INTO scheduled_image_workers (account_id, token_hash, created_at) VALUES (?, ?, ?)
        ON CONFLICT (account_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at`)
        .bind(accountId, await hashText(token), now),
      db.prepare("UPDATE scheduled_image_requests SET claim_id = NULL, lease_until = NULL WHERE account_id = ? AND lease_until IS NOT NULL")
        .bind(accountId),
    ]);
    return noStoreJson({ token });
  }

  if (body.action === "enqueue") {
    let words;
    try { words = parseScheduledWords(body.words); }
    catch { return noStoreJson({ error: "invalid_words" }, { status: 400 }); }
    const images = await wordsWithImages(db, accountId);
    const inserts = await db.batch(words.map(({ word, key, detail }) => db.prepare(`
      INSERT INTO scheduled_image_requests (id, account_id, word, word_key, detail, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (account_id, word_key) DO UPDATE SET
        word = excluded.word, detail = excluded.detail, status = excluded.status, message = '',
        pr_number = NULL, batch_id = NULL, claim_id = NULL, lease_until = NULL, updated_at = excluded.updated_at
      WHERE scheduled_image_requests.status IN ('cancelled', 'needs_review', 'failed')
    `).bind(crypto.randomUUID(), accountId, word, key, detail, images.has(key) ? "existing" : "queued", now, now)));
    return noStoreJson({ ...await queue(db, accountId), accepted: inserts.filter(result => result.meta.changes > 0).length, submitted: words.length });
  }

  if (body.action === "cancel" && typeof body.id === "string") {
    const result = await db.prepare(`
      UPDATE scheduled_image_requests SET status = 'cancelled', message = '', claim_id = NULL, lease_until = NULL, updated_at = ?
      WHERE account_id = ? AND id = ? AND status IN ('queued', 'needs_review', 'failed')
    `).bind(now, accountId, body.id).run();
    if (!result.meta.changes) return noStoreJson({ error: "request_changed" }, { status: 409 });
    return noStoreJson(await queue(db, accountId));
  }

  return noStoreJson({ error: "invalid_action" }, { status: 400 });
}
