import { CircleHelp } from "lucide-react";
import { useId, useState } from "react";
import { comparedWordColors, progressKindSeries, type ChartSeries, type ProgressKind, TrendChart } from "../../components/progress-visuals";
import { trendByKind, trendByWord, type TrendRecord } from "../../domain/progress-trend";
import { Modal, ModalTitle } from "../../shared/ui/modal";

export type ChartWord = { wordId: string; label: string };
type HelpCount = { label: string; count: number };

const monthLabel = (month: string) => {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", { month: "short", year: "2-digit" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
};

/**
 * Monthly trend of one word (one line per activity) or of up to four words (one line per word,
 * filtered by activity). On a portrait phone the panel is drawn already rotated to landscape.
 */
export function ProgressChartDialog({ words, records, modeLabel, helpsFor, onClose }: { words: ChartWord[]; records: TrendRecord<ProgressKind>[]; modeLabel: string; helpsFor: (wordId: string) => HelpCount[]; onClose: () => void }) {
  const titleId = useId();
  const comparing = words.length > 1;
  const [kind, setKind] = useState<ProgressKind | "all">("all");
  const wordIds = words.map((word) => word.wordId);
  const availableKinds = progressKindSeries.filter((item) => records.some((record) => record.kind === item.key && wordIds.includes(record.wordId)));
  const trend = comparing ? trendByWord(records, wordIds, kind) : trendByKind(records, wordIds[0], progressKindSeries.map((item) => item.key));
  const series: ChartSeries[] = trend.series.map((item) => {
    if (comparing) {
      const index = wordIds.indexOf(item.key);
      return { ...item, label: words[index].label.toLocaleUpperCase("it-IT"), color: comparedWordColors[index % comparedWordColors.length] };
    }
    const meta = progressKindSeries.find((entry) => entry.key === item.key)!;
    return { ...item, label: meta.label, color: meta.color };
  });
  const title = comparing ? `Confronto: ${words.map((word) => word.label.toLocaleUpperCase("it-IT")).join(", ")}` : words[0].label.toLocaleUpperCase("it-IT");
  const singleHelps = comparing ? [] : helpsFor(wordIds[0]);
  return <Modal labelledBy={titleId} className="wide progress-chart-modal" onClose={onClose} closeButton>
    <ModalTitle id={titleId} eyebrow={`ANDAMENTO MENSILE · ${modeLabel.toLocaleUpperCase("it-IT")}`}>{title}</ModalTitle>
    <div className="progress-chart-layout">
      <div className="progress-chart-main">
        {comparing && <label className="progress-chart-filter"><span>Attività</span><select value={kind} onChange={(event) => setKind(event.target.value as ProgressKind | "all")}><option value="all">Tutte le attività</option>{availableKinds.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>}
        <TrendChart title={title} months={trend.months.map((month) => ({ month, label: monthLabel(month) }))} series={series} />
      </div>
      <aside className="progress-chart-helps" aria-label="Aiuti registrati">
        <span className="eyebrow"><CircleHelp aria-hidden="true" />AIUTI</span>
        {comparing
          ? <ul>{words.map((word) => <li key={word.wordId}><span>{word.label.toLocaleUpperCase("it-IT")}</span><strong>{helpsFor(word.wordId).reduce((sum, help) => sum + help.count, 0)}</strong></li>)}</ul>
          : singleHelps.length ? <ul>{singleHelps.map((help) => <li key={help.label}><span>{help.label}</span><strong>{help.count}</strong></li>)}</ul> : <p>Nessun aiuto registrato in questa modalità.</p>}
      </aside>
    </div>
    <p className="progress-chart-note">Percentuale di risposte corrette al primo tentativo, mese per mese. Una sola rilevazione non definisce una tendenza.</p>
  </Modal>;
}
