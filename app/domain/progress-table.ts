// Filtering and sorting for the Progressi word table. Pure, so the same rules apply to the
// table (sortable headers) and to the Giocoso cards (sort menu).
import { type WordProgressStatus } from "./progress-status";

export type TableScore = { percent: number | null; total: number; correct: number };
export type TableRow<K extends string = string> = { wordId: string; label: string; category: string; status: WordProgressStatus; correct: number; total: number; helpCount: number; scores: Record<K, TableScore> };
export type SortKey<K extends string = string> = "priority" | "word" | "status" | "helps" | K;
export type SortDirection = "asc" | "desc";
export type TableSort<K extends string = string> = { key: SortKey<K>; direction: SortDirection };
export type TableFilters<K extends string = string> = { query: string; statuses: WordProgressStatus[]; category: string; kind: K | "all" };

export const INITIAL_VISIBLE_ROWS = 15;
export const defaultTableSort: TableSort = { key: "priority", direction: "asc" };
export const defaultTableFilters: TableFilters = { query: "", statuses: [], category: "all", kind: "all" };

/** Lower comes first in the default view: what needs attention before what is already secure. */
export const statusPriority: Record<WordProgressStatus, number> = { reinforce: 0, growing: 1, few: 2, secure: 3 };

const normalize = (value: string) => value.toLocaleLowerCase("it").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
const rate = (row: TableRow) => (row.total ? row.correct / row.total : Number.POSITIVE_INFINITY);
const byWord = (a: TableRow, b: TableRow) => a.label.localeCompare(b.label, "it");

export function filterRows<K extends string>(rows: readonly TableRow<K>[], filters: TableFilters<K>): TableRow<K>[] {
  const query = normalize(filters.query);
  return rows.filter((row) =>
    (!query || normalize(row.label).includes(query))
    && (!filters.statuses.length || filters.statuses.includes(row.status))
    && (filters.category === "all" || row.category === filters.category)
    && (filters.kind === "all" || (row.scores[filters.kind]?.total ?? 0) > 0));
}

export function sortRows<K extends string>(rows: readonly TableRow<K>[], sort: TableSort<K>): TableRow<K>[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  const compare = (a: TableRow<K>, b: TableRow<K>): number => {
    switch (sort.key) {
      case "priority": return statusPriority[a.status] - statusPriority[b.status] || rate(a) - rate(b) || byWord(a, b);
      case "word": return sign * byWord(a, b);
      case "status": return sign * (statusPriority[a.status] - statusPriority[b.status]) || byWord(a, b);
      case "helps": return sign * (a.helpCount - b.helpCount) || byWord(a, b);
      default: {
        const left = a.scores[sort.key as K]?.percent ?? null;
        const right = b.scores[sort.key as K]?.percent ?? null;
        // Words never tried in this activity always stay at the bottom.
        if (left === null || right === null) return left === right ? byWord(a, b) : left === null ? 1 : -1;
        return sign * (left - right) || byWord(a, b);
      }
    }
  };
  return [...rows].sort(compare);
}

export function statusCounts(rows: readonly TableRow[]): Record<WordProgressStatus, number> {
  const counts: Record<WordProgressStatus, number> = { reinforce: 0, growing: 0, few: 0, secure: 0 };
  rows.forEach((row) => { counts[row.status] += 1; });
  return counts;
}

/** Next sort when a column header is pressed: a new column starts from the highest values. */
export function nextSort<K extends string>(current: TableSort<K>, key: SortKey<K>): TableSort<K> {
  if (current.key === key) return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  return { key, direction: key === "word" || key === "status" ? "asc" : "desc" };
}
