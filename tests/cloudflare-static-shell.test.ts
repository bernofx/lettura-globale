import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config.ts";

test("pre-renderizza la shell per non consumare CPU Worker sulla pagina iniziale", () => {
  assert.equal(nextConfig.output, "export");
});
