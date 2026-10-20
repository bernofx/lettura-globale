import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { applyStateChange, parseStateChangeRequest } from "../../../domain/state-changes";
import { getDb } from "../../../../db";
import { therapistCredentials, userStates } from "../../../../db/schema";
import { persistRelationalShadow, stateChecksum } from "../../../../db/relational-state";

const MAX_CHANGE_BYTES = 4_000_000;
const MAX_STATE_BYTES = 4_000_000;

type Credential = {
  loginEmail: string;
  ownerUserId: string;
  therapistId: string;
  pinHash: string;
  displayName: string;
  updatedAt: number;
};

function credentialsFromState(state: unknown, ownerUserId: string, now: number): Credential[] {
  const therapists = (state as { therapists?: Array<{ id?: string; email?: string; firstName?: string; lastName?: string; pinHash?: string }> }).therapists ?? [];
  return therapists.filter((item) => item.id && item.email && item.pinHash).map((item) => ({
    loginEmail: item.email!.trim().toLowerCase(), ownerUserId, therapistId: item.id!, pinHash: item.pinHash!,
    displayName: `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim() || item.email!.trim().toLowerCase(), updatedAt: now,
  }));
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_unavailable" }, { status: 503 });
  const database = env.DB;

  const rawRequest = await request.text();
  if (new TextEncoder().encode(rawRequest).byteLength > MAX_CHANGE_BYTES) return Response.json({ error: "change_too_large" }, { status: 413 });
  let change;
  try { change = parseStateChangeRequest(JSON.parse(rawRequest)); } catch { return Response.json({ error: "invalid_state_change" }, { status: 400 }); }

  const requestChecksum = await stateChecksum(rawRequest);
  const prior = await database.prepare("SELECT result_revision, request_checksum FROM state_operations WHERE account_id = ? AND operation_id = ?")
    .bind(user.userId, change.operationId).first<{ result_revision: number; request_checksum: string }>();
  if (prior) {
    if (prior.request_checksum !== requestChecksum) return Response.json({ error: "operation_id_reused" }, { status: 409 });
    return Response.json({ ok: true, revision: prior.result_revision, idempotent: true });
  }

  const current = (await getDb().select({ payload: userStates.payload, revision: userStates.revision, createdAt: userStates.createdAt })
    .from(userStates).where(eq(userStates.userId, user.userId)).limit(1))[0];
  if (!current) return Response.json({ error: "state_not_initialized" }, { status: 409, headers: { "x-current-revision": "0" } });
  if (current.revision !== change.baseRevision) return Response.json({ error: "revision_conflict", currentRevision: current.revision }, { status: 409 });

  let state: unknown;
  try { state = applyStateChange(JSON.parse(current.payload), change); } catch { return Response.json({ error: "invalid_state_change" }, { status: 400 }); }
  const rawState = JSON.stringify(state);
  if (new TextEncoder().encode(rawState).byteLength > MAX_STATE_BYTES) return Response.json({ error: "state_too_large" }, { status: 413 });

  const now = Date.now();
  const revision = current.revision + 1;
  const credentials = credentialsFromState(state, user.userId, now);
  if (new Set(credentials.map((item) => item.loginEmail)).size !== credentials.length) return Response.json({ error: "duplicate_therapist_email" }, { status: 409 });
  const db = getDb();
  for (const item of credentials) {
    const existing = (await db.select({ ownerUserId: therapistCredentials.ownerUserId }).from(therapistCredentials).where(eq(therapistCredentials.loginEmail, item.loginEmail)).limit(1))[0];
    if (existing && existing.ownerUserId !== user.userId) return Response.json({ error: "therapist_email_unavailable" }, { status: 409 });
  }

  const statements = [
    database.prepare("UPDATE user_states SET email = ?, payload = ?, schema_version = 1, revision = ?, updated_at = ? WHERE user_id = ? AND revision = ?")
      .bind(user.email, rawState, revision, now, user.userId, current.revision),
    database.prepare("INSERT INTO state_operations (account_id, operation_id, base_revision, result_revision, request_checksum, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM user_states WHERE user_id = ? AND revision = ? AND payload = ?)")
      .bind(user.userId, change.operationId, current.revision, revision, requestChecksum, now, user.userId, revision, rawState),
    database.prepare("DELETE FROM therapist_credentials WHERE owner_user_id = ? AND EXISTS (SELECT 1 FROM state_operations WHERE account_id = ? AND operation_id = ?)")
      .bind(user.userId, user.userId, change.operationId),
    ...credentials.map((credential) => database.prepare("INSERT INTO therapist_credentials (login_email, owner_user_id, therapist_id, pin_hash, display_name, updated_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM state_operations WHERE account_id = ? AND operation_id = ?)")
      .bind(credential.loginEmail, credential.ownerUserId, credential.therapistId, credential.pinHash, credential.displayName, credential.updatedAt, user.userId, change.operationId)),
  ];
  await database.batch(statements);
  const recorded = await database.prepare("SELECT result_revision FROM state_operations WHERE account_id = ? AND operation_id = ?")
    .bind(user.userId, change.operationId).first<{ result_revision: number }>();
  if (!recorded) {
    const latest = await database.prepare("SELECT revision FROM user_states WHERE user_id = ?").bind(user.userId).first<{ revision: number }>();
    return Response.json({ error: "revision_conflict", currentRevision: latest?.revision ?? 0 }, { status: 409 });
  }

  let relationalStatus = "pending";
  try {
    await persistRelationalShadow({ database, accountId: user.userId, email: user.email, displayName: user.displayName, rawState, state, sourceRevision: revision, now });
    relationalStatus = "verified";
  } catch { /* the compatible snapshot can rebuild the relational projection on the next read */ }
  return Response.json({ ok: true, revision, updatedAt: now, relationalStatus, idempotent: false });
}
