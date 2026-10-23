import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { hashPinForStorage } from "../app/domain/pin-credentials.ts";

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
const mf = new Miniflare({ name: "auth-test", compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"], modules,
  durableObjects: { SESSIONS: { className: "RealtimeSession", useSQLite: true } }, d1Databases: { DB: "synthetic-auth-d1" } });
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
  const therapists = [
    { id: "adult-a", email: "adult-a@example.test", firstName: "Synthetic A", role: "Amministratore", pinHash: firstHash, childIds: [] },
    { id: "adult-b", email: "adult-b@example.test", firstName: "Synthetic B", role: "Terapista", pinHash: secondHash, childIds: [] },
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
  console.log("PASS: login PBKDF2, refresh, logout revocato, cambio adulto, PIN errato e vista isolata verificati su Worker/D1 locali.");
} finally { await mf.dispose(); }
