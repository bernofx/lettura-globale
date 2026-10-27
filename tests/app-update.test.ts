import assert from "node:assert/strict";
import test from "node:test";
import { shouldDeferAppUpdate } from "../app/domain/app-update.ts";
import { parseSharedPreview } from "../app/domain/shared-launch.ts";

const search = "?preview=c6b1291e-6eb6-4dc9-b89c-95fedd825cba";

test("first-visit SW activation cannot reload a public preview before React commits it", () => {
  assert.equal(shouldDeferAppUpdate(search, false, false), true);
  // Fetch success does not consume the URL; updates in the commit gap are deferred.
  assert.ok(parseSharedPreview(search));
  assert.equal(shouldDeferAppUpdate(search, false, false), true);
  assert.equal(shouldDeferAppUpdate(search, true, false), true);
  // A manual refresh still has the same public token, without any adult cookie.
  assert.equal(parseSharedPreview(search)?.token, "c6b1291e-6eb6-4dc9-b89c-95fedd825cba");
  // Explicit exit removes the token and permits the pending update.
  assert.equal(shouldDeferAppUpdate("", false, false), false);
});

test("existing session/controller protections and ordinary home updates are preserved", () => {
  assert.equal(shouldDeferAppUpdate("", true, false), true);
  assert.equal(shouldDeferAppUpdate("", false, true), true);
  assert.equal(shouldDeferAppUpdate("", false, false), false);
  assert.equal(shouldDeferAppUpdate("?preview=invalid", false, false), false);
});
