import assert from "node:assert/strict";
import test from "node:test";
import { progressMonthOrdinal, trendByKind, trendByWord, trendSegments } from "../app/domain/progress-trend.ts";

const r = (wordId: string, kind: string, month: string, correct: boolean) => ({ wordId, kind, month, correct });
const records = [
  r("mela", "recognition", "2026-09", true), r("mela", "recognition", "2026-09", false), r("mela", "articles", "2026-10", true),
  r("gatto", "recognition", "2026-10", false), r("gatto", "recognition", "2026-11", true), r("pane", "articles", "2026-11", true),
];

test("una parola: una serie per attività con dati, mesi ordinati", () => {
  const trend = trendByKind(records, "mela", ["recognition", "articles", "naming"]);
  assert.deepEqual(trend.months, ["2026-09", "2026-10"]);
  assert.deepEqual(trend.series, [{ key: "recognition", values: [50, undefined] }, { key: "articles", values: [undefined, 100] }]);
});

test("confronto: una serie per parola, con filtro per attività", () => {
  const all = trendByWord(records, ["mela", "gatto"], "all");
  assert.deepEqual(all.months, ["2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(all.series, [{ key: "mela", values: [50, 100, undefined] }, { key: "gatto", values: [undefined, 0, 100] }]);
  const recognition = trendByWord(records, ["mela", "gatto", "pane"], "recognition");
  assert.deepEqual(recognition.series.map((item) => item.key), ["mela", "gatto"]);
});

test("il confronto si ferma a quattro parole", () => {
  const many = ["a", "b", "c", "d", "e"].map((word) => r(word, "recognition", "2026-10", true));
  assert.equal(trendByWord(many, ["a", "b", "c", "d", "e"], "all").series.length, 4);
});

test("ignora mesi non validi e attività escluse dall’asse", () => {
  const trend = trendByKind([...records, r("mela", "recognition", "2026-13", true)], "mela", ["recognition"]);
  assert.deepEqual(trend.months, ["2026-09"]);
  assert.equal(progressMonthOrdinal("2027-01")! - progressMonthOrdinal("2026-12")!, 1);
});

test("le linee si interrompono nei mesi senza prove per la serie", () => {
  assert.deepEqual(trendSegments(["2025-12", "2026-01", "2026-02", "2026-03", "2026-06"], [30, 50, undefined, 80, 100]), [
    [{ index: 0, value: 30 }, { index: 1, value: 50 }],
    [{ index: 3, value: 80 }],
    [{ index: 4, value: 100 }],
  ]);
});
