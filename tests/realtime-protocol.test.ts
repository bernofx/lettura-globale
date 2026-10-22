import assert from "node:assert/strict";
import test from "node:test";
import { parseRealtimeController, realtimeControllerUrl } from "../app/domain/realtime-protocol.ts";
import { controllerUrl, parseControllerToken } from "../app/domain/remote-controller.ts";

test("il QR classico resta invariato e il QR DO identifica esplicitamente il trasporto", () => {
  const token = "a".repeat(64);
  const classic = new URL(controllerUrl("https://app.example", token));
  assert.equal(classic.searchParams.has("transport"), false);
  assert.equal(parseRealtimeController(classic.search), null);
  const realtime = new URL(realtimeControllerUrl("https://app.example", token, "session-demo"));
  assert.equal(parseControllerToken(realtime.search), token);
  assert.equal(parseRealtimeController(realtime.search), "session-demo");
  assert.equal(parseRealtimeController("?transport=do&session=../../secret"), null);
  assert.equal(parseRealtimeController("?transport=classic&session=session-demo"), null);
});
