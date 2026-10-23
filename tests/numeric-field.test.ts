import assert from "node:assert/strict";
import test from "node:test";
import { numericFieldValue } from "../app/domain/numeric-field.ts";

test("empty and intermediate input do not replace the last valid number", () => {
  assert.equal(numericFieldValue("", 1, 50), null);
  assert.equal(numericFieldValue("-", 1, 50), null);
  assert.equal(numericFieldValue("1.5", 1, 50), null);
  assert.equal(numericFieldValue("1e2", 1, 50), null);
  assert.equal(numericFieldValue("999999999999999999999999", 1, 50), null);
});

test("replacement numbers and bounds are normalized without persisting an empty value", () => {
  assert.equal(numericFieldValue("12", 1, 50), 12);
  assert.equal(numericFieldValue("02", 1, 50), 2);
  assert.equal(numericFieldValue("0", 1, 10), 1);
  assert.equal(numericFieldValue("80", 1, 50), 50);
  assert.equal(numericFieldValue("2", 4, 10), 4);
});
