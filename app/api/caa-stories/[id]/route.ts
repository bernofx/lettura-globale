import { env } from "cloudflare:workers";
import { authenticatedAdult, noStoreJson } from "../../controller/_shared";
import { caaId, parseCaaStory } from "../../../domain/caa-stories";
import { getStory, listStories, putStory, storyPrefix } from "../storage";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const user = await authenticatedAdult();
  if (!user) return noStoreJson({ error: "authentication_required" }, { status: 401 });
  const prefix = await storyPrefix(user.userId,user.adultProfileId);
  if (request.headers.get("x-caa-profile") !== user.adultProfileId || request.headers.get("x-caa-scope") !== prefix.split("/")[1]) return noStoreJson({ error: "profile_changed" }, { status: 401 });
  if (!env.BUCKET) return noStoreJson({ error: "storage_unavailable" }, { status: 503 });
  const { id } = await context.params;
  if (!caaId(id)) return noStoreJson({ error: "invalid_id" }, { status: 400 });
  try {
    const result = await getStory(env.BUCKET, `${prefix}${id}.json`);
    return result ? noStoreJson({ story: result.story, etag: result.etag }) : noStoreJson({ error: "not_found" }, { status: 404 });
  } catch { return noStoreJson({ error: "story_unavailable" }, { status: 503 }); }
}

export async function PUT(request: Request, context: Context) {
  const user = await authenticatedAdult();
  if (!user) return noStoreJson({ error: "authentication_required" }, { status: 401 });
  const prefix = await storyPrefix(user.userId,user.adultProfileId);
  if (request.headers.get("x-caa-profile") !== user.adultProfileId || request.headers.get("x-caa-scope") !== prefix.split("/")[1]) return noStoreJson({ error: "profile_changed" }, { status: 401 });
  if (!env.BUCKET) return noStoreJson({ error: "storage_unavailable" }, { status: 503 });
  const { id } = await context.params;
  if (!caaId(id)) return noStoreJson({ error: "invalid_id" }, { status: 400 });
  const reader = request.body?.getReader();
  if (!reader) return noStoreJson({ error: "invalid_story" }, { status: 400 });
  const chunks: Uint8Array[] = []; let length = 0;
  for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 200_000) { await reader.cancel(); return noStoreJson({ error: "story_too_large" }, { status: 413 }); } chunks.push(part.value); }
  let story; let baseEtag: string | null; let operationId: string;
  try {
    const raw = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { raw.set(chunk,offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder().decode(raw));
    story = parseCaaStory(body.story);
    baseEtag = body.baseEtag; operationId = body.operationId;
    if (story.id !== id || (baseEtag !== null && (typeof baseEtag !== "string" || !/^[a-f0-9]{32}$/.test(baseEtag))) || typeof operationId !== "string" || !caaId(operationId)) throw new Error("invalid_request");
  } catch { return noStoreJson({ error: "invalid_story" }, { status: 400 }); }
  try {
    if (baseEtag === null && (await listStories(env.BUCKET,prefix)).items.length >= 100 && !await env.BUCKET.head(`${prefix}${id}.json`)) return noStoreJson({ error: "story_limit" }, { status: 409 });
    const result = await putStory(env.BUCKET, `${prefix}${id}.json`, story, baseEtag, operationId);
    return noStoreJson(result.status === 200 ? { etag: result.etag } : { error: "story_conflict" }, { status: result.status });
  } catch { return noStoreJson({ error: "story_save_failed" }, { status: 503 }); }
}
