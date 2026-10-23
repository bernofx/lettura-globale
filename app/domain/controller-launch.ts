import { parseControllerToken, PAIRING_DURATION_MS } from "./remote-controller.ts";
import { parseRealtimeController } from "./realtime-protocol.ts";

export const PENDING_CONTROLLER_LAUNCH_KEY = "lg-pending-controller-launch";
type LaunchStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Keep the QR through login/update reloads, never replace or discard the local session. */
export function resolveControllerLaunch(search: string, storage: LaunchStorage, now = Date.now()) {
  const token = parseControllerToken(search);
  if (token) {
    const launch = { token, realtimeSessionId: parseRealtimeController(search), createdAt: now };
    try { storage.setItem(PENDING_CONTROLLER_LAUNCH_KEY, JSON.stringify(launch)); } catch { /* In-memory launch still works. */ }
    return launch;
  }
  try {
    const saved = JSON.parse(storage.getItem(PENDING_CONTROLLER_LAUNCH_KEY) ?? "null");
    if (saved && typeof saved.token === "string" && /^[a-f0-9]{64}$/.test(saved.token)
      && (saved.realtimeSessionId === null || (typeof saved.realtimeSessionId === "string" && /^[a-zA-Z0-9:_-]{8,100}$/.test(saved.realtimeSessionId)))
      && typeof saved.createdAt === "number" && saved.createdAt <= now && now - saved.createdAt < PAIRING_DURATION_MS) {
      return saved as { token: string; realtimeSessionId: string | null; createdAt: number };
    }
    storage.removeItem(PENDING_CONTROLLER_LAUNCH_KEY);
  } catch { /* Invalid/disabled storage must not prevent opening home. */ }
  return null;
}
