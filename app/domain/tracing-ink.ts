export type TracePoint = { x: number; y: number };

type TraceLeg = { points: readonly TracePoint[]; painted: Uint8Array; paintedCount: number };
type OrderedTrace = {
  covered: number;
  invalid: boolean;
  entry?: { points: TracePoint[]; segments: number; position: number };
};
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

/** Some strokes share a straight tail with the next start, for example the middle bar of B. */
export function orderedTraceEntry(previous: readonly TracePoint[] | undefined, start: TracePoint): TracePoint[] {
  const end = previous?.at(-1);
  if (!previous || !end) return [];
  const length = Math.hypot(start.x - end.x, start.y - end.y);
  if (length <= TRACE_TOLERANCE) return [];

  // Only allow the final part of the previous stroke. A whole stroke in reverse is a different gesture.
  for (let index = previous.length - 2; index >= ORDER_SEARCH_RADIUS; index--) {
    const point = previous[index];
    if (distanceSquared(point, end, start) > TRACE_SAMPLE_STEP ** 2) break;
    if (Math.hypot(point.x - start.x, point.y - start.y) <= TRACE_SAMPLE_STEP) {
      const steps = Math.ceil(length / TRACE_SAMPLE_STEP);
      // The start of the new stroke is added when the guide is joined to this approach.
      return Array.from({ length: steps }, (_, i) => ({
        x: end.x + (start.x - end.x) * i / steps,
        y: end.y + (start.y - end.y) * i / steps,
      }));
    }
  }
  return [];
}

export function startOrderedTrace(points: readonly TracePoint[], covered: number, origin: TracePoint, entry: readonly TracePoint[] = []): OrderedTrace {
  const start = points[covered];
  if (Math.hypot(origin.x - start.x, origin.y - start.y) <= TRACE_TOLERANCE) return { covered, invalid: false };
  if (covered || !entry.length) return { covered, invalid: true };
  const approach = [...entry, ...points];
  const hit = nearestSegment(origin, approach, 0, entry.length - 1);
  return hit
    ? { covered, invalid: false, entry: { points: approach, segments: entry.length, position: hit.index } }
    : { covered, invalid: true };
}

/** Evaluate forward progress on the current directed stroke, locally even on a loop or crossing. */
export function paintOrderedTrace(points: readonly TracePoint[], gesture: OrderedTrace, from: TracePoint, to: TracePoint) {
  if (gesture.invalid) return;
  const guide = gesture.entry?.points ?? points;
  const entrySegments = gesture.entry?.segments ?? 0;
  let position = gesture.entry?.position ?? gesture.covered;
  for (const sample of traceSamples(from, to)) {
    const hit = nearestSegment(sample, guide,
      Math.max(0, position - ORDER_SEARCH_RADIUS),
      Math.min(guide.length - 2, position + ORDER_SEARCH_RADIUS - 1));
    if (!hit || hit.index + 1 < position - ORDER_BACKTRACK) {
      gesture.invalid = true;
      return;
    }
    position = Math.max(position, hit.index + 1);
  }
  if (gesture.entry) gesture.entry.position = position;
  gesture.covered = Math.max(0, position - entrySegments);
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
