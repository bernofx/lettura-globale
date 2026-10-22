import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("su mobile due risposte standard sono impilate senza modificare IL/LA", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.session-screen \.answer-grid\.options-2\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.session-screen \.sentence-answer-grid\.options-2\{grid-template-columns:minmax\(0,1fr\)!important\}/);
  assert.doesNotMatch(css, /\.article-boxes\.options-2/);
});
