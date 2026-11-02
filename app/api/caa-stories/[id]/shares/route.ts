import { env } from "cloudflare:workers";
import { authenticatedAdult, noStoreJson, readJson } from "../../../controller/_shared";
import { caaId, sentenceText } from "../../../../domain/caa-stories";
import { getStory, storyPrefix } from "../../storage";
import { listSharePointers, loadShare, sentPrefix, shareKey, shareSummary, shareToken, snapshotMedia, writeSharePointers, SHARE_DURATION, type CaaShare } from "../../../caa-shares/storage";
type Context = { params: Promise<{ id: string }> };
async function identity(request: Request) {
  const user = await authenticatedAdult();
  if (!user) return null;
  const prefix = await storyPrefix(user.userId,user.adultProfileId); const scope = prefix.split("/")[1];
  return request.headers.get("x-caa-profile") === user.adultProfileId && request.headers.get("x-caa-scope") === scope ? { user,prefix,scope } : null;
}
export async function GET(request: Request,context: Context) {
  const actor = await identity(request);
  if (!actor) return noStoreJson({ error: "authentication_required" },{ status: 401 });
  if (!env.BUCKET) return noStoreJson({ error: "storage_unavailable" },{ status: 503 });
  const { id } = await context.params;
  if (!caaId(id)) return noStoreJson({ error: "invalid_id" },{ status: 400 });
  try { const shares = await listSharePointers(env.BUCKET,sentPrefix(actor.scope)); return noStoreJson({ items: shares.filter(s => s.storyId === id) }); }
  catch { return noStoreJson({ error: "shares_unavailable" },{ status: 503 }); }
}
export async function POST(request: Request,context: Context) {
  const actor = await identity(request);
  if (!actor) return noStoreJson({ error: "authentication_required" },{ status: 401 });
  if (!env.BUCKET || !env.DB) return noStoreJson({ error: "storage_unavailable" },{ status: 503 });
  const { id } = await context.params;
  const body = await readJson(request,2048) as { token?: unknown; baseEtag?: unknown; recipientEmail?: unknown; public?: unknown; consent?: unknown } | null;
  if (!caaId(id) || !body || !shareToken(body.token) || typeof body.baseEtag !== "string" || !/^[a-f0-9]{32}$/.test(body.baseEtag) || body.consent !== true || typeof body.public !== "boolean") return noStoreJson({ error: "invalid_request" },{ status: 400 });
  try {
    const original = await getStory(env.BUCKET,`${actor.prefix}${id}.json`);
    if (!original || original.story.archived) return noStoreJson({ error: "not_found" },{ status: 404 });
    if (original.etag !== body.baseEtag) return noStoreJson({ error: "story_changed" },{ status: 409 });
    if (!original.story.sentences.some(s => s.tokens.length)) return noStoreJson({ error: "empty_story" },{ status: 400 });
    if (original.story.draftText !== original.story.sentences.map(sentenceText).join("\n")) return noStoreJson({ error: "unapplied_text" },{ status: 400 });
    let recipientScope: string | null = null; let recipientEmail: string | null = null;
    if (!body.public) {
      if (typeof body.recipientEmail !== "string" || body.recipientEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.recipientEmail.trim())) return noStoreJson({ error: "invalid_recipient" },{ status: 400 });
      recipientEmail = body.recipientEmail.trim().toLowerCase();
      const person = await env.DB.prepare("SELECT c.owner_user_id AS account, c.therapist_id AS adult FROM therapist_credentials c JOIN adult_profiles a ON a.account_id = c.owner_user_id AND a.id = c.therapist_id WHERE c.login_email = ? AND a.deleted_at IS NULL AND a.role IN ('Terapista','Supervisore','Amministratore') LIMIT 1").bind(recipientEmail).first<{ account: string; adult: string }>();
      if (!person) return noStoreJson({ error: "recipient_unavailable" },{ status: 400 });
      recipientScope = (await storyPrefix(person.account,person.adult)).split("/")[1];
      if (recipientScope === actor.scope) return noStoreJson({ error: "invalid_recipient" },{ status: 400 });
    }
    const existing = await loadShare(env.BUCKET,body.token);
    if (existing && (existing.ownerScope !== actor.scope || existing.storyId !== id || existing.baseEtag !== body.baseEtag || existing.recipientScope !== recipientScope || existing.revokedAt)) return noStoreJson({ error: "share_conflict" },{ status: 409 });
    if (!existing && (await env.BUCKET.list({ prefix: sentPrefix(actor.scope),limit: 100 })).objects.length >= 100) return noStoreJson({ error: "share_limit" },{ status: 409 });
    let share: CaaShare = existing ?? { token: body.token,ownerScope: actor.scope,storyId: id,baseEtag: original.etag,recipientScope,recipientEmail,createdAt: Date.now(),expiresAt: Date.now() + SHARE_DURATION,story: await snapshotMedia(env.BUCKET,actor.user.userId,body.token,original.story) };
    // Publish only after every image is copied. No pointer ever exposes a partial snapshot.
    if (!existing) {
      const created = await env.BUCKET.put(shareKey(body.token),JSON.stringify(share),{ onlyIf: { etagDoesNotMatch: "*" },httpMetadata: { contentType: "application/json",cacheControl: "private, no-store" } });
      if (!created) {
        const committed = await loadShare(env.BUCKET,body.token);
        if (!committed || committed.ownerScope !== actor.scope || committed.storyId !== id || committed.baseEtag !== body.baseEtag || committed.recipientScope !== recipientScope || committed.revokedAt) return noStoreJson({ error: "share_conflict" },{ status: 409 });
        share = committed;
      }
    }
    await writeSharePointers(env.BUCKET,share);
    return noStoreJson(shareSummary(share),{ status: 201 });
  } catch (error) {
    const code = error instanceof Error && ["missing_image","image_changed","too_many_images","images_too_large"].includes(error.message) ? error.message : "share_save_failed";
    return noStoreJson({ error: code },{ status: code === "share_save_failed" ? 503 : 400 });
  }
}
export async function DELETE(request: Request,context: Context) {
  const actor = await identity(request);
  if (!actor) return noStoreJson({ error: "authentication_required" },{ status: 401 });
  if (!env.BUCKET) return noStoreJson({ error: "storage_unavailable" },{ status: 503 });
  const { id } = await context.params; const token = new URL(request.url).searchParams.get("token");
  try {
    const share = shareToken(token) ? await loadShare(env.BUCKET,token) : null;
    if (!share || share.ownerScope !== actor.scope || share.storyId !== id) return noStoreJson({ error: "not_found" },{ status: 404 });
    const revoked = { ...share,revokedAt: Date.now() };
    await env.BUCKET.put(shareKey(share.token),JSON.stringify(revoked),{ httpMetadata: { contentType: "application/json",cacheControl: "private, no-store" } });
    await writeSharePointers(env.BUCKET,revoked);
    return noStoreJson({ revoked: true });
  } catch { return noStoreJson({ error: "revoke_failed" },{ status: 503 }); }
}
