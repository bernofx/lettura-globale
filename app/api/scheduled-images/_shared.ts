import { env } from "cloudflare:workers";
import { readBoundedJson } from "../../server/bounded-json";
import { authenticatedAdult, noStoreJson } from "../controller/_shared";

export const requestFields = "id, word, detail, status, message";

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
