// Monthly first-attempt accuracy for the Progressi chart: one series per activity for a single
// word, or one series per word (optionally restricted to one activity) when comparing words.
export type TrendRecord<K extends string = string> = { wordId: string; kind: K; month: string; correct: boolean };
export type TrendSeries = { key: string; values: (number | undefined)[] };
export type Trend = { months: string[]; series: TrendSeries[] };

export const MAX_COMPARED_WORDS = 4;

export function progressMonthOrdinal(month: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

function build<K extends string>(records: readonly TrendRecord<K>[], keys: readonly string[], keyOf: (record: TrendRecord<K>) => string): Trend {
  const totals = new Map([...new Set(keys)].map((key) => [key, new Map<string, { correct: number; total: number }>()]));
  const activeMonths = new Set<string>();
  for (const record of records) {
    const counts = totals.get(keyOf(record));
    if (!counts || progressMonthOrdinal(record.month) === null) continue;
    activeMonths.add(record.month);
    const count = counts.get(record.month) ?? { correct: 0, total: 0 };
    count.total += 1;
    if (record.correct) count.correct += 1;
    counts.set(record.month, count);
  }
  const months = [...activeMonths].sort();
  const series = [...totals].filter(([, counts]) => counts.size > 0).map(([key, counts]) => ({
    key,
    values: months.map((month) => {
      const count = counts.get(month);
      return count && Math.round(count.correct / count.total * 100);
    }),
  }));
  return { months, series };
}

/** Never connect months across an interruption in observations. */
export function trendSegments(months: readonly string[], values: readonly (number | undefined)[]) {
  const segments: { index: number; value: number }[][] = [];
  let previous: number | null = null;
  for (const [index, month] of months.entries()) {
    const ordinal = progressMonthOrdinal(month);
    const value = values[index];
    if (ordinal === null || value === undefined) continue;
    const point = { index, value };
    if (previous !== null && ordinal === previous + 1) segments.at(-1)?.push(point);
    else segments.push([point]);
    previous = ordinal;
  }
  return segments;
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
