import { useEffect, useMemo } from "react";
import { COLORING_DRAWINGS_URL, MAX_DRAWING_BYTES, compareColoringDrawings, deviceEvictions, drawingUploadTimeout, type ColoringArea, type ColoringDrawing, type DeviceCopy } from "../../domain/coloring-drawings";
import { coloringPages, type ColoringPage } from "../../domain/coloring-pages";
import { THERAPIST_SESSION_STORAGE_KEY } from "../../domain/therapist-session";
import { fetchWithTimeout } from "../../shared/cloud-client";

type DeviceDrawing = { drawing: ColoringDrawing; pending: boolean; etag?: string };
/** Unscoped edits live only in memory, tagged with the login session that made them. */
type MemoryDrawing = DeviceDrawing & { session?: string };
type CloudDrawing = { scope: string; drawing?: ColoringDrawing | null; etag?: string; drawings?: Array<{ id: string; etag: string }> };
export type ColoringPreviews = Partial<Record<string, ColoringArea[]>>;

/** Every device copy of a drawing, any version or account, starts with this. */
const DEVICE_ROOT = "lg-coloring:";
const KEY_ROOT = "lg-coloring:v2:";
/** Browsers cap the bodies of in-flight keepalive requests at 64 KiB in total. */
const KEEPALIVE_BUDGET = 60_000;
const scopePattern = /^[a-f0-9]{16,128}$/;

/** Short, stable tag of the current login session (a new login, in any tab, gives a new tag). */
function sessionTag() {
  let value = "";
  try { value = localStorage.getItem(THERAPIST_SESSION_STORAGE_KEY) ?? ""; } catch { /* Storage unavailable. */ }
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  return (hash >>> 0).toString(16);
}

function storedKeys(startsWith: string) {
  const keys: string[] = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(startsWith)) keys.push(key);
    }
  } catch { /* Storage unavailable. */ }
  return keys;
}

function parseDevice(raw: string | null): DeviceDrawing | undefined {
  try {
    const device = JSON.parse(raw ?? "null") as DeviceDrawing | null;
    return device && device.drawing?.version === 1 && Array.isArray(device.drawing.areas) ? device : undefined;
  } catch { return undefined; }
}

/**
 * Frees already-synced drawing copies across the whole device (every account,
 * profile and storage version), oldest first, so drawings never starve session
 * recovery or the cloud save queue. Unsynced copies are never removed.
 */
function pruneDevice(budget?: number) {
  const copies: DeviceCopy[] = [];
  for (const key of storedKeys(DEVICE_ROOT)) {
    let raw: string | null = null;
    try { raw = localStorage.getItem(key); } catch { continue; }
    const device = parseDevice(raw);
    if (device) copies.push({ key, size: raw?.length ?? 0, pending: device.pending, editedAt: device.drawing.editedAt });
  }
  for (const key of deviceEvictions(copies, budget)) {
    try { localStorage.removeItem(key); } catch { /* Nothing else to free. */ }
  }
}

/**
 * Device copies are stored only under the account scope verified by the server,
 * so accounts sharing a tablet (even with the same demo adult id/email) never
 * see or upload each other's drawings. A scope is remembered for the login
 * session that verified it; copies stay under their scope across logins of
 * the same account. Before the scope is known, edits are kept in memory only.
 */
