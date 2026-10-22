import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { loginRateLimits, therapistCredentials, userStates } from "../../../db/schema";
import { CHATGPT_SESSION_COOKIE, CHATGPT_SESSION_DURATION_SECONDS, createCloudSession, hashText } from "../../chatgpt-auth";
import { loginRetryAfterSeconds, nextLoginFailure, type LoginRateState } from "../../domain/login-rate-limit";
import { verifyStoredPin } from "../../domain/pin-credentials";

type SavedTherapist = { id: string; email: string; firstName?: string; lastName?: string; pinHash?: string };

async function rateLimitKeys(request: Request, loginEmail: string) {
  const network = request.headers.get("cf-connecting-ip")?.slice(0, 64) || "unknown";
  return Promise.all([hashText(`email:${loginEmail}`), hashText(`network:${network}`)]);
}

async function readRateLimit(keys: string[]) {
  const rows = await getDb().select().from(loginRateLimits).where(inArray(loginRateLimits.keyHash, keys));
  return rows.map((row) => ({ windowStartedAt: row.windowStartedAt, failedAttempts: row.failedAttempts, blockedUntil: row.blockedUntil }));
}

async function recordFailedLogin(keys: string[], now: number) {
  const db = getDb();
  const existing = new Map((await db.select().from(loginRateLimits).where(inArray(loginRateLimits.keyHash, keys))).map((row) => [row.keyHash, row]));
  await Promise.all(keys.map((keyHash) => {
    const previous = existing.get(keyHash);
    const next = nextLoginFailure(previous ? {
      windowStartedAt: previous.windowStartedAt,
      failedAttempts: previous.failedAttempts,
      blockedUntil: previous.blockedUntil,
    } satisfies LoginRateState : undefined, now);
    return db.insert(loginRateLimits).values({ keyHash, ...next, updatedAt: now }).onConflictDoUpdate({
      target: loginRateLimits.keyHash,
      set: { windowStartedAt: next.windowStartedAt, failedAttempts: next.failedAttempts, blockedUntil: next.blockedUntil, updatedAt: now },
    });
  }));
}

async function invalidCredentials(keys: string[], now: number) {
  await recordFailedLogin(keys, now);
  const retryAfter = loginRetryAfterSeconds(await readRateLimit(keys), now);
  if (retryAfter) return Response.json({ error: "too_many_attempts" }, { status: 429, headers: { "retry-after": String(retryAfter) } });
  return Response.json({ error: "invalid_credentials" }, { status: 401 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 2048) return Response.json({ error: "invalid_request" }, { status: 400 });
  let input: { email?: unknown; pin?: unknown };
  try { input = JSON.parse(raw); } catch { return Response.json({ error: "invalid_request" }, { status: 400 }); }
  if (typeof input.email !== "string" || typeof input.pin !== "string") return Response.json({ error: "invalid_request" }, { status: 400 });

  const loginEmail = input.email.trim().toLowerCase();
  if (!loginEmail || loginEmail.length > 320 || !/^\d{4,8}$/.test(input.pin)) return Response.json({ error: "invalid_credentials" }, { status: 401 });
  const now = Date.now();
  const keys = await rateLimitKeys(request, loginEmail);
  const retryAfter = loginRetryAfterSeconds(await readRateLimit(keys), now);
  if (retryAfter) return Response.json({ error: "too_many_attempts" }, { status: 429, headers: { "retry-after": String(retryAfter) } });

  const db = getDb();
  let credential = (await db.select().from(therapistCredentials).where(eq(therapistCredentials.loginEmail, loginEmail)).limit(1))[0];

  if (!credential) {
    const rows = (await db.select().from(userStates)).sort((left, right) => {
      const leftService = left.email.includes("screenshot-service") ? 1 : 0;
      const rightService = right.email.includes("screenshot-service") ? 1 : 0;
      return leftService - rightService || right.updatedAt - left.updatedAt;
    });
    for (const row of rows) {
      let therapists: SavedTherapist[] = [];
      try { therapists = (JSON.parse(row.payload) as { therapists?: SavedTherapist[] }).therapists ?? []; } catch { continue; }
      for (const item of therapists) {
        if (item.email?.trim().toLowerCase() !== loginEmail || !item.pinHash || !await verifyStoredPin(input.pin, item.pinHash)) continue;
        const displayName = `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim() || loginEmail;
        credential = { loginEmail, ownerUserId: row.userId, therapistId: item.id, pinHash: item.pinHash, displayName, updatedAt: now };
        await db.insert(therapistCredentials).values(credential).onConflictDoUpdate({ target: therapistCredentials.loginEmail, set: credential });
        break;
      }
      if (credential) break;
    }
  }

  if (!credential || !await verifyStoredPin(input.pin, credential.pinHash)) return invalidCredentials(keys, now);
  await db.delete(loginRateLimits).where(inArray(loginRateLimits.keyHash, keys));
  const token = await createCloudSession({ userId: credential.ownerUserId, email: loginEmail, displayName: credential.displayName, fullName: credential.displayName }, credential.therapistId);
  const response = Response.json({ ok: true, therapistId: credential.therapistId });
  response.headers.append("set-cookie", `${CHATGPT_SESSION_COOKIE}=${token}; Path=/; Max-Age=${CHATGPT_SESSION_DURATION_SECONDS}; HttpOnly; Secure; SameSite=Lax`);
  return response;
}
