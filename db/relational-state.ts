import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { RELATIONAL_MIGRATION_KEY, projectLegacyState, projectionCounts, rebuildLegacyState, type RelationalProjection } from "../app/domain/relational-state.ts";
import type { StateChangeRequest, StateCollectionName } from "../app/domain/state-changes.ts";

const INSERT_ORDER = [
  "adult_profiles", "children", "adult_child_access", "account_preferences", "categories", "media_assets", "library_items",
  "exercises", "exercise_items", "exercise_categories", "sequences", "sequence_exercises", "sessions", "session_items",
  "session_item_content", "session_item_responses", "session_item_help_labels", "attempts", "attempt_options", "help_events",
] as const;

const DELETE_ORDER = [...INSERT_ORDER].reverse();

function insertStatement(database: D1Database, table: string, row: Record<string, string | number | null>) {
  const columns = Object.keys(row);
  const sql = `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
  return database.prepare(sql).bind(...columns.map((column) => row[column]));
}

type RelationalTable = keyof RelationalProjection["tables"];
type RelationalRow = Record<string, string | number | null>;

const PRIMARY_KEYS: Record<RelationalTable, string[]> = {
  adult_profiles: ["account_id", "id"], children: ["account_id", "id"], adult_child_access: ["account_id", "adult_id", "child_id"],
  account_preferences: ["account_id"], categories: ["account_id", "name"], media_assets: ["account_id", "id"], library_items: ["account_id", "id"],
  exercises: ["account_id", "id"], exercise_items: ["account_id", "exercise_id", "role", "library_item_id"], exercise_categories: ["account_id", "exercise_id", "role", "category_name"],
  sequences: ["account_id", "id"], sequence_exercises: ["account_id", "sequence_id", "position"], sessions: ["account_id", "id"], session_items: ["account_id", "id"],
  session_item_content: ["account_id", "session_item_id", "role", "position"], session_item_responses: ["account_id", "session_item_id", "position"],
  session_item_help_labels: ["account_id", "session_item_id", "position"], attempts: ["account_id", "id"], attempt_options: ["account_id", "attempt_id", "position"], help_events: ["account_id", "id"],
};

export function relationalShadowMatches(state: unknown, actual: RelationalProjection, accountId: string) {
  return relationalProjectionMatches(projectLegacyState(state, accountId), actual);
}

export function relationalProjectionMatches(expected: RelationalProjection, actual: RelationalProjection) {
  return INSERT_ORDER.every((table) => {
    if (expected.tables[table].length !== actual.tables[table].length) return false;
    const identity = (row: RelationalRow) => JSON.stringify(PRIMARY_KEYS[table].map((key) => row[key]));
    const wanted = expected.tables[table].map(identity).sort();
    const found = actual.tables[table].map(identity).sort();
    return wanted.every((key, index) => key === found[index]);
  });
}

function guardedUpsert(database: D1Database, table: RelationalTable, row: RelationalRow, accountId: string, operationId: string) {
  const columns = Object.keys(row);
  const updates = columns.filter((column) => !PRIMARY_KEYS[table].includes(column) && column !== "created_at");
  const sql = `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(", ")}) SELECT ${columns.map(() => "?").join(", ")} WHERE EXISTS (SELECT 1 FROM state_operations WHERE account_id = ? AND operation_id = ?) ON CONFLICT (${PRIMARY_KEYS[table].map((column) => `\`${column}\``).join(", ")}) DO UPDATE SET ${updates.map((column) => `\`${column}\` = excluded.\`${column}\``).join(", ")}`;
  return database.prepare(sql).bind(...columns.map((column) => row[column]), accountId, operationId);
}

function guardedDelete(database: D1Database, table: RelationalTable, where: string, values: Array<string | number>, accountId: string, operationId: string) {
  return database.prepare(`DELETE FROM \`${table}\` WHERE account_id = ? AND ${where} AND EXISTS (SELECT 1 FROM state_operations WHERE account_id = ? AND operation_id = ?)`).bind(accountId, ...values, accountId, operationId);
}

