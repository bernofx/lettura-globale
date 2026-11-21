import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { hashPinForStorage } from "../app/domain/pin-credentials.ts";
import { buildStateChange } from "../app/domain/state-changes.ts";
import { createHash, pbkdf2Sync } from "node:crypto";

const require = createRequire(import.meta.resolve("wrangler/package.json"));
const { Miniflare } = require("miniflare");
const root = resolve("dist/server"), modules = [];
function collect(directory = "") {
  for (const item of readdirSync(join(root, directory), { withFileTypes: true })) {
    const name = directory ? `${directory}/${item.name}` : item.name;
    if (item.isDirectory()) collect(name);
    else if (/\.m?js$/.test(name)) modules.push({ type: "ESModule", path: name, contents: readFileSync(join(root, name), "utf8") });
  }
}
collect();
modules.sort((a, b) => a.path === "index.js" ? -1 : b.path === "index.js" ? 1 : a.path.localeCompare(b.path));
// workerd locally has no production PBKDF2 cap: enforce it in this test only.
modules[0].contents = `const originalDeriveBits = crypto.subtle.deriveBits.bind(crypto.subtle);
crypto.subtle.deriveBits = function(algorithm, key, length) {
  if (algorithm.name === 'PBKDF2' && algorithm.iterations > 100000) return Promise.reject(new DOMException('Synthetic production PBKDF2 cap', 'NotSupportedError'));
  return originalDeriveBits(algorithm, key, length);
};\n` + modules[0].contents;
const mf = new Miniflare({ name: "auth-test", compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"], modules,
  durableObjects: { SESSIONS: { className: "RealtimeSession", useSQLite: true } }, d1Databases: { DB: "synthetic-auth-d1" },
  r2Buckets: { BUCKET: "synthetic-soundtrack-r2" } });
