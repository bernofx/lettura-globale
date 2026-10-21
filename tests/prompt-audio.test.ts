import assert from "node:assert/strict";
import test from "node:test";
import { shouldAutoPronouncePrompt } from "../app/domain/prompt-audio.ts";

const recognitionPrompt = {
  sessionActive: true,
  awaitingNextExercise: false,
  isRecognition: true,
  enabled: true,
  promptWord: "mela",
};

test("la prima parola non viene pronunciata sulla schermata di transizione", () => {
  assert.equal(shouldAutoPronouncePrompt({ ...recognitionPrompt, awaitingNextExercise: true }), false);
  assert.equal(shouldAutoPronouncePrompt(recognitionPrompt), true);
});

test("la pronuncia automatica resta limitata ai turni di riconoscimento attivi", () => {
  assert.equal(shouldAutoPronouncePrompt({ ...recognitionPrompt, sessionActive: false }), false);
  assert.equal(shouldAutoPronouncePrompt({ ...recognitionPrompt, isRecognition: false }), false);
  assert.equal(shouldAutoPronouncePrompt({ ...recognitionPrompt, enabled: false }), false);
  assert.equal(shouldAutoPronouncePrompt({ ...recognitionPrompt, promptWord: "" }), false);
});