function guardedStageUnique(database: D1Database, table: RelationalTable, column: string, idColumn: string, ids: string[], accountId: string, operationId: string) {
  if (!ids.length) return null;
  return database.prepare(`UPDATE \`${table}\` SET \`${column}\` = ? || \`${idColumn}\` WHERE account_id = ? AND \`${idColumn}\` IN (${ids.map(() => "?").join(", ")}) AND EXISTS (SELECT 1 FROM state_operations WHERE account_id = ? AND operation_id = ?)`).bind(`pending-${accountId}-${operationId}-`, accountId, ...ids, accountId, operationId);
}

const POSITION_ROWS_PER_STATEMENT = 25;

function positionStatements(database: D1Database, table: RelationalTable, rows: RelationalRow[], accountId: string, operationId: string) {
  const statements: D1PreparedStatement[] = [];
  for (let start = 0; start < rows.length; start += POSITION_ROWS_PER_STATEMENT) {
    const chunk = rows.slice(start, start + POSITION_ROWS_PER_STATEMENT);
    const sql = `UPDATE \`${table}\` SET position = CASE id ${chunk.map(() => "WHEN ? THEN ?").join(" ")} ELSE position END WHERE account_id = ? AND id IN (${chunk.map(() => "?").join(", ")}) AND EXISTS (SELECT 1 FROM state_operations WHERE account_id = ? AND operation_id = ?)`;
    statements.push(database.prepare(sql).bind(...chunk.flatMap((row) => [String(row.id), Number(row.position)]), accountId, ...chunk.map((row) => String(row.id)), accountId, operationId));
  }
  return statements;
}

function collectionIds(change: StateChangeRequest, key: StateCollectionName) {
  const value = change.collections[key];
  return value ? [...new Set([...value.upserts.map((item) => item.id), ...value.removedIds])] : [];
}

export function relationalTablesForChange(change: StateChangeRequest) {
  const tables = new Set<RelationalTable>();
  const add = (...names: RelationalTable[]) => names.forEach((name) => tables.add(name));
  if (change.collections.therapists) add("adult_profiles", "adult_child_access");
  if (change.collections.children) add("children", "adult_child_access");
  if (change.collections.library) add("categories", "media_assets", "library_items", "exercise_items");
  if (change.collections.exercises) add("categories", "exercises", "exercise_items", "exercise_categories", "sequence_exercises");
  if (change.collections.sequences) add("adult_profiles", "sequences", "sequence_exercises");
  if (change.collections.sessionHistory) add("adult_profiles", "children", "sessions", "session_items", "session_item_content", "session_item_responses", "session_item_help_labels");
  if (change.collections.attempts) add("adult_profiles", "children", "attempts", "attempt_options");
  if (change.collections.helps) add("adult_profiles", "children", "help_events");
  if (Object.keys(change.values).length) add("account_preferences");
  return [...tables];
}

