export const CELEBRATION_DURATION_MS = 6_000;
export const BALLOON_COLORS = ["#f77c8b", "#f3b854", "#73c9c2", "#9583e5", "#79a9ed", "#ed95d5", "#9ccc71", "#efaa77"];

/** Ephemeral reward only: no session events, scores or cloud writes. */
export function popCelebrationBalloon(popped: ReadonlySet<number>, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= BALLOON_COLORS.length || popped.has(index)) return popped;
  return new Set([...popped, index]);
}