export function createColoringStorage(profileId: string, email: string) {
  const scopeKey = `lg-coloring-scope:${encodeURIComponent(profileId)}`;
  const legacyPrefix = `lg-coloring:${encodeURIComponent(profileId)}:${encodeURIComponent(email.trim().toLowerCase())}:`;
  /** In-memory copies keyed by full device key (scope + id), or `unscoped:<id>`. */
  const memory = new Map<string, MemoryDrawing>();
  const previews = new Map<string, { operation: string; areas: ColoringArea[] }>();
  const inFlight = new Set<string>();
  let scope = rememberedScope();
  let timer = 0;
  let running: Promise<void> | null = null;
  let flushAgain = false;

  function rememberedScope() {
    try {
      const stored = JSON.parse(localStorage.getItem(scopeKey) ?? "null") as { session?: string; scope?: string } | null;
      return stored?.session === sessionTag() && scopePattern.test(stored.scope ?? "") ? String(stored.scope) : "";
    } catch { return ""; }
  }

  const keyFor = (id: string) => scope ? `${KEY_ROOT}${scope}:${id}` : `unscoped:${id}`;

  function readDevice(id: string): MemoryDrawing | undefined {
    const key = keyFor(id);
    let device: DeviceDrawing | undefined;
    if (scope) {
      try { device = parseDevice(localStorage.getItem(key)); } catch { /* Browser storage can be unavailable. */ }
    }
    const latest = memory.get(key);
    return latest && (!device || compareColoringDrawings(latest.drawing, device.drawing) >= 0) ? latest : device;
  }

  /** Stores a copy under the current scope; returns whether it is on the device (not only in memory). */
  function writeDevice(id: string, entry: DeviceDrawing) {
    const previous = readDevice(id);
    if (previous && compareColoringDrawings(previous.drawing, entry.drawing) > 0) return Boolean(scope);
    const key = keyFor(id);
    if (!scope) {
      memory.set(key, { ...entry, session: sessionTag() });
      return false;
    }
    memory.set(key, entry);
    return storeDevice(key, entry);
  }

  function storeDevice(key: string, entry: DeviceDrawing) {
    const serialized = JSON.stringify(entry);
    // Second attempt after a normal prune, third after freeing every synced copy (the cloud has them).
    for (const budget of [undefined, 0, null]) {
      try {
        localStorage.setItem(key, serialized);
        if (!entry.pending) pruneDevice();
        return true;
      } catch {
        if (budget !== null) pruneDevice(budget);
      }
    }
    return false;
  }

  /** Moves a copy into the current scope; the source is removed only after a successful write. */
  function moveInto(id: string, sourceKey: string) {
    const device = parseDevice(localStorage.getItem(sourceKey));
    if (!device) return;
    const previous = readDevice(id);
    let written = true;
    if (!previous || compareColoringDrawings(previous.drawing, device.drawing) < 0) {
      memory.set(keyFor(id), device);
      written = storeDevice(keyFor(id), device);
    }
    if (written) {
      try { localStorage.removeItem(sourceKey); } catch { /* Best effort. */ }
    }
  }

  /** Adopts the scope verified by the cloud for this login session. */
  function adoptScope(verified: string) {
    if (!scopePattern.test(verified) || verified === scope) return;
    const session = sessionTag();
    const unscoped = [...memory].filter(([key]) => key.startsWith("unscoped:"));
    memory.clear();
    previews.clear();
    scope = verified;
    try { localStorage.setItem(scopeKey, JSON.stringify({ session, scope })); } catch { /* Kept in memory. */ }
    // Edits made in this tab before the scope was known belong to this account only
    // if no other login happened meanwhile (the session tag is shared by every tab).
    for (const [key, entry] of unscoped) {
      if (entry.session === session) writeDevice(key.slice("unscoped:".length), { drawing: entry.drawing, pending: entry.pending, etag: entry.etag });
    }
    // Version 1 keys were not bound to the account: move their unsynced work only
    // when the scope they recorded is this one, and drop synced copies (the cloud has them).
    let legacyScope = "";
    try { legacyScope = localStorage.getItem(legacyPrefix + "scope") ?? ""; } catch { /* None. */ }
    for (const key of storedKeys(legacyPrefix)) {
      if (key === legacyPrefix + "scope") continue;
      const device = parseDevice(localStorage.getItem(key));
      if (device?.pending && legacyScope === scope) moveInto(key.slice(legacyPrefix.length), key);
      else if (!device?.pending) {
        try { localStorage.removeItem(key); } catch { /* Best effort. */ }
      }
    }
    if (!storedKeys(legacyPrefix).some(key => key !== legacyPrefix + "scope")) {
      try { localStorage.removeItem(legacyPrefix + "scope"); } catch { /* Best effort. */ }
    }
    // Copies saved before the scope was known by the previous release of this code.
    const sessionPrefix = `${KEY_ROOT}session-${session}:${encodeURIComponent(profileId)}:`;
    for (const key of storedKeys(sessionPrefix)) moveInto(key.slice(sessionPrefix.length), key);
  }

  /** A remembered scope the server rejects is dropped; its copies stay with their own account. */
  function forgetScope() {
    scope = "";
    memory.clear();
    previews.clear();
    try { localStorage.removeItem(scopeKey); } catch { /* Nothing stored. */ }
  }

  function headers() {
    const result = new Headers({ "x-coloring-profile": profileId });
    if (scope) result.set("x-coloring-scope", scope);
    return result;
  }

  async function rejected(response: Response) {
    if (response.status !== 401) return;
    const data = await response.json().catch(() => null) as { error?: string } | null;
    if (data?.error === "profile_changed") forgetScope();
  }

  async function getCloud(query = ""): Promise<CloudDrawing | undefined> {
    if (!navigator.onLine) return undefined;
    try {
      const response = await fetchWithTimeout(COLORING_DRAWINGS_URL + query, { cache: "no-store", headers: headers() }, 2500);
      if (!response.ok) { await rejected(response); return undefined; }
      const data = await response.json() as CloudDrawing;
      if (!data.scope) return undefined;
      adoptScope(data.scope);
      return data;
    } catch {
      return undefined;
    }
  }

  async function pullDrawing(id: string) {
    const cloud = await getCloud("?drawing=" + encodeURIComponent(id));
    if (cloud?.drawing) writeDevice(id, { drawing: cloud.drawing, pending: false, etag: cloud.etag });
    return cloud;
  }

  function putRequest(id: string, body: string, keepalive: boolean) {
    const requestHeaders = headers();
    requestHeaders.set("content-type", "application/json");
    return { url: COLORING_DRAWINGS_URL + "?drawing=" + id, init: { method: "PUT", cache: "no-store", headers: requestHeaders, body, keepalive } as RequestInit };
  }

  async function flushPage(id: string) {
    if (!navigator.onLine) return;
    if (!scope && !await getCloud()) return;
    const flightKey = keyFor(id);
    if (inFlight.has(flightKey)) return;
    inFlight.add(flightKey);
    const uploadScope = scope;
    try {
      let entry = readDevice(id);
      while (entry?.pending && scope === uploadScope) {
        const body = JSON.stringify(entry.drawing);
        if (body.length > MAX_DRAWING_BYTES) return;
        const { url, init } = putRequest(id, body, false);
        const response = await fetchWithTimeout(url, init, drawingUploadTimeout(body.length));
        if (!response.ok) { await rejected(response); return; }
        const data = await response.json() as { written?: true; drawing?: ColoringDrawing; etag?: string };
        const drawing = data.written ? entry.drawing : data.drawing;
        // The scope may have changed while the request was in flight: never mix accounts.
        if (!drawing || scope !== uploadScope) return;
        writeDevice(id, { drawing, pending: false, etag: data.etag });
        entry = readDevice(id);
      }
    } catch {
      // Leave this drawing queued for the next retry.
    } finally {
      inFlight.delete(flightKey);
    }
  }

  function pendingIds() {
    const ids = new Set<string>();
    const prefix = scope ? `${KEY_ROOT}${scope}:` : "unscoped:";
    for (const key of memory.keys()) if (key.startsWith(prefix)) ids.add(key.slice(prefix.length));
    if (scope) for (const key of storedKeys(prefix)) ids.add(key.slice(prefix.length));
    return [...ids].filter((id) => readDevice(id)?.pending);
  }

  /** Uploads pending drawings one at a time (no parallel keepalive bodies, no wasted aborts). */
  function flush() {
    if (!navigator.onLine) return;
    if (running) { flushAgain = true; return; }
    running = (async () => {
      do {
        flushAgain = false;
        for (const id of pendingIds()) await flushPage(id);
      } while (flushAgain && navigator.onLine);
    })().finally(() => { running = null; });
  }

  /**
   * On page hide, send keepalive uploads that fit the browser's 64 KiB budget,
   * including drawings whose regular upload is in flight (the unload cancels it;
   * the server ignores a duplicate that is not newer). Results are reconciled on the next visit.
   */
  function flushOnHide() {
    if (!navigator.onLine || !scope) return;
    let budget = KEEPALIVE_BUDGET;
    for (const id of pendingIds()) {
      const entry = readDevice(id);
      if (!entry) continue;
      const body = JSON.stringify(entry.drawing);
      if (body.length >= budget) continue;
      budget -= body.length;
      const { url, init } = putRequest(id, body, true);
      void fetch(url, init).catch(() => undefined);
    }
  }

  /** Stable preview arrays: unchanged drawings keep the same reference, so thumbnails do not redraw. */
  function preview(id: string) {
    const drawing = readDevice(id)?.drawing;
    if (!drawing?.areas.length) { previews.delete(id); return undefined; }
    const cached = previews.get(id);
    if (cached?.operation === drawing.operation) return cached.areas;
    previews.set(id, { operation: drawing.operation, areas: drawing.areas });
    return drawing.areas;
  }

  return {
    async loadGallery(signal: AbortSignal, show: (previews: ColoringPreviews) => void) {
      const snapshot = (): ColoringPreviews => Object.fromEntries(coloringPages.flatMap(({ id }) => {
        const areas = preview(id);
        return areas ? [[id, areas]] : [];
      }));
      if (signal.aborted) return;
      show(snapshot());
      const cloud = await getCloud("?gallery=1");
      // The verified scope may have just been adopted (e.g. after a new login): show its device copies.
      if (!signal.aborted) show(snapshot());
      const changed = cloud?.drawings?.filter(({ id, etag }) => readDevice(id)?.etag !== etag) ?? [];
      // Draw immediately from device storage and fetch only changed cloud drawings.
      for (let offset = 0; offset < changed.length && !signal.aborted; offset += 4) {
        await Promise.all(changed.slice(offset, offset + 4).map(({ id }) => pullDrawing(id)));
        if (!signal.aborted) show(snapshot());
      }
    },

    async load(page: ColoringPage) {
      const cloud = await pullDrawing(page.id);
      const device = readDevice(page.id);
      // Drawings are never deleted (a reset is a newer blank drawing): if the cloud
      // has none, it lost it. Keep the device copy, which the thumbnail shows, and upload it again.
      if (cloud && !cloud.drawing && device && !device.pending) writeDevice(page.id, { drawing: device.drawing, pending: true });
      if (readDevice(page.id)?.pending) flush();
      return readDevice(page.id)?.drawing.areas ?? [];
    },

    save(id: string, areas: ColoringArea[]) {
      const drawing: ColoringDrawing = {
        version: 1,
        operation: crypto.randomUUID(),
        editedAt: Math.max(Date.now(), (readDevice(id)?.drawing.editedAt ?? 0) + 1),
        areas,
      };
      const kept = writeDevice(id, { drawing, pending: true });
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 900);
      return { kept, tooLarge: JSON.stringify(drawing).length > MAX_DRAWING_BYTES };
    },

    flush,
    listen() {
      const retry = window.setInterval(flush, 30_000);
      window.addEventListener("online", flush);
      window.addEventListener("pagehide", flushOnHide);
      // Learn the account scope right away, so edits are kept on the device from the start.
      if (!scope) void getCloud().then(() => flush());
      else flush();
      return () => {
        window.clearInterval(retry);
        window.clearTimeout(timer);
        window.removeEventListener("online", flush);
        window.removeEventListener("pagehide", flushOnHide);
      };
    },
  };
}

export type ColoringStorage = ReturnType<typeof createColoringStorage>;

export function useColoringStorage(profileId: string | undefined, email: string | undefined) {
  const storage = useMemo(() => profileId && email ? createColoringStorage(profileId, email) : null, [profileId, email]);
  useEffect(() => storage?.listen(), [storage]);
  return storage;
}