/** Builds guarded, entity-scoped relational writes to join the snapshot revision batch atomically. */
export async function prepareRelationalChange(options: {
  database: D1Database; accountId: string; email: string; displayName: string; rawState: string; state: unknown;
  change: StateChangeRequest; sourceRevision: number; operationId: string; now: number;
}) {
  const { database, accountId, operationId, change, now } = options;
  const projection = projectLegacyState(options.state, accountId, now);
  const tables = projection.tables;
  const statements: D1PreparedStatement[] = [];
  const upsert = (table: RelationalTable, rows: RelationalRow[]) => rows.forEach((row) => statements.push(guardedUpsert(database, table, row, accountId, operationId)));
  const rowsByIds = (table: RelationalTable, ids: string[]) => tables[table].filter((row) => ids.includes(String(row.id))) as RelationalRow[];

  statements.push(database.prepare("INSERT INTO accounts (id, email, display_name, created_at, updated_at) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM state_operations WHERE account_id = ? AND operation_id = ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at")
    .bind(accountId, options.email, options.displayName, now, now, accountId, operationId));

  // New historical references can require archived parents even when profiles did not change.
  if (change.collections.sequences || change.collections.sessionHistory || change.collections.attempts || change.collections.helps) {
    upsert("adult_profiles", tables.adult_profiles.filter((row) => row.deleted_at !== null));
  }
  if (change.collections.sessionHistory || change.collections.attempts || change.collections.helps) {
    upsert("children", tables.children.filter((row) => row.deleted_at !== null));
  }

  const therapistIds = collectionIds(change, "therapists");
  if (change.collections.therapists) {
    for (const id of therapistIds) statements.push(guardedDelete(database, "adult_child_access", "adult_id = ?", [id], accountId, operationId));
    const stageEmails = guardedStageUnique(database, "adult_profiles", "email_normalized", "id", change.collections.therapists.upserts.map((item) => item.id), accountId, operationId);
    if (stageEmails) statements.push(stageEmails);
    upsert("adult_profiles", rowsByIds("adult_profiles", therapistIds));
    statements.push(...positionStatements(database, "adult_profiles", tables.adult_profiles.filter((row) => change.collections.therapists!.order.includes(String(row.id))), accountId, operationId));
  }
  const childIds = collectionIds(change, "children");
  if (change.collections.children) {
    for (const id of change.collections.children.removedIds) statements.push(guardedDelete(database, "adult_child_access", "child_id = ?", [id], accountId, operationId));
    upsert("children", rowsByIds("children", childIds));
    statements.push(...positionStatements(database, "children", tables.children.filter((row) => change.collections.children!.order.includes(String(row.id))), accountId, operationId));
  }
  if (change.collections.therapists) upsert("adult_child_access", tables.adult_child_access.filter((row) => therapistIds.includes(String(row.adult_id))));

  if (change.collections.library || change.collections.exercises) {
    const categoryNames = tables.categories.map((row) => String(row.name));
    statements.push(database.prepare(`UPDATE categories SET normalized_name = ? || name WHERE account_id = ? AND name NOT IN (${categoryNames.map(() => "?").join(", ")}) AND EXISTS (SELECT 1 FROM state_operations WHERE account_id = ? AND operation_id = ?)`).bind(`pending-${accountId}-${operationId}-`, accountId, ...categoryNames, accountId, operationId));
    upsert("categories", tables.categories);
  }

  const libraryIds = collectionIds(change, "library");
  if (change.collections.library) {
    upsert("media_assets", rowsByIds("media_assets", libraryIds));
    upsert("library_items", rowsByIds("library_items", libraryIds));
    for (const id of change.collections.library.removedIds) {
      statements.push(guardedDelete(database, "exercise_items", "library_item_id = ?", [id], accountId, operationId));
    }
    statements.push(...positionStatements(database, "library_items", tables.library_items.filter((row) => change.collections.library!.order.includes(String(row.id))), accountId, operationId));
  }

  const exerciseIds = collectionIds(change, "exercises");
  if (change.collections.exercises) {
    for (const id of exerciseIds) {
      statements.push(guardedDelete(database, "exercise_items", "exercise_id = ?", [id], accountId, operationId));
      statements.push(guardedDelete(database, "exercise_categories", "exercise_id = ?", [id], accountId, operationId));
    }
    for (const id of change.collections.exercises.removedIds) statements.push(guardedDelete(database, "sequence_exercises", "exercise_id = ?", [id], accountId, operationId));
    upsert("exercises", rowsByIds("exercises", exerciseIds));
    for (const id of change.collections.exercises.removedIds) statements.push(guardedDelete(database, "exercises", "id = ?", [id], accountId, operationId));
    upsert("exercise_items", tables.exercise_items.filter((row) => exerciseIds.includes(String(row.exercise_id))));
    upsert("exercise_categories", tables.exercise_categories.filter((row) => exerciseIds.includes(String(row.exercise_id))));
    statements.push(...positionStatements(database, "exercises", tables.exercises.filter((row) => change.collections.exercises!.order.includes(String(row.id))), accountId, operationId));
  }

  const sequenceIds = collectionIds(change, "sequences");
  if (change.collections.sequences) {
    for (const id of sequenceIds) statements.push(guardedDelete(database, "sequence_exercises", "sequence_id = ?", [id], accountId, operationId));
    upsert("sequences", rowsByIds("sequences", sequenceIds));
    for (const id of change.collections.sequences.removedIds) statements.push(guardedDelete(database, "sequences", "id = ?", [id], accountId, operationId));
    upsert("sequence_exercises", tables.sequence_exercises.filter((row) => sequenceIds.includes(String(row.sequence_id))));
    statements.push(...positionStatements(database, "sequences", tables.sequences.filter((row) => change.collections.sequences!.order.includes(String(row.id))), accountId, operationId));
  }

  const sessionIds = collectionIds(change, "sessionHistory");
  if (change.collections.sessionHistory) {
    for (const id of sessionIds) statements.push(guardedDelete(database, "session_items", "session_id = ?", [id], accountId, operationId));
    upsert("sessions", rowsByIds("sessions", sessionIds));
    for (const id of change.collections.sessionHistory.removedIds) statements.push(guardedDelete(database, "sessions", "id = ?", [id], accountId, operationId));
    const sessionItems = tables.session_items.filter((row) => sessionIds.includes(String(row.session_id)));
    const sessionItemIds = new Set(sessionItems.map((row) => String(row.id)));
    upsert("session_items", sessionItems);
    upsert("session_item_content", tables.session_item_content.filter((row) => sessionItemIds.has(String(row.session_item_id))));
    upsert("session_item_responses", tables.session_item_responses.filter((row) => sessionItemIds.has(String(row.session_item_id))));
    upsert("session_item_help_labels", tables.session_item_help_labels.filter((row) => sessionItemIds.has(String(row.session_item_id))));
    statements.push(...positionStatements(database, "sessions", tables.sessions.filter((row) => change.collections.sessionHistory!.order.includes(String(row.id))), accountId, operationId));
  }

  const attemptIds = collectionIds(change, "attempts");
  if (change.collections.attempts) {
    for (const id of attemptIds) statements.push(guardedDelete(database, "attempt_options", "attempt_id = ?", [id], accountId, operationId));
    upsert("attempts", rowsByIds("attempts", attemptIds));
    for (const id of change.collections.attempts.removedIds) statements.push(guardedDelete(database, "attempts", "id = ?", [id], accountId, operationId));
    upsert("attempt_options", tables.attempt_options.filter((row) => attemptIds.includes(String(row.attempt_id))));
    statements.push(...positionStatements(database, "attempts", tables.attempts.filter((row) => change.collections.attempts!.order.includes(String(row.id))), accountId, operationId));
  }

  const helpIds = collectionIds(change, "helps");
  if (change.collections.helps) {
    upsert("help_events", rowsByIds("help_events", helpIds));
    for (const id of change.collections.helps.removedIds) statements.push(guardedDelete(database, "help_events", "id = ?", [id], accountId, operationId));
    statements.push(...positionStatements(database, "help_events", tables.help_events.filter((row) => change.collections.helps!.order.includes(String(row.id))), accountId, operationId));
  }

  if (Object.keys(change.values).length) upsert("account_preferences", tables.account_preferences);

  // Parent deletions run after all dependent collections have reached their final state.
  if (change.collections.library) {
    for (const id of change.collections.library.removedIds) statements.push(guardedDelete(database, "library_items", "id = ?", [id], accountId, operationId));
    for (const id of libraryIds.filter((id) => !tables.media_assets.some((row) => row.id === id))) statements.push(guardedDelete(database, "media_assets", "id = ?", [id], accountId, operationId));
  }
  if (change.collections.therapists) for (const id of change.collections.therapists.removedIds.filter((id) => !tables.adult_profiles.some((row) => row.id === id))) statements.push(guardedDelete(database, "adult_profiles", "id = ?", [id], accountId, operationId));
  if (change.collections.children) for (const id of change.collections.children.removedIds.filter((id) => !tables.children.some((row) => row.id === id))) statements.push(guardedDelete(database, "children", "id = ?", [id], accountId, operationId));
  if (change.collections.library || change.collections.exercises) {
    const categoryNames = tables.categories.map((row) => String(row.name));
    statements.push(database.prepare(`DELETE FROM categories WHERE account_id = ? AND name NOT IN (${categoryNames.map(() => "?").join(", ")}) AND EXISTS (SELECT 1 FROM state_operations WHERE account_id = ? AND operation_id = ?)`).bind(accountId, ...categoryNames, accountId, operationId));
  }

  const sourceChecksum = await stateChecksum(options.rawState);
  statements.push(database.prepare("INSERT INTO data_migrations (account_id, migration_key, source_revision, source_checksum, status, details, started_at, completed_at) SELECT ?, ?, ?, ?, 'verified', ?, ?, ? WHERE EXISTS (SELECT 1 FROM state_operations WHERE account_id = ? AND operation_id = ?) ON CONFLICT(account_id, migration_key) DO UPDATE SET source_revision = excluded.source_revision, source_checksum = excluded.source_checksum, status = excluded.status, details = excluded.details, started_at = excluded.started_at, completed_at = excluded.completed_at")
    .bind(accountId, RELATIONAL_MIGRATION_KEY, options.sourceRevision, sourceChecksum, JSON.stringify({ counts: projectionCounts(projection), warnings: projection.warnings, writeMode: "direct", touchedTables: relationalTablesForChange(change) }), now, now, accountId, operationId));
  return { statements, counts: projectionCounts(projection), warnings: projection.warnings };
}

