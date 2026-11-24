import { env } from "cloudflare:workers";
import { hashText } from "../../domain/sha256";
import { readBoundedJson } from "../../server/bounded-json";
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

export async function readQueueBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new Error("invalid_body");
  return readBoundedJson(request, 24_000);
}

export async function scheduledPublisher(request: Request) {
  const db = env.DB;
  if (!db) return noStoreJson({ error: "queue_unavailable" }, { status: 503 });
  const token = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return noStoreJson({ error: "worker_authentication_required" }, { status: 401 });
  const tokenHash = await hashText(token);
  const worker = await db.prepare(`SELECT account_id FROM scheduled_image_workers WHERE publisher_hash = ?`)
    .bind(tokenHash).first<{ account_id: string }>();
  if (!worker) return noStoreJson({ error: "worker_authentication_required" }, { status: 401 });
  const stillAuthorized = `EXISTS (SELECT 1 FROM scheduled_image_workers WHERE account_id = ? AND publisher_hash = ?)`;
  return { db, accountId: worker.account_id, tokenHash, stillAuthorized };
}

export const scheduledLeaseMs = 60 * 60 * 1000;
