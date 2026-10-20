import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { loadRelationalProjection, relationalMigrationRevision } from "../../../../db/relational-state";
import { userStates } from "../../../../db/schema";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { projectionCounts } from "../../../domain/relational-state";

function legacyCounts(value: unknown) {
  const state = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const count = (key: string) => Array.isArray(state[key]) ? state[key].length : 0;
  return { adult_profiles: count("therapists"), children: count("children"), library_items: count("library"), exercises: count("exercises"), sequences: count("sequences"), attempts: count("attempts"), help_events: count("helps"), sessions: count("sessionHistory") };
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });
  if (!env.DB) return Response.json({ error: "database_unavailable" }, { status: 503 });
  const snapshot = (await getDb().select({ payload: userStates.payload, revision: userStates.revision }).from(userStates).where(eq(userStates.userId, user.userId)).limit(1))[0];
  if (!snapshot) return Response.json({ status: "empty", snapshotRevision: 0, relationalRevision: 0 });

  try {
    const legacy = legacyCounts(JSON.parse(snapshot.payload));
    const projection = await loadRelationalProjection(env.DB, user.userId);
    const projected = projectionCounts(projection);
    const comparableProjected: Record<string, number> = { ...projected, adult_profiles: projection.tables.adult_profiles.filter((row) => row.deleted_at === null).length, children: projection.tables.children.filter((row) => row.deleted_at === null).length };
    const mismatches = Object.entries(legacy).filter(([key, value]) => comparableProjected[key] !== value).map(([key]) => key);
    const relationalRevision = await relationalMigrationRevision(env.DB, user.userId);
    return Response.json({
      status: relationalRevision === snapshot.revision && mismatches.length === 0 ? "ready" : "pending",
      snapshotRevision: snapshot.revision,
      relationalRevision,
      counts: projected,
      mismatches,
      warningCount: projection.warnings.length,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ status: "error", snapshotRevision: snapshot.revision }, { status: 500, headers: { "cache-control": "private, no-store" } });
  }
}
