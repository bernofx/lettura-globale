import assert from "node:assert/strict";
import test from "node:test";
import { buildExcelProgressCsv, buildProgressCsv, type ProgressCsvAttempt } from "../app/domain/progress-csv.ts";

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

test("aggiunge riepiloghi per competenza e parola usando solo i primi tentativi", () => {
  const attempts: ProgressCsvAttempt[] = [
    ...Array.from({ length: 5 }, (_, index) => ({
      createdAt: `2026-10-${String(10 + index).padStart(2, "0")}T12:00:00.000Z`,
      exerciseId: "exercise-1", wordId: "word-1", answerId: index < 4 ? "word-1" : "word-2",
      correct: index < 4, firstAttempt: true, mode: "test" as const,
    })),
    { createdAt: "2026-10-14T12:00:02.000Z", exerciseId: "exercise-1", wordId: "word-1", answerId: "word-1", correct: true, firstAttempt: false, mode: "test" },
    { createdAt: "2026-10-15T12:00:00.000Z", exerciseId: "exercise-1", wordId: "word-1", answerId: "word-1", correct: true, firstAttempt: true, mode: "teaching" },
  ];
  const csv = buildProgressCsv(attempts, {
    exercises: [{ id: "exercise-1", title: "Trova Mela", kind: "recognition", promptId: "word-1" }],
    library: [{ id: "word-1", word: "Mela" }, { id: "word-2", word: "Pera" }],
  });
  assert.match(csv, /"Competenza";"Tutte";"Trova la parola";"5";"4";"80";"Acquisita";"1";"1";"100"/);
  assert.match(csv, /"Parola";"Mela";"Trova la parola";"5";"4";"80";"Acquisita";"1";"1";"100"/);
  assert.match(csv, /"exercise-1";"Trova Mela";"Trova la parola";"Mela";"Pera"/);
});

test("codifica il file Excel in UTF-16LE senza colonne finali vuote", () => {
  const bytes = buildExcelProgressCsv([{
    createdAt: "2026-10-21T12:30:00.000Z", exerciseId: "exercise-1", wordId: "word-1", answerId: "word-1", correct: true, firstAttempt: true, mode: "test",
  }], { exercises: [{ id: "exercise-1", title: "Esercizio", kind: "recognition" }], library: [{ id: "word-1", word: "Città" }] });
  assert.deepEqual([...bytes.slice(0, 2)], [0xff, 0xfe]);
  const decoded = new TextDecoder("utf-16le").decode(bytes);
  assert.match(decoded, /"Sì";"Sì";"Valutazione"/);
  assert.equal(decoded.split("\r\n").filter((line) => line !== "sep=;").some((line) => line.endsWith(";")), false);
});
