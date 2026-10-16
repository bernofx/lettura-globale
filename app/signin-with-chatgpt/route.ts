import { CHATGPT_SESSION_COOKIE, CHATGPT_SESSION_DURATION_SECONDS, createCloudSession, getChatGPTUser } from "../chatgpt-auth";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  const fallback = new URL("/", request.url);
  if (!user) return Response.redirect(fallback);

  const requested = new URL(request.url).searchParams.get("return_to") ?? "/";
  const returnTo = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
  const token = await createCloudSession(user);

  const response = Response.redirect(new URL(returnTo, request.url));
  response.headers.append("set-cookie", `${CHATGPT_SESSION_COOKIE}=${token}; Path=/; Max-Age=${CHATGPT_SESSION_DURATION_SECONDS}; HttpOnly; Secure; SameSite=Lax`);
  return response;
}
