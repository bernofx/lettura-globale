import type { RealtimeAction, RealtimeResult } from "../app/domain/realtime-protocol";

export async function requestRealtime(namespace: DurableObjectNamespace, input: RealtimeAction): Promise<RealtimeResult> {
  if (!input.identity?.accountId || !input.identity.adultId || !/^[a-zA-Z0-9:_-]{8,100}$/.test(input.sessionId)) return { ok: false, status: 400, error: "invalid_request" };
  const id = namespace.idFromName(JSON.stringify([input.identity.accountId, input.sessionId]));
  const response = await namespace.get(id).fetch("https://session.internal/internal", { method: "POST", body: JSON.stringify(input) });
  const result = await response.json() as RealtimeResult;
  return { ...result, ...(result.ok ? { objectId: id.toString() } : {}) };
}

export async function upgradeRealtime(request: Request, namespace: DurableObjectNamespace, allowedOrigin: string): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== allowedOrigin) return new Response("Forbidden", { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[a-f0-9]{64}$/.test(id)) return new Response("Invalid session", { status: 400 });
  return namespace.get(namespace.idFromString(id)).fetch(request);
}
