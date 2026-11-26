import assert from "node:assert/strict";
import test from "node:test";
import { buildWordProgress } from "../app/domain/progress-data.ts";
import type { AttemptEvent, HelpEventRecord } from "../app/domain/session-events.ts";
import type { SessionHistoryItem, SessionHistoryRecord } from "../app/domain/session-history.ts";

const date = "2026-11-05T10:00:00.000Z";
const attempt = (id: string, fields: Partial<AttemptEvent> = {}): AttemptEvent => ({
  id, sessionId: "session", sessionItemId: id, exerciseId: "quick:test", wordId: "gatto", answerId: "ok", correct: true, firstAttempt: true, mode: "test", createdAt: date, ...fields,
});
const historyItem = (id: string, kind: SessionHistoryItem["kind"]): SessionHistoryItem => ({
  id, exerciseId: "quick:test", exerciseTitle: "Rapido", kind, target: { itemId: "gatto", word: "Gatto", category: "Animali" },
  options: [], responses: [], helpLabels: [], firstCorrect: true,
});
const history: SessionHistoryRecord = {
  id: "session", childId: "child", therapistId: "therapist", title: "Rapido", source: "quick", mode: "test", presentation: "images", startedAt: date,
  completedAt: date, comment: "", items: [historyItem("turn", "articles")],
};
const help = (id: string, fields: Partial<HelpEventRecord> = {}): HelpEventRecord => ({
  id, exerciseId: "quick:test", wordId: "gatto", label: "Supporto storico", createdAt: date, ...fields,
});

test("un avvio rapido resta nella sua attività originale anche se l’esercizio non è stato salvato", () => {
  const result = buildWordProgress({ attempts: [attempt("turn")], histories: [history], helps: [], library: [], exercises: [], mode: "test" });
  assert.equal(result.rows[0].label, "Gatto");
  assert.equal(result.rows[0].category, "Animali");
  assert.deepEqual(result.rows[0].scores.articles, { correct: 1, total: 1, percent: 100 });
  assert.equal(result.rows[0].scores.recognition.total, 0);
  assert.equal(result.trendRecords[0].kind, "articles");
});

test("conteggia solo la modalità attiva e i primi tentativi, e mantiene gli aiuti storici", () => {
  const result = buildWordProgress({
    attempts: [
      attempt("fixed", { exerciseId: "fixed", wordId: undefined }), attempt("no", { firstAttempt: false }),
      attempt("teaching", { mode: "teaching", wordId: "pera" }), attempt("quantity", { wordId: "quantity:2" }),
      attempt("errorless", { quantityErrorless: true }),
    ],
    helps: [help("legacy"), help("teaching", { mode: "teaching", wordId: "pera" }), help("solo-aiuto", { wordId: "sole" })],
    histories: [], exercises: [{ id: "fixed", kind: "recognition", promptId: "gatto" }], library: [], mode: "test",
  });
  assert.deepEqual(result.rows.map(({ wordId, total, helpCount }) => [wordId, total, helpCount]), [["gatto", 1, 1], ["sole", 0, 1]]);
  assert.equal(result.helpsByWord.get("gatto")?.get("Supporto storico"), 1);
});
