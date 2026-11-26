import { ArrowDown, ArrowUp, ArrowUpDown, CircleHelp, LineChart, Search } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { progressKindSeries, type ProgressKind, ProgressScore } from "../../components/progress-visuals";
import { type WordProgressStatus, wordProgressStatusLabels } from "../../domain/progress-status";
import { defaultTableFilters, defaultTableSort, filterRows, INITIAL_VISIBLE_ROWS, nextSort, type SortKey, sortRows, statusCounts, type TableFilters, type TableRow, type TableSort } from "../../domain/progress-table";
import { Artwork } from "../../shared/artwork";
import { useStoredState } from "../../shared/hooks";
import { type LibraryItem } from "../../shared/types";

type Kind = Exclude<ProgressKind, "number-quantity">;
export type WordTableRow = TableRow<Kind>;
type Saved = { filters: Omit<TableFilters<Kind>, "query">; sort: TableSort<Kind> };

const statusOrder: WordProgressStatus[] = ["reinforce", "growing", "few", "secure"];
const tableKinds = progressKindSeries.filter((item): item is { key: Kind; label: string; color: string } => item.key !== "number-quantity");
const sortKeys = new Set<string>(["priority", "word", "status", "helps", ...tableKinds.map((item) => item.key)]);

const savedFallback: Saved = { filters: { statuses: [], category: "all", kind: "all" }, sort: defaultTableSort as TableSort<Kind> };
/** Saved preferences are per device; anything unexpected falls back to the defaults. */
const readSaved = (saved: Saved): Saved => {
  const statuses = Array.isArray(saved?.filters?.statuses) ? saved.filters.statuses.filter((status) => statusOrder.includes(status)) : [];
  const kind = tableKinds.some((item) => item.key === saved?.filters?.kind) ? saved.filters.kind : "all";
  const category = typeof saved?.filters?.category === "string" ? saved.filters.category : "all";
  const sort = sortKeys.has(String(saved?.sort?.key)) && (saved.sort.direction === "asc" || saved.sort.direction === "desc") ? { ...saved.sort, direction: saved.sort.key === "priority" ? "asc" as const : saved.sort.direction } : savedFallback.sort;
  return { filters: { statuses, category, kind }, sort };
};

/**
 * Word × activity table of Progressi with search, status/category/activity filters, sortable
 * headers (a sort menu for cards and phones) and an initial view of the first rows by priority.
 */
