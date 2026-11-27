import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { hashPinForStorage } from "../app/domain/pin-credentials.ts";
import { checkExerciseCopyWrites } from "./test-exercise-copy-writes.mjs";
import { checkLegacyExerciseWrites } from "./test-legacy-exercise-writes.mjs";
import { checkExerciseCopyMigration } from "./test-exercise-copy-storage.mjs";
import { buildCloudSaveChange, rebaseCloudSaveChange } from "../app/domain/cloud-save-change.ts";
import { buildStateChange, parseStateChangeRequest } from "../app/domain/state-changes.ts";
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
const apiImage = readFileSync("public/images/demo/mela.png").toString("base64");
const imageApiCalls = [];
const commonsId = "8ce494ce-d038-40ae-a3ab-2131ab07b2f2";
const commonsOrigin = "https://commons.wikimedia.org";
const ccBy = "https://creativecommons.org/licenses/by/4.0/";
const indexedPhoto = { id: commonsId, title: "Port lamp", source: "wikimedia", license: "by", license_version: "4.0",
  foreign_landing_url: commonsOrigin + "/wiki/File:Port_lamp.png" };
let commonsLicense = ccBy;
let alternateImageHost = false;
let redirectedImage = false;

const mf = new Miniflare({ name: "auth-test", compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"], modules,
  durableObjects: { SESSIONS: { className: "RealtimeSession", useSQLite: true } }, d1Databases: { DB: "synthetic-auth-d1" },
  r2Buckets: { BUCKET: "synthetic-soundtrack-r2" },
  bindings: { OPENAI_API_KEY: "synthetic-key", SCHEDULED_IMAGES_ACCOUNT_ID: "synthetic-account", SCHEDULED_IMAGES_MONTHLY_LIMIT: "2" },
  unsafeTriggerHandlers: true,
  queueProducers: { SCHEDULED_IMAGE_JOBS: "synthetic-image-jobs" },
  queueConsumers: { "synthetic-image-jobs": { maxBatchSize: 1, maxBatchTimeout: 0 } },
  async outboundService(req) {
    const url = new URL(req.url);
    if (url.origin === "https://api.openverse.org") {
      assert.equal(req.headers.has("authorization"), false);
      if (url.pathname === "/v1/images/") {
        assert.equal(url.searchParams.get("source"), "wikimedia");
        assert.equal(url.searchParams.get("q"), "Port lamp");
        return Response.json({ page_count: 1, results: [
          indexedPhoto, { ...indexedPhoto, id: crypto.randomUUID(), license_version: "3.0" },
          { ...indexedPhoto, id: crypto.randomUUID(), source: "flickr" },
          { ...indexedPhoto, id: crypto.randomUUID(), mature: true },
        ] });
      }
      assert.equal(url.pathname, `/v1/images/${commonsId}/`);
      return Response.json(indexedPhoto);
    }
    if (url.origin === commonsOrigin) {
      assert.equal(url.pathname, "/w/api.php");
      assert.equal(url.searchParams.get("titles"), "File:Port_lamp.png");
      return Response.json({ query: { pages: [{ title: "File:Port lamp.png", imageinfo: [{
        mime: "image/png", mediatype: "BITMAP",
        thumburl: alternateImageHost ? "https://unrelated.example/secret.png" : "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Port_lamp.png/640px-Port_lamp.png",
        extmetadata: { Artist: { value: "<a href='https://example.test'>Demo &amp; Author</a>" }, LicenseUrl: { value: commonsLicense } },
      }] }] } });
    }
    if (url.origin === "https://upload.wikimedia.org") {
      assert.equal(url.pathname, "/wikipedia/commons/thumb/a/a0/Port_lamp.png/640px-Port_lamp.png");
      if (redirectedImage) return Response.redirect("https://unrelated.example/redirected.png", 302);
      return new Response(Buffer.from(apiImage, "base64"), { headers: { "content-type": "image/png" } });
    }
    assert.equal(req.url, "https://api.openai.com/v1/images/generations");
    assert.equal(req.headers.get("authorization"), "Bearer synthetic-key");
    assert.equal(req.method, "POST");
    const body = await req.json();
    assert.equal(body.output_format, "webp");
    assert.equal(body.n, 1);
    assert.equal(body.moderation, "auto");
    assert.equal(body.background, undefined);
    assert.equal(body.tools, undefined);
    const subject = JSON.parse(body.prompt.split("\n").at(-1));
    imageApiCalls.push(subject);
    if (subject.parola === "Ombrello") {
      return Response.json({ error: { code: "moderation_blocked" } }, { status: 400 });
    }
    return Response.json({ data: [{ b64_json: apiImage }] });
  },
});
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
  const migrate = async file => {
    for (const statement of readFileSync(join("drizzle", file), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) await db.prepare(statement.trim()).run();
    }
  };
  for (const file of readdirSync("drizzle").filter(name => name.endsWith(".sql")).sort()) {
    if (file === "0020_sequence_exercise_copies.sql") await checkExerciseCopyMigration(db, () => migrate(file));
    else await migrate(file);
  }
  console.log("Auth test: migrazione 0020, copie delle sei attività e compatibilità con lo schema precedente verificate.");
  const now = Date.now(), account = "synthetic-account";
  const firstHash = await hashPinForStorage("1357"), secondHash = await hashPinForStorage("9753");
  const oldSalt = Buffer.alloc(16, 7);
  const oldHash = `pbkdf2-sha256$120000$${oldSalt.toString("base64url")}$${pbkdf2Sync("8642", oldSalt, 120000, 32, "sha256").toString("base64url")}`;
  const therapists = [
    { id: "adult-a", email: "adult-a@example.test", firstName: "Synthetic A", role: "Amministratore", pinHash: firstHash, childIds: [] },
    { id: "adult-b", email: "adult-b@example.test", firstName: "Synthetic B", role: "Terapista", pinHash: secondHash, childIds: [] },
    { id: "supervisor", email: "supervisor@example.test", firstName: "Synthetic S", role: "Supervisore", pinHash: firstHash, childIds: [] },
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
  const prematureCopy = { id: "copy", ownerAdultId: "adult-a", sequenceId: "sequence", templateExerciseId: "model" };
  const prematureState = { ...beforeReset.state, exercises: [prematureCopy] };
  const prematureChange = buildStateChange(beforeReset.state, prematureState, crypto.randomUUID(), beforeReset.revision);
  for (const [path, method, body] of [["/api/state", "PUT", prematureState], ["/api/state/changes", "PATCH", prematureChange]]) {
    const result = await request(path, {
      method, headers: { cookie: adminCookie, "content-type": "application/json", "x-base-revision": String(beforeReset.revision) },
      body: JSON.stringify(body),
    });
    assert.equal(result.status, 422);
    assert.equal((await result.json()).error, "exercise_copies_not_enabled");
  }
  assert.equal((await (await read(adminCookie)).json()).revision, beforeReset.revision);
  const resetHash = await hashPinForStorage("8642");
  const updatedState = { ...beforeReset.state, therapists: beforeReset.state.therapists.map((adult) => adult.id === "adult-old" ? { ...adult, pinHash: resetHash } : adult) };
  const change = buildStateChange(beforeReset.state, updatedState, crypto.randomUUID(), beforeReset.revision);
  const save = await request("/api/state/changes", { method: "PATCH", headers: { cookie: adminCookie, "content-type": "application/json" }, body: JSON.stringify(change) });
  assert.equal(save.status, 200, "admin reset persists via the ordinary cloud save API");
  const recovered = await login("adult-old@example.test", "8642");
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).therapistId, "adult-old");
  assert.equal((await read(cookie(recovered))).status, 200);
  // The standalone game flag round-trips through the usual account state, even on a relational read.
  const saveTracingOrder = async (required) => {
    const current = await (await read(secondCookie)).json();
    const change = buildStateChange(current.state, { ...current.state, tracingOrderRequired: required }, crypto.randomUUID(), current.revision);
    const response = await request("/api/state/changes", { method: "PATCH", headers: { cookie: secondCookie, "content-type": "application/json" }, body: JSON.stringify(change) });
    assert.equal(response.status, 200);
    const loaded = await (await read(adminCookie)).json();
    assert.equal(loaded.dataSource, "relational");
    assert.equal(loaded.state.tracingOrderRequired, required);
  };
  await saveTracingOrder(true);
  await saveTracingOrder(false);
  // The interface style follows the same path and is read back on the relational projection.
  for (const style of ["studio", "playful", "classic"]) {
    const current = await (await read(secondCookie)).json();
    const change = buildStateChange(current.state, { ...current.state, interfaceStyle: style }, crypto.randomUUID(), current.revision);
    const response = await request("/api/state/changes", { method: "PATCH", headers: { cookie: secondCookie, "content-type": "application/json" }, body: JSON.stringify(change) });
    assert.equal(response.status, 200);
    const loaded = await (await read(adminCookie)).json();
    assert.equal(loaded.state.interfaceStyle, style);
  }
  // Use the normal PATCH and filtered GET on a local D1, including the snapshot/relational boundary.
  const supervisorCookie = cookie(await login("supervisor@example.test", "1357"));
  const patchState = async (key, snapshot, nextState, headers = {}) => {
    const change = buildStateChange(snapshot.state, nextState, crypto.randomUUID(), snapshot.revision);
    return request("/api/state/changes", { method: "PATCH", headers: { cookie: key, "content-type": "application/json", ...headers }, body: JSON.stringify(change) });
  };
  const baseline = await (await read(adminCookie)).json();
  const models = ["synth-first", "synth-second"].map(id => ({ id, title: id, kind: "recognition" }));
  const sequence = { id: "synth-sequence", therapistId: "adult-b", title: "Sequenza di prova", deleted: false, exerciseIds: models.map(model => model.id) };
  assert.equal((await patchState(adminCookie, baseline, { ...baseline.state, exercises: models, sequences: [sequence] })).status, 200);
  const ownerBefore = await (await read(secondCookie)).json();
  const lastUsedAt = "2026-11-27T08:30:00.000Z";
  const launchChange = buildCloudSaveChange(ownerBefore.state, { ...ownerBefore.state,
    sequences: [{ ...ownerBefore.state.sequences[0], lastUsedAt }] }, crypto.randomUUID(), ownerBefore.revision);
  const shared = await (await read(supervisorCookie)).json();
  const reordered = { ...shared.state, sequences: [{ ...shared.state.sequences[0], exerciseIds: [...sequence.exerciseIds].reverse() }] };
  assert.equal((await patchState(supervisorCookie, shared, reordered)).status, 403);
  const contentVersion = { "x-lg-sequence-content-version": "1" };
  assert.equal((await patchState(supervisorCookie, shared, reordered, contentVersion)).status, 200);
  const ownerView = await (await read(secondCookie)).json();
  assert.equal(ownerView.dataSource, "relational");
  assert.deepEqual(ownerView.state.sequences[0].exerciseIds, reordered.sequences[0].exerciseIds);
  assert.equal(ownerView.state.sequences[0].therapistId, "adult-b");
  const saveLaunch = change => request("/api/state/changes", { method: "PATCH",
    headers: { cookie: secondCookie, "content-type": "application/json" }, body: JSON.stringify(parseStateChangeRequest(change)) });
  assert.equal((await saveLaunch(launchChange)).status, 409);
  const restored = rebaseCloudSaveChange(ownerView.state, JSON.parse(JSON.stringify(launchChange)), crypto.randomUUID(), ownerView.revision);
  assert.equal((await saveLaunch(restored.change)).status, 200);
  const currentShared = await (await read(supervisorCookie)).json();
  assert.equal(currentShared.state.sequences[0].lastUsedAt, lastUsedAt);
  assert.deepEqual(currentShared.state.sequences[0].exerciseIds, reordered.sequences[0].exerciseIds);
  const renamed = { ...currentShared.state, sequences: [{ ...currentShared.state.sequences[0], title: "Altro" }] };
  assert.equal((await patchState(supervisorCookie, currentShared, renamed, contentVersion)).status, 403);
  const fullReplace = await request("/api/state", {
    method: "PUT", headers: { cookie: supervisorCookie, "content-type": "application/json", "x-base-revision": String(currentShared.revision), ...contentVersion },
    body: JSON.stringify(renamed),
  });
  assert.equal(fullReplace.status, 403);
  assert.equal((await fullReplace.json()).error, "full_state_replacement_forbidden");
  const adminView = await (await read(adminCookie)).json();
  const reassigned = { ...adminView.state, sequences: [{ ...adminView.state.sequences[0], therapistId: "adult-a" }] };
  const transfer = await request("/api/state", {
    method: "PUT", headers: { cookie: adminCookie, "content-type": "application/json", "x-base-revision": String(adminView.revision) },
    body: JSON.stringify(reassigned),
  });
  assert.equal(transfer.status, 403);
  assert.equal((await transfer.json()).reason, "invalid_sequence_owner");
  assert.equal((await (await read(secondCookie)).json()).revision, currentShared.revision);
  console.log("Auth test: riordino del supervisore visibile al proprietario, rinomina e sostituzione integrale protette.");
  const soundtrackPath = "/api/game-soundtrack";
  const mp3 = readFileSync("public/audio/coloring-calypso.mp3");
  const uploadHeaders = { "content-type": "audio/mpeg", "x-soundtrack-name": encodeURIComponent("Colonna sonora 🎵.mp3"), "x-soundtrack-source": encodeURIComponent("Autore di prova"), "x-soundtrack-license": "CC0", "x-soundtrack-rights": "confirmed" };
  const upload = (body, key = adminCookie, extra = {}) => request(soundtrackPath, {
    method: "PUT", headers: { cookie: key, ...uploadHeaders, ...extra }, body,
  });
  const info = (key = adminCookie) => request(`${soundtrackPath}?info`, { headers: { cookie: key } });
  assert.equal((await request(soundtrackPath)).status, 401);
  assert.equal((await upload(mp3, firstCookie)).status, 401, "a revoked adult session cannot upload");
  assert.equal((await (await info()).json()).soundtrack, null);
  assert.equal((await upload(Buffer.from("ID3 non è un MP3"))).status, 422);
  assert.equal((await upload(Buffer.alloc(6_000_001))).status, 413);
  assert.equal((await upload(mp3, adminCookie, { "x-soundtrack-rights": "" })).status, 400, "the rights confirmation is mandatory");
  assert.equal((await upload(mp3, adminCookie, { "x-soundtrack-license": "" })).status, 400, "the licence is mandatory");
  const withTrailer = Buffer.concat([mp3, Buffer.from("APETAGEX"), Buffer.alloc(24)]);
  assert.equal((await upload(withTrailer)).status, 200, "an APEv2 trailer does not invalidate the MP3");
  const saved = await upload(mp3);
  assert.equal(saved.status, 200);
  const { soundtrack } = await saved.json();
  assert.equal(soundtrack.name, "Colonna sonora 🎵.mp3");
  assert.equal(soundtrack.source, "Autore di prova");
  assert.equal(soundtrack.license, "CC0");
  assert.ok(soundtrack.rightsConfirmedAt, "the rights confirmation time is stored");
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
  const tail = await request(soundtrackPath, { headers: { cookie: adminCookie, range: `bytes=${mp3.length - 10}-` } });
  assert.equal(tail.status, 206, "open-ended ranges are partial responses");
  assert.equal(tail.headers.get("content-range"), `bytes ${mp3.length - 10}-${mp3.length - 1}/${mp3.length}`);
  assert.deepEqual(Buffer.from(await tail.arrayBuffer()), mp3.subarray(mp3.length - 10));
  const suffix = await request(soundtrackPath, { headers: { cookie: adminCookie, range: "bytes=-4" } });
  assert.equal(suffix.status, 206, "suffix ranges are partial responses");
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), mp3.subarray(mp3.length - 4));
  const beyond = await request(soundtrackPath, { headers: { cookie: adminCookie, range: `bytes=${mp3.length}-` } });
  assert.equal(beyond.status, 416, "unsatisfiable ranges are rejected instead of failing");
  assert.equal(beyond.headers.get("content-range"), `bytes */${mp3.length}`);
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
  const drawingPath = "/api/coloring-drawings?drawing=casa";
  const drawingHeaders = (key, profile, scope) => ({
    cookie: key, "x-coloring-profile": profile, ...(scope && { "x-coloring-scope": scope }),
  });
  const readDrawing = (key, profile, scope) => request(drawingPath, { headers: drawingHeaders(key, profile, scope) });
  assert.equal((await request(drawingPath)).status, 401);
  const readDrawingGallery = (key, profile, scope) => request("/api/coloring-drawings?gallery=1", {
    headers: drawingHeaders(key, profile, scope),
  });
  assert.equal((await request("/api/coloring-drawings?gallery=1")).status, 401);
  const initialDrawing = await readDrawing(adminCookie, "adult-a");
  assert.equal(initialDrawing.headers.get("cache-control"), "private, no-store");
  const { scope: drawingScope, drawing: blank } = await initialDrawing.json();
  assert.equal(blank, null);
  const drawing = { version: 1, editedAt: Date.now(), operation: crypto.randomUUID(),
    areas: [{ index: -1, fill: "#f8d245", strokes: [{ tool: "brush", color: "#e84252", points: [{ x: 25, y: 45 }] }] }],
  };
  const uploadDrawing = (value, headers = drawingHeaders(adminCookie, "adult-a", drawingScope)) => request(drawingPath, {
    method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(value),
  });
  assert.equal((await uploadDrawing(drawing, drawingHeaders(adminCookie, "adult-a"))).status, 401);
  assert.equal((await uploadDrawing(drawing, drawingHeaders(secondCookie, "adult-b", drawingScope))).status, 401);
  assert.equal((await uploadDrawing({ ...drawing, areas: [{ index: 100, strokes: [] }] })).status, 400);
  const emptyDrawing = await request(drawingPath, { method: "PUT", headers: { ...drawingHeaders(adminCookie, "adult-a", drawingScope), "content-type": "application/json" } });
  assert.equal(emptyDrawing.status, 400, "a missing body is invalid, not too large");
  const savedDrawing = await uploadDrawing(drawing);
  assert.equal(savedDrawing.status, 200);
  const { etag: firstDrawingTag } = await savedDrawing.json();
  assert.ok(firstDrawingTag);
  const { drawing: storedDrawing, etag: readDrawingTag } = await (await readDrawing(adminCookie, "adult-a", drawingScope)).json();
  assert.deepEqual(storedDrawing, drawing);
  assert.equal(readDrawingTag, firstDrawingTag);
  const gallery = await readDrawingGallery(adminCookie, "adult-a", drawingScope);
  assert.equal(gallery.headers.get("cache-control"), "private, no-store");
  assert.deepEqual((await gallery.json()).drawings, [{ id: "casa", etag: firstDrawingTag }]);
  assert.equal((await readDrawingGallery(secondCookie, "adult-b", drawingScope)).status, 401);
  assert.deepEqual((await (await readDrawingGallery(secondCookie, "adult-b")).json()).drawings, []);
  assert.equal((await (await readDrawing(secondCookie, "adult-b")).json()).drawing, null);
  const reset = { ...drawing, editedAt: drawing.editedAt + 2, operation: crypto.randomUUID(), areas: [] };
  const interim = { ...drawing, editedAt: drawing.editedAt + 1, operation: crypto.randomUUID() };
  const concurrent = await Promise.all([uploadDrawing(reset), uploadDrawing(interim)]);
  assert.ok(concurrent.every(response => response.status === 200));
  assert.deepEqual((await (await uploadDrawing(drawing)).json()).drawing, reset, "an old offline edit cannot undo a newer reset");
  const latestDrawing = await (await readDrawing(adminCookie, "adult-a")).json();
  assert.deepEqual(latestDrawing.drawing, reset);
  assert.notEqual(latestDrawing.etag, firstDrawingTag, "reset invalidates the saved preview across devices");
  assert.deepEqual((await (await readDrawingGallery(adminCookie, "adult-a")).json()).drawings, [{ id: "casa", etag: latestDrawing.etag }]);
  console.log("PASS: coloring drawings, gallery isolation and revisions, concurrent resets and offline retries on R2.");
  const queuePath = "/api/scheduled-images";
  const queueAdmin = (body, key = adminCookie, profile = "adult-a") => request(queuePath, {
    method: body ? "POST" : "GET",
    headers: { cookie: key, "x-scheduled-images-profile": profile, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal((await request(queuePath)).status, 401);
  assert.equal((await queueAdmin(undefined, secondCookie, "adult-b")).status, 403);
  assert.equal((await request(queuePath + "/publisher", { method: "POST" })).status, 404, "the GitHub publisher endpoint is gone");
  assert.equal((await queueAdmin({ action: "rotate_publisher_key" })).status, 400);
  assert.equal((await request(queuePath + "/worker", { method: "POST" })).status, 404, "generation has no public worker route");
  const manualCard = {
    id: crypto.randomUUID(), word: "Rocchetto", category: "Oggetti", contentKind: "word",
    source: "Elemento testuale", license: "Nessuna immagine", author: "—", article: null,
    syllabification: "roc-chet-to", syllableCount: 3, syllableStatus: "automatic",
  };
  const saveManualCard = async item => {
    const { state: previous, revision } = await (await read(adminCookie)).json();
    const library = [...previous.library.filter(entry => entry.id !== item.id), item];
    const change = buildStateChange(previous, { ...previous, library }, crypto.randomUUID(), revision);
    const response = await request("/api/state/changes", {
      method: "PATCH", headers: { cookie: adminCookie, "content-type": "application/json" }, body: JSON.stringify(change),
    });
    assert.equal(response.status, 200);
  };
  const assertNoGeneration = async () => {
    const { requests, generation } = await (await queueAdmin()).json();
    assert.deepEqual(requests, [], "saving a manual card never creates a generation request");
    assert.equal(generation.used, 0);
    assert.deepEqual(imageApiCalls, []);
  };
  await saveManualCard(manualCard);
  await assertNoGeneration();

  const mediaId = crypto.randomUUID();
  const uploadPhoto = await request("/api/media", {
    method: "POST", headers: { cookie: adminCookie, "content-type": "image/webp", "x-media-id": mediaId },
    body: readFileSync("public/images/demo/clessidra.webp"),
  });
  assert.equal(uploadPhoto.status, 201);
  await saveManualCard({
    ...manualCard, source: "Upload privato", license: "Diritto d’uso dichiarato", author: "Utente",
    privateUpload: true, remoteImageId: mediaId, article: "IL",
  });
  await assertNoGeneration();
  const added = await (await queueAdmin({ action: "generate", words: "Nave\nRocchetto\nClessidra\nLanterna | una lampada a olio\nLANTERNA" })).json();
  assert.equal(added.accepted, 4);
  assert.equal(added.requests.find(item => item.word === "Nave").status, "existing");
  assert.equal(added.requests.find(item => item.word === "Rocchetto").status, "existing");
  const duplicate = await (await queueAdmin({ action: "generate", words: " lanterna " })).json();
  assert.equal(duplicate.accepted, 0);
  const waitForQueueStatus = async (word, status) => {
    for (let attempt = 0; attempt < 80; attempt++) {
      const current = await (await queueAdmin()).json();
      const item = current.requests.find(item => item.word === word);
      if (item?.status === status) return item;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.fail(`Queue never reached ${status} for ${word}`);
  };
  const job = await waitForQueueStatus("Lanterna", "generated");
  assert.deepEqual(imageApiCalls, [{ parola: "Lanterna", precisazione_visiva: "una lampada a olio" }], "existing and duplicate words consume no requests");
  const producer = await mf.getQueueProducer("SCHEDULED_IMAGE_JOBS");
  const { generationId } = await db.prepare("SELECT generation_id AS generationId FROM scheduled_image_requests WHERE id = ?").bind(job.id).first();
  await producer.sendBatch([{ body: { id: job.id, generationId } }, { body: { id: job.id, generationId } }]);
  const listedCatalog = async () => (await (await request("/api/official-catalog")).json()).entries;
  assert.deepEqual(await listedCatalog(), [], "generated drafts stay private");
  assert.equal((await request(`/images/catalog/${job.id}.png`)).status, 404);
  assert.equal((await queueAdmin({ action: "publish", id: job.id })).status, 200);
  assert.deepEqual(await listedCatalog(), [], "retry uses only previously approved proposals");
  const metadata = { category: "Oggetti", article: "LA", syllabification: "lan-ter-na" };
  const preview = (sessionCookie, profile) => request(queuePath + "?preview=" + job.id,
    { headers: { cookie: sessionCookie, "x-scheduled-images-profile": profile } });
  assert.equal((await preview(secondCookie, "adult-b")).status, 403);
  const reviewed = await (await preview(adminCookie, "adult-a")).json();
  assert.deepEqual(JSON.parse(reviewed.metadata), { ...metadata, article: null }, "new nouns get an editable local draft");
  assert.equal(reviewed.image, apiImage);
  assert.equal(reviewed.imageType, "image/png");
  const approval = { action: "approve", id: job.id, digest: reviewed.digest, metadata };
  assert.equal((await queueAdmin({ ...approval, digest: "invalid" })).status, 409);
  assert.equal((await queueAdmin(approval, secondCookie, "adult-b")).status, 403);
  assert.equal((await queueAdmin({ ...approval, metadata: { ...metadata, category: "Azione" } })).status, 422);
  const concurrentApprovals = await Promise.all([queueAdmin(approval), queueAdmin(approval)]);
  assert.deepEqual(concurrentApprovals.map(response => response.status).sort(), [200, 409]);
  const result = await concurrentApprovals.find(response => response.ok).json();
  assert.equal(result.requests.find(item => item.id === job.id).status, "published");
  assert.deepEqual(await listedCatalog(), [{ assetId: job.id, word: "Lanterna", metadata, extension: "png" }]);
  const publicImage = await request(`/images/catalog/${job.id}.png`);
  assert.equal(publicImage.status, 200);
  assert.equal(publicImage.headers.get("content-type"), "image/png");
  assert.equal(publicImage.headers.get("x-content-type-options"), "nosniff");
  assert.ok((await publicImage.arrayBuffer()).byteLength);
  assert.equal((await request(`/images/catalog/${job.id}.webp`)).status, 404);
  assert.equal(await db.prepare("SELECT image_base64 FROM scheduled_image_requests WHERE id = ?").bind(job.id).first("image_base64"), null);
  assert.equal((await queueAdmin({ action: "generate", words: "LANterna" })).status, 200);
  assert.equal(imageApiCalls.length, 1, "the shared catalog prevents regeneration");

  await queueAdmin({ action: "generate", words: "Ombrello" });
  assert.match((await waitForQueueStatus("Ombrello", "needs_review")).message, /HTTP 400 · moderation_blocked/);
  await queueAdmin({ action: "generate", words: "Ventaglio" });
  const limited = await waitForQueueStatus("Ventaglio", "failed");
  assert.match(limited.message, /Limite mensile/);
  assert.deepEqual(imageApiCalls.map(item => item.parola), ["Lanterna", "Ombrello"], "queue redelivery and the capped word consume no requests");
  assert.deepEqual((await (await queueAdmin()).json()).generation, { used: 2, limit: 2 });
  const missed = crypto.randomUUID(), expired = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO scheduled_image_requests (id, account_id, word, word_key, generation_id, status, created_at, updated_at)
      VALUES (?, ?, 'Maniglia', 'maniglia', ?, 'queued', ?, ?)`).bind(missed, account, crypto.randomUUID(), now, now),
    db.prepare(`INSERT INTO scheduled_image_requests (id, account_id, word, word_key, generation_id, status, lease_until, created_at, updated_at)
      VALUES (?, ?, 'Portacandele', 'portacandele', ?, 'processing', ?, ?, ?)`).bind(expired, account, crypto.randomUUID(), now - 1000, now, now),
  ]);
  const oldImage = readFileSync("public/images/demo/clessidra.webp").toString("base64");
  for (const [word, syllabification, status] of [["Lanterna marina", "lan-ter-na ma-ri-na", "approved"], ["Scatola", "sca-to-la", "pull_request"]]) {
    const approvedMetadata = { category: "Oggetti", article: "LA", syllabification };
    const digest = createHash("sha256").update(JSON.stringify([approvedMetadata, oldImage])).digest("hex");
    await db.prepare(`INSERT INTO scheduled_image_requests (id, account_id, word, word_key, status, metadata, image_base64, proposal_digest, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), account, word, word.toLowerCase(), status,
      JSON.stringify(approvedMetadata), oldImage, digest, now, now).run();
  }
  const recovery = await request("/cdn-cgi/handler/scheduled?cron=" + encodeURIComponent("*/5 * * * *"));
  assert.equal(recovery.status, 200);
  const [recoveredDelivery, expiredCall] = await Promise.all([
    waitForQueueStatus("Maniglia", "failed"), waitForQueueStatus("Portacandele", "failed"),
  ]);
  assert.match(recoveredDelivery.message, /Limite mensile/);
  assert.match(expiredCall.message, /Generazione interrotta/);
  assert.equal(imageApiCalls.length, 2, "recovery respects the cap and does not repeat uncertain API calls");
  await Promise.all([waitForQueueStatus("Lanterna marina", "published"), waitForQueueStatus("Scatola", "published")]);
  assert.equal((await listedCatalog()).length, 3);
  assert.equal(imageApiCalls.length, 2, "backfill never invokes the image provider");
  assert.equal((await queueAdmin({ action: "cancel", id: job.id })).status, 409);
  await db.prepare(`INSERT INTO scheduled_image_requests (id, account_id, word, word_key, status, created_at, updated_at)
    SELECT ?, account_id, 'Girandola', 'girandola', 'existing', 1, 1 FROM scheduled_image_requests WHERE id = ?`).bind(crypto.randomUUID(), job.id).run();
  const regenerated = await (await queueAdmin({ action: "generate", words: "Girandola" })).json();
  assert.equal(regenerated.accepted, 1, "a word marked as illustrated can be requested again once it has no image");
  assert.notEqual(regenerated.requests.find(item => item.word === "Girandola").status, "existing");
  const snapshot = await (await queueAdmin()).json();
  assert.equal(snapshot.requests.find(item => item.id === job.id).status, "published");
  console.log("PASS: manual card and photo save bypass OpenAI, explicit single and batch generation, quota, private previews, direct publication and legacy recovery.");
  const importPath = "/api/official-catalog/import";
  const importImage = (body, key = adminCookie, profile = "adult-a") => request(importPath, {
    method: "POST", headers: { cookie: key, "x-scheduled-images-profile": profile, "content-type": "application/json" },
    body: JSON.stringify({ word: "Fanalino", ...body }),
  });
  const searches = { action: "search", detail: "Port lamp" };
  assert.equal((await importImage(searches, secondCookie, "adult-b")).status, 403);
  assert.equal((await importImage({ ...searches, detail: "https://example.test/" })).status, 400);
  const searchResponse = await importImage(searches);
  const found = await searchResponse.json();
  assert.equal(searchResponse.status, 200, JSON.stringify(found));
  assert.deepEqual(found.results, [{ id: commonsId, title: "Port lamp", thumbnail: `https://api.openverse.org/v1/images/${commonsId}/thumb/`, license: "by" }]);

  const imagePreview = { action: "preview", id: commonsId };
  alternateImageHost = true;
  assert.equal((await importImage(imagePreview)).status, 422);
  alternateImageHost = false;
  redirectedImage = true;
  assert.equal((await importImage(imagePreview)).status, 502);
  redirectedImage = false;
  commonsLicense = "https://creativecommons.org/publicdomain/zero/1.0/";
  assert.equal((await (await importImage(imagePreview)).json()).credit.license, "cc0");
  commonsLicense = ccBy;
  const review = await (await importImage(imagePreview)).json();
  assert.equal(review.imageType, "image/png");
  assert.equal(review.credit.author, "Demo & Author");
  assert.equal(review.credit.sourceUrl, commonsOrigin + "/wiki/File:Port_lamp.png");
  assert.equal((await listedCatalog()).length, 3, "preview does not publish");
  const importApproval = { action: "publish", id: commonsId, digest: review.digest, metadata: review.metadata };
  assert.equal((await importImage({ ...importApproval, digest: "f".repeat(64) })).status, 409);
  commonsLicense = "https://creativecommons.org/licenses/by-nc/4.0/";
  assert.equal((await importImage(importApproval)).status, 422, "publication rechecks the license at source");
  commonsLicense = ccBy;
  const approvedImports = await Promise.all([importImage(importApproval), importImage(importApproval)]);
  assert.deepEqual(approvedImports.map(response => response.status).sort(), [201, 409]);
  const imported = (await listedCatalog()).find(entry => entry.word === "Fanalino");
  assert.deepEqual(imported.credit, review.credit);
  const stockPhoto = await request(`/images/catalog/${imported.assetId}.png`);
  assert.equal(stockPhoto.status, 200);
  assert.equal(stockPhoto.headers.get("content-type"), "image/png");
  assert.equal(imageApiCalls.length, 2, "search, preview and publication do not invoke OpenAI");
  console.log("PASS: Openverse import checks source, license and exact preview and publishes with credits without spending OpenAI budget.");

  await checkLegacyExerciseWrites({ db, account, request, adminCookie, read });
  await checkExerciseCopyWrites({ request, read, ownerCookie: secondCookie, supervisorCookie, adminCookie });
  console.log("PASS: production 100000 cap, old hash rejected without rate-limit increment, admin cloud reset and login with the same PIN.");
  console.log("PASS: login PBKDF2, refresh, logout revocato, cambio adulto, PIN errato e vista isolata verificati su Worker/D1 locali.");
} finally { await mf.dispose(); }
