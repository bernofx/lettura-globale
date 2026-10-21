import { env } from "cloudflare:workers";
import { getChatGPTUser, hashText, type ChatGPTUser } from "../../chatgpt-auth";

export type ControllerSessionRow = {
  account_id: string;
  session_id: string;
  child_id: string;
  owner_adult_id: string;
  pairing_token_hash: string;
  pairing_expires_at: number;
  status: "waiting" | "pending" | "connected" | "closed";
  pending_adult_id: string | null;
  pending_adult_name: string | null;
  controller_key_hash: string | null;
  controller_last_seen_at: number | null;
  latest_sequence: number;
  snapshot_json: string;
  created_at: number;
  updated_at: number;
};

export async function authenticatedAdult(): Promise<ChatGPTUser & { adultProfileId: string } | null> {
  const user = await getChatGPTUser();
  return user?.adultProfileId ? { ...user, adultProfileId: user.adultProfileId } : null;
}

export async function adultCanAccessChild(user: ChatGPTUser & { adultProfileId: string }, childId: string) {
  if (!env.DB) return false;
  const row = await env.DB.prepare("SELECT 1 AS allowed FROM adult_child_access WHERE account_id = ? AND adult_id = ? AND child_id = ? LIMIT 1")
    .bind(user.userId, user.adultProfileId, childId).first<{ allowed: number }>();
  return Boolean(row?.allowed);
}

export async function loadControllerSession(accountId: string, sessionId: string) {
  if (!env.DB) return null;
  return env.DB.prepare("SELECT * FROM remote_controller_sessions WHERE account_id = ? AND session_id = ? LIMIT 1")
    .bind(accountId, sessionId).first<ControllerSessionRow>();
}

export async function validateController(row: ControllerSessionRow, user: ChatGPTUser & { adultProfileId: string }, controllerKey: string | null) {
  if (!controllerKey || !/^[a-f0-9]{64}$/.test(controllerKey) || row.pending_adult_id !== user.adultProfileId || !row.controller_key_hash) return false;
  return row.controller_key_hash === await hashText(controllerKey);
}

export function noStoreJson(value: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "private, no-store");
  return Response.json(value, { ...init, headers });
}

export async function readJson(request: Request, maxBytes = 16_384) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return null;
  try { return JSON.parse(raw) as unknown; } catch { return null; }
}

export function randomHex(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
