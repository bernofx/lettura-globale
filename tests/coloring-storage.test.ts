import assert from "node:assert/strict";
import test from "node:test";
import { THERAPIST_SESSION_STORAGE_KEY } from "../app/domain/therapist-session.ts";
import { SYNCED_DEVICE_BUDGET, type ColoringDrawing } from "../app/domain/coloring-drawings.ts";

// ---- Browser fakes: storage with a quota, timers, network and a drawings server ----

class QuotaStorage {
  data = new Map<string, string>();
  quota = Infinity;
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  size() { let total = 0; for (const [key, value] of this.data) total += key.length + value.length; return total; }
  setItem(key: string, value: string) {
    const previous = this.data.get(key);
    const next = this.size() - (previous === undefined ? 0 : key.length + previous.length) + key.length + value.length;
    if (next > this.quota) throw new DOMException("quota", "QuotaExceededError");
    this.data.set(key, value);
  }
}

type Request = { method: string; scope: string | null; keepalive: boolean; id: string | null; body?: ColoringDrawing };
const server = {
  account: "a".repeat(32),
  cloud: new Map<string, Map<string, ColoringDrawing>>(),
  requests: [] as Request[],
  hangPuts: false,
};
const storage = new QuotaStorage();
const listeners = new Map<string, Set<() => void>>();

Object.assign(globalThis, {
  localStorage: storage,
  window: Object.assign(globalThis, {
    addEventListener: (type: string, listener: () => void) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(listener); },
    removeEventListener: (type: string, listener: () => void) => listeners.get(type)?.delete(listener),
  }),
});
Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, get: () => online });
let online = true;

globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = new URL(String(input), "https://app.example");
  const headers = new Headers(init.headers);
  const scope = headers.get("x-coloring-scope");
  const id = url.searchParams.get("drawing");
  const method = init.method ?? "GET";
  const body = typeof init.body === "string" ? JSON.parse(init.body) as ColoringDrawing : undefined;
  server.requests.push({ method, scope, keepalive: Boolean(init.keepalive), id, body });
  if (scope !== null && scope !== server.account) return Response.json({ error: "profile_changed" }, { status: 401 });
  const drawings = server.cloud.get(server.account) ?? new Map();
  server.cloud.set(server.account, drawings);
  if (method === "PUT") {
    if (server.hangPuts && !init.keepalive) return new Promise<Response>(() => {});
    drawings.set(id!, body!);
    return Response.json({ written: true, etag: body!.operation });
  }
  if (url.searchParams.get("gallery")) return Response.json({ scope: server.account, drawings: [...drawings].map(([page, value]) => ({ id: page, etag: value.operation })) });
  if (id) { const drawing = drawings.get(id) ?? null; return Response.json({ scope: server.account, drawing, etag: drawing?.operation }); }
  return Response.json({ scope: server.account });
}) as typeof fetch;

const { createColoringStorage } = await import("../app/features/games/coloring-storage.ts");

const A = "a".repeat(32), B = "b".repeat(32);
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
function login(session: string, account: string) {
  storage.setItem(THERAPIST_SESSION_STORAGE_KEY, JSON.stringify({ therapistId: "admin-giuseppe", expiresAt: 4_102_444_800_000, session }));
  server.account = account;
}
function reset() {
  listeners.clear(); // Instances left by a failed test must not answer later page events.
  storage.data.clear();
  storage.quota = Infinity;
  server.cloud.clear();
  server.requests = [];
  server.hangPuts = false;
  online = true;
}
function drawing(color = "#e84252", editedAt = 1_700_000_000_000, size = 0): ColoringDrawing {
  return { version: 1, editedAt, operation: crypto.randomUUID(), areas: [{ index: -1, fill: color, strokes: size ? [{ tool: "brush", color, points: Array.from({ length: size }, (_, x) => ({ x, y: 1 })) }] : [] }] };
}
const keysOf = (account: string) => [...storage.data.keys()].filter((key) => key.startsWith(`lg-coloring:v2:${account}:`));
const open = () => { const coloring = createColoringStorage("admin-giuseppe", "demo@example.test"); const stop = coloring.listen(); return { coloring, stop }; };

test("uno scope rifiutato dopo un accesso in un'altra scheda non sposta i disegni nell'altro account", async () => {
  reset();
  login("A1", A);
  const { coloring, stop } = open();
  await settle();
  online = false;
  coloring.save("casa", drawing().areas);
  assert.equal(keysOf(A).length, 1, "the edit is kept under account A");
  login("B1", B); // Another tab logs in as account B with the same demo adult.
  online = true;
  coloring.flush();
  await settle(); await settle();
  assert.equal(keysOf(A).length, 1, "A's unsynced drawing stays with A");
  assert.equal(keysOf(B).length, 0, "nothing is moved into B");
  assert.equal(server.cloud.get(B)?.size ?? 0, 0, "nothing is uploaded to B's cloud");
  const preview: Record<string, unknown> = {};
  await coloring.loadGallery(new AbortController().signal, (previews) => Object.assign(preview, previews));
  assert.equal(preview.casa, undefined, "B's gallery does not show A's drawing from memory");
  stop();
});

