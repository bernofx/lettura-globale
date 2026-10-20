import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { therapistCredentials, userStates } from "../../../db/schema";
import { CHATGPT_SESSION_COOKIE, CHATGPT_SESSION_DURATION_SECONDS, createCloudSession, hashText } from "../../chatgpt-auth";

type SavedTherapist = { id: string; email: string; firstName?: string; lastName?: string; pinHash?: string; pin?: string };

export async function POST(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 2048) return Response.json({ error: "invalid_request" }, { status: 400 });
  let input: { email?: unknown; pin?: unknown };
  try { input = JSON.parse(raw); } catch { return Response.json({ error: "invalid_request" }, { status: 400 }); }
  if (typeof input.email !== "string" || typeof input.pin !== "string") return Response.json({ error: "invalid_request" }, { status: 400 });

  const loginEmail = input.email.trim().toLowerCase();
  const submittedHash = await hashText(input.pin);
  const db = getDb();
  let credential = (await db.select().from(therapistCredentials).where(eq(therapistCredentials.loginEmail, loginEmail)).limit(1))[0];

  if (!credential) {
    const rows = await db.select().from(userStates);
    const candidates = rows.flatMap((row) => {
      try {
        const state = JSON.parse(row.payload) as { therapists?: SavedTherapist[] };
        return (state.therapists ?? []).filter((item) => item.email?.trim().toLowerCase() === loginEmail && (item.pinHash === submittedHash || item.pin === input.pin)).map((item) => ({ row, item }));
      } catch { return []; }
    }).sort((left, right) => {
      const leftService = left.row.email.includes("screenshot-service") ? 1 : 0;
      const rightService = right.row.email.includes("screenshot-service") ? 1 : 0;
      return leftService - rightService || right.row.updatedAt - left.row.updatedAt;
    });
    const selected = candidates[0];
    if (selected) {
      const displayName = `${selected.item.firstName ?? ""} ${selected.item.lastName ?? ""}`.trim() || loginEmail;
      credential = { loginEmail, ownerUserId: selected.row.userId, therapistId: selected.item.id, pinHash: selected.item.pinHash ?? submittedHash, displayName, updatedAt: Date.now() };
      await db.insert(therapistCredentials).values(credential).onConflictDoUpdate({ target: therapistCredentials.loginEmail, set: credential });
    }
  }

  if (!credential || credential.pinHash !== submittedHash) return Response.json({ error: "invalid_credentials" }, { status: 401 });
  const token = await createCloudSession({ userId: credential.ownerUserId, email: loginEmail, displayName: credential.displayName, fullName: credential.displayName }, credential.therapistId);
  const response = Response.json({ ok: true, therapistId: credential.therapistId });
  response.headers.append("set-cookie", `${CHATGPT_SESSION_COOKIE}=${token}; Path=/; Max-Age=${CHATGPT_SESSION_DURATION_SECONDS}; HttpOnly; Secure; SameSite=Lax`);
  return response;
}