export function ProgressWordTable({ rows, itemFor, compareIds, maxCompare, onToggleCompare, onOpenChart }: { rows: WordTableRow[]; itemFor: (wordId: string) => LibraryItem | undefined; compareIds: string[]; maxCompare: number; onToggleCompare: (wordId: string) => void; onOpenChart: (wordIds: string[]) => void }) {
  const [saved, setSaved] = useStoredState<Saved>("lg-progress-table", savedFallback, readSaved);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const categories = useMemo(() => [...new Set(rows.map((row) => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it")), [rows]);
  const columns = tableKinds.filter((item) => rows.some((row) => row.scores[item.key].total > 0));
  const filters: TableFilters<Kind> = { ...defaultTableFilters, ...saved.filters, query, category: categories.includes(saved.filters.category) ? saved.filters.category : "all", kind: columns.some((item) => item.key === saved.filters.kind) ? saved.filters.kind : "all" };
  const counts = statusCounts(rows);
  const sortKey = saved.sort.key;
  const sort = tableKinds.some((item) => item.key === sortKey) && !columns.some((item) => item.key === sortKey)
    ? savedFallback.sort
    : saved.sort;
  const filtered = sortRows(filterRows(rows, filters), sort);
  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE_ROWS);
  const filtersActive = Boolean(query) || filters.statuses.length > 0 || filters.category !== "all" || filters.kind !== "all";
  const update = (change: Partial<Saved["filters"]>) => { setSaved((current) => ({ ...current, filters: { ...current.filters, ...change } })); setShowAll(false); };
  const setSort = (sort: TableSort<Kind>) => setSaved((current) => ({ ...current, sort }));
  const toggleStatus = (status: WordProgressStatus) => update({ statuses: filters.statuses.includes(status) ? filters.statuses.filter((item) => item !== status) : [...filters.statuses, status] });
  const resetFilters = () => { setQuery(""); update({ statuses: [], category: "all", kind: "all" }); };
  const columnLabel = (key: SortKey<Kind>) => key === "word" ? "Parola" : key === "status" ? "Stato" : key === "helps" ? "Aiuti" : tableKinds.find((item) => item.key === key)?.label ?? "";
  const ariaSort = (key: SortKey<Kind>) => sort.key !== key ? undefined : sort.direction === "asc" ? "ascending" as const : "descending" as const;
  const header = (key: SortKey<Kind>, label = columnLabel(key)) => <span role="columnheader" aria-sort={ariaSort(key)}><button type="button" className="sort-header" onClick={() => setSort(nextSort(sort, key))}>{label}{sort.key === key ? sort.direction === "asc" ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" /> : <ArrowUpDown aria-hidden="true" />}</button></span>;
  const sortOptions: { value: string; label: string }[] = [
    { value: "priority:asc", label: "Priorità: da rinforzare prima" },
    { value: "word:asc", label: "Parola A → Z" },
    { value: "word:desc", label: "Parola Z → A" },
    { value: "status:asc", label: "Stato: prima da rinforzare" },
    { value: "status:desc", label: "Stato: prima sicure" },
    ...columns.flatMap((item) => [{ value: `${item.key}:desc`, label: `${item.label}: più alta` }, { value: `${item.key}:asc`, label: `${item.label}: più bassa` }]),
    { value: "helps:desc", label: "Più aiuti" },
    { value: "helps:asc", label: "Meno aiuti" },
  ];
  const sortValue = `${sort.key}:${sort.direction}`;

  return <>
    <div className="progress-filters">
      <label className="search-box progress-search"><Search size={19} aria-hidden="true" /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setShowAll(false); }} placeholder="Cerca una parola…" aria-label="Cerca una parola nei progressi" /></label>
      <div className="status-chips" role="group" aria-label="Filtra per stato">{statusOrder.map((status) => <button type="button" key={status} className={`status-chip ${status}`} aria-pressed={filters.statuses.includes(status)} onClick={() => toggleStatus(status)} disabled={!counts[status] && !filters.statuses.includes(status)}><i aria-hidden="true" />{wordProgressStatusLabels[status]}<span>{counts[status]}</span></button>)}</div>
      <div className="progress-selects">
        {categories.length > 0 && <label className="progress-select"><span>Categoria</span><select value={filters.category} onChange={(event) => update({ category: event.target.value })}><option value="all">Tutte</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>}
        {columns.length > 0 && <label className="progress-select"><span>Attività</span><select value={filters.kind} onChange={(event) => update({ kind: event.target.value as Kind | "all" })}><option value="all">Tutte</option>{columns.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>}
        <label className="progress-select progress-sort"><span>Ordina per</span><select value={sortValue} onChange={(event) => { const [key, direction] = event.target.value.split(":"); setSort({ key: key as SortKey<Kind>, direction: direction as "asc" | "desc" }); }}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        {filtersActive && <button type="button" className="text-button progress-reset" onClick={resetFilters}>Azzera filtri</button>}
      </div>
    </div>
    <p className="progress-results" role="status" aria-live="polite">{filtered.length === rows.length ? `${rows.length} parole` : `${filtered.length} di ${rows.length} parole`}{sort.key === "priority" ? " · prima quelle da rinforzare" : ""}</p>
    {filtered.length ? <div className="progress-matrix" role="table" aria-label="Risultati per parola e tipologia di attività" style={{ "--activity-cols": columns.length, "--activity-tracks": columns.length ? `repeat(${columns.length}, minmax(96px, 1fr))` : undefined } as React.CSSProperties}>
      <div className="matrix-row matrix-header" role="row">{header("word")}{header("status")}{columns.map((item) => <Fragment key={item.key}>{header(item.key)}</Fragment>)}{header("helps", "Aiuti e grafico")}</div>
      {visible.map((row) => {
        const checked = compareIds.includes(row.wordId);
        const item = itemFor(row.wordId);
        return <div className={`matrix-row ${checked ? "selected" : ""}`} key={row.wordId} role="row">
          <span className="matrix-word-art" aria-hidden="true">{item && <Artwork item={item} compact />}</span>
          <strong role="cell" className="matrix-word"><label className="matrix-compare"><input type="checkbox" checked={checked} disabled={!checked && compareIds.length >= maxCompare} onChange={() => onToggleCompare(row.wordId)} /><span className="visually-hidden">Confronta {row.label}</span></label><span className="matrix-word-label">{row.label.toLocaleUpperCase("it-IT")}</span></strong>
          <span role="cell" className={`word-status ${row.status}`}><i aria-hidden="true" />{wordProgressStatusLabels[row.status]}{row.total > 0 && ` · ${row.correct}/${row.total}`}</span>
          {columns.map((column) => <span role="cell" key={column.key}><ProgressScore cell={row.scores[column.key]} /></span>)}
          <span role="cell" className="help-total"><span className="help-total-count" title="Aiuti registrati"><CircleHelp aria-hidden="true" />{row.helpCount}<span className="visually-hidden"> aiuti</span></span><button type="button" className="matrix-chart-button" onClick={() => onOpenChart([row.wordId])} aria-label={`Grafico di ${row.label}`} title="Andamento mensile"><LineChart aria-hidden="true" /></button></span>
        </div>;
      })}
    </div> : <div className="empty-mini"><Search /><p>Nessuna parola corrisponde ai filtri.</p><button type="button" className="ghost-button" onClick={resetFilters}>Azzera filtri</button></div>}
    {filtered.length > INITIAL_VISIBLE_ROWS && <button type="button" className="ghost-button progress-show-all" onClick={() => setShowAll((current) => !current)} aria-expanded={showAll}>{showAll ? "Mostra solo le prime " + INITIAL_VISIBLE_ROWS : `Mostra tutte (${filtered.length})`}</button>}
  </>;
}
