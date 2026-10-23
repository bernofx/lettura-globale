import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { pbkdf2Sync } from "node:crypto";
import { loginRetryAfterSeconds, nextLoginFailure } from "../app/domain/login-rate-limit.ts";
import { hashPinForStorage, isVersionedPinHash, pinRequiresCloudReset, PinResetRequiredError, PinVerificationUnavailableError, verifyStoredPin } from "../app/domain/pin-credentials.ts";
import { SHARED_LAUNCH_LIFETIME_MS, sharedLaunchExpiresAt, sharedLaunchIsAvailable } from "../app/domain/shared-launch-policy.ts";

test("i PIN nuovi usano PBKDF2 con sale e quelli SHA-256 esistenti restano validi", async () => {
  const first = await hashPinForStorage("2468");
  const second = await hashPinForStorage("2468");
  assert.equal(isVersionedPinHash(first), true);
  assert.notEqual(first, second);
  assert.equal(await verifyStoredPin("2468", first), true);
  assert.equal(await verifyStoredPin("0000", first), false);
  assert.equal(await verifyStoredPin("1234", "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"), true);
});

test("generation and verification respect the production 100000-iteration ceiling", async (context) => {
  const original = crypto.subtle.deriveBits.bind(crypto.subtle);
  const calls: number[] = [];
  const derive = context.mock.method(crypto.subtle, "deriveBits", async (...args: Parameters<typeof original>) => {
    const count = (args[0] as Pbkdf2Params).iterations;
    if (count > 100_000) throw new DOMException("Synthetic production iteration cap", "NotSupportedError");
    calls.push(count);
    return original(...args);
  });
  try {
    const hash = await hashPinForStorage("1357");
    assert.equal(hash.split("$")[1], "100000");
    assert.equal(pinRequiresCloudReset(hash), false);
    assert.equal(await verifyStoredPin("1357", hash, { cloud: true }), true);
    assert.equal(await verifyStoredPin("1358", hash, { cloud: true }), false);
    assert.deepEqual(calls, [100000, 100000, 100000]);
  } finally { derive.mock.restore(); }
});

test("legacy 120000 hashes are preserved, flagged for reset, and never silently truncated", async () => {
  const salt = Buffer.alloc(16, 7);
  const oldHash = `pbkdf2-sha256$120000$${salt.toString("base64url")}$${pbkdf2Sync("1357", salt, 120000, 32, "sha256").toString("base64url")}`;
  assert.equal(pinRequiresCloudReset(oldHash), true);
  assert.equal(pinRequiresCloudReset(undefined), false);
  assert.equal(pinRequiresCloudReset("03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"), false);
  assert.equal(await verifyStoredPin("1357", oldHash), true, "local unlock remains compatible");
  await assert.rejects(verifyStoredPin("1357", oldHash, { cloud: true }), PinResetRequiredError);
  const reset = await hashPinForStorage("1357");
  assert.equal(await verifyStoredPin("1357", reset, { cloud: true }), true);
  assert.notEqual(reset, oldHash);
});

test("il quinto errore blocca il login e il ritardo cresce fino al limite", () => {
  const now = Date.UTC(2026, 9, 22);
  let state;
  for (let index = 0; index < 5; index += 1) state = nextLoginFailure(state, now + index);
  assert.equal(state?.failedAttempts, 5);
  assert.equal(loginRetryAfterSeconds([state!], now + 4), 30);
  const sixth = nextLoginFailure(state, now + 30_005);
  assert.equal(loginRetryAfterSeconds([sixth], now + 30_005), 60);
  let repeated = sixth;
  for (let index = 0; index < 10; index += 1) repeated = nextLoginFailure(repeated, now + 30_006 + index);
  assert.equal(loginRetryAfterSeconds([repeated], now + 30_015), 15 * 60);
});

test("a crypto service failure is not misreported as an incorrect PIN", async (context) => {
  const hash = await hashPinForStorage("1357");
  const derive = context.mock.method(crypto.subtle, "deriveBits", async () => { throw new Error("synthetic-unavailable"); });
  try { await assert.rejects(verifyStoredPin("1357", hash), PinVerificationUnavailableError); }
  finally { derive.mock.restore(); }
  assert.equal(await verifyStoredPin("1357", hash), true);
  assert.equal(await verifyStoredPin("1358", hash), false);
  assert.equal(await verifyStoredPin("1357", "pbkdf2-sha256$120000$invalid$invalid"), false);
});

test("i link pubblici scadono dopo trenta giorni e la revoca è immediata", () => {
  const createdAt = Date.UTC(2026, 9, 22);
  const expiresAt = sharedLaunchExpiresAt(createdAt);
  assert.equal(expiresAt - createdAt, SHARED_LAUNCH_LIFETIME_MS);
  assert.equal(sharedLaunchIsAvailable({ expiresAt, revokedAt: null }, expiresAt - 1), true);
  assert.equal(sharedLaunchIsAvailable({ expiresAt, revokedAt: null }, expiresAt), false);
  assert.equal(sharedLaunchIsAvailable({ expiresAt, revokedAt: createdAt + 1 }, createdAt + 2), false);
});

test("la migrazione conserva i link esistenti e aggiunge il rate limit", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(readFileSync(new URL("../drizzle/0003_shared_launches.sql", import.meta.url), "utf8"));
  database.prepare("INSERT INTO shared_launches (token, owner_user_id, kind, content_id, payload, created_at, updated_at) VALUES (?, ?, ?, ?, '{}', ?, ?)")
    .run("token", "owner", "exercise", "exercise-1", 1000, 1000);
  database.exec(readFileSync(new URL("../drizzle/0014_security_hardening.sql", import.meta.url), "utf8"));
  assert.deepEqual({ ...database.prepare("SELECT expires_at, revoked_at FROM shared_launches WHERE token = 'token'").get() }, {
    expires_at: 1000 + SHARED_LAUNCH_LIFETIME_MS,
    revoked_at: null,
  });
  database.prepare("INSERT INTO login_rate_limits (key_hash, window_started_at, failed_attempts, blocked_until, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run("hash", 1, 5, 31, 2);
  assert.equal(database.prepare("SELECT failed_attempts FROM login_rate_limits WHERE key_hash = 'hash'").get()?.failed_attempts, 5);
});
