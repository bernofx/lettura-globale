// Monthly first-attempt accuracy for the Progressi chart: one series per activity for a single
// word, or one series per word (optionally restricted to one activity) when comparing words.
export type TrendRecord<K extends string = string> = { wordId: string; kind: K; month: string; correct: boolean };
export type TrendSeries = { key: string; values: (number | undefined)[] };
export type Trend = { months: string[]; series: TrendSeries[] };

export const MAX_COMPARED_WORDS = 4;

const percent = (correct: number, total: number) => Math.round((correct / total) * 100);

function build<K extends string>(records: readonly TrendRecord<K>[], keys: readonly string[], keyOf: (record: TrendRecord<K>) => string): Trend {
  const months = [...new Set(records.map((record) => record.month))].sort();
  const series = keys.map((key) => ({
    key,
    values: months.map((month) => {
      const matching = records.filter((record) => record.month === month && keyOf(record) === key);
      return matching.length ? percent(matching.filter((record) => record.correct).length, matching.length) : undefined;
    }),
  })).filter((item) => item.values.some((value) => value !== undefined));
  return { months, series };
}

/** One series per activity kind that has data for `wordId`. */
export function trendByKind<K extends string>(records: readonly TrendRecord<K>[], wordId: string, kinds: readonly K[]): Trend {
  return build(records.filter((record) => record.wordId === wordId), kinds, (record) => record.kind);
}

/** One series per compared word; `kind` "all" merges every activity. */
export function trendByWord<K extends string>(records: readonly TrendRecord<K>[], wordIds: readonly string[], kind: K | "all"): Trend {
  const words = wordIds.slice(0, MAX_COMPARED_WORDS);
  return build(records.filter((record) => words.includes(record.wordId) && (kind === "all" || record.kind === kind)), words, (record) => record.wordId);
}
