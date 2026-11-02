import { env } from "cloudflare:workers";
import { authenticatedAdult, noStoreJson } from "../controller/_shared";
import { storyPrefix } from "../caa-stories/storage";
import { inboxPrefix, listSharePointers } from "./storage";

export async function GET(request: Request) {
  const user = await authenticatedAdult();
  if (!user) return noStoreJson({ error: "authentication_required" },{ status: 401 });
  const scope = (await storyPrefix(user.userId,user.adultProfileId)).split("/")[1];
  if (request.headers.get("x-caa-profile") !== user.adultProfileId || request.headers.get("x-caa-scope") !== scope) return noStoreJson({ error: "profile_changed" },{ status: 401 });
  if (!env.BUCKET) return noStoreJson({ error: "storage_unavailable" },{ status: 503 });
  try {
    const shares = await listSharePointers(env.BUCKET,inboxPrefix(scope));
    return noStoreJson({ items: shares.filter(s => !s.revoked && s.expiresAt > Date.now()).map(s => ({ token: s.token,title: s.title,createdAt: s.createdAt,expiresAt: s.expiresAt })) });
  } catch { return noStoreJson({ error: "shares_unavailable" },{ status: 503 }); }
}
