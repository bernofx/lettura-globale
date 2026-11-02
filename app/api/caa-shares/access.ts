import { env } from "cloudflare:workers";
import { authenticatedAdult } from "../controller/_shared";
import { storyPrefix } from "../caa-stories/storage";
import { canReadShare, loadShare } from "./storage";

export async function sharedAccess(token: string) {
  if (!env.BUCKET) return null;
  const share = await loadShare(env.BUCKET,token);
  if (!share) return null;
  let scope: string | null = null;
  if (share.recipientScope) {
    const user = await authenticatedAdult();
    if (user) scope = (await storyPrefix(user.userId,user.adultProfileId)).split("/")[1];
  }
  return canReadShare(share,scope) ? share : null;
}
