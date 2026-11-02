import { env } from "cloudflare:workers";
import { sharedAccess } from "../../../access";
import { caaMediaId } from "../../../../../domain/caa-stories";
export async function GET(_request: Request,context: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token,id } = await context.params;
    const share = await sharedAccess(token);
    if (!share || !caaMediaId(id) || !share.story.sentences.some(s => s.tokens.some(t => t.symbol?.kind === "media" && t.symbol.id === id))) return new Response("Not found",{ status: 404,headers: { "cache-control": "private, no-store" } });
    const object = await env.BUCKET!.get(`caa-shares/${token}/media/${id}`);
    if (!object) return new Response("Not found",{ status: 404,headers: { "cache-control": "private, no-store" } });
    return new Response(object.body,{ headers: { "content-type": object.httpMetadata?.contentType ?? "image/webp","cache-control": "private, no-store","x-content-type-options": "nosniff" } });
  } catch { return new Response("Unavailable",{ status: 503,headers: { "cache-control": "private, no-store" } }); }
}
