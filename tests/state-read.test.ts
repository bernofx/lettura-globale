import assert from "node:assert/strict";
import test from "node:test";
import { stateReadHeaders, stateReadMatches, stateReadTag } from "../app/domain/state-read.ts";

test("il validatore dipende da account, adulto e revisione senza esporre identità", async () => {
  const tag = await stateReadTag("account-demo", "adult-demo", 10);
  assert.equal(await stateReadTag("account-demo", "adult-demo", 10), tag);
  assert.notEqual(await stateReadTag("account-other", "adult-demo", 10), tag);
  assert.notEqual(await stateReadTag("account-demo", "adult-other", 10), tag);
  assert.notEqual(await stateReadTag("account-demo", undefined, 10), tag);
  assert.notEqual(await stateReadTag("account-demo", "adult-demo", 11), tag);
  assert.equal(tag.includes("account-demo"), false);
  assert.equal(tag.includes("adult-demo"), false);
});

test("304 richiede un validatore esatto e non abilita cache pubbliche", async () => {
  const tag = await stateReadTag("demo", "adult", 1);
  assert.equal(stateReadMatches(tag, tag), true);
  assert.equal(stateReadMatches(`W/${tag}`, tag), true);
  assert.equal(stateReadMatches(`"other", ${tag}`, tag), true);
  for (const value of [null, "", "*", '"invalid"', tag.repeat(100)]) assert.equal(stateReadMatches(value, tag), false);
  assert.equal(stateReadHeaders(tag)["cache-control"], "private, no-store");
  assert.equal(stateReadHeaders(tag).etag, tag);
});
