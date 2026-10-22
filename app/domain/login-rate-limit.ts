export const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_FAILURE_THRESHOLD = 5;
export const LOGIN_RATE_MAX_BLOCK_MS = 15 * 60 * 1000;

export type LoginRateState = {
  windowStartedAt: number;
  failedAttempts: number;
  blockedUntil: number | null;
};

export function nextLoginFailure(previous: LoginRateState | undefined, now: number): LoginRateState {
  const withinWindow = previous && now - previous.windowStartedAt < LOGIN_RATE_WINDOW_MS;
  const failedAttempts = (withinWindow ? previous.failedAttempts : 0) + 1;
  const blockMs = failedAttempts < LOGIN_RATE_FAILURE_THRESHOLD
    ? 0
    : Math.min(30_000 * (2 ** (failedAttempts - LOGIN_RATE_FAILURE_THRESHOLD)), LOGIN_RATE_MAX_BLOCK_MS);
  return {
    windowStartedAt: withinWindow ? previous.windowStartedAt : now,
    failedAttempts,
    blockedUntil: blockMs ? now + blockMs : null,
  };
}

export function loginRetryAfterSeconds(states: LoginRateState[], now: number) {
  const blockedUntil = Math.max(0, ...states.map((state) => state.blockedUntil ?? 0));
  return blockedUntil > now ? Math.ceil((blockedUntil - now) / 1000) : 0;
}

