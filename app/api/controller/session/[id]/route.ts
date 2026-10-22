import { env } from "cloudflare:workers";
import { CONTROLLER_HEARTBEAT_WRITE_MS, controllerIsConnected, parseRemoteCommand, sanitizeRemoteSnapshot, type RemoteControllerEvent } from "../../../../domain/remote-controller";
import { hashText } from "../../../../chatgpt-auth";
import { adultCanAccessChild, authenticatedAdult, loadControllerSession, noStoreJson, readJson, validateController } from "../../_shared";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const user = await authenticatedAdult();
  if (!user) return noStoreJson({ error: "authentication_required" }, { status: 401 });
  if (!env.DB) return noStoreJson({ error: "database_unavailable" }, { status: 503 });
  const { id } = await context.params;
  const row = await loadControllerSession(user.userId, id);
  if (!row || !await adultCanAccessChild(user, row.child_id)) return noStoreJson({ error: "not_found" }, { status: 404 });
  const controllerKey = request.headers.get("x-controller-key");
  if (controllerKey) {
    if (!await validateController(row, user, controllerKey)) return noStoreJson({ error: "forbidden" }, { status: 403 });
    if (row.status === "closed") return noStoreJson({ status: "closed", connected: false, snapshot: null, latestSequence: row.latest_sequence });
    const now = Date.now();
    if (row.status === "connected" && (!row.controller_last_seen_at || row.controller_last_seen_at <= now - CONTROLLER_HEARTBEAT_WRITE_MS)) {
      const heartbeat = await env.DB.prepare("UPDATE remote_controller_sessions SET controller_last_seen_at = ?, updated_at = ? WHERE account_id = ? AND session_id = ? AND controller_key_hash = ?")
        .bind(now, now, row.account_id, row.session_id, await hashText(controllerKey)).run();
      if (!heartbeat.meta.changes) return noStoreJson({ error: "forbidden" }, { status: 403 });
    }
    return noStoreJson({ status: row.status, connected: row.status === "connected", snapshot: safeSnapshot(row.snapshot_json), latestSequence: row.latest_sequence });
  }
  if (row.owner_adult_id !== user.adultProfileId) return noStoreJson({ error: "forbidden" }, { status: 403 });
  const since = Math.max(0, Number(new URL(request.url).searchParams.get("since")) || 0);
  const events = await env.DB.prepare(`SELECT server_sequence, client_event_id, adult_id, command, payload_json, created_at
    FROM remote_controller_events WHERE account_id = ? AND session_id = ? AND server_sequence > ? ORDER BY server_sequence ASC LIMIT 100`)
    .bind(row.account_id, row.session_id, since).all<{ server_sequence: number; client_event_id: string; adult_id: string; command: RemoteControllerEvent["command"]; payload_json: string; created_at: number }>();
  return noStoreJson({
    status: row.status,
    connected: controllerIsConnected(row.status, row.controller_last_seen_at),
    pendingAdultName: row.status === "pending" ? row.pending_adult_name : null,
    latestSequence: row.latest_sequence,
    events: events.results.map((event) => ({ serverSequence: event.server_sequence, clientEventId: event.client_event_id, adultId: event.adult_id, command: event.command, payload: safeSnapshot(event.payload_json), createdAt: event.created_at })),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await authenticatedAdult();
  if (!user) return noStoreJson({ error: "authentication_required" }, { status: 401 });
  if (!env.DB) return noStoreJson({ error: "database_unavailable" }, { status: 503 });
  const { id } = await context.params;
  const row = await loadControllerSession(user.userId, id);
  if (!row || !await adultCanAccessChild(user, row.child_id)) return noStoreJson({ error: "not_found" }, { status: 404 });
  const input = await readJson(request);
  if (!input || typeof input !== "object") return noStoreJson({ error: "invalid_request" }, { status: 400 });
  const body = input as Record<string, unknown>;
  const now = Date.now();

  if (body.action === "approve") {
    if (row.owner_adult_id !== user.adultProfileId || row.status !== "pending" || !row.controller_key_hash || !row.pending_adult_id) return noStoreJson({ error: "invalid_state" }, { status: 409 });
    await env.DB.prepare("UPDATE remote_controller_sessions SET status = 'connected', controller_last_seen_at = ?, updated_at = ? WHERE account_id = ? AND session_id = ?")
      .bind(now, now, row.account_id, row.session_id).run();
    return noStoreJson({ ok: true });
  }

  if (body.action === "sync") {
    if (row.owner_adult_id !== user.adultProfileId) return noStoreJson({ error: "forbidden" }, { status: 403 });
    const snapshot = sanitizeRemoteSnapshot(body.snapshot);
    if (!snapshot || snapshot.sessionId !== id) return noStoreJson({ error: "invalid_snapshot" }, { status: 400 });
    await env.DB.prepare("UPDATE remote_controller_sessions SET snapshot_json = ?, updated_at = ? WHERE account_id = ? AND session_id = ?")
      .bind(JSON.stringify(snapshot), now, row.account_id, row.session_id).run();
    return noStoreJson({ ok: true });
  }

  if (body.action === "close") {
    if (row.owner_adult_id !== user.adultProfileId) return noStoreJson({ error: "forbidden" }, { status: 403 });
    await env.DB.prepare("UPDATE remote_controller_sessions SET status = 'closed', controller_last_seen_at = NULL, updated_at = ? WHERE account_id = ? AND session_id = ?")
      .bind(now, row.account_id, row.session_id).run();
    return noStoreJson({ ok: true });
  }

  const controllerKey = request.headers.get("x-controller-key");
  if (!await validateController(row, user, controllerKey)) return noStoreJson({ error: "forbidden" }, { status: 403 });
  if (row.status !== "connected") return noStoreJson({ error: "not_approved", status: row.status }, { status: 409 });
  const controllerKeyHash = await hashText(controllerKey as string);

  if (body.action === "disconnect") {
    const disconnected = await env.DB.prepare(`UPDATE remote_controller_sessions SET status = 'waiting', pending_adult_id = NULL,
      pending_adult_name = NULL, controller_key_hash = NULL, controller_last_seen_at = NULL, updated_at = ?
      WHERE account_id = ? AND session_id = ? AND status = 'connected' AND controller_key_hash = ?`)
      .bind(now, row.account_id, row.session_id, controllerKeyHash).run();
    if (!disconnected.meta.changes) return noStoreJson({ error: "forbidden" }, { status: 403 });
    return noStoreJson({ ok: true });
  }

  if (body.action === "heartbeat") {
    const heartbeat = await env.DB.prepare("UPDATE remote_controller_sessions SET controller_last_seen_at = ?, updated_at = ? WHERE account_id = ? AND session_id = ? AND controller_key_hash = ?")
      .bind(now, now, row.account_id, row.session_id, controllerKeyHash).run();
    if (!heartbeat.meta.changes) return noStoreJson({ error: "forbidden" }, { status: 403 });
    return noStoreJson({ ok: true });
  }

  if (body.action === "command") {
    const command = parseRemoteCommand(body.command);
    if (!command) return noStoreJson({ error: "invalid_command" }, { status: 400 });
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO remote_controller_events (account_id, session_id, server_sequence, client_event_id, adult_id, origin, command, payload_json, created_at)
        SELECT account_id, session_id, latest_sequence + 1, ?, ?, 'mobile', ?, ?, ? FROM remote_controller_sessions
        WHERE account_id = ? AND session_id = ? AND status = 'connected' AND controller_key_hash = ?
        ON CONFLICT(account_id, session_id, client_event_id) DO NOTHING`)
        .bind(command.clientEventId, user.adultProfileId, command.command, JSON.stringify(command.payload ?? {}), now, row.account_id, row.session_id, controllerKeyHash),
      env.DB.prepare(`UPDATE remote_controller_sessions SET latest_sequence = COALESCE((SELECT MAX(server_sequence) FROM remote_controller_events WHERE account_id = ? AND session_id = ?), latest_sequence),
        controller_last_seen_at = ?, updated_at = ? WHERE account_id = ? AND session_id = ?`)
        .bind(row.account_id, row.session_id, now, now, row.account_id, row.session_id),
    ]);
    const saved = await env.DB.prepare("SELECT server_sequence FROM remote_controller_events WHERE account_id = ? AND session_id = ? AND client_event_id = ? LIMIT 1")
      .bind(row.account_id, row.session_id, command.clientEventId).first<{ server_sequence: number }>();
    if (!saved) return noStoreJson({ error: "forbidden" }, { status: 403 });
    return noStoreJson({ ok: true, serverSequence: saved?.server_sequence ?? row.latest_sequence });
  }

  return noStoreJson({ error: "invalid_action" }, { status: 400 });
}

function safeSnapshot(value: string) {
  try { return JSON.parse(value) as unknown; } catch { return {}; }
}
