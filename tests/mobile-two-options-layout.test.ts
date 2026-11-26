import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("su mobile due risposte standard sono impilate senza modificare IL/LA", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.session-screen \.answer-grid\.options-2\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  const sentenceMatching = readFileSync(new URL("../app/features/session/activities/sentence-matching.tsx", import.meta.url), "utf8");
  assert.match(sentenceMatching, /className=\{`answer-grid sentence-answer-grid options-\$\{optionIds.length\}`\}/);
  assert.doesNotMatch(css, /\.sentence-answer-grid\.options-2\{[^}]*grid-template-columns/);
  assert.doesNotMatch(css, /\.article-boxes\.options-2/);
});

test("su tablet quattro risposte occupano due colonne", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@media\(min-width:761px\) and \(max-width:1100px\)\{\.session-screen \.answer-grid\.options-4\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
