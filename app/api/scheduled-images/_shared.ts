import { hashText } from "../../chatgpt-auth";
import { env } from "cloudflare:workers";
import { scheduledWordKey } from "../../domain/scheduled-images";
import { stockItems } from "../../shared/seed-data";
import { authenticatedAdult, noStoreJson } from "../controller/_shared";

export const requestFields = "id, word, detail, status, message, pr_number AS prNumber";

export async function scheduledImagesAdmin(request: Request) {
  if (!env.DB) return noStoreJson({ error: "queue_unavailable" }, { status: 503 });
  const adult = await authenticatedAdult();
  if (!adult || adult.adultProfileId !== request.headers.get("x-scheduled-images-profile")) {
    return noStoreJson({ error: "authentication_required" }, { status: 401 });
  }
  const allowed = await env.DB.prepare(`
    SELECT 1 FROM user_states AS state, json_each(state.payload, '$.therapists') AS adult
    WHERE state.user_id = ? AND json_extract(adult.value, '$.id') = ?
      AND json_extract(adult.value, '$.role') = 'Amministratore'
  `).bind(adult.userId, adult.adultProfileId).first();
  if (!allowed) return noStoreJson({ error: "administrator_required" }, { status: 403 });
  return { db: env.DB, accountId: adult.userId };
}

export async function readQueueBody(request: Request, maxBytes = 24_000): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new Error("invalid_body");
  // Bound the stream even when Content-Length is missing.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_body");
  const decoder = new TextDecoder();
  let length = 0;
  let json = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new Error("invalid_body");
      }
      json += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  const body: unknown = JSON.parse(json + decoder.decode());
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_body");
  return body as Record<string, unknown>;
}

const bundledImageWords = stockItems.filter(item => item.image && !item.categorySymbolOnly && item.contentKind !== "sentence")
  .map(item => scheduledWordKey(item.word));

export async function wordsWithImages(db: D1Database, accountId: string) {
  const { results } = await db.prepare(`
    SELECT json_extract(item.value, '$.word') AS word
    FROM user_states AS state, json_each(state.payload, '$.library') AS item
    WHERE state.user_id = ?
      AND COALESCE(json_extract(item.value, '$.deleted'), 0) = 0
      AND COALESCE(json_extract(item.value, '$.categorySymbolOnly'), 0) = 0
      AND json_extract(item.value, '$.contentKind') IS NOT 'sentence'
      AND (COALESCE(json_extract(item.value, '$.image'), '') <> '' OR COALESCE(json_extract(item.value, '$.remoteImageId'), '') <> '')
  `).bind(accountId).all<{ word: string }>();
  return new Set([...bundledImageWords, ...results.filter(item => typeof item.word === "string").map(item => scheduledWordKey(item.word))]);
}

const keyColumn = { generator: "token_hash", publisher: "publisher_hash" } as const;

export async function scheduledWorker(request: Request, role: keyof typeof keyColumn) {
  const db = env.DB;
  if (!db) return noStoreJson({ error: "queue_unavailable" }, { status: 503 });
  const token = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return noStoreJson({ error: "worker_authentication_required" }, { status: 401 });
  const tokenHash = await hashText(token);
  const column = keyColumn[role];
  const worker = await db.prepare(`SELECT account_id FROM scheduled_image_workers WHERE ${column} = ?`)
    .bind(tokenHash).first<{ account_id: string }>();
  if (!worker) return noStoreJson({ error: "worker_authentication_required" }, { status: 401 });
  const stillAuthorized = `EXISTS (SELECT 1 FROM scheduled_image_workers WHERE account_id = ? AND ${column} = ?)`;
  return { db, accountId: worker.account_id, tokenHash, stillAuthorized };
}

export const scheduledLeaseMs = 60 * 60 * 1000;
