export async function ownerStoragePrefix(userId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export function validMediaId(value: string) {
  return /^[a-zA-Z0-9-]{1,80}$/.test(value);
}
