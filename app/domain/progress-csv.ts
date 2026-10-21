export type ProgressCsvAttempt = {
  createdAt: string;
  exerciseId: string;
  answerId: string;
  correct: boolean;
  firstAttempt: boolean;
  mode: "teaching" | "test";
};

function excelSafeText(value: unknown) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown) {
  return `"${excelSafeText(value).replaceAll('"', '""')}"`;
}

export function buildProgressCsv(attempts: ProgressCsvAttempt[]) {
  const rows = attempts.map((item) => [
    item.createdAt,
    item.exerciseId,
    item.answerId,
    item.correct ? "Sì" : "No",
    item.firstAttempt ? "Sì" : "No",
    item.mode === "test" ? "Valutazione" : "Insegnamento",
  ]);
  const header = ["data", "esercizio", "risposta", "corretto", "primo_tentativo", "modalita"];
  return `\uFEFFsep=;\r\n${[header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}
