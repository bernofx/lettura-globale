import assert from "node:assert/strict";
import test from "node:test";
import { defaultSoundPreferences, hydrateSoundPreferences, soundAsset, soundOptions } from "../app/domain/sound-preferences.ts";
import { customSoundChoice } from "../app/domain/sound-library.ts";

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

test("un audio caricato è disponibile solo nella sua categoria", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const choice = customSoundChoice(id);
  const catalog = [{ id, name: "Il mio suono", cue: "wrong" as const, byteLength: 10, createdAt: 1 }];
  assert.equal(hydrateSoundPreferences({ wrong: choice }).wrong, choice);
  assert.equal(soundAsset("wrong", choice, catalog), `/api/sounds/${id}`);
  assert.equal(soundAsset("correct", choice, catalog), null);
});
