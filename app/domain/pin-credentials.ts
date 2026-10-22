const PIN_HASH_PREFIX = "pbkdf2-sha256";
const PIN_HASH_ITERATIONS = 120_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function derivePin(pin: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, HASH_BYTES * 8);
  return new Uint8Array(bits);
}

async function legacySha256(pin: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin)));
}

export function isVersionedPinHash(value: string) {
  return value.startsWith(`${PIN_HASH_PREFIX}$`);
}

export async function hashPinForStorage(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derivePin(pin, salt, PIN_HASH_ITERATIONS);
  return `${PIN_HASH_PREFIX}$${PIN_HASH_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

export async function verifyStoredPin(pin: string, storedHash: string) {
  if (isVersionedPinHash(storedHash)) {
    const [prefix, rawIterations, rawSalt, rawHash, ...extra] = storedHash.split("$");
    const iterations = Number(rawIterations);
    if (prefix !== PIN_HASH_PREFIX || extra.length || !Number.isSafeInteger(iterations) || iterations < 50_000 || iterations > 1_000_000) return false;
    try {
      const expected = fromBase64Url(rawHash);
      if (expected.length !== HASH_BYTES) return false;
      return constantTimeEqual(await derivePin(pin, fromBase64Url(rawSalt), iterations), expected);
    } catch {
      return false;
    }
  }
  if (!/^[0-9a-f]{64}$/i.test(storedHash)) return false;
  return constantTimeEqual(await legacySha256(pin), Uint8Array.from(storedHash.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16)));
}

