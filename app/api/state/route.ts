import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { therapistCredentials, userStates } from "../../../db/schema";
import { loadRelationalProjection, persistRelationalShadow, relationalMigrationInfo, relationalShadowMatches, repairRelationalShadow, stateChecksum } from "../../../db/relational-state";
import { rebuildLegacyState, relationalParityReport } from "../../domain/relational-state";
import { authorizeStateTransition } from "../../domain/state-authorization";
import { adultRoleInState, stateVisibleToAdult } from "../../domain/state-visibility";
import { stateReadHeaders, stateReadMatches, stateReadTag } from "../../domain/state-read";

const MAX_STATE_BYTES = 4_000_000;

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401, headers: stateReadHeaders() });

  // Authenticate first; account/profile-scoped validators never reuse another adult's view.
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) {
    const metadata = (await getDb().select({ revision: userStates.revision }).from(userStates).where(eq(userStates.userId, user.userId)).limit(1))[0];
    if (metadata) {
      const tag = await stateReadTag(user.userId, user.adultProfileId, metadata.revision);
      if (stateReadMatches(ifNoneMatch, tag)) return new Response(null, { status: 304, headers: stateReadHeaders(tag) });
    }
  }

  const rows = await getDb().select().from(userStates).where(eq(userStates.userId, user.userId)).limit(1);
  const row = rows[0];
  if (!row) return Response.json({ state: null, revision: 0, user: { email: user.email, name: user.displayName } }, { headers: stateReadHeaders() });

  try {
    const state = JSON.parse(row.payload) as unknown;
    let responseState = state;
    let relationalStatus = "pending";
    let dataSource = "snapshot";
    try {
      if (env.DB) {
        const checksum = await stateChecksum(row.payload);
        let projection = await loadRelationalProjection(env.DB, user.userId);
        let migration = await relationalMigrationInfo(env.DB, user.userId);
        let relationalRevision = migration?.source_revision ?? 0;
        let parity = relationalParityReport(state, projection, row.revision, relationalRevision, migration?.source_checksum === checksum);
        // A previous partial direct write can leave a current migration marker
        // while whole collections are absent. Repair that case as well as stale revisions.
        if (relationalRevision < row.revision || !parity.sourceChecksumMatches || !relationalShadowMatches(state, projection, user.userId)) {
          await repairRelationalShadow({ database: env.DB, accountId: user.userId, email: row.email, displayName: user.displayName, rawState: row.payload, state, sourceRevision: row.revision });
          projection = await loadRelationalProjection(env.DB, user.userId);
          migration = await relationalMigrationInfo(env.DB, user.userId);
          relationalRevision = migration?.source_revision ?? 0;
          parity = relationalParityReport(state, projection, row.revision, relationalRevision, migration?.source_checksum === checksum);
        }
        relationalStatus = parity.ready ? "ready" : "pending";
        if (parity.ready) {
          const rebuilt = rebuildLegacyState(projection) as Record<string, unknown>;
          // Before audio preferences became cloud-backed, the browser copy was the
          // only authoritative source. Keep the field absent for those snapshots so
          // the client can migrate its existing local selection instead of replacing
          // it with relational defaults.
          if (!(state && typeof state === "object" && "soundPreferences" in state)) delete rebuilt.soundPreferences;
          responseState = rebuilt;
          dataSource = "relational";
        }
      }
    } catch (error) {
      const sqliteCode = error instanceof Error ? error.message.match(/SQLITE_[A-Z_]+/)?.[0] : undefined;
      console.error("relational_shadow_repair_failed", { revision: row.revision, sqliteCode: sqliteCode ?? "unknown" });
      relationalStatus = "pending";
    }
    if (user.adultProfileId) responseState = stateVisibleToAdult(responseState, user.adultProfileId);
    return Response.json({ state: responseState, revision: row.revision, relationalStatus, dataSource, user: { email: user.email, name: user.displayName } }, { headers: stateReadHeaders(relationalStatus === "ready" ? await stateReadTag(user.userId, user.adultProfileId, row.revision) : undefined) });
  } catch {
    return Response.json({ error: "invalid_saved_state" }, { status: 500, headers: stateReadHeaders() });
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });

  const rawBaseRevision = request.headers.get("x-base-revision");
  const baseRevision = rawBaseRevision === null ? Number.NaN : Number(rawBaseRevision);
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0) return Response.json({ error: "base_revision_required" }, { status: 428 });
  if (!env.DB) return Response.json({ error: "database_unavailable" }, { status: 503 });
  const database = env.DB;

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
  const existing = await db.select({ revision: userStates.revision, payload: userStates.payload }).from(userStates).where(eq(userStates.userId, user.userId)).limit(1);
  const currentRevision = existing[0]?.revision ?? 0;
  if (currentRevision !== baseRevision) return Response.json({ error: "revision_conflict", currentRevision }, { status: 409 });
  // The account owner may initialize an empty account before selecting an adult
  // profile. Every replacement of an existing state requires an adult session.
  if (currentRevision > 0 && !user.adultProfileId) return Response.json({ error: "adult_authentication_required" }, { status: 403 });
  if (existing[0]?.payload && user.adultProfileId) {
    const currentState = JSON.parse(existing[0].payload);
    if (adultRoleInState(currentState, user.adultProfileId) !== "Amministratore") return Response.json({ error: "full_state_replacement_forbidden" }, { status: 403 });
    const authorization = authorizeStateTransition(currentState, state, user.adultProfileId);
    if (!authorization.allowed) return Response.json({ error: "state_change_forbidden", reason: authorization.reason }, { status: 403 });
  }
  const revision = baseRevision + 1;
  const stateExists = "EXISTS (SELECT 1 FROM user_states WHERE user_id = ? AND revision = ? AND payload = ?)";
  const statements = [
    database.prepare(`INSERT INTO user_states (user_id, email, payload, schema_version, revision, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, payload = excluded.payload, schema_version = 1,
        revision = excluded.revision, updated_at = excluded.updated_at
      WHERE user_states.revision = ?`)
      .bind(user.userId, user.email, raw, revision, now, now, baseRevision),
    database.prepare(`DELETE FROM therapist_credentials WHERE owner_user_id = ? AND ${stateExists}`)
      .bind(user.userId, user.userId, revision, raw),
    ...credentials.map((credential) => database.prepare(`INSERT INTO therapist_credentials
      (login_email, owner_user_id, therapist_id, pin_hash, display_name, updated_at)
      SELECT ?, ?, ?, ?, ?, ? WHERE ${stateExists}`)
      .bind(credential.loginEmail, credential.ownerUserId, credential.therapistId, credential.pinHash, credential.displayName, credential.updatedAt, user.userId, revision, raw)),
  ];
  const results = await database.batch(statements);
  if (!results[0]?.meta.changes) {
    const latest = await db.select({ revision: userStates.revision }).from(userStates).where(eq(userStates.userId, user.userId)).limit(1);
    return Response.json({ error: "revision_conflict", currentRevision: latest[0]?.revision ?? 0 }, { status: 409 });
  }
  let relational: Awaited<ReturnType<typeof persistRelationalShadow>> | null = null;
  try {
    if (env.DB) relational = await persistRelationalShadow({ database: env.DB, accountId: user.userId, email: user.email, displayName: user.displayName, rawState: raw, state, sourceRevision: revision, now });
  } catch (error) {
    // The versioned snapshot remains authoritative during the shadow period.
    const sqliteCode = error instanceof Error ? error.message.match(/SQLITE_[A-Z_]+/)?.[0] : undefined;
    console.error("relational_shadow_initialization_failed", { revision, sqliteCode: sqliteCode ?? "unknown" });
  }
  return Response.json({ ok: true, revision, updatedAt: now, relationalStatus: relational ? "verified" : "pending" });
}
