import assert from "node:assert/strict";
import test from "node:test";
import { PENDING_CONTROLLER_LAUNCH_KEY, resolveControllerLaunch } from "../app/domain/controller-launch.ts";
import { PAIRING_DURATION_MS } from "../app/domain/remote-controller.ts";

function storage() {
  const data = new Map<string, string>([["lg-active-session", "local-session-to-keep"]]);
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}

test("il QR sopravvive a login, pulizia URL e reload senza scartare la sessione locale", () => {
  const saved = storage();
  const token = "a".repeat(64);
  const launch = resolveControllerLaunch(`?controller=${token}&transport=do&session=session-demo-123`, saved, 1000);
  assert.deepEqual(launch, { token, realtimeSessionId: "session-demo-123", createdAt: 1000 });
  assert.deepEqual(resolveControllerLaunch("", saved, 2000), launch);
  assert.equal(saved.getItem("lg-active-session"), "local-session-to-keep");
  saved.removeItem(PENDING_CONTROLLER_LAUNCH_KEY); // join confermato / Home / logout
  assert.equal(resolveControllerLaunch("", saved, 3000), null);
  assert.equal(saved.getItem("lg-active-session"), "local-session-to-keep");
});

test("l'ultima scansione prevale e un intento scaduto non riapre il controller", () => {
  const saved = storage();
  resolveControllerLaunch(`?controller=${"a".repeat(64)}`, saved, 1000);
  const next = resolveControllerLaunch(`?controller=${"b".repeat(64)}`, saved, 2000);
  assert.equal(resolveControllerLaunch("", saved, 3000)?.token, next?.token);
  assert.equal(resolveControllerLaunch("", saved, 2000 + PAIRING_DURATION_MS), null);
  saved.setItem(PENDING_CONTROLLER_LAUNCH_KEY, JSON.stringify({ token: "bad", createdAt: 4000 }));
  assert.equal(resolveControllerLaunch("", saved, 4001), null);
});
