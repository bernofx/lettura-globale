import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("l'indicatore QR nella sessione occupa lo stesso spazio compatto del journal", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.session-tools \.remote-host-badge[^}]*width:28px;min-width:28px;max-width:28px;height:28px;min-height:28px;max-height:28px;flex:0 0 28px/);
  assert.match(css, /\.session-tools \.remote-host-summary\{width:28px!important;min-width:28px!important;max-width:28px!important;height:28px!important;min-height:28px!important;max-height:28px!important/);
  assert.match(css, /\.session-tools \.remote-host-summary\{[^}]*border:0!important;[^}]*background:transparent!important;box-shadow:none!important/);
  assert.match(css, /\.session-tools \.remote-host-summary>\.remote-status-dot\{position:static;width:9px;height:9px/);
});

test("la nuova shell invalida la vecchia cache PWA", () => {
  const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(serviceWorker, /CACHE_NAME = "lettura-globale-v22"/);
  assert.match(serviceWorker, /lettura-globale:update-ready/);
});

test("il componente QR mantiene le dimensioni anche prima del caricamento del CSS", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /remote-host-badge[^\n]*style=\{\{ width: 28, minWidth: 28, maxWidth: 28, height: 28/);
  assert.match(page, /remote-host-summary[^\n]*style=\{\{ width: 28, minWidth: 28, maxWidth: 28, height: 28/);
});
