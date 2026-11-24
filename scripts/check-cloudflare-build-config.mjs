import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.WRANGLER_WRITE_LOGS ??= "false";
const { experimental_readRawConfig } = await import("wrangler");
const config = process.env.LETTURA_WRANGLER_CONFIG ?? "wrangler.production.jsonc";
const { rawConfig: expected } = experimental_readRawConfig({ config });

const deployRedirect = new URL("../.wrangler/deploy/config.json", import.meta.url);
const { configPath } = JSON.parse(readFileSync(deployRedirect, "utf8"));
const generated = JSON.parse(readFileSync(new URL(configPath, deployRedirect), "utf8"));

for (const field of ["name", "queues", "triggers", "keep_vars"]) {
  assert.deepEqual(generated[field], expected[field], `Generated Wrangler configuration differs in ${field}`);
}
console.log(`Cloudflare build uses the Worker, queue, scheduled triggers and variable policy of ${config}.`);
