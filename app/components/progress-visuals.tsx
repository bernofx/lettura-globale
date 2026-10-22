import { BarChart3 } from "lucide-react";

export type ProgressKind = "recognition" | "articles" | "word-categories" | "naming" | "number-quantity" | "sentence-matching";
export type ProgressCell = { total: number; correct: number; percent: number | null };
export type MonthlyProgress = { month: string; label: string; recognition?: number; articles?: number; "word-categories"?: number; naming?: number; "number-quantity"?: number; "sentence-matching"?: number };

export function ProgressScore({ cell }: { cell: ProgressCell }) {
  if (cell.percent === null) return <span className="score-cell empty">—<small>Nessuna prova</small></span>;
  const tone = cell.percent >= 80 ? "strong" : cell.percent >= 50 ? "developing" : "attention";
  return <span className={`score-cell ${tone}`}><strong>{cell.percent}%</strong><small>{cell.correct}/{cell.total} corrette</small></span>;
}

export function LearningProgressChart({ points, word }: { points: MonthlyProgress[]; word: string }) {
  const width = 760;
  const height = 300;
  const left = 52;
  const right = 20;
  const top = 22;
  const bottom = 48;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const x = (index: number) => left + (points.length === 1 ? innerWidth / 2 : (index / Math.max(1, points.length - 1)) * innerWidth);
  const y = (value: number) => top + ((100 - value) / 100) * innerHeight;
  const series = [
    { key: "recognition" as const, label: "Trova la parola", color: "#7468df" },
    { key: "articles" as const, label: "Articolo IL / LA", color: "#33a37a" },
    { key: "word-categories" as const, label: "Parola → categoria", color: "#e19445" },
    { key: "naming" as const, label: "Mix and vary", color: "#d15b8f" },
    { key: "number-quantity" as const, label: "Numero quantità", color: "#a45ad1" },
    { key: "sentence-matching" as const, label: "Abbina la frase", color: "#2f82a5" },
  ];
  const coordinates = (key: ProgressKind) => points.flatMap((point, index) => point[key] === undefined ? [] : [`${x(index)},${y(point[key]!)}`]).join(" ");
  return <div className="learning-chart"><div className="chart-legend">{series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>{points.length ? <><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Evoluzione mensile di ${word}: mesi sull’asse orizzontale e percentuale sull’asse verticale`}><title>Evoluzione mensile di {word}</title>{[0, 25, 50, 75, 100].map((value) => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="chart-grid" /><text x={left - 10} y={y(value) + 4} textAnchor="end" className="chart-axis-label">{value}%</text></g>)}{points.map((point, index) => <text key={point.month} x={x(index)} y={height - 18} textAnchor="middle" className="chart-axis-label">{point.label}</text>)}{series.map((item) => <g key={item.key}>{coordinates(item.key) && <polyline points={coordinates(item.key)} fill="none" stroke={item.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}{points.map((point, index) => point[item.key] === undefined ? null : <circle key={point.month} cx={x(index)} cy={y(point[item.key]!)} r="6" fill={item.color}><title>{item.label}, {point.label}: {point[item.key]}%</title></circle>)}</g>)}</svg>{points.length < 2 && <p className="chart-guidance">Servono rilevazioni in almeno due mesi per mostrare una tendenza.</p>}</> : <div className="empty-mini"><BarChart3 /><p>Nessuna rilevazione per questa parola.</p><small>Il grafico apparirà dopo la prima prova.</small></div>}</div>;
}

