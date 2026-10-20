import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { therapistCredentials, userStates } from "../../../db/schema";
import { loadRelationalProjection, persistRelationalShadow, relationalMigrationInfo, relationalMigrationRevision, stateChecksum } from "../../../db/relational-state";
import { rebuildLegacyState, relationalParityReport } from "../../domain/relational-state";

const MAX_STATE_BYTES = 4_000_000;

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });

  const rows = await getDb().select().from(userStates).where(eq(userStates.userId, user.userId)).limit(1);
  const row = rows[0];
  if (!row) return Response.json({ state: null, revision: 0, user: { email: user.email, name: user.displayName } });

  try {
    const state = JSON.parse(row.payload) as unknown;
    let responseState = state;
    let relationalStatus = "pending";
    let dataSource = "snapshot";
    try {
      let relationalRevision = env.DB ? await relationalMigrationRevision(env.DB, user.userId) : 0;
      if (env.DB && relationalRevision < row.revision) {
        await persistRelationalShadow({ database: env.DB, accountId: user.userId, email: row.email, displayName: user.displayName, rawState: row.payload, state, sourceRevision: row.revision });
        relationalRevision = row.revision;
      }
      if (env.DB) {
        const projection = await loadRelationalProjection(env.DB, user.userId);
        const migration = await relationalMigrationInfo(env.DB, user.userId);
        const parity = relationalParityReport(state, projection, row.revision, relationalRevision, migration?.source_checksum === await stateChecksum(row.payload));
        relationalStatus = parity.ready ? "ready" : "pending";
        if (parity.ready) {
          responseState = rebuildLegacyState(projection);
          dataSource = "relational";
        }
      }
    } catch {
      relationalStatus = "pending";
    }
    return Response.json({ state: responseState, revision: row.revision, relationalStatus, dataSource, user: { email: user.email, name: user.displayName } });
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
  const therapists = (state as { therapists?: Array<{ id?: string; email?: string; firstName?: string; lastName?: string; pinHash?: string }> }).therapists ?? [];
  const credentials = therapists.filter((item) => item.id && item.email && item.pinHash).map((item) => ({
    loginEmail: item.email!.trim().toLowerCase(),
    ownerUserId: user.userId,
    therapistId: item.id!,
    pinHash: item.pinHash!,
    displayName: `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim() || item.email!.trim().toLowerCase(),
    updatedAt: now,
  }));
  if (new Set(credentials.map((item) => item.loginEmail)).size !== credentials.length) return Response.json({ error: "duplicate_therapist_email" }, { status: 409 });
  for (const item of credentials) {
    const existingCredential = (await db.select({ ownerUserId: therapistCredentials.ownerUserId }).from(therapistCredentials).where(eq(therapistCredentials.loginEmail, item.loginEmail)).limit(1))[0];
    if (existingCredential && existingCredential.ownerUserId !== user.userId) return Response.json({ error: "therapist_email_unavailable" }, { status: 409 });
  }
  const existing = await db.select({ revision: userStates.revision, createdAt: userStates.createdAt }).from(userStates).where(eq(userStates.userId, user.userId)).limit(1);
  const revision = (existing[0]?.revision ?? 0) + 1;
  await db.insert(userStates).values({ userId: user.userId, email: user.email, payload: raw, schemaVersion: 1, revision, createdAt: existing[0]?.createdAt ?? now, updatedAt: now }).onConflictDoUpdate({ target: userStates.userId, set: { email: user.email, payload: raw, schemaVersion: 1, revision, updatedAt: now } });
  await db.delete(therapistCredentials).where(eq(therapistCredentials.ownerUserId, user.userId));
  for (const credential of credentials) await db.insert(therapistCredentials).values(credential);
  let relational: Awaited<ReturnType<typeof persistRelationalShadow>> | null = null;
  try {
    if (env.DB) relational = await persistRelationalShadow({ database: env.DB, accountId: user.userId, email: user.email, displayName: user.displayName, rawState: raw, state, sourceRevision: revision, now });
  } catch {
    // The versioned snapshot remains authoritative during the shadow period.
  }
  return Response.json({ ok: true, revision, updatedAt: now, relationalStatus: relational ? "verified" : "pending" });
}
