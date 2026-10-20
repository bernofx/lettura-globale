import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { RELATIONAL_MIGRATION_KEY, projectLegacyState, projectionCounts } from "../app/domain/relational-state";

const INSERT_ORDER = [
  "adult_profiles", "children", "adult_child_access", "account_preferences", "categories", "media_assets", "library_items",
  "exercises", "exercise_items", "exercise_categories", "sequences", "sequence_exercises", "sessions", "session_items",
  "session_item_content", "attempts", "help_events",
] as const;

const DELETE_ORDER = [...INSERT_ORDER].reverse();

function insertStatement(database: D1Database, table: string, row: Record<string, string | number | null>) {
  const columns = Object.keys(row);
  const sql = `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
  return database.prepare(sql).bind(...columns.map((column) => row[column]));
}

async function checksum(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function relationalMigrationRevision(database: D1Database, accountId: string) {
  const row = await database.prepare("SELECT source_revision FROM data_migrations WHERE account_id = ? AND migration_key = ? AND status = 'verified'").bind(accountId, RELATIONAL_MIGRATION_KEY).first<{ source_revision: number }>();
  return row?.source_revision ?? 0;
}

/** Replaces one account's shadow rows in a single D1 batch transaction. */
export async function persistRelationalShadow(options: {
  database: D1Database;
  accountId: string;
  email: string;
  displayName: string;
  rawState: string;
  state: unknown;
  sourceRevision: number;
  now?: number;
}) {
  const now = options.now ?? Date.now();
  const projection = projectLegacyState(options.state, options.accountId, now);
  const sourceChecksum = await checksum(options.rawState);
  const statements: D1PreparedStatement[] = [
    options.database.prepare("INSERT INTO accounts (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at").bind(options.accountId, options.email, options.displayName, now, now),
  ];
  for (const table of DELETE_ORDER) statements.push(options.database.prepare(`DELETE FROM \`${table}\` WHERE account_id = ?`).bind(options.accountId));
  for (const table of INSERT_ORDER) for (const row of projection.tables[table]) statements.push(insertStatement(options.database, table, row));
  statements.push(options.database.prepare("INSERT INTO data_migrations (account_id, migration_key, source_revision, source_checksum, status, details, started_at, completed_at) VALUES (?, ?, ?, ?, 'verified', ?, ?, ?) ON CONFLICT(account_id, migration_key) DO UPDATE SET source_revision = excluded.source_revision, source_checksum = excluded.source_checksum, status = excluded.status, details = excluded.details, started_at = excluded.started_at, completed_at = excluded.completed_at").bind(options.accountId, RELATIONAL_MIGRATION_KEY, options.sourceRevision, sourceChecksum, JSON.stringify({ counts: projectionCounts(projection), warnings: projection.warnings }), now, now));
  await options.database.batch(statements);
  return { counts: projectionCounts(projection), warnings: projection.warnings };
}
