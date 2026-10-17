import assert from "node:assert/strict";
import test from "node:test";
import { buildSharedLaunchUrl, parseSharedLaunch } from "../app/domain/shared-launch.ts";

test("crea e rilegge un link condiviso per un esercizio", () => {
  const url = buildSharedLaunchUrl("https://lettura-globale.example", { kind: "exercise", id: "exercise-123" });
  const parsed = new URL(url);
  assert.equal(parsed.pathname, "/");
  assert.deepEqual(parseSharedLaunch(parsed.search), { kind: "exercise", id: "exercise-123" });
});

test("crea e rilegge un link condiviso per una sequenza", () => {
  const url = buildSharedLaunchUrl("https://lettura-globale.example/app", { kind: "sequence", id: "sequence-456" });
  assert.deepEqual(parseSharedLaunch(new URL(url).search), { kind: "sequence", id: "sequence-456" });
});

test("ignora link incompleti o con un tipo sconosciuto", () => {
  assert.equal(parseSharedLaunch("?launch=exercise"), null);
  assert.equal(parseSharedLaunch("?launch=other&id=123"), null);
  assert.equal(parseSharedLaunch(""), null);
});