test("un disegno fatto prima di conoscere lo scope resta in memoria e si salva solo nello stesso accesso", async () => {
  reset();
  login("A1", A);
  online = false;
  const first = open();
  const result = first.coloring.save("casa", drawing().areas);
  assert.equal(result.kept, false, "no device copy before the scope is verified");
  assert.equal([...storage.data.keys()].filter((key) => key.startsWith("lg-coloring:")).length, 0, "no orphaned pre-scope keys");
  online = true;
  first.coloring.flush();
  await settle(); await settle();
  assert.equal(server.cloud.get(A)?.has("casa"), true, "the same login uploads it once the scope is known");
  first.stop();

  reset();
  login("A1", A);
  online = false;
  const second = open();
  second.coloring.save("casa", drawing().areas);
  login("B1", B);
  online = true;
  second.coloring.flush();
  await settle(); await settle();
  assert.equal(keysOf(B).length, 0, "an edit from another login is not attributed to B");
  assert.equal(server.cloud.get(B)?.size ?? 0, 0);
  second.stop();
});

test("le vecchie copie (versione 1) passano solo all'account che le aveva salvate", async () => {
  reset();
  const legacy = "lg-coloring:admin-giuseppe:demo%40example.test:";
  storage.setItem(legacy + "scope", A);
  storage.setItem(legacy + "casa", JSON.stringify({ drawing: drawing(), pending: true }));
  login("B1", B);
  const asB = open();
  await settle();
  assert.equal(keysOf(B).length, 0, "account B does not receive A's legacy drawing");
  assert.ok(storage.getItem(legacy + "casa"), "the legacy copy is kept for its account");
  asB.stop();
  login("A1", A);
  const asA = open();
  await settle(); await settle();
  assert.equal(keysOf(A).length, 1, "account A gets its legacy drawing back");
  assert.equal(storage.getItem(legacy + "casa"), null, "the legacy key is removed after a successful move");
  assert.equal(server.cloud.get(A)?.has("casa"), true);
  asA.stop();
});

test("se lo spostamento non riesce per lo spazio pieno, la copia originale resta", async () => {
  reset();
  const legacy = "lg-coloring:admin-giuseppe:demo%40example.test:";
  storage.setItem(legacy + "scope", A);
  storage.setItem(legacy + "casa", JSON.stringify({ drawing: drawing("#e84252", 1_700_000_000_000, 3_000), pending: true }));
  login("A1", A);
  storage.quota = storage.size() + 200; // No room for a second copy of the drawing.
  online = false; // Keep the drawing local: only the move is under test.
  const { coloring, stop } = open();
  online = true;
  await coloring.loadGallery(new AbortController().signal, () => {});
  assert.ok(storage.getItem(legacy + "casa"), "the unsynced drawing is not deleted when the move fails");
  stop();
});

test("con lo spazio pieno si liberano le copie già sincronizzate per salvare un disegno nuovo", async () => {
  reset();
  login("A1", A);
  const { coloring, stop } = open();
  await settle();
  for (const page of ["mela", "pera", "gatto"]) storage.setItem(`lg-coloring:v2:${A}:${page}`, JSON.stringify({ drawing: drawing("#2b9b58", 1_600_000_000_000, 2_000), pending: false }));
  storage.quota = storage.size() + 500;
  const result = coloring.save("casa", drawing("#e84252", 1_700_000_000_000, 400).areas);
  assert.equal(result.kept, true, "synced copies (still in the cloud) make room for the unsynced edit");
  stop();
});

test("il limite delle copie sincronizzate vale per tutto il dispositivo, non per un solo account", async () => {
  reset();
  const big = (account: string, page: string, editedAt: number) => storage.setItem(`lg-coloring:v2:${account}:${page}`, JSON.stringify({ drawing: drawing("#2b9b58", editedAt, 9_000), pending: false }));
  for (let index = 0; index < 6; index++) { big(B, `b${index}`, 1_500_000_000_000 + index); big("c".repeat(32), `c${index}`, 1_500_000_000_100 + index); }
  login("A1", A);
  server.cloud.set(A, new Map([["casa", drawing()]]));
  const { coloring, stop } = open();
  await coloring.loadGallery(new AbortController().signal, () => {});
  let synced = 0;
  for (const [key, value] of storage.data) if (key.startsWith("lg-coloring:") && !JSON.parse(value).pending) synced += value.length;
  assert.ok(synced <= SYNCED_DEVICE_BUDGET, `synced copies across accounts stay within the budget (${synced})`);
  stop();
});

test("alla chiusura parte un invio keepalive anche per il disegno il cui invio è in corso", async () => {
  reset();
  login("A1", A);
  const { coloring, stop } = open();
  await settle();
  server.hangPuts = true;
  coloring.save("casa", drawing().areas);
  coloring.flush();
  await settle();
  assert.ok(server.requests.some((request) => request.method === "PUT" && !request.keepalive), "a regular upload is in flight");
  for (const listener of listeners.get("pagehide") ?? []) listener();
  await settle();
  assert.ok(server.requests.some((request) => request.method === "PUT" && request.keepalive && request.id === "casa"), "page hide sends it again with keepalive");
  stop();
});
