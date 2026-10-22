import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("l'indicatore QR nella sessione occupa lo stesso spazio compatto del journal", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.session-tools \.remote-host-badge[^}]*width:28px;height:28px;flex:0 0 28px/);
  assert.match(css, /\.session-tools \.remote-host-summary\{width:28px;height:28px;padding:0;border:0;border-radius:999px/);
  assert.match(css, /\.session-tools \.remote-host-summary>\.remote-status-dot\{position:static;width:9px;height:9px/);
});
