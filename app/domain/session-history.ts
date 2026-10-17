import type { AttemptEvent, HelpEventRecord, SessionMode } from "./session-events";

export type HistoryImageSnapshot = {
  itemId: string;
  word: string;
  category: string;
  emoji?: string;
  image?: string;
  imageKey?: string;
  remoteImageId?: string;
};

export type SessionHistoryResponse = {
  answerId: string;
  label: string;
  correct: boolean;
  firstAttempt: boolean;
  createdAt: string;
};

export type SessionHistoryItem = {
  id: string;
  exerciseId: string;
  exerciseTitle: string;
  kind: "recognition" | "articles" | "word-categories" | "naming";
  presentation?: "images" | "words";
  target?: HistoryImageSnapshot;
  options: HistoryImageSnapshot[];
  responses: SessionHistoryResponse[];
  helpLabels: string[];
  firstCorrect: boolean;
};

export type SessionHistoryRecord = {
  id: string;
  childId: string;
  therapistId: string;
  title: string;
  source: "sequence" | "quick";
  mode: SessionMode;
  presentation: "images" | "words" | "mixed";
  startedAt: string;
  completedAt: string;
  comment: string;
  items: SessionHistoryItem[];
  deletedAt?: string;
};

type HistoryExercise = {
  id: string;
  sourceExerciseId?: string;
  title: string;
  kind?: SessionHistoryItem["kind"];
  presentation?: "images" | "words";
  promptId?: string;
  optionIds: string[];
};

type HistoryLibraryItem = HistoryImageSnapshot & { image?: string };

function snapshotImage(item?: HistoryLibraryItem): HistoryImageSnapshot | undefined {
  if (!item) return undefined;
  return {
    itemId: item.itemId,
    word: item.word,
    category: item.category,
    emoji: item.emoji,
    image: item.image?.startsWith("data:") ? undefined : item.image,
    imageKey: item.imageKey,
    remoteImageId: item.remoteImageId,
  };
}

export function buildSessionHistoryItems(
  sessionId: string,
  plan: HistoryExercise[],
  attempts: AttemptEvent[],
  helps: HelpEventRecord[],
  library: HistoryLibraryItem[],
): SessionHistoryItem[] {
  const itemMap = new Map(library.map((item) => [item.itemId, item]));
  const exerciseMap = new Map<string, HistoryExercise>();
  plan.forEach((exercise) => {
    exerciseMap.set(exercise.id, exercise);
    exerciseMap.set(exercise.sourceExerciseId ?? exercise.id, exercise);
  });
  const sessionAttempts = attempts.filter((attempt) => attempt.sessionId === sessionId);
  const groups = new Map<string, AttemptEvent[]>();
  sessionAttempts.forEach((attempt) => {
    const key = attempt.sessionItemId ?? attempt.id;
    groups.set(key, [...(groups.get(key) ?? []), attempt]);
  });

  return [...groups.entries()].map(([id, responses]) => {
    const first = responses[0];
    const exercise = exerciseMap.get(first.exerciseId);
    const targetId = first.wordId ?? exercise?.promptId;
    const itemHelps = helps.filter((help) => help.sessionId === sessionId && (
      help.sessionItemId === first.sessionItemId || (!first.sessionItemId && help.exerciseId === first.exerciseId && help.wordId === targetId)
    ));
    const optionIds = first.optionIds?.length ? first.optionIds : exercise?.optionIds?.length ? exercise.optionIds : targetId ? [targetId] : [];
    return {
      id,
      exerciseId: first.exerciseId,
      exerciseTitle: exercise?.title ?? "Esercizio archiviato",
      kind: exercise?.kind ?? "recognition",
      presentation: exercise?.presentation,
      target: snapshotImage(targetId ? itemMap.get(targetId) : undefined),
      options: optionIds.map((optionId) => snapshotImage(itemMap.get(optionId))).filter((item): item is HistoryImageSnapshot => Boolean(item)),
      responses: responses.map((attempt) => ({
        answerId: attempt.answerId,
        label: itemMap.get(attempt.answerId)?.word ?? attempt.answerId,
        correct: attempt.correct,
        firstAttempt: attempt.firstAttempt,
        createdAt: attempt.createdAt,
      })),
      helpLabels: itemHelps.map((help) => help.label),
      firstCorrect: Boolean(responses.find((attempt) => attempt.firstAttempt)?.correct),
    };
  }).sort((a, b) => (a.responses[0]?.createdAt ?? "").localeCompare(b.responses[0]?.createdAt ?? ""));
}
