import { parseCaaStory, type CaaStory } from "../../domain/caa-stories.ts";
import { ownerStoragePrefix } from "../media-key.ts";

export const shareToken = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const SHARE_DURATION = 30 * 24 * 60 * 60 * 1000;
export type CaaShare = {
  token: string; ownerScope: string; storyId: string; baseEtag: string;
  recipientScope: string | null; recipientEmail: string | null;
  createdAt: number; expiresAt: number; revokedAt?: number; story: CaaStory;
};
export const shareKey = (token: string) => `caa-shares/${token}/record.json`;
export const sentPrefix = (scope: string) => `caa-sent/${scope}/`;
export const inboxPrefix = (scope: string) => `caa-inbox/${scope}/`;
export async function loadShare(bucket: R2Bucket, token: string) {
  if (!shareToken(token)) return null;
  const object = await bucket.get(shareKey(token));
  return object ? await object.json<CaaShare>() : null;
}
export function liveShare(share: CaaShare | null, now = Date.now()): share is CaaShare {
  return Boolean(share && !share.revokedAt && share.expiresAt > now);
}
export function canReadShare(share: CaaShare | null, scope: string | null, now = Date.now()) {
  return liveShare(share,now) && (!share.recipientScope || scope === share.recipientScope || scope === share.ownerScope);
}
export function shareSummary(share: CaaShare) {
  return { token: share.token,title: share.story.title,storyId: share.storyId,recipientEmail: share.recipientEmail,createdAt: share.createdAt,expiresAt: share.expiresAt,revoked: Boolean(share.revokedAt) };
}
export async function listSharePointers(bucket: R2Bucket, prefix: string) {
  // One R2 list, never N full story reads. These summaries do not grant access.
  const options = { prefix,limit: 1000,include: ["customMetadata"] };
  const objects = await bucket.list(options);
  return objects.objects.flatMap(object => {
    const token = object.key.slice(prefix.length).replace(/\.json$/,""),m = object.customMetadata;
    if (!shareToken(token) || !m) return [];
    try { return [{ token,title: decodeURIComponent(m.title),storyId: m.storyId,recipientEmail: m.recipientEmail ? decodeURIComponent(m.recipientEmail) : null,createdAt: Number(m.createdAt),expiresAt: Number(m.expiresAt),revoked: m.revoked === "true" }]; } catch { return []; }
  }).sort((a,b) => b.createdAt - a.createdAt);
}
export async function writeSharePointers(bucket: R2Bucket, share: CaaShare) {
  const customMetadata = { title: encodeURIComponent(share.story.title),storyId: share.storyId,recipientEmail: share.recipientEmail ? encodeURIComponent(share.recipientEmail) : "",createdAt: String(share.createdAt),expiresAt: String(share.expiresAt),revoked: String(Boolean(share.revokedAt)) };
  await bucket.put(`${sentPrefix(share.ownerScope)}${share.token}.json`,"{}",{ customMetadata });
  if (share.recipientScope) await bucket.put(`${inboxPrefix(share.recipientScope)}${share.token}.json`,"{}",{ customMetadata });
}
export async function snapshotMedia(bucket: R2Bucket, accountId: string, token: string, input: CaaStory) {
  const story = parseCaaStory(input);
  const ids = [...new Set(story.sentences.flatMap(s => s.tokens.flatMap(t => t.symbol?.kind === "media" ? [t.symbol.id] : [])))];
  if (ids.length > 60) throw new Error("too_many_images");
  const prefix = await ownerStoragePrefix(accountId); let bytes = 0;
  // Check all references before publishing anything. Only this account's R2 keys.
  const objects: Array<{ id: string; object: R2Object }> = [];
  for (const id of ids) {
    const object = await bucket.head(`${prefix}/${id}`);
    if (!object || !["image/png","image/jpeg","image/webp"].includes(object.httpMetadata?.contentType ?? "")) throw new Error("missing_image");
    bytes += object.size;
    if (object.size > 2_500_000 || bytes > 30_000_000) throw new Error("images_too_large");
    objects.push({ id,object });
  }
  const replacements = new Map<string,string>();
  for (const { id,object } of objects) {
    const image = await bucket.get(`${prefix}/${id}`,{ onlyIf: { etagMatches: object.etag } });
    if (!image || !("body" in image)) throw new Error("image_changed");
    const sharedId = crypto.randomUUID(); replacements.set(id,sharedId);
    await bucket.put(`caa-shares/${token}/media/${sharedId}`,image.body,{ httpMetadata: { contentType: object.httpMetadata!.contentType,cacheControl: "private, no-store" } });
  }
  for (const sentence of story.sentences) for (const word of sentence.tokens) if (word.symbol?.kind === "media") word.symbol.id = replacements.get(word.symbol.id)!;
  return story;
}
