import assert from "node:assert/strict";
import test from "node:test";
import { defaultSoundPreferences, hydrateSoundPreferences, soundAsset, soundOptions } from "../app/domain/sound-preferences.ts";

test("ripristina solo scelte sonore note e mantiene quelle mancanti", () => {
  assert.deepEqual(hydrateSoundPreferences({ wrong: "naaa", finish: "applause", select: "../../secret.mp3" }), {
    ...defaultSoundPreferences,
    wrong: "naaa",
    finish: "applause",
  });
  assert.deepEqual(hydrateSoundPreferences(null), defaultSoundPreferences);
});

test("ogni evento offre tre scelte e gli MP3 restano in un elenco fisso", () => {
  for (const options of Object.values(soundOptions)) assert.equal(options.length, 3);
  assert.equal(soundAsset("wrong", "naaa"), "/audio/naaa.mp3");
  assert.equal(soundAsset("finish", "applause"), "/audio/applausi.mp3");
  assert.equal(soundAsset("select", "select"), "/audio/select.mp3");
  assert.equal(soundAsset("correct", "unknown"), null);
});
