import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { loadRelationalProjection, relationalMigrationInfo, stateChecksum } from "../../../../db/relational-state";
import { userStates } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { relationalParityReport } from "../../../domain/relational-state";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_unavailable" }, { status: 503 });
  const snapshot = (await getDb().select({ payload: userStates.payload, revision: userStates.revision }).from(userStates).where(eq(userStates.userId, user.userId)).limit(1))[0];
  if (!snapshot) return Response.json({ status: "empty", snapshotRevision: 0, relationalRevision: 0 });

  try {
    const state = JSON.parse(snapshot.payload) as unknown;
    const projection = await loadRelationalProjection(env.DB, user.userId);
    const migration = await relationalMigrationInfo(env.DB, user.userId);
    const report = relationalParityReport(state, projection, snapshot.revision, migration?.source_revision ?? 0, migration?.source_checksum === await stateChecksum(snapshot.payload));
    let writeMode = "shadow";
    try {
      const details = JSON.parse(migration?.details ?? "{}") as { writeMode?: unknown };
      if (details.writeMode === "direct") writeMode = "direct";
    } catch { /* diagnostics remain available when legacy details are malformed */ }
    return Response.json({
      status: report.ready ? "ready" : "pending",
      writeMode,
      ...report,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ status: "error", snapshotRevision: snapshot.revision }, { status: 500, headers: { "cache-control": "private, no-store" } });
  }
}
