import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.WRANGLER_WRITE_LOGS ??= "false";
const { experimental_readRawConfig } = await import("wrangler");
const { rawConfig: production } = experimental_readRawConfig({ config: "wrangler.production.jsonc" });

const deployRedirect = new URL("../.wrangler/deploy/config.json", import.meta.url);
const { configPath } = JSON.parse(readFileSync(deployRedirect, "utf8"));
const generated = JSON.parse(readFileSync(new URL(configPath, deployRedirect), "utf8"));

for (const field of ["name", "queues", "triggers", "keep_vars"]) {
  assert.deepEqual(generated[field], production[field], `Generated Wrangler configuration differs in ${field}`);
}
console.log("Cloudflare build uses the production Worker, queue, scheduled triggers and variable policy.");
