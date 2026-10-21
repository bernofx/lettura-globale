import { env } from "cloudflare:workers";
import { PAIRING_DURATION_MS, sanitizeRemoteSnapshot } from "../../../domain/remote-controller";
import { hashText } from "../../../chatgpt-auth";
import { adultCanAccessChild, authenticatedAdult, noStoreJson, randomHex, readJson, type ControllerSessionRow } from "../_shared";

export async function POST(request: Request) {
  const user = await authenticatedAdult();
  if (!user) return noStoreJson({ error: "authentication_required" }, { status: 401 });
  if (!env.DB) return noStoreJson({ error: "database_unavailable" }, { status: 503 });
  const input = await readJson(request);
  if (!input || typeof input !== "object") return noStoreJson({ error: "invalid_request" }, { status: 400 });
  const body = input as Record<string, unknown>;

  if (body.action === "create") {
    if (typeof body.sessionId !== "string" || body.sessionId.length < 8 || body.sessionId.length > 100 || typeof body.childId !== "string" || body.childId.length > 100) return noStoreJson({ error: "invalid_request" }, { status: 400 });
    const snapshot = sanitizeRemoteSnapshot(body.snapshot);
    if (!snapshot || snapshot.sessionId !== body.sessionId || !await adultCanAccessChild(user, body.childId)) return noStoreJson({ error: "forbidden" }, { status: 403 });
    const token = randomHex();
    const now = Date.now();
    const expiresAt = now + PAIRING_DURATION_MS;
    await env.DB.prepare(`INSERT INTO remote_controller_sessions
      (account_id, session_id, child_id, owner_adult_id, pairing_token_hash, pairing_expires_at, status, latest_sequence, snapshot_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'waiting', 0, ?, ?, ?)
      ON CONFLICT(account_id, session_id) DO UPDATE SET child_id = excluded.child_id, owner_adult_id = excluded.owner_adult_id,
      pairing_token_hash = excluded.pairing_token_hash, pairing_expires_at = excluded.pairing_expires_at, status = 'waiting',
      pending_adult_id = NULL, pending_adult_name = NULL, controller_key_hash = NULL, controller_last_seen_at = NULL,
      snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at`)
      .bind(user.userId, body.sessionId, body.childId, user.adultProfileId, await hashText(token), expiresAt, JSON.stringify(snapshot), now, now).run();
    return noStoreJson({ sessionId: body.sessionId, token, expiresAt });
  }

  if (body.action === "join") {
    if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token) || typeof body.controllerKey !== "string" || !/^[a-f0-9]{64}$/.test(body.controllerKey)) return noStoreJson({ error: "invalid_request" }, { status: 400 });
    const now = Date.now();
    const row = await env.DB.prepare("SELECT * FROM remote_controller_sessions WHERE pairing_token_hash = ? AND pairing_expires_at > ? AND status != 'closed' LIMIT 1")
      .bind(await hashText(body.token), now).first<ControllerSessionRow>();
    if (!row) return noStoreJson({ error: "pairing_expired" }, { status: 404 });
    if (row.account_id !== user.userId || !await adultCanAccessChild(user, row.child_id)) return noStoreJson({ error: "forbidden" }, { status: 403 });
    const replacement = row.status === "connected" || row.status === "pending";
    const statements = [env.DB.prepare(`UPDATE remote_controller_sessions SET status = 'connected', pending_adult_id = NULL, pending_adult_name = NULL,
      controller_key_hash = ?, controller_last_seen_at = ?, updated_at = ? WHERE account_id = ? AND session_id = ?`)
      .bind(await hashText(body.controllerKey), now, now, row.account_id, row.session_id)];
    if (replacement) statements.push(env.DB.prepare("INSERT INTO audit_events (id, account_id, adult_id, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, 'controller_replaced', 'learning_session', ?, ?)")
      .bind(crypto.randomUUID(), row.account_id, user.adultProfileId, row.session_id, now));
    await env.DB.batch(statements);
    return noStoreJson({ sessionId: row.session_id, status: "connected" });
  }

  return noStoreJson({ error: "invalid_action" }, { status: 400 });
}
