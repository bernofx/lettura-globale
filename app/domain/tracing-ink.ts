export type TracePoint = { x: number; y: number };

type TraceLeg = { points: readonly TracePoint[]; painted: Uint8Array; paintedCount: number };
export const TRACE_TOLERANCE = 25;
export const TRACE_SAMPLE_STEP = 4;
const COMPLETE_FRACTION = 0.88;
const ORDER_SEARCH_RADIUS = Math.ceil(TRACE_TOLERANCE / TRACE_SAMPLE_STEP) + 1;
const ORDER_BACKTRACK = 3;

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

function* traceSamples(from: TracePoint, to: TracePoint) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (TRACE_SAMPLE_STEP / 2)));
  for (let step = 0; step <= steps; step++) {
    yield { x: from.x + (to.x - from.x) * step / steps, y: from.y + (to.y - from.y) * step / steps };
  }
}

function nearestSegment(point: TracePoint, points: readonly TracePoint[], start = 0, end = points.length - 2) {
  let nearest = -1;
  let closest = TRACE_TOLERANCE ** 2;
  for (let index = start; index <= end; index++) {
    const distance = distanceSquared(point, points[index], points[index + 1]);
    if (distance <= closest) {
      closest = distance;
      nearest = index;
    }
  }
  return nearest === -1 ? undefined : { index: nearest, distance: closest };
}

/** Bridge nearby projections of successive in-bounds samples, but preserve real excursions. */
export function paintTrace(ink: TraceLeg[], from: TracePoint, to: TracePoint) {
  let changed = false;
  let last: { stroke: TraceLeg; index: number } | undefined;
  for (const point of traceSamples(from, to)) {
    let nearest: { stroke: TraceLeg; index: number; distance: number } | undefined;
    for (const stroke of ink) {
      const hit = nearestSegment(point, stroke.points);
      if (hit && (!nearest || hit.distance <= nearest.distance)) nearest = { stroke, ...hit };
    }
    if (nearest) {
      const { stroke, index } = nearest;
      const previous = last?.stroke === stroke && Math.abs(last.index - index) <= ORDER_SEARCH_RADIUS ? last.index : index;
      for (let segment = Math.min(previous, index); segment <= Math.max(previous, index); segment++) {
        if (stroke.painted[segment]) continue;
        stroke.painted[segment] = 1;
        stroke.paintedCount++;
        changed = true;
      }
    }
    last = nearest;
  }
  return changed;
}

export function startOrderedTrace(points: readonly TracePoint[], covered: number, origin: TracePoint) {
  const start = points[covered];
  return { covered, invalid: Math.hypot(origin.x - start.x, origin.y - start.y) > TRACE_TOLERANCE };
}

/** Evaluate forward progress on the current directed stroke, locally even on a loop or crossing. */
export function paintOrderedTrace(points: readonly TracePoint[], gesture: ReturnType<typeof startOrderedTrace>, from: TracePoint, to: TracePoint) {
  if (gesture.invalid) return;
  for (const sample of traceSamples(from, to)) {
    const hit = nearestSegment(sample, points,
      Math.max(0, gesture.covered - ORDER_SEARCH_RADIUS),
      Math.min(points.length - 2, gesture.covered + ORDER_SEARCH_RADIUS - 1));
    if (!hit || hit.index + 1 < gesture.covered - ORDER_BACKTRACK) {
      gesture.invalid = true;
      return;
    }
    gesture.covered = Math.max(gesture.covered, hit.index + 1);
  }
}

export function orderedStrokeCompleted(points: readonly TracePoint[], covered: number) {
  const segments = points.length - 1;
  return covered >= Math.max(segments * COMPLETE_FRACTION, segments - ORDER_SEARCH_RADIUS + 1);
}

export function tracePrefixPath(points: readonly TracePoint[], covered: number) {
  return covered ? points.slice(0, covered + 1).map(({ x, y }, i) => `${i ? "L" : "M"}${x} ${y}`).join("") : "";
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
