import { BarChart3 } from "lucide-react";

export type ProgressKind = "recognition" | "articles" | "word-categories" | "naming" | "number-quantity" | "sentence-matching";
export type ProgressCell = { total: number; correct: number; percent: number | null };

export function ProgressScore({ cell }: { cell: ProgressCell }) {
  if (cell.percent === null) return <span className="score-cell empty">—<span className="visually-hidden"> nessuna prova</span></span>;
  const tone = cell.percent >= 80 ? "strong" : cell.percent >= 50 ? "developing" : "attention";
  return <span className={`score-cell ${tone}`}><strong>{cell.percent}%</strong><small>{cell.correct}/{cell.total}<span className="visually-hidden"> corrette</span></small></span>;
}

export type ChartSeries = { key: string; label: string; color: string; values: (number | undefined)[] };

/** Activity colours shared by the chart legend and the comparison picker. */
export const progressKindSeries: { key: ProgressKind; label: string; color: string }[] = [
  { key: "recognition", label: "Trova la parola", color: "#6a5fd8" },
  { key: "articles", label: "Articolo IL / LA", color: "#1f8a62" },
  { key: "word-categories", label: "Parola → categoria", color: "#c46a16" },
  { key: "naming", label: "Mix and vary", color: "#c2427c" },
  { key: "number-quantity", label: "Numero quantità", color: "#8a44bd" },
  { key: "sentence-matching", label: "Abbina la frase", color: "#1f6f94" },
];

/** Distinct colours for compared words (series also differ by marker shape). */
export const comparedWordColors = ["#6a5fd8", "#1f8a62", "#c46a16", "#c2427c"];

const markerShapes = ["circle", "square", "triangle", "diamond"] as const;

function Marker({ shape, x, y, color, children }: { shape: (typeof markerShapes)[number]; x: number; y: number; color: string; children: React.ReactNode }) {
  if (shape === "square") return <rect x={x - 6} y={y - 6} width={12} height={12} rx={2} fill={color}>{children}</rect>;
  if (shape === "triangle") return <polygon points={`${x},${y - 8} ${x + 7},${y + 6} ${x - 7},${y + 6}`} fill={color}>{children}</polygon>;
  if (shape === "diamond") return <polygon points={`${x},${y - 8} ${x + 8},${y} ${x},${y + 8} ${x - 8},${y}`} fill={color}>{children}</polygon>;
  return <circle cx={x} cy={y} r={6.5} fill={color}>{children}</circle>;
}

/**
 * Monthly accuracy chart: months on X, first-attempt percentage on Y. Each series has its own
 * colour and marker shape, and the same numbers are available as a table for assistive tech.
 */
export function TrendChart({ title, months, series }: { title: string; months: { month: string; label: string }[]; series: ChartSeries[] }) {
  const width = 760;
  const height = 300;
  const left = 52;
  const right = 24;
  const top = 22;
  const bottom = 44;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const x = (index: number) => left + (months.length === 1 ? innerWidth / 2 : (index / Math.max(1, months.length - 1)) * innerWidth);
  const y = (value: number) => top + ((100 - value) / 100) * innerHeight;
  const shapeOf = (index: number) => markerShapes[index % markerShapes.length];
  if (!months.length || !series.length) return <div className="learning-chart"><div className="empty-mini"><BarChart3 /><p>Nessuna rilevazione.</p><small>Il grafico apparirà dopo la prima prova.</small></div></div>;
  return <div className="learning-chart">
    <div className="chart-legend" aria-hidden="true">{series.map((item, index) => <span key={item.key}><svg viewBox="0 0 30 16" width="30" height="16"><line x1="1" x2="29" y1="8" y2="8" stroke={item.color} strokeWidth="3" strokeLinecap="round" /><Marker shape={shapeOf(index)} x={15} y={8} color={item.color}>{null}</Marker></svg>{item.label}</span>)}</div>
    <svg className="trend-chart-svg" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {[0, 25, 50, 75, 100].map((value) => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="chart-grid" /><text x={left - 10} y={y(value) + 4} textAnchor="end" className="chart-axis-label">{value}%</text></g>)}
      {months.map((month, index) => <text key={month.month} x={x(index)} y={height - 14} textAnchor="middle" className="chart-axis-label">{month.label}</text>)}
      {series.map((item, seriesIndex) => {
        const points = item.values.flatMap((value, index) => value === undefined ? [] : [`${x(index)},${y(value)}`]).join(" ");
        return <g key={item.key}>{points.includes(" ") && <polyline points={points} fill="none" stroke={item.color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />}{item.values.map((value, index) => value === undefined ? null : <Marker key={months[index].month} shape={shapeOf(seriesIndex)} x={x(index)} y={y(value)} color={item.color}><title>{item.label}, {months[index].label}: {value}%</title></Marker>)}</g>;
      })}
    </svg>
    {months.length < 2 && <p className="chart-guidance">Servono rilevazioni in almeno due mesi per mostrare una tendenza.</p>}
    <div className="visually-hidden"><table><caption>{title}: percentuale di risposte corrette al primo tentativo per mese</caption><thead><tr><th scope="col">Mese</th>{series.map((item) => <th scope="col" key={item.key}>{item.label}</th>)}</tr></thead><tbody>{months.map((month, index) => <tr key={month.month}><th scope="row">{month.label}</th>{series.map((item) => <td key={item.key}>{item.values[index] === undefined ? "nessuna prova" : `${item.values[index]}%`}</td>)}</tr>)}</tbody></table></div>
  </div>;
}
