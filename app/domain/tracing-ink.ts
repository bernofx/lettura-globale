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
  /** Started by going on from a finished stroke: leaving before any progress is like lifting the finger. */
  handedOver?: boolean;
  endReached?: boolean;
  /** The finger went on into the next stroke without lifting: continue there from `at`. */
  handover?: { gesture: OrderedTrace; at: TracePoint };
};
export type NextOrderedStroke = { points: readonly TracePoint[]; traced: readonly (readonly TracePoint[])[] };
/** Free tracing: how far from the guide (half wide 18 units) the finger still leaves ink. */
export const TRACE_TOLERANCE = 32;
/** Required order: how far from the current stroke the finger may wander before the gesture turns red. */
export const ORDER_TOLERANCE = 45;
export const TRACE_SAMPLE_STEP = 4;
const COMPLETE_FRACTION = 0.88;
/** Segments examined around the reached point (about 32 units along the guide). */
const ORDER_SEARCH_RADIUS = 8;
const ORDER_BACKTRACK = 6;
/** Samples of different strokes this close belong to the same junction. */
const INK_JOIN = 6;

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

function nearestSegment(point: TracePoint, points: readonly TracePoint[], start = 0, end = points.length - 2, tolerance = TRACE_TOLERANCE) {
  let nearest = -1;
  let closest = tolerance ** 2;
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
 * The way along the strokes already traced from the ink nearest to `origin` to `start`, when the new
 * stroke begins on that ink: the finger may slide over what is done to reach it, without lifting.
 * Strokes are joined wherever their samples touch (junctions, crossings, closed loops).
 */
export function inkApproach(traced: readonly (readonly TracePoint[])[], origin: TracePoint, start: TracePoint): TracePoint[] {
  const nodes = traced.flatMap((points, stroke) => points.map((point, index) => ({ point, stroke, index })));
  if (!nodes.length) return [];
  const near = (a: TracePoint, b: TracePoint, limit: number) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= limit ** 2;
  let source = -1;
  let closest = ORDER_TOLERANCE ** 2;
  for (const [index, { point }] of nodes.entries()) {
    const distance = (point.x - origin.x) ** 2 + (point.y - origin.y) ** 2;
    if (distance <= closest) [closest, source] = [distance, index];
  }
  if (source < 0 || !nodes.some(node => near(node.point, start, INK_JOIN))) return [];

  const distance = new Float64Array(nodes.length).fill(Infinity);
  const previous = new Int32Array(nodes.length).fill(-1);
  const settled = new Uint8Array(nodes.length);
  distance[source] = 0;
  for (;;) {
    let current = -1;
    for (let index = 0; index < nodes.length; index++) if (!settled[index] && distance[index] < (current < 0 ? Infinity : distance[current])) current = index;
    if (current < 0) return [];
    const node = nodes[current];
    if (near(node.point, start, INK_JOIN)) {
      const path: TracePoint[] = [];
      for (let at = current; at >= 0; at = previous[at]) path.unshift(nodes[at].point);
      return path;
    }
    settled[current] = 1;
    for (const [index, other] of nodes.entries()) {
      if (settled[index]) continue;
      const neighbour = other.stroke === node.stroke && Math.abs(other.index - node.index) === 1;
      if (!neighbour && !near(other.point, node.point, INK_JOIN)) continue;
      const length = distance[current] + Math.hypot(other.point.x - node.point.x, other.point.y - node.point.y);
      if (length < distance[index]) [distance[index], previous[index]] = [length, current];
    }
  }
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
  let closest = ORDER_TOLERANCE ** 2;
  let closestAlong = closest;
  for (let index = start; index <= end; index++) {
    const distance = distanceSquared(point, guide[index], guide[index + 1]);
    if (distance > ORDER_TOLERANCE ** 2) continue;
    if (distance <= closest) [closest, nearest] = [distance, index];
    const forward = motion && (guide[index + 1].x - guide[index].x) * motion.x + (guide[index + 1].y - guide[index].y) * motion.y > 0;
    if (forward && distance <= closestAlong) [closestAlong, along] = [distance, index];
  }
  return along ?? nearest;
}

/** Start a gesture on the next stroke, at its start or anywhere on the ink already traced that leads there. */
export function startOrderedTrace(points: readonly TracePoint[], covered: number, origin: TracePoint, traced: readonly (readonly TracePoint[])[] = []): OrderedTrace {
  const start = points[covered];
  if (Math.hypot(origin.x - start.x, origin.y - start.y) <= ORDER_TOLERANCE) {
    // Resuming a little behind the reached point is fine: progress is kept and evaluated from the touch.
    const reached = orderedSegment(origin, points, covered);
    return { covered, position: Math.min(covered, reached ?? covered), invalid: false, done: false };
  }
  const approach = covered ? [] : inkApproach(traced, origin, start);
  if (!approach.length) return { covered, position: covered, invalid: true, done: false };
  return { covered, position: 0, invalid: false, done: false, entry: { points: [...approach, ...points], segments: approach.length } };
}

/**
 * Evaluate forward progress on the current directed stroke, locally even on a loop or crossing.
 * With `next`, a finger that finishes the stroke and goes on along the next one (A drawn as «Λ»,
 * the two bowls of B, the leg of R) is handed over to it instead of having to lift.
 */
export function paintOrderedTrace(points: readonly TracePoint[], gesture: OrderedTrace, from: TracePoint, to: TracePoint, next?: NextOrderedStroke) {
  if (gesture.invalid || gesture.done) return;
  const guide = gesture.entry?.points ?? points;
  const entrySegments = gesture.entry?.segments ?? 0;
  const motion = { x: to.x - from.x, y: to.y - from.y };
  const handOver = (at: TracePoint) => {
    const following = next && startOrderedTrace(next.points, 0, at, next.traced);
    if (!following || following.invalid) return false;
    following.handedOver = true;
    gesture.done = true;
    gesture.handover = { gesture: following, at };
    return true;
  };
  for (const sample of traceSamples(from, to)) {
    const index = orderedSegment(sample, guide, gesture.position, motion);
    if (index === undefined || index + 1 < gesture.position - ORDER_BACKTRACK) {
      // Leaving a stroke already traced (going past its end, closing a loop) is not a mistake.
      if (gesture.handedOver && !gesture.covered) gesture.done = true;
      else if (!orderedStrokeCompleted(points, gesture.covered)) gesture.invalid = true;
      else if (!handOver(sample)) gesture.done = true;
      return;
    }
    gesture.position = Math.max(gesture.position, index + 1);
    gesture.covered = Math.max(gesture.covered, gesture.position - entrySegments);
    // Tried once on reaching the end (the answer only changes once the finger leaves the stroke).
    if (gesture.covered >= points.length - 1 && !gesture.endReached) {
      gesture.endReached = true;
      if (handOver(sample)) return;
    }
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
