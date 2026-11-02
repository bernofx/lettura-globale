import { env } from "cloudflare:workers";
import { authenticatedAdult, noStoreJson } from "../controller/_shared";
import { listStories, storyPrefix } from "./storage";

export async function GET(request: Request) {
  const user = await authenticatedAdult();
  if (!user) return noStoreJson({ error: "authentication_required" }, { status: 401 });
  if (request.headers.get("x-caa-profile") !== user.adultProfileId) return noStoreJson({ error: "profile_changed" }, { status: 401 });
  if (!env.BUCKET) return noStoreJson({ error: "storage_unavailable" }, { status: 503 });
  try {
    const prefix = await storyPrefix(user.userId,user.adultProfileId); const scope = prefix.split("/")[1];
    if (request.headers.has("x-caa-scope") && request.headers.get("x-caa-scope") !== scope) return noStoreJson({ error: "profile_changed" }, { status: 401 });
    return noStoreJson({ ...await listStories(env.BUCKET,prefix),scope });
  }
  catch { return noStoreJson({ error: "stories_unavailable" }, { status: 503 }); }
}