export async function stateChecksum(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function relationalMigrationRevision(database: D1Database, accountId: string) {
  const row = await relationalMigrationInfo(database, accountId);
  return row?.source_revision ?? 0;
}

export async function relationalMigrationInfo(database: D1Database, accountId: string) {
  return database.prepare("SELECT source_revision, source_checksum, details FROM data_migrations WHERE account_id = ? AND migration_key = ? AND status = 'verified'").bind(accountId, RELATIONAL_MIGRATION_KEY).first<{ source_revision: number; source_checksum: string; details: string | null }>();
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
  const sourceChecksum = await stateChecksum(options.rawState);
  const statements: D1PreparedStatement[] = [
    options.database.prepare("INSERT INTO accounts (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at").bind(options.accountId, options.email, options.displayName, now, now),
  ];
  for (const table of DELETE_ORDER) statements.push(options.database.prepare(`DELETE FROM \`${table}\` WHERE account_id = ?`).bind(options.accountId));
  for (const table of INSERT_ORDER) for (const row of projection.tables[table]) statements.push(insertStatement(options.database, table, row));
  statements.push(options.database.prepare("INSERT INTO data_migrations (account_id, migration_key, source_revision, source_checksum, status, details, started_at, completed_at) VALUES (?, ?, ?, ?, 'verified', ?, ?, ?) ON CONFLICT(account_id, migration_key) DO UPDATE SET source_revision = excluded.source_revision, source_checksum = excluded.source_checksum, status = excluded.status, details = excluded.details, started_at = excluded.started_at, completed_at = excluded.completed_at").bind(options.accountId, RELATIONAL_MIGRATION_KEY, options.sourceRevision, sourceChecksum, JSON.stringify({ counts: projectionCounts(projection), warnings: projection.warnings }), now, now));
  await options.database.batch(statements);
  return { counts: projectionCounts(projection), warnings: projection.warnings };
}

/** Fills missing shadow rows without deleting user data; the snapshot stays authoritative until every identity is present. */
export async function repairRelationalShadow(options: Parameters<typeof persistRelationalShadow>[0]) {
  const now = options.now ?? Date.now();
  const projection = projectLegacyState(options.state, options.accountId, now);
  const sourceChecksum = await stateChecksum(options.rawState);
  const statements: D1PreparedStatement[] = [
    options.database.prepare("INSERT INTO accounts (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, updated_at = excluded.updated_at").bind(options.accountId, options.email, options.displayName, now, now),
  ];
  for (const table of INSERT_ORDER) for (const row of projection.tables[table]) {
    const columns = Object.keys(row);
    const updates = columns.filter((column) => !PRIMARY_KEYS[table].includes(column) && column !== "created_at");
    const sql = `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(", ")}) SELECT ${columns.map(() => "?").join(", ")} WHERE true ON CONFLICT (${PRIMARY_KEYS[table].map((column) => `\`${column}\``).join(", ")}) DO UPDATE SET ${updates.map((column) => `\`${column}\` = excluded.\`${column}\``).join(", ")}`;
    statements.push(options.database.prepare(sql).bind(...columns.map((column) => row[column])));
  }
  for (let start = 0; start < statements.length; start += 100) {
    try {
      await options.database.batch(statements.slice(start, start + 100));
    } catch (error) {
      console.error("relational_shadow_batch_failed", { batchIndex: Math.floor(start / 100), sqliteCode: error instanceof Error ? error.message.match(/SQLITE_[A-Z_]+/)?.[0] ?? "unknown" : "unknown" });
      throw error;
    }
  }
  const persisted = await loadRelationalProjection(options.database, options.accountId);
  if (!relationalProjectionMatches(projection, persisted)) throw new Error("relational_shadow_identity_mismatch");
  await options.database.prepare("INSERT INTO data_migrations (account_id, migration_key, source_revision, source_checksum, status, details, started_at, completed_at) SELECT ?, ?, ?, ?, 'verified', ?, ?, ? WHERE EXISTS (SELECT 1 FROM user_states WHERE user_id = ? AND revision = ? AND payload = ?) ON CONFLICT(account_id, migration_key) DO UPDATE SET source_revision = excluded.source_revision, source_checksum = excluded.source_checksum, status = excluded.status, details = excluded.details, started_at = excluded.started_at, completed_at = excluded.completed_at")
    .bind(options.accountId, RELATIONAL_MIGRATION_KEY, options.sourceRevision, sourceChecksum, JSON.stringify({ counts: projectionCounts(projection), warnings: projection.warnings, writeMode: "repair" }), now, now, options.accountId, options.sourceRevision, options.rawState).run();
  const marker = await relationalMigrationInfo(options.database, options.accountId);
  if (marker?.source_revision !== options.sourceRevision || marker.source_checksum !== sourceChecksum) throw new Error("relational_shadow_source_changed");
  return { counts: projectionCounts(projection), warnings: projection.warnings };
}

export async function loadRelationalProjection(database: D1Database, accountId: string): Promise<RelationalProjection> {
  const statements = INSERT_ORDER.map((table) => database.prepare(`SELECT * FROM \`${table}\` WHERE account_id = ?`).bind(accountId));
  statements.push(database.prepare("SELECT details FROM data_migrations WHERE account_id = ? AND migration_key = ?").bind(accountId, RELATIONAL_MIGRATION_KEY));
  const results = await database.batch<Record<string, string | number | null>>(statements);
  const entries = INSERT_ORDER.map((table, index) => [table, results[index].results] as const);
  const migration = results[INSERT_ORDER.length].results[0];
  let warnings: string[] = [];
  try {
    const details = JSON.parse(String(migration?.details ?? "{}")) as { warnings?: unknown };
    if (Array.isArray(details.warnings)) warnings = details.warnings.filter((item): item is string => typeof item === "string");
  } catch { /* invalid diagnostics do not affect persisted data */ }
  return { tables: Object.fromEntries(entries) as RelationalProjection["tables"], warnings };
}

export async function loadRelationalState(database: D1Database, accountId: string) {
  return rebuildLegacyState(await loadRelationalProjection(database, accountId));
}
