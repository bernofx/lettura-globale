import type { SessionActivity, SessionExercise } from "./session-compilation";
import type { AttemptEvent, HelpEventRecord, SessionMode } from "./session-events";
import type { SessionHistoryRecord } from "./session-history";
import { wordProgressStatus } from "./progress-status.ts";
import type { TableRow, TableScore } from "./progress-table";
import type { TrendRecord } from "./progress-trend";

export type WordActivity = Exclude<SessionActivity, "number-quantity">;
export type ProgressExercise = Pick<SessionExercise, "id" | "kind" | "promptId"> & { title?: string };
type AttemptReference = Pick<AttemptEvent, "exerciseId" | "wordId" | "sessionId" | "sessionItemId" | "quantityErrorless"> & { id?: string };
export type ProgressHistory = Pick<SessionHistoryRecord, "id" | "items">;

export function progressAttemptLookup(exercises: readonly ProgressExercise[], histories: readonly ProgressHistory[]) {
  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const historyBySession = new Map(histories.map((history) => [history.id, new Map(history.items.map((item) => [item.id, item]))]));
  return (attempt: AttemptReference) => {
    const exercise = exerciseById.get(attempt.exerciseId);
    const sessionItemId = attempt.sessionItemId ?? attempt.id;
    const history = attempt.sessionId && sessionItemId ? historyBySession.get(attempt.sessionId)?.get(sessionItemId) : undefined;
    const legacyArticle = attempt.exerciseId.startsWith("article-");
    const targetId = attempt.wordId || history?.target?.itemId || (legacyArticle ? attempt.exerciseId.slice(8) : exercise?.promptId);
    const quantity = targetId?.startsWith("quantity:") || attempt.quantityErrorless;
    const kind: SessionActivity = quantity ? "number-quantity" : history?.kind ?? exercise?.kind ?? (legacyArticle ? "articles" : "recognition");
    const wordId = kind === "number-quantity" ? undefined : targetId;
    const target = history?.target?.itemId === wordId ? history?.target : undefined;
    return { kind, wordId, target, title: history?.exerciseTitle ?? exercise?.title ?? attempt.exerciseId };
  };
}

type Input = {
  attempts: readonly AttemptEvent[];
  helps: readonly HelpEventRecord[];
  histories: readonly SessionHistoryRecord[];
  exercises: readonly ProgressExercise[];
  library: readonly { id: string; word: string; category: string }[];
  mode: SessionMode;
};

const emptyScore = (): TableScore => ({ correct: 0, total: 0, percent: null });
const wordScores = (): Record<WordActivity, TableScore> => ({
  recognition: emptyScore(),
  articles: emptyScore(),
  "word-categories": emptyScore(),
  naming: emptyScore(),
  "sentence-matching": emptyScore(),
});

export function buildWordProgress({ attempts, helps, histories, exercises, library, mode }: Input) {
  const describe = progressAttemptLookup(exercises, histories);
  const itemById = new Map(library.map((item) => [item.id, item]));
  const rows = new Map<string, TableRow<WordActivity>>();
  const trendRecords: TrendRecord<WordActivity>[] = [];
  const helpsByWord = new Map<string, Map<string, number>>();

  const rowFor = (wordId: string, snapshot?: { word: string; category: string }) => {
    let row = rows.get(wordId);
    if (!row) {
      const details = itemById.get(wordId) ?? snapshot;
      row = { wordId, label: details?.word ?? wordId, category: details?.category ?? "", scores: wordScores(), correct: 0, total: 0, status: "few", helpCount: 0 };
      rows.set(wordId, row);
    }
    return row;
  };

  for (const attempt of attempts) {
    if (!attempt.firstAttempt || attempt.mode !== mode || attempt.quantityErrorless) continue;
    const { kind, wordId, target } = describe(attempt);
    if (!wordId || kind === "number-quantity") continue;
    const row = rowFor(wordId, target);
    const score = row.scores[kind];
    score.total += 1;
    row.total += 1;
    if (attempt.correct) {
      score.correct += 1;
      row.correct += 1;
    }
    trendRecords.push({ wordId, kind, month: attempt.createdAt.slice(0, 7), correct: attempt.correct });
  }

  for (const help of helps) {
    if (help.mode && help.mode !== mode) continue;
    const { wordId, target } = describe(help);
    if (!wordId) continue;
    rowFor(wordId, target).helpCount += 1;
    const labels = helpsByWord.get(wordId) ?? new Map<string, number>();
    labels.set(help.label, (labels.get(help.label) ?? 0) + 1);
    helpsByWord.set(wordId, labels);
  }

  for (const row of rows.values()) {
    row.status = wordProgressStatus(row.correct, row.total);
    for (const score of Object.values(row.scores)) {
      score.percent = score.total ? Math.round(score.correct / score.total * 100) : null;
    }
  }

  return { rows: [...rows.values()], trendRecords, helpsByWord };
}
