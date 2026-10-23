/** Validator only: no response bodies or account data are cached on the server. */
export async function stateReadTag(accountId: string, adultProfileId: string | undefined, revision: number) {
  const scope = JSON.stringify(["private-state-v1", accountId, adultProfileId ?? null, revision]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `"state-v1-${hash}"`;
}

export function stateReadMatches(ifNoneMatch: string | null, tag: string) {
  return Boolean(ifNoneMatch && ifNoneMatch.length <= 4096 && ifNoneMatch.split(",").some((value) => value.trim().replace(/^W\//, "") === tag));
}

export function stateReadHeaders(tag?: string) {
  return { "cache-control": "private, no-store", vary: "Cookie", ...(tag ? { etag: tag } : {}) };
}
