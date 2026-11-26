import { progressAttemptLookup, type ProgressHistory } from "./progress-data.ts";

export type ProgressCsvAttempt = {
  id?: string;
  sessionId?: string;
  sessionItemId?: string;
  createdAt: string;
  exerciseId: string;
  wordId?: string;
  answerId: string;
  correct: boolean;
  firstAttempt: boolean;
  quantityErrorless?: boolean;
  mode: "teaching" | "test";
};

export type ProgressCsvExercise = {
  id: string;
  title: string;
  kind?: "recognition" | "articles" | "word-categories" | "naming" | "number-quantity" | "sentence-matching";
  promptId?: string;
};

export type ProgressCsvLibraryItem = { id: string; word: string };
export type ProgressCsvContext = { exercises?: ProgressCsvExercise[]; library?: ProgressCsvLibraryItem[]; histories?: ProgressHistory[] };
type ProgressKind = NonNullable<ProgressCsvExercise["kind"]>;

const kindLabels: Record<ProgressKind, string> = {
  recognition: "Trova la parola",
  articles: "Articolo IL / LA",
  "word-categories": "Parola nella categoria",
  naming: "Mix and vary",
  "number-quantity": "Numero quantità",
  "sentence-matching": "Abbina la frase",
};

function excelSafeText(value: unknown) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown) {
  return `"${excelSafeText(value).replaceAll('"', '""')}"`;
}

function percent(correct: number, total: number) {
  return total ? Math.round(correct / total * 100) : "";
}

function acquisitionStatus(correct: number, total: number) {
  if (total < 5) return "Dati insufficienti";
  const accuracy = Math.round(correct / total * 100);
  if (accuracy >= 80) return "Acquisita";
  if (accuracy >= 50) return "In consolidamento";
  return "Da esercitare";
}

function latestDate(attempts: ProgressCsvAttempt[]) {
  return attempts.reduce((latest, attempt) => attempt.createdAt > latest ? attempt.createdAt : latest, "");
}

function encodeUtf16Le(text: string) {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < text.length; index += 1) view.setUint16(2 + index * 2, text.charCodeAt(index), true);
  return bytes;
}

export function buildProgressCsv(attempts: ProgressCsvAttempt[], context: ProgressCsvContext = {}) {
  const itemMap = new Map((context.library ?? []).map((item) => [item.id, item.word]));
  const describe = progressAttemptLookup(context.exercises ?? [], context.histories ?? []);
  const entries = attempts.map((attempt) => {
    const { kind, wordId, target, title } = describe(attempt);
    return { attempt, kind, wordId, title, word: wordId ? itemMap.get(wordId) ?? target?.word ?? wordId : "" };
  });
  const firstAttempts = entries.filter(({ attempt }) => attempt.firstAttempt && !attempt.quantityErrorless);
  const errorlessAttempts = attempts.filter((attempt) => attempt.firstAttempt && attempt.quantityErrorless);
  const summaryHeader = ["ambito", "parola", "competenza", "prove_valutazione", "corrette_valutazione", "accuratezza_valutazione_percento", "stato", "prove_insegnamento", "corrette_insegnamento", "accuratezza_insegnamento_percento", "ultima_prova"];
  const summaryRow = (scope: string, word: string, kind: ProgressKind, matching: ProgressCsvAttempt[]) => {
    const evaluation = matching.filter((attempt) => attempt.mode === "test");
    const teaching = matching.filter((attempt) => attempt.mode === "teaching");
    const evaluationCorrect = evaluation.filter((attempt) => attempt.correct).length;
    const teachingCorrect = teaching.filter((attempt) => attempt.correct).length;
    return [scope, word, kindLabels[kind], evaluation.length, evaluationCorrect, percent(evaluationCorrect, evaluation.length), acquisitionStatus(evaluationCorrect, evaluation.length), teaching.length, teachingCorrect, percent(teachingCorrect, teaching.length), latestDate(matching)];
  };

  const byKind = new Map<ProgressKind, ProgressCsvAttempt[]>();
  const byWord = new Map<string, { word: string; kind: ProgressKind; attempts: ProgressCsvAttempt[] }>();
  for (const { attempt, kind, wordId, word } of firstAttempts) {
    const skill = byKind.get(kind) ?? [];
    skill.push(attempt);
    byKind.set(kind, skill);
    if (!wordId) continue;
    const key = `${wordId}\u0000${kind}`;
    const group = byWord.get(key) ?? { word, kind, attempts: [] };
    group.attempts.push(attempt);
    byWord.set(key, group);
  }
  const skillRows = [...byKind].sort(([left], [right]) => kindLabels[left].localeCompare(kindLabels[right], "it"))
    .map(([kind, matching]) => summaryRow("Competenza", "Tutte", kind, matching));
  const wordRows = [...byWord.values()].map(({ word, kind, attempts }) => summaryRow("Parola", word, kind, attempts))
    .sort((a, b) => String(a[1]).localeCompare(String(b[1]), "it") || String(a[2]).localeCompare(String(b[2]), "it"));

  const detailHeader = ["data", "esercizio_id", "esercizio", "competenza", "parola", "risposta", "corretto", "primo_tentativo", "modalita", "apprendimento_senza_errori"];
  const detailRows = entries.map(({ attempt, kind, title, word }) => [
    attempt.createdAt, attempt.exerciseId, title, kindLabels[kind], word, itemMap.get(attempt.answerId) ?? attempt.answerId, attempt.correct ? "Sì" : "No",
    attempt.firstAttempt ? "Sì" : "No", attempt.mode === "test" ? "Valutazione" : "Insegnamento", attempt.quantityErrorless ? "Sì" : "No",
  ]);
  const sections = [
    [["RIEPILOGO PER PAROLA E COMPETENZA"], summaryHeader, ...skillRows, ...wordRows],
    [["LEGENDA"], ["Acquisita: almeno 5 prove in valutazione e accuratezza almeno 80%. In consolidamento: almeno 5 prove e accuratezza dal 50% al 79%. Da esercitare: almeno 5 prove e accuratezza sotto il 50%. L'insegnamento resta separato dalla valutazione."]],
    [["APPRENDIMENTO SENZA ERRORI · NUMERO QUANTITÀ"], ["modalita", "prove", "corrette"], ...(["test", "teaching"] as const).map((mode) => { const matching = errorlessAttempts.filter((attempt) => attempt.mode === mode); return [mode === "test" ? "Valutazione" : "Insegnamento", matching.length, matching.filter((attempt) => attempt.correct).length]; }), ["Prove guidate escluse dai riepiloghi di acquisizione e accuratezza autonoma."]],
    [["DETTAGLIO TENTATIVI"], detailHeader, ...detailRows],
  ];
  return `\uFEFFsep=;\r\n${sections.map((section) => section.map((row) => row.map(csvCell).join(";")).join("\r\n")).join("\r\n\r\n")}\r\n`;
}

export function buildExcelProgressCsv(attempts: ProgressCsvAttempt[], context: ProgressCsvContext = {}) {
  return encodeUtf16Le(buildProgressCsv(attempts, context).replace(/^\uFEFF/, ""));
}
