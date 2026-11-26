import assert from "node:assert/strict";
import test from "node:test";
import { wordProgressStatus } from "../app/domain/progress-status.ts";

test("lo stato di una parola segue le soglie della legenda", () => {
  assert.equal(wordProgressStatus(4, 5), "secure");
  assert.equal(wordProgressStatus(3, 5), "growing");
  assert.equal(wordProgressStatus(2, 5), "reinforce");
  assert.equal(wordProgressStatus(5, 10), "growing");
});

test("con meno di tre prove non si dichiara una tendenza", () => {
  assert.equal(wordProgressStatus(2, 2), "few");
  assert.equal(wordProgressStatus(0, 0), "few");
  assert.equal(wordProgressStatus(0, 3), "reinforce");
});
