import type { RemoteCommand, RemoteControllerEvent, RemoteSessionSnapshot } from "./remote-controller.ts";

export type ControllerTransport = "classic" | "do";
export type RealtimeIdentity = { accountId: string; adultId: string };
export type RealtimeAction = {
  action: "inspect" | "create" | "join" | "ticket" | "disconnect" | "close";
  identity: RealtimeIdentity;
  sessionId: string;
  childId?: string;
  snapshot?: RemoteSessionSnapshot;
  token?: string;
  controllerKey?: string;
  role?: "host" | "controller";
  since?: number;
};
export type RealtimeResult = {
  ok: boolean;
  status?: number;
  error?: string;
  childId?: string;
  sessionId?: string;
  token?: string;
  objectId?: string;
  ticket?: string;
  latestSequence?: number;
};
export type RealtimeService = { request(input: RealtimeAction): Promise<RealtimeResult> };
export type RealtimeMessage =
  | { type: "state"; status: string; connected: boolean; snapshot: RemoteSessionSnapshot | null }
  | { type: "events"; events: RemoteControllerEvent[] }
  | { type: "ack"; clientEventId: string; serverSequence: number }
  | { type: "error"; error: string; clientEventId?: string }
  | { type: "replaced" }
  | { type: "pong" };
export type RealtimeClientMessage =
  | { type: "ping" }
  | { type: "sync"; snapshot: RemoteSessionSnapshot }
  | { type: "command"; command: RemoteCommand };

export function realtimeControllerUrl(origin: string, token: string, sessionId: string) {
  const url = new URL(origin);
  url.searchParams.set("controller", token);
  url.searchParams.set("transport", "do");
  url.searchParams.set("session", sessionId);
  return url.toString();
}

export function parseRealtimeController(search: string) {
  const params = new URLSearchParams(search);
  const sessionId = params.get("session") ?? "";
  return params.get("transport") === "do" && /^[a-zA-Z0-9:_-]{8,100}$/.test(sessionId) ? sessionId : null;
}
