import { ownerStoragePrefix } from "../media-key.ts";
import { caaId, parseCaaStory } from "../../domain/caa-stories.ts";
import type { CaaStory, CaaSummary } from "../../domain/caa-stories.ts";

export async function storyPrefix(accountId: string, adultId: string) { return `caa-stories/${await ownerStoragePrefix(JSON.stringify([accountId,adultId]))}/`; }
export async function listStories(bucket: R2Bucket, prefix: string) {
  // R2 supports include on this compatibility date; the pinned global type omits it.
  const options = { prefix,limit: 100,include: ["customMetadata"] };
  const objects = await bucket.list(options);
  const items: CaaSummary[] = objects.objects.map(object => {
    const id = object.key.slice(prefix.length).replace(/\.json$/, "");
    let title = "Storia"; try { title = decodeURIComponent(object.customMetadata?.title ?? "Storia"); } catch { /* Invalid old metadata must not break the list. */ }
    return { id, title, updatedAt: object.customMetadata?.updatedAt ?? object.uploaded.toISOString(), archived: object.customMetadata?.archived === "true", etag: object.etag };
  }).filter(item => caaId(item.id));
  return { items: items.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)), truncated: objects.truncated };
}
export async function getStory(bucket: R2Bucket, key: string) {
  const object = await bucket.get(key);
  if (!object) return null;
  return { story: parseCaaStory(await object.json()), etag: object.etag, operationId: object.customMetadata?.operationId };
}
export async function putStory(bucket: R2Bucket, key: string, story: CaaStory, baseEtag: string | null, operationId: string) {
  const payload = JSON.stringify(story);
  const payloadHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(payload))),byte => byte.toString(16).padStart(2,"0")).join("");
  const previous = await bucket.head(key);
  if (previous?.customMetadata?.operationId === operationId) return previous.customMetadata.payloadHash === payloadHash ? { status: 200, etag: previous.etag } : { status: 409 };
  if ((previous?.etag ?? null) !== baseEtag) return { status: 409 };
  const object = await bucket.put(key, payload, {
    onlyIf: baseEtag ? { etagMatches: baseEtag } : { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
    customMetadata: { operationId,payloadHash, title: encodeURIComponent(story.title), updatedAt: story.updatedAt, archived: String(story.archived) },
  });
  if (object) return { status: 200,etag: object.etag };
  // Two retries can race after a lost response; recognize the exact committed op.
  const committed = await bucket.head(key);
  return committed?.customMetadata?.operationId === operationId && committed.customMetadata.payloadHash === payloadHash ? { status: 200,etag: committed.etag } : { status: 409 };
}
