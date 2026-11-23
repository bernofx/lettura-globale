import type { TracePoint } from "../../app/domain/tracing-ink.ts";

/** Approximate SVGPathElement sampling for the tracing glyphs (M, L, H, V, C, Q, Z), every `step` units like the game. */
export function sampleGlyphPath(d: string, step = 4): TracePoint[] {
  const tokens = d.match(/[MLHVCQZ]|-?\d+(?:\.\d+)?/g) ?? [];
  const line: TracePoint[] = [];
  let index = 0;
  let command = "";
  let current = { x: 0, y: 0 };
  let first = current;
  const number = () => Number(tokens[index++]);
  const curve = (at: (t: number) => TracePoint) => { for (let i = 1; i <= 64; i++) line.push(at(i / 64)); };
  while (index < tokens.length) {
    if (/[A-Z]/.test(tokens[index])) command = tokens[index++];
    if (command === "M") { current = first = { x: number(), y: number() }; line.push(current); command = "L"; continue; }
    if (command === "Z") { line.push(first); current = first; continue; }
    if (command === "L") current = { x: number(), y: number() };
    else if (command === "H") current = { x: number(), y: current.y };
    else if (command === "V") current = { x: current.x, y: number() };
    else if (command === "C") {
      const [p0, p1, p2, p3] = [current, { x: number(), y: number() }, { x: number(), y: number() }, { x: number(), y: number() }];
      curve(t => ({ x: (1 - t) ** 3 * p0.x + 3 * (1 - t) ** 2 * t * p1.x + 3 * (1 - t) * t * t * p2.x + t ** 3 * p3.x, y: (1 - t) ** 3 * p0.y + 3 * (1 - t) ** 2 * t * p1.y + 3 * (1 - t) * t * t * p2.y + t ** 3 * p3.y }));
      current = p3;
      continue;
    } else if (command === "Q") {
      const [p0, p1, p2] = [current, { x: number(), y: number() }, { x: number(), y: number() }];
      curve(t => ({ x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x, y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y }));
      current = p2;
      continue;
    }
    line.push(current);
  }
  const lengths = [0];
  for (let i = 1; i < line.length; i++) lengths.push(lengths[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  const total = lengths.at(-1)!;
  const steps = Math.max(1, Math.ceil(total / step));
  let segment = 1;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const at = total * i / steps;
    while (segment < line.length - 1 && lengths[segment] < at) segment++;
    const span = lengths[segment] - lengths[segment - 1] || 1;
    const fraction = Math.min(1, Math.max(0, (at - lengths[segment - 1]) / span));
    const [a, b] = [line[segment - 1], line[segment]];
    return { x: Math.round((a.x + (b.x - a.x) * fraction) * 10) / 10, y: Math.round((a.y + (b.y - a.y) * fraction) * 10) / 10 };
  });
}
