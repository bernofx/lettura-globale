import assert from "node:assert/strict";
import test from "node:test";
import { customSoundChoice, customSoundId, isMp3Header, isSoundCue, normalizeSoundName } from "../app/domain/sound-library.ts";

test("le categorie sono limitate ai quattro momenti previsti", () => {
  assert.equal(isSoundCue("wrong"), true);
  assert.equal(isSoundCue("select"), true);
  assert.equal(isSoundCue("anything"), false);
});

test("i suoni caricati usano identificativi opachi e validati", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(customSoundId(customSoundChoice(id)), id);
  assert.equal(customSoundId("custom:../private"), null);
});

test("i file MP3 vengono riconosciuti dall'intestazione e il nome è normalizzato", () => {
  assert.equal(isMp3Header(new Uint8Array([0x49, 0x44, 0x33, 0x04, 0, 0])), true);
  assert.equal(isMp3Header(new Uint8Array([0xff, 0xfb, 0x90, 0x64])), true);
  assert.equal(isMp3Header(new Uint8Array([0x52, 0x49, 0x46, 0x46])), false);
  assert.equal(normalizeSoundName("  Applausi   brevi "), "Applausi brevi");
  assert.equal(normalizeSoundName("\n"), null);
});
