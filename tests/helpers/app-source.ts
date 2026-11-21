import { readdirSync, readFileSync } from "node:fs";

const appRoot = new URL("../../app/", import.meta.url);

/** Reads one application source file, e.g. `appSource("features/app-state/use-cloud-sync.ts")`. */
export function appSource(path: string): string {
  return readFileSync(new URL(path, appRoot), "utf8");
}

/** Concatenated UI sources (page, features, shared) for structural assertions that must hold everywhere. */
export function allUiSources(): string {
  const files = ["page.tsx", ...["features", "shared"].flatMap((dir) => readdirSync(new URL(`${dir}/`, appRoot), { recursive: true, encoding: "utf8" }).filter((file) => /\.tsx?$/.test(file)).map((file) => `${dir}/${file}`))];
  return files.map((file) => appSource(file)).join("\n");
}
