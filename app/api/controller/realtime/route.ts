import { env } from "cloudflare:workers";
import { sanitizeRemoteSnapshot } from "../../../domain/remote-controller";
import type { RealtimeAction } from "../../../domain/realtime-protocol";
import { adultCanAccessChild, authenticatedAdult, noStoreJson, readJson } from "../_shared";
import { requestRealtime } from "../../../../realtime/gateway";

export async function POST(request: Request) {
  const user = await authenticatedAdult();
  if (!user) return noStoreJson({ error: "authentication_required" }, { status: 401 });
  if (!env.SESSIONS) return noStoreJson({ error: "realtime_unavailable" }, { status: 503 });
  const input = await readJson(request);
  if (!input || typeof input !== "object") return noStoreJson({ error: "invalid_request" }, { status: 400 });
  const body = input as Record<string, unknown>;
  if (typeof body.sessionId !== "string" || !/^[a-zA-Z0-9:_-]{8,100}$/.test(body.sessionId)) return noStoreJson({ error: "invalid_session" }, { status: 400 });
  const identity = { accountId: user.userId, adultId: user.adultProfileId };
  const action = body.action as RealtimeAction["action"];
  if (!["create", "join", "ticket", "disconnect", "close"].includes(action)) return noStoreJson({ error: "invalid_action" }, { status: 400 });
  const params: RealtimeAction = { action, identity, sessionId: body.sessionId };
  if (action === "create") {
    const snapshot = sanitizeRemoteSnapshot(body.snapshot);
    if (typeof body.childId !== "string" || !snapshot || snapshot.sessionId !== body.sessionId) return noStoreJson({ error: "invalid_snapshot" }, { status: 400 });
    params.childId = body.childId;
    params.snapshot = snapshot;
  } else {
    const session = await requestRealtime(env.SESSIONS, { action: "inspect", identity, sessionId: body.sessionId });
    if (!session.ok || !session.childId) return noStoreJson({ error: session.error ?? "session_not_found" }, { status: session.status ?? 404 });
    params.childId = session.childId;
  }
  if (!await adultCanAccessChild(user, params.childId!)) return noStoreJson({ error: "forbidden" }, { status: 403 });
  if (typeof body.token === "string") params.token = body.token;
  if (typeof body.controllerKey === "string") params.controllerKey = body.controllerKey;
  params.role = body.role === "host" ? "host" : "controller";
  params.since = typeof body.since === "number" && Number.isSafeInteger(body.since) ? Math.max(0, body.since) : 0;
  const result = await requestRealtime(env.SESSIONS, params);
  if (!result.ok) return noStoreJson({ error: result.error }, { status: result.status ?? 500 });
  if (result.ticket && result.objectId) {
    // The external endpoint accepts only a single-use ticket minted after these access checks.
    const socketUrl = new URL("/api/controller/realtime/connect", request.url);
    socketUrl.protocol = socketUrl.protocol === "http:" ? "ws:" : "wss:";
    socketUrl.searchParams.set("id", result.objectId);
    socketUrl.searchParams.set("ticket", result.ticket);
    return noStoreJson({ socketUrl: socketUrl.toString() });
  }
  // Keep the same privacy boundary as the classic pairing API.
  const { childId: _childId, objectId: _objectId, ...response } = result;
  void _childId; void _objectId;
  return noStoreJson(response);
}
