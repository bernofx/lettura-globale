import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { ownerStoragePrefix, validMediaId } from "../../media-key";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!env.BUCKET) return new Response("Storage unavailable", { status: 503 });
  const { id } = await context.params;
  if (!validMediaId(id)) return new Response("Invalid id", { status: 400 });
  const object = await env.BUCKET.get(`${await ownerStoragePrefix(user.userId)}/${id}`);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(object.body, { headers });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "authentication_required" }, { status: 401 });
  if (!env.BUCKET) return Response.json({ error: "storage_unavailable" }, { status: 503 });
  const { id } = await context.params;
  if (!validMediaId(id)) return Response.json({ error: "invalid_media_id" }, { status: 400 });
  await env.BUCKET.delete(`${await ownerStoragePrefix(user.userId)}/${id}`);
  return Response.json({ ok: true });
}
