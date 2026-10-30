// Browser regression on a separately running local build/Chromium. Synthetic
// public preview only; no production data, credentials or external requests.
import assert from "node:assert/strict";

const origin = process.env.TEST_APP_ORIGIN ?? "http://127.0.0.1:5180";
const tabs = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const socket = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
let sequence = 0;
const pending = new Map();
const errors = [];
let navigations = 0;
let stateFixture = null;
let revision = 1;
const fixture = {
  schemaVersion: 1, kind: "exercise", title: "Demo aggiornamento",
  exercises: [{ id: "quantity-demo", kind: "number-quantity", title: "Numero demo", promptId: "", optionIds: [], rounds: 3, quantityMin: 3, quantityMax: 3, quantityErrorless: true }], library: [],
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
socket.addEventListener("message", async (event) => {
  const data = JSON.parse(event.data);
  if (data.id) {
    const handler = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) handler?.reject(new Error(JSON.stringify(data.error))); else handler?.resolve(data.result);
  }
  if (data.method === "Runtime.exceptionThrown") errors.push(data.params.exceptionDetails.text);
  if (data.method === "Page.frameNavigated" && !data.params.frame.parentId) navigations += 1;
  if (data.method === "Fetch.requestPaused") {
    const { requestId, request } = data.params;
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/shared-launch/")) await send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify(fixture)).toString("base64") });
    else if (url.pathname === "/api/app-version") await send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ version: "r9999999-abcdef0" })).toString("base64") });
    else if (stateFixture && (url.pathname === "/api/state" || url.pathname === "/api/state/changes")) await send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ state: stateFixture, revision: ++revision })).toString("base64") });
    else if (url.origin !== origin) await send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
    else await send("Fetch.continueRequest", { requestId });
  }
});
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const waitFor = async (expression, afterNavigation = -1) => {
  for (let i = 0; i < 150; i++) {
    if (navigations > afterNavigation && await evaluate(`Boolean(${expression})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${expression}; page: ${await evaluate("document.body.innerText.slice(0,1800)")}`);
};
try {
  await send("Page.enable"); await send("Runtime.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__updateHandoff = JSON.parse(sessionStorage.getItem('lg-update-checkpoint-v1') || 'null');" });
  await send("Page.navigate", { url: `${origin}/?preview=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` });
  await waitFor("document.querySelectorAll('.quantity-field button').length === 10 && document.querySelector('.app-version button')");
  await evaluate("document.querySelectorAll('.quantity-field button')[0].click(); document.querySelectorAll('.quantity-field button')[2].click()");
  await waitFor("document.querySelectorAll('.quantity-field button[aria-pressed=true]').length === 2");
  // Storage failure must never reload or discard the active activity.
  await evaluate("window.__originalSetItem=Storage.prototype.setItem; Storage.prototype.setItem=function(key,value){if(key==='lg-update-checkpoint-v1')throw new Error('synthetic quota');return window.__originalSetItem.call(this,key,value)}; document.querySelector('.app-version button').click()");
  await waitFor("document.querySelector('.app-version [role=alert]')");
  assert.equal(await evaluate("document.querySelectorAll('.quantity-field button[aria-pressed=true]').length"), 2);
  const beforeFirstUpdate = navigations;
  await evaluate("Storage.prototype.setItem=window.__originalSetItem; document.querySelector('.app-version button').click()");
  await waitFor("window.__updateHandoff && document.querySelectorAll('.quantity-field button[aria-pressed=true]').length === 2", beforeFirstUpdate);
  assert.equal(await evaluate("window.__updateHandoff.values['root:sessionIndex']"), 0);
  assert.equal(await evaluate("sessionStorage.getItem('lg-update-checkpoint-v1')"), null, "handoff is consumed after reload");
  assert.ok(await evaluate("location.search.includes('preview=')"), "public token survives update");
  await evaluate("document.querySelectorAll('.quantity-field button')[4].click()");
  await waitFor("document.querySelector('.quantity-field.correct')");
  assert.equal(await evaluate("document.querySelectorAll('.quantity-field button:disabled').length"), 10, "restored quantity refs retain the two prior selections");
  const beforeSecondUpdate = navigations;
  await evaluate("document.querySelector('.app-version button').click()");
  await waitFor("Object.entries(window.__updateHandoff?.values ?? {}).some(([key,value]) => key.startsWith('NumberQuantitySession:') && key.endsWith(':judgement') && value === 'correct') && document.querySelector('.quantity-field.correct') && document.querySelectorAll('.quantity-field button:disabled').length === 10", beforeSecondUpdate);
  // Fresh public previews also exercise the category/article component state.
  fixture.library = [
    { id: "cane", word: "cane", category: "Animali", article: "IL", emoji: "🐕" },
    { id: "mela", word: "mela", category: "Cibi", article: "LA", emoji: "🍎" },
  ];
  for (const kind of ["articles", "word-categories", "recognition"]) {
    fixture.exercises = [{ id: `demo-${kind}`, kind, title: "Demo aggiornamento", rounds: 2, promptId: "cane", optionIds: ["cane", "mela"], articleItemIds: ["cane", "mela"], categoryItemIds: ["cane", "mela"], categoryNames: ["Animali", "Cibi"], autoPronounce: false }];
    await send("Page.navigate", { url: `${origin}/?preview=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb&case=${kind}` });
    const selector = kind === "articles" ? ".article-card" : kind === "word-categories" ? ".word-category-card" : ".answer-card";
    await waitFor(`document.querySelector(${JSON.stringify(selector)}) && document.querySelector('.app-version button')`);
    const before = await evaluate("JSON.stringify([...document.querySelectorAll('.article-card,.word-category-card,.answer-card')].map(el=>el.getAttribute('aria-label')))");
    const navigationBefore = navigations;
    await evaluate("document.querySelector('.app-version button').click()");
    await waitFor(`window.__updateHandoff && document.querySelector(${JSON.stringify(selector)})`, navigationBefore);
    assert.equal(await evaluate("JSON.stringify([...document.querySelectorAll('.article-card,.word-category-card,.answer-card')].map(el=>el.getAttribute('aria-label')) )"), before, `${kind} keeps current image and choice order`);
  }
  stateFixture = await evaluate(`(() => {
    const read = (key, fallback) => JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    const therapists = [{id:'adult-demo-update',firstName:'Demo',lastName:'Test',email:'demo@example.invalid',role:'Amministratore',childIds:['child-demo-update']}];
    const children = [{id:'child-demo-update',firstName:'Demo',lastName:'',birthYear:'',notes:'',avatarColor:'#7568d9'}];
    localStorage.setItem('lg-therapists',JSON.stringify(therapists));
    localStorage.setItem('lg-children',JSON.stringify(children));
    localStorage.setItem('lg-active-child',JSON.stringify(children[0].id));
    localStorage.setItem('lg-therapist-session', JSON.stringify({therapistId:therapists[0].id,expiresAt:Date.now()+86400000}));
    return {schemaVersion:1,therapists,children,activeChildId:children[0].id,activeSequenceId:read('lg-active-sequence',''),library:read('lg-library',[]),exercises:read('lg-exercises',[]),sequences:read('lg-sequences',[]),attempts:[],helps:[],sessionHistory:[],appearance:read('lg-appearance',{}),soundPreferences:read('lg-sound-preferences',{}),categorySymbols:read('lg-category-symbols',{})};
  })()`);
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${origin}/` });
  await waitFor("document.querySelector('.whats-new summary') && document.querySelector('.topbar .app-version button')");
  await evaluate("document.querySelector('.whats-new summary').click()");
  assert.equal(await evaluate("document.querySelectorAll('.whats-new[open] li').length"), 5);
  assert.ok(await evaluate("document.querySelector('.whats-new summary small').textContent.startsWith('vr')"), "notes describe the loaded version");
  assert.deepEqual(errors, [], "no uncaught browser errors");
  console.log("PASS browser: mobile update, storage failure, public URL, quantity selections/lock, IL-LA/categories/recognition order, desktop home version and release notes");
} finally { socket.close(); }
