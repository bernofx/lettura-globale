import { getDb } from "../../db";
import { authSessions } from "../../db/schema";
import { CHATGPT_SESSION_COOKIE, getChatGPTUser, hashText } from "../chatgpt-auth";

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  const fallback = new URL("/", request.url);
  if (!user) return Response.redirect(fallback);

  const requested = new URL(request.url).searchParams.get("return_to") ?? "/";
  const returnTo = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(tokenBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const now = Date.now();
  await getDb().insert(authSessions).values({
    tokenHash: await hashText(token),
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
    expiresAt: now + SESSION_DURATION_SECONDS * 1000,
    createdAt: now,
  });

  const response = Response.redirect(new URL(returnTo, request.url));
  response.headers.append("set-cookie", `${CHATGPT_SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_DURATION_SECONDS}; HttpOnly; Secure; SameSite=Lax`);
  return response;
}
