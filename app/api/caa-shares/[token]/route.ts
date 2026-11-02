import { noStoreJson } from "../../controller/_shared";
import { sharedAccess } from "../access";
export async function GET(_request: Request,context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const share = await sharedAccess(token);
    return share ? noStoreJson({ story: share.story,expiresAt: share.expiresAt }) : noStoreJson({ error: "not_found" },{ status: 404 });
  } catch { return noStoreJson({ error: "share_unavailable" },{ status: 503 }); }
}