async function request(path, init) {
  let timeout;
  try {
    return await Promise.race([
      mf.dispatchFetch(`https://app.example${path}`, init),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`Timeout endpoint ${path}`)), 15000); }),
    ]);
  } finally { clearTimeout(timeout); }
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(join("drizzle", file), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) await db.prepare(statement.trim()).run();
    }
  }
  console.log("Auth test: schema D1 locale pronto.");
  const now = Date.now(), account = "synthetic-account";
  const firstHash = await hashPinForStorage("1357"), secondHash = await hashPinForStorage("9753");
  const oldSalt = Buffer.alloc(16, 7);
  const oldHash = `pbkdf2-sha256$120000$${oldSalt.toString("base64url")}$${pbkdf2Sync("8642", oldSalt, 120000, 32, "sha256").toString("base64url")}`;
  const therapists = [
    { id: "adult-a", email: "adult-a@example.test", firstName: "Synthetic A", role: "Amministratore", pinHash: firstHash, childIds: [] },
    { id: "adult-b", email: "adult-b@example.test", firstName: "Synthetic B", role: "Terapista", pinHash: secondHash, childIds: [] },
    { id: "adult-old", email: "adult-old@example.test", firstName: "Synthetic Old", role: "Terapista", pinHash: oldHash, childIds: [] },
  ];
  const state = { schemaVersion: 1, therapists, children: [], library: [], exercises: [], sequences: [], attempts: [], helps: [], sessionHistory: [] };
  await db.prepare("INSERT INTO user_states (user_id,email,payload,schema_version,revision,created_at,updated_at) VALUES (?,?,?,1,1,?,?)")
    .bind(account, "adult-a@example.test", JSON.stringify(state), now, now).run();
  for (const adult of therapists) await db.prepare("INSERT INTO therapist_credentials (login_email,owner_user_id,therapist_id,pin_hash,display_name,updated_at) VALUES (?,?,?,?,?,?)")
    .bind(adult.email, account, adult.id, adult.pinHash, adult.firstName, now).run();
  console.log("Auth test: credenziali PBKDF2 sintetiche create.");
  const login = (email, pin) => request("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, pin }) });
  const cookie = (response) => response.headers.get("set-cookie")?.split(";")[0];
  const read = (key) => request("/api/state", { headers: { cookie: key } });
  const first = await login("adult-a@example.test", "1357");
  assert.equal(first.status, 200);
  assert.equal((await first.json()).therapistId, "adult-a");
  const firstCookie = cookie(first);
  assert.ok(firstCookie?.startsWith("lg-cloud-session="));
  assert.equal((await read(firstCookie)).status, 200);
  assert.equal((await read(firstCookie)).status, 200, "il refresh conserva l'accesso server");
  console.log("Auth test: primo login e refresh confermati.");
  const out = await request("/api/logout", { method: "POST", headers: { cookie: firstCookie } });
  assert.equal(out.status, 200);
  assert.equal((await read(firstCookie)).status, 401, "il token revocato non è più valido");
  const rejected = await login("adult-b@example.test", "0000");
  assert.equal(rejected.status, 401);
  assert.equal((await rejected.json()).error, "invalid_credentials");
  assert.equal(cookie(rejected), undefined);
  const second = await login("adult-b@example.test", "9753");
  assert.equal(second.status, 200);
  assert.equal((await second.json()).therapistId, "adult-b");
  const secondCookie = cookie(second);
  assert.notEqual(secondCookie, firstCookie);
  assert.equal((await read(secondCookie)).status, 200);
  const secondView = await (await read(secondCookie)).json();
  assert.equal(secondView.state.therapists.find((adult) => adult.id === "adult-a").pinHash, undefined);
  assert.equal((await read(firstCookie)).status, 401);
  const resetRequired = await login("adult-old@example.test", "8642");
  assert.equal(resetRequired.status, 503);
  assert.equal((await resetRequired.json()).error, "pin_reset_required");
  assert.equal(cookie(resetRequired), undefined);
  const oldKey = createHash("sha256").update("email:adult-old@example.test").digest("hex");
  assert.equal(await db.prepare("SELECT failed_attempts FROM login_rate_limits WHERE key_hash = ?").bind(oldKey).first(), null, "incompatible configuration is not a wrong PIN attempt");
  const adminAgain = await login("adult-a@example.test", "1357");
  const adminCookie = cookie(adminAgain);
  const beforeReset = await (await read(adminCookie)).json();
  const resetHash = await hashPinForStorage("8642");
  const updatedState = { ...beforeReset.state, therapists: beforeReset.state.therapists.map((adult) => adult.id === "adult-old" ? { ...adult, pinHash: resetHash } : adult) };
  const change = buildStateChange(beforeReset.state, updatedState, crypto.randomUUID(), beforeReset.revision);
  const save = await request("/api/state/changes", { method: "PATCH", headers: { cookie: adminCookie, "content-type": "application/json" }, body: JSON.stringify(change) });
  assert.equal(save.status, 200, "admin reset persists via the ordinary cloud save API");
  const recovered = await login("adult-old@example.test", "8642");
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).therapistId, "adult-old");
  assert.equal((await read(cookie(recovered))).status, 200);
  const soundtrackPath = "/api/game-soundtrack";
  const mp3 = readFileSync("public/audio/coloring-calypso.mp3");
  const upload = (body, key = adminCookie) => request(soundtrackPath, {
    method: "PUT", headers: { cookie: key, "content-type": "audio/mpeg", "x-soundtrack-name": encodeURIComponent("Colonna sonora 🎵.mp3") }, body,
  });
  const info = (key = adminCookie) => request(`${soundtrackPath}?info`, { headers: { cookie: key } });
  assert.equal((await request(soundtrackPath)).status, 401);
  assert.equal((await upload(mp3, firstCookie)).status, 401, "a revoked adult session cannot upload");
  assert.equal((await (await info()).json()).soundtrack, null);
  assert.equal((await upload(Buffer.from("ID3 non è un MP3"))).status, 422);
  assert.equal((await upload(Buffer.alloc(6_000_001))).status, 413);
  const saved = await upload(mp3);
  assert.equal(saved.status, 200);
  const { soundtrack } = await saved.json();
  assert.equal(soundtrack.name, "Colonna sonora 🎵.mp3");
  assert.deepEqual((await (await info(secondCookie)).json()).soundtrack, soundtrack, "the library soundtrack is shared within its account");

  const outsider = { id: "adult-outsider", email: "outsider@example.test", firstName: "Outsider", role: "Amministratore", pinHash: firstHash, childIds: [] };
  await db.prepare("INSERT INTO user_states (user_id,email,payload,schema_version,revision,created_at,updated_at) VALUES (?,?,?,1,1,?,?)")
    .bind("another-account", outsider.email, JSON.stringify({ ...state, therapists: [outsider] }), now, now).run();
  await db.prepare("INSERT INTO therapist_credentials (login_email,owner_user_id,therapist_id,pin_hash,display_name,updated_at) VALUES (?,?,?,?,?,?)")
    .bind(outsider.email, "another-account", outsider.id, outsider.pinHash, outsider.firstName, now).run();
  const outsiderCookie = cookie(await login(outsider.email, "1357"));
  assert.ok(outsiderCookie);
  assert.equal((await (await info(outsiderCookie)).json()).soundtrack, null, "another account cannot see the track");
  assert.equal((await request(soundtrackPath, { headers: { cookie: outsiderCookie } })).status, 404);
  const full = await request(soundtrackPath, { headers: { cookie: adminCookie } });
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), mp3);
  const slice = await request(soundtrackPath, { headers: { cookie: adminCookie, range: "bytes=0-1" } });
  assert.equal(slice.status, 206);
  assert.equal(slice.headers.get("content-range"), `bytes 0-1/${mp3.length}`);
  assert.deepEqual(Buffer.from(await slice.arrayBuffer()), mp3.subarray(0, 2));
  assert.equal((await request(soundtrackPath, { method: "DELETE", headers: { cookie: adminCookie } })).status, 200);
  assert.equal((await (await info()).json()).soundtrack, null);
  console.log("PASS: MP3 validation, authorized private R2 audio and byte ranges, account isolation and reset.");
  const puzzlePath = "/api/puzzle-images";
  const puzzleUrl = puzzlePath + "?image=synthetic-test";
  const catalogRead = async (key) => (await request(puzzlePath, { headers: { cookie: key } })).json();
  const { scope } = await catalogRead(adminCookie);
  const puzzleHeaders = { cookie: adminCookie, "x-puzzle-profile": "adult-a", "x-puzzle-scope": scope };
  const photo = readFileSync("public/images/categories/casa.webp");
  const uploadPuzzle = (body, headers = {}) => request(puzzleUrl, {
    method: "PUT", body, headers: {
      ...puzzleHeaders, "content-type": "image/webp", "x-puzzle-title": encodeURIComponent("Città allegra"),
      "x-puzzle-rights": "confirmed", ...headers,
    },
  });
  assert.equal((await request(puzzlePath)).status, 401);
  assert.equal((await uploadPuzzle(photo, { "x-puzzle-rights": "" })).status, 400);
  assert.equal((await uploadPuzzle(photo, { "x-puzzle-scope": "another" })).status, 401);
  assert.equal((await uploadPuzzle(photo, { "x-puzzle-profile": "adult-b" })).status, 401);
  assert.equal((await uploadPuzzle(Buffer.from("non è un WebP"))).status, 422);
  assert.equal((await uploadPuzzle(photo)).status, 200);
  assert.equal((await uploadPuzzle(photo)).status, 200);
  assert.deepEqual((await catalogRead(secondCookie)).images, [{ id: "synthetic-test", title: "Città allegra", image: puzzleUrl }]);
  assert.deepEqual((await catalogRead(outsiderCookie)).images, []);
  assert.equal((await request(puzzleUrl, { headers: { cookie: outsiderCookie } })).status, 404);
  const puzzleImage = await request(puzzleUrl, { headers: { cookie: secondCookie } });
  assert.equal(puzzleImage.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await puzzleImage.arrayBuffer()), photo);
  assert.equal((await request(puzzleUrl, { method: "DELETE", headers: { ...puzzleHeaders, cookie: outsiderCookie } })).status, 401);
  assert.equal((await request(puzzleUrl, { method: "DELETE", headers: puzzleHeaders })).status, 200);
  assert.equal((await uploadPuzzle(photo)).status, 410, "a late upload retry cannot restore a removed image");
  assert.deepEqual((await catalogRead(adminCookie)).images, []);
  assert.equal((await request(puzzleUrl, { headers: { cookie: adminCookie } })).status, 404);
  console.log("PASS: puzzle WebP validation, private scope, repeated upload and removal on R2.");
  console.log("PASS: production 100000 cap, old hash rejected without rate-limit increment, admin cloud reset and login with the same PIN.");
  console.log("PASS: login PBKDF2, refresh, logout revocato, cambio adulto, PIN errato e vista isolata verificati su Worker/D1 locali.");
} finally { await mf.dispose(); }
