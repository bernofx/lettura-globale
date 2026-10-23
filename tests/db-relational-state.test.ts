import assert from "node:assert/strict";
import test from "node:test";
import { loadRelationalProjection, prepareRelationalChange } from "../db/relational-state.ts";

test("loads all account-scoped relational tables and warnings in one read batch", async () => {
  let batches = 0;
  const database = {
    prepare(sql: string) { return { bind(...values: unknown[]) { return { sql, values }; } }; },
    async batch(statements: Array<{ sql: string; values: unknown[] }>) {
      batches++;
      assert.equal(statements.length, 21);
      for (const statement of statements) {
        assert.equal(statement.values[0], "account-demo");
        assert.match(statement.sql, /WHERE account_id = \?/);
      }
      return statements.map((statement) => ({ results: statement.sql.includes("data_migrations") ? [{ details: JSON.stringify({ warnings: ["archived_adult:demo", 99] }) }] : [] }));
    },
  };
  const projection = await loadRelationalProjection(database as never, "account-demo");
  assert.equal(batches, 1);
  assert.equal(Object.keys(projection.tables).length, 20);
  assert.deepEqual(projection.warnings, ["archived_adult:demo"]);
});

test("keeps ordered collection updates below the D1 binding limit", async () => {
  const prepared: Array<{ sql: string; bindings: unknown[] }> = [];
  const database = {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          const statement = { sql, bindings };
          prepared.push(statement);
          return statement;
        },
      };
    },
  };
  const library = Array.from({ length: 120 }, (_, position) => ({
    id: `word-${position}`,
    word: `Parola ${position}`,
    category: "Test",
    source: "Test",
    license: "Test",
    author: "Test",
  }));
  const state = {
    schemaVersion: 1,
    therapists: [], children: [], library, exercises: [], sequences: [], attempts: [], helps: [], sessionHistory: [],
  };
  const change = {
    schemaVersion: 1 as const,
    operationId: "12345678-1234-1234-1234-123456789abc",
    baseRevision: 1,
    collections: { library: { upserts: [library[0]], removedIds: [], order: library.map((item) => item.id) } },
    values: {},
  };

  await prepareRelationalChange({
    database: database as never,
    accountId: "account-1",
    email: "user@example.test",
    displayName: "Utente",
    rawState: JSON.stringify(state),
    state,
    change,
    sourceRevision: 2,
    operationId: change.operationId,
    now: Date.UTC(2026, 9, 20),
  });

  const positionUpdates = prepared.filter((statement) => statement.sql.startsWith("UPDATE `library_items` SET position"));
  assert.equal(positionUpdates.length, 5);
  assert.ok(positionUpdates.every((statement) => statement.bindings.length <= 100));
  const positions = positionUpdates.flatMap((statement) => {
    const rowCount = (statement.bindings.length - 3) / 3;
    return statement.bindings.slice(0, rowCount * 2).filter((_, index) => index % 2 === 1);
  });
  assert.deepEqual(positions, Array.from({ length: 120 }, (_, position) => position));
});
