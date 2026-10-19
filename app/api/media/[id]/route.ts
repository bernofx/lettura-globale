import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";

async function ownerPrefix(userId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function validId(value: string) { return /^[a-zA-Z0-9-]{1,80}$/.test(value); }

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!env.BUCKET) return new Response("Storage unavailable", { status: 503 });
  const { id } = await context.params;
  if (!validId(id)) return new Response("Invalid id", { status: 400 });
  const object = await env.BUCKET.get(`${await ownerPrefix(user.userId)}/${id}`);
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
  if (!validId(id)) return Response.json({ error: "invalid_media_id" }, { status: 400 });
  await env.BUCKET.delete(`${await ownerPrefix(user.userId)}/${id}`);
  return Response.json({ ok: true });
}
