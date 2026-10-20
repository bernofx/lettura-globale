import assert from "node:assert/strict";
import test from "node:test";
import { prepareRelationalChange } from "../db/relational-state.ts";

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
