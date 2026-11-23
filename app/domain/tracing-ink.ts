export type TracePoint = { x: number; y: number };

type TraceLeg = { points: readonly TracePoint[]; painted: Uint8Array; paintedCount: number };
export type OrderedTrace = {
  /** Segments of the stroke already traced, never decreasing during a gesture. */
  covered: number;
  /** Where the finger is evaluated on the guide (the approach plus the stroke, when there is one). */
  position: number;
  invalid: boolean;
  /** The stroke was already complete when the finger left it: later movement is ignored. */
  done: boolean;
  entry?: { points: TracePoint[]; segments: number };
};
export const TRACE_TOLERANCE = 25;
export const TRACE_SAMPLE_STEP = 4;
const COMPLETE_FRACTION = 0.88;
const ORDER_SEARCH_RADIUS = Math.ceil(TRACE_TOLERANCE / TRACE_SAMPLE_STEP) + 1;
const ORDER_BACKTRACK = 3;
/** An approach must continue into the next stroke, as on B and R, not turn sharply as on T, I or K. */
const ENTRY_MIN_COSINE = Math.cos(Math.PI / 3);

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

/**
 * Some strokes start on the straight tail of the previous one, which ends on an earlier stroke and
 * leads into the new stroke, like the middle bars of B and R: the child may start from that junction.
 */
export function orderedTraceEntry(earlier: readonly (readonly TracePoint[])[], points: readonly TracePoint[]): TracePoint[] {
  const previous = earlier.at(-1);
  const end = previous?.at(-1);
  const start = points[0];
  if (!previous || !end || !start) return [];
  const length = Math.hypot(start.x - end.x, start.y - end.y);
  if (length <= TRACE_TOLERANCE) return [];
  const junction = earlier.slice(0, -1).some(stroke => (nearestSegment(end, stroke)?.distance ?? Infinity) <= TRACE_SAMPLE_STEP ** 2);
  if (!junction) return [];
  const ahead = points[Math.min(points.length - 1, ORDER_SEARCH_RADIUS)];
  const direction = Math.hypot(ahead.x - start.x, ahead.y - start.y);
  const cosine = direction && ((start.x - end.x) * (ahead.x - start.x) + (start.y - end.y) * (ahead.y - start.y)) / (length * direction);
  if (cosine < ENTRY_MIN_COSINE) return [];

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

/**
 * The segment reached near `position`. Segments running the way the finger moves come first, so a
 * cut corner (N, M, Z) follows the next leg while a cusp (the middle of 3) does not jump ahead.
 */
function orderedSegment(point: TracePoint, guide: readonly TracePoint[], position: number, motion?: TracePoint) {
  const start = Math.max(0, position - ORDER_SEARCH_RADIUS);
  const end = Math.min(guide.length - 2, position + ORDER_SEARCH_RADIUS - 1);
  let nearest: number | undefined;
  let along: number | undefined;
  let closest = TRACE_TOLERANCE ** 2;
  let closestAlong = closest;
  for (let index = start; index <= end; index++) {
    const distance = distanceSquared(point, guide[index], guide[index + 1]);
    if (distance > TRACE_TOLERANCE ** 2) continue;
    if (distance <= closest) [closest, nearest] = [distance, index];
    const forward = motion && (guide[index + 1].x - guide[index].x) * motion.x + (guide[index + 1].y - guide[index].y) * motion.y > 0;
    if (forward && distance <= closestAlong) [closestAlong, along] = [distance, index];
  }
  return along ?? nearest;
}

export function startOrderedTrace(points: readonly TracePoint[], covered: number, origin: TracePoint, entry: readonly TracePoint[] = []): OrderedTrace {
  const start = points[covered];
  if (Math.hypot(origin.x - start.x, origin.y - start.y) <= TRACE_TOLERANCE) {
    // Resuming a little behind the reached point is fine: progress is kept and evaluated from the touch.
    const reached = orderedSegment(origin, points, covered);
    return { covered, position: Math.min(covered, reached ?? covered), invalid: false, done: false };
  }
  if (covered || !entry.length) return { covered, position: covered, invalid: true, done: false };
  const approach = [...entry, ...points];
  const hit = nearestSegment(origin, approach, 0, entry.length - 1);
  return hit
    ? { covered, position: hit.index, invalid: false, done: false, entry: { points: approach, segments: entry.length } }
    : { covered, position: covered, invalid: true, done: false };
}

/** Evaluate forward progress on the current directed stroke, locally even on a loop or crossing. */
export function paintOrderedTrace(points: readonly TracePoint[], gesture: OrderedTrace, from: TracePoint, to: TracePoint) {
  if (gesture.invalid || gesture.done) return;
  const guide = gesture.entry?.points ?? points;
  const entrySegments = gesture.entry?.segments ?? 0;
  const motion = { x: to.x - from.x, y: to.y - from.y };
  for (const sample of traceSamples(from, to)) {
    const index = orderedSegment(sample, guide, gesture.position, motion);
    if (index === undefined || index + 1 < gesture.position - ORDER_BACKTRACK) {
      // Leaving a stroke already traced (going past its end, closing a loop) is not a mistake.
      if (orderedStrokeCompleted(points, gesture.covered)) gesture.done = true;
      else gesture.invalid = true;
      return;
    }
    gesture.position = Math.max(gesture.position, index + 1);
    gesture.covered = Math.max(gesture.covered, gesture.position - entrySegments);
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
