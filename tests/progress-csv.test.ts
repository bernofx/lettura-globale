import assert from "node:assert/strict";
import test from "node:test";
import { buildProgressCsv } from "../app/domain/progress-csv.ts";

test("genera un CSV compatibile con Excel italiano", () => {
  const csv = buildProgressCsv([{
    createdAt: "2026-10-21T12:30:00.000Z",
    exerciseId: "esercizio;con separatore",
    answerId: "risposta \"citata\"",
    correct: true,
    firstAttempt: false,
    mode: "test",
  }]);
  assert.ok(csv.startsWith("\uFEFFsep=;\r\n"));
  assert.match(csv, /"esercizio;con separatore"/);
  assert.match(csv, /"risposta ""citata"""/);
  assert.match(csv, /"Sì";"No";"Valutazione"\r\n$/);
  assert.equal(csv.includes("\n") && !csv.includes("\r\n"), false);
});

test("neutralizza le formule nei campi esportati", () => {
  const csv = buildProgressCsv([{
    createdAt: "2026-10-21T12:30:00.000Z",
    exerciseId: "=HYPERLINK(\"https://example.test\")",
    answerId: "+1",
    correct: false,
    firstAttempt: true,
    mode: "teaching",
  }]);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
  assert.match(csv, /"'\+1"/);
});
