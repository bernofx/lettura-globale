import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { projectLegacyState, rebuildLegacyState } from "../app/domain/relational-state.ts";
import { statePerformanceFixture } from "./fixtures/state-performance.ts";

test("1000 turni ricostruiti con output identico alla versione precedente e scansioni lineari", () => {
  const projection = projectLegacyState(statePerformanceFixture(1000), "demo", Date.UTC(2026, 9, 20));
  let reads = 0;
  for (const [rows, key] of [[projection.tables.attempt_options, "attempt_id"], [projection.tables.session_item_content, "session_item_id"]] as const) {
    for (const row of rows) {
      const value = row[key];
      Object.defineProperty(row, key, { enumerable: true, get() { reads++; return value; } });
    }
  }
  const rebuilt = rebuildLegacyState(projection);
  // Golden digest measured against the original implementation on this exact synthetic fixture.
  assert.equal(createHash("sha256").update(JSON.stringify(rebuilt)).digest("hex"), "10f47c4d542ebbbb6ef7141eadaf7009b9c53c627b696defebf76dbd6f5ecd02");
  const rowCount = projection.tables.attempt_options.length + projection.tables.session_item_content.length;
  assert.ok(reads <= rowCount * 2, "ogni chiave viene indicizzata una sola volta, non riletta per ogni turno");
  assert.equal(rebuilt.attempts.length, 1000);
  assert.equal(rebuilt.sessionHistory.length, 100);
  projection.tables.session_item_responses[0].label_snapshot = "Updated";
  const responses = rebuildLegacyState(projection).sessionHistory[0].items[0].responses as Array<{ label: string }>;
  assert.equal(responses[0].label, "Updated", "nessuna cache di dati fra richieste");
});
