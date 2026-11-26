import assert from "node:assert/strict";
import test from "node:test";
import { filterRows, nextSort, sortRows, statusCounts, type TableRow } from "../app/domain/progress-table.ts";

const row = (label: string, status: TableRow["status"], correct: number, total: number, recognition: number | null, helpCount = 0, category = "Cibi"): TableRow<"recognition" | "articles"> => ({
  wordId: label.toLowerCase(), label, category, status, correct, total, helpCount,
  scores: { recognition: { percent: recognition, total: recognition === null ? 0 : total, correct: recognition === null ? 0 : correct }, articles: { percent: null, total: 0, correct: 0 } },
});
const rows = [row("Mela", "secure", 4, 5, 80), row("Gatto", "reinforce", 1, 4, 25, 2, "Animali"), row("Pane", "growing", 3, 4, 75), row("Palla", "few", 2, 2, null), row("Àncora", "reinforce", 0, 3, 0)];

test("ordine iniziale per priorità: prima da rinforzare, poi in crescita, pochi dati, sicura", () => {
  assert.deepEqual(sortRows(rows, { key: "priority", direction: "asc" }).map((item) => item.label), ["Àncora", "Gatto", "Pane", "Palla", "Mela"]);
});

test("ordinamento per attività: le parole senza prove restano in fondo in entrambe le direzioni", () => {
  assert.deepEqual(sortRows(rows, { key: "recognition", direction: "desc" }).map((item) => item.label), ["Mela", "Pane", "Gatto", "Àncora", "Palla"]);
  assert.deepEqual(sortRows(rows, { key: "recognition", direction: "asc" }).map((item) => item.label), ["Àncora", "Gatto", "Pane", "Mela", "Palla"]);
  assert.deepEqual(sortRows(rows, { key: "articles", direction: "desc" }).map((item) => item.label), ["Àncora", "Gatto", "Mela", "Palla", "Pane"]);
});

test("ordinamento per parola e per aiuti", () => {
  assert.deepEqual(sortRows(rows, { key: "word", direction: "asc" }).map((item) => item.label), ["Àncora", "Gatto", "Mela", "Palla", "Pane"]);
  assert.equal(sortRows(rows, { key: "helps", direction: "desc" })[0].label, "Gatto");
});

test("filtri: ricerca senza accenti, stati multipli, categoria e attività", () => {
  const base = { query: "", statuses: [], category: "all", kind: "all" as const };
  assert.deepEqual(filterRows(rows, { ...base, query: "anc" }).map((item) => item.label), ["Àncora"]);
  assert.deepEqual(filterRows(rows, { ...base, statuses: ["reinforce", "growing"] }).map((item) => item.label), ["Gatto", "Pane", "Àncora"]);
  assert.deepEqual(filterRows(rows, { ...base, category: "Animali" }).map((item) => item.label), ["Gatto"]);
  assert.equal(filterRows(rows, { ...base, kind: "recognition" }).length, 4);
});

test("conteggi per stato e intestazioni che alternano la direzione", () => {
  assert.deepEqual(statusCounts(rows), { reinforce: 2, growing: 1, few: 1, secure: 1 });
  assert.deepEqual(nextSort({ key: "priority", direction: "asc" }, "recognition"), { key: "recognition", direction: "desc" });
  assert.deepEqual(nextSort({ key: "recognition", direction: "desc" }, "recognition"), { key: "recognition", direction: "asc" });
  assert.deepEqual(nextSort({ key: "priority", direction: "asc" }, "word"), { key: "word", direction: "asc" });
});
