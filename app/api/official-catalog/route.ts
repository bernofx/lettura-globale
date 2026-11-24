import { env } from "cloudflare:workers";
import { readOfficialCatalog } from "../../server/official-catalog";
import { noStoreJson } from "../controller/_shared";

export async function GET() {
  if (!env.DB) return noStoreJson({ error: "catalog_unavailable" }, { status: 503 });
  return noStoreJson({ entries: await readOfficialCatalog(env.DB) });
}
