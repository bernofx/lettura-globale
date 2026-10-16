import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { userStates } from "../../../db/schema";

const MAX_STATE_BYTES = 4_000_000;

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });

  const rows = await getDb().select().from(userStates).where(eq(userStates.userId, user.userId)).limit(1);
  const row = rows[0];
  if (!row) return Response.json({ state: null, revision: 0, user: { email: user.email, name: user.displayName } });

  try {
    return Response.json({ state: JSON.parse(row.payload), revision: row.revision, user: { email: user.email, name: user.displayName } });
  } catch {
    return Response.json({ error: "invalid_saved_state" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_STATE_BYTES) return Response.json({ error: "state_too_large" }, { status: 413 });

  let state: unknown;
  try { state = JSON.parse(raw); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  if (!state || typeof state !== "object" || (state as { schemaVersion?: unknown }).schemaVersion !== 1) return Response.json({ error: "invalid_state" }, { status: 400 });

  const now = Date.now();
  const db = getDb();
  const existing = await db.select({ revision: userStates.revision, createdAt: userStates.createdAt }).from(userStates).where(eq(userStates.userId, user.userId)).limit(1);
  const revision = (existing[0]?.revision ?? 0) + 1;
  await db.insert(userStates).values({ userId: user.userId, email: user.email, payload: raw, schemaVersion: 1, revision, createdAt: existing[0]?.createdAt ?? now, updatedAt: now }).onConflictDoUpdate({ target: userStates.userId, set: { email: user.email, payload: raw, schemaVersion: 1, revision, updatedAt: now } });
  return Response.json({ ok: true, revision, updatedAt: now });
}
