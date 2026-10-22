import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "../../../db";
import { authSessions } from "../../../db/schema";
import { CHATGPT_SESSION_COOKIE, hashText } from "../../chatgpt-auth";

export async function POST() {
  const token = (await cookies()).get(CHATGPT_SESSION_COOKIE)?.value;
  if (token) await getDb().delete(authSessions).where(eq(authSessions.tokenHash, await hashText(token)));
  const response = Response.json({ ok: true });
  response.headers.append("set-cookie", `${CHATGPT_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return response;
}
