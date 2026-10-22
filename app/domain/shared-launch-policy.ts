export const SHARED_LAUNCH_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export function sharedLaunchExpiresAt(createdAt: number) {
  return createdAt + SHARED_LAUNCH_LIFETIME_MS;
}

export function sharedLaunchIsAvailable(launch: { expiresAt: number | null; revokedAt: number | null }, now = Date.now()) {
  return launch.revokedAt === null && launch.expiresAt !== null && launch.expiresAt > now;
}

