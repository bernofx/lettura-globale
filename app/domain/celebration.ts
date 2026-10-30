export const CELEBRATION_DURATION_MS = 20_000;
export const BALLOON_WAVE_INTERVAL_MS = 2_000;
export const BALLOON_WAVE_COUNT = CELEBRATION_DURATION_MS / BALLOON_WAVE_INTERVAL_MS;
export const BALLOON_COLORS = ["#f77c8b", "#f3b854", "#73c9c2", "#9583e5", "#79a9ed", "#ed95d5", "#9ccc71", "#efaa77"];
export const BALLOON_COUNT = BALLOON_WAVE_COUNT * BALLOON_COLORS.length;

/** Retain at most four overlapping flights (5.3s + stagger), not every past wave. */
export function celebrationBalloons(wave: number, continuous = false) {
  const current = Math.max(0, Math.floor(wave));
  const last = continuous ? current : Math.min(BALLOON_WAVE_COUNT - 1, current);
  return Array.from({ length: Math.min(last + 1, 4) }, (_, offset) => last - Math.min(last, 3) + offset)
    .flatMap((flight) => BALLOON_COLORS.map((color, slot) => ({ id: flight * BALLOON_COLORS.length + slot, wave: flight, slot, color })));
}

/** Ephemeral reward only: no session events, scores or cloud writes. */
export function popCelebrationBalloon(popped: ReadonlySet<number>, index: number, continuous = false) {
  if (!Number.isInteger(index) || index < 0 || (!continuous && index >= BALLOON_COUNT) || popped.has(index)) return popped;
  return new Set([...popped, index]);
}
