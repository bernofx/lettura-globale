export type TracePoint = { x: number; y: number };

type TraceLeg = { points: readonly TracePoint[]; painted: Uint8Array; paintedCount: number };
export const TRACE_TOLERANCE = 25;
export const TRACE_SAMPLE_STEP = 4;
const COMPLETE_FRACTION = 0.88;

export function createTraceInk(strokes: readonly (readonly TracePoint[])[]) {
  return strokes.map(points => ({ points, painted: new Uint8Array(points.length - 1), paintedCount: 0 }));
}

function distanceSquared(point: TracePoint, start: TracePoint, end: TracePoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  return (point.x - start.x - dx * fraction) ** 2 + (point.y - start.y - dy * fraction) ** 2;
}

/** Sample the actual pointer movement. Only samples inside the guide's tolerance add ink. */
export function paintTrace(ink: TraceLeg[], from: TracePoint, to: TracePoint) {
  // Sample the gesture more densely than the guide so the two grids can't skip alternating segments.
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (TRACE_SAMPLE_STEP / 2)));
  let changed = false;
  for (let step = 0; step <= steps; step++) {
    const point = { x: from.x + (to.x - from.x) * step / steps, y: from.y + (to.y - from.y) * step / steps };
    let nearest: TraceLeg | undefined;
    let nearestIndex = 0;
    let closest = TRACE_TOLERANCE ** 2;
    for (const stroke of ink) {
      for (let index = 0; index < stroke.painted.length; index++) {
        const distance = distanceSquared(point, stroke.points[index], stroke.points[index + 1]);
        if (distance <= closest) {
          closest = distance;
          nearest = stroke;
          nearestIndex = index;
        }
      }
    }
    if (nearest && !nearest.painted[nearestIndex]) {
      nearest.painted[nearestIndex] = 1;
      nearest.paintedCount++;
      changed = true;
    }
  }
  return changed;
}

/** Reconstruct only the covered parts along each stroke, leaving gaps after excursions. */
export function traceInkPath(ink: TraceLeg[]) {
  let path = "";
  for (const stroke of ink) {
    for (let index = 0; index < stroke.painted.length; index++) {
      if (!stroke.painted[index]) continue;
      if (index === 0 || !stroke.painted[index - 1]) path += `M${stroke.points[index].x} ${stroke.points[index].y}`;
      path += `L${stroke.points[index + 1].x} ${stroke.points[index + 1].y}`;
    }
  }
  return path;
}

export function traceInkCompleted(ink: TraceLeg[]) {
  return ink.length > 0 && ink.every(stroke => stroke.paintedCount >= stroke.painted.length * COMPLETE_FRACTION);
}
