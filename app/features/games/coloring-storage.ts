import { useEffect, useMemo } from "react";
import { COLORING_DRAWINGS_URL, MAX_DRAWING_BYTES, compareColoringDrawings, deviceEvictions, drawingUploadTimeout, type ColoringArea, type ColoringDrawing, type DeviceCopy } from "../../domain/coloring-drawings";
import { coloringPages, type ColoringPage } from "../../domain/coloring-pages";
import { THERAPIST_SESSION_STORAGE_KEY } from "../../domain/therapist-session";
import { fetchWithTimeout } from "../../shared/cloud-client";

type DeviceDrawing = { drawing: ColoringDrawing; pending: boolean; etag?: string };
type CloudDrawing = { scope: string; drawing?: ColoringDrawing | null; etag?: string; drawings?: Array<{ id: string; etag: string }> };
export type ColoringPreviews = Partial<Record<string, ColoringArea[]>>;

const KEY_ROOT = "lg-coloring:v2:";
/** Browsers cap the bodies of in-flight keepalive requests at 64 KiB in total. */
const KEEPALIVE_BUDGET = 60_000;
const scopePattern = /^[a-f0-9]{16,128}$/;

/** Short, stable tag of the current login session (new login ⇒ new tag). */
function sessionTag() {
  let value = "";
  try { value = localStorage.getItem(THERAPIST_SESSION_STORAGE_KEY) ?? ""; } catch { /* Storage unavailable. */ }
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  return (hash >>> 0).toString(16);
}

/**
 * Device copies are keyed by the server-verified account scope, so two accounts
 * that share a tablet (and even the same demo adult id/email) never see each
 * other's drawings. The scope is remembered only for the login session that
 * verified it; edits made before it is known use a session-bound key and are
 * moved under the scope once the cloud confirms it.
 */
function createColoringStorage(profileId: string, email: string) {
  const scopeKey = `lg-coloring-scope:${encodeURIComponent(profileId)}`;
  const legacyPrefix = `lg-coloring:${encodeURIComponent(profileId)}:${encodeURIComponent(email.trim().toLowerCase())}:`;
  const memory = new Map<string, DeviceDrawing>();
  const previews = new Map<string, { operation: string; areas: ColoringArea[] }>();
  const inFlight = new Set<string>();
  let scope = rememberedScope();
  /** Scope dropped after a `profile_changed` reply: its copies belong to this session and move to the verified one. */
  let staleScope = "";
  let timer = 0;
  let running: Promise<void> | null = null;
  let flushAgain = false;

  function rememberedScope() {
    try {
      const stored = JSON.parse(localStorage.getItem(scopeKey) ?? "null") as { session?: string; scope?: string } | null;
      return stored?.session === sessionTag() && scopePattern.test(stored.scope ?? "") ? String(stored.scope) : "";
    } catch { return ""; }
  }

  function prefixFor(currentScope: string) {
    return currentScope ? `${KEY_ROOT}${currentScope}:` : `${KEY_ROOT}session-${sessionTag()}:${encodeURIComponent(profileId)}:`;
  }
  const prefix = () => prefixFor(scope);

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

  function readDevice(id: string): DeviceDrawing | undefined {
    let device: DeviceDrawing | undefined;
    try { device = parseDevice(localStorage.getItem(prefix() + id)); } catch { /* Browser storage can be unavailable. */ }
    const latest = memory.get(id);
    return latest && (!device || compareColoringDrawings(latest.drawing, device.drawing) >= 0) ? latest : device;
  }

  /** Frees synced copies beyond the budget so drawings never starve session recovery or the save queue. */
  function prune() {
    const current = prefix();
    const copies: DeviceCopy[] = [];
    for (const key of storedKeys(current)) {
      let raw: string | null = null;
      try { raw = localStorage.getItem(key); } catch { continue; }
      const device = parseDevice(raw);
      copies.push({ key, size: raw?.length ?? 0, pending: device?.pending ?? false, editedAt: device?.drawing.editedAt ?? 0 });
    }
    for (const key of deviceEvictions(copies)) {
      try { localStorage.removeItem(key); } catch { /* Nothing else to free. */ }
    }
  }

  function writeDevice(id: string, entry: DeviceDrawing) {
    const previous = readDevice(id);
    if (previous && compareColoringDrawings(previous.drawing, entry.drawing) > 0) return true;
    memory.set(id, entry);
    const serialized = JSON.stringify(entry);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        localStorage.setItem(prefix() + id, serialized);
        if (!entry.pending) prune();
        return true;
      } catch {
        // Quota: free synced copies once, then report that the device copy is missing.
        prune();
      }
    }
    return false;
  }

  /** Adopts the scope verified by the cloud and moves earlier device copies under it. */
  function adoptScope(verified: string) {
    if (!scopePattern.test(verified) || verified === scope) return;
    const sources = [prefix(), prefixFor(""), ...(staleScope ? [prefixFor(staleScope)] : [])];
    staleScope = "";
    scope = verified;
    try { localStorage.setItem(scopeKey, JSON.stringify({ session: sessionTag(), scope })); } catch { /* Kept in memory. */ }
    const target = prefix();
    for (const source of new Set(sources)) {
      if (source === target) continue;
      for (const key of storedKeys(source)) {
        const device = parseDevice(localStorage.getItem(key));
        if (device) writeDevice(key.slice(source.length), device);
        try { localStorage.removeItem(key); } catch { /* Best effort. */ }
      }
    }
    // Version 1 keys were not bound to the account: keep only unsynced work, then drop them.
    for (const key of storedKeys(legacyPrefix)) {
      const device = parseDevice(localStorage.getItem(key));
      if (device?.pending && key !== legacyPrefix + "scope") writeDevice(key.slice(legacyPrefix.length), device);
      try { localStorage.removeItem(key); } catch { /* Best effort. */ }
    }
  }

  function forgetScope() {
    if (scope) staleScope = scope;
    scope = "";
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
    // A remembered scope the server no longer accepts must not block every later sync.
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

  async function flushPage(id: string, keepalive = false) {
    if (!navigator.onLine || inFlight.has(id)) return;
    inFlight.add(id);
    try {
      let entry = readDevice(id);
      while (entry?.pending) {
        const body = JSON.stringify(entry.drawing);
        if (body.length > MAX_DRAWING_BYTES) return;
        if (!scope && !await getCloud()) return;
        const requestHeaders = headers();
        requestHeaders.set("content-type", "application/json");
        const response = await fetchWithTimeout(COLORING_DRAWINGS_URL + "?drawing=" + id, {
          method: "PUT", cache: "no-store", headers: requestHeaders, body, keepalive: keepalive && body.length < KEEPALIVE_BUDGET,
        }, drawingUploadTimeout(body.length));
        if (!response.ok) { await rejected(response); return; }
        const data = await response.json() as { written?: true; drawing?: ColoringDrawing; etag?: string };
        const drawing = data.written ? entry.drawing : data.drawing;
        if (!drawing) return;
        writeDevice(id, { drawing, pending: false, etag: data.etag });
        entry = readDevice(id);
      }
    } catch {
      // Leave this drawing queued for the next retry.
    } finally {
      inFlight.delete(id);
    }
  }

  function pendingIds() {
    const ids = new Set(memory.keys());
    const current = prefix();
    for (const key of storedKeys(current)) ids.add(key.slice(current.length));
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

  /** On page hide, start only the keepalive uploads that fit the browser's 64 KiB budget. */
  function flushOnHide() {
    if (!navigator.onLine || !scope) return;
    let budget = KEEPALIVE_BUDGET;
    for (const id of pendingIds()) {
      const entry = readDevice(id);
      const size = entry ? JSON.stringify(entry.drawing).length : 0;
      if (!entry || inFlight.has(id) || size >= budget) continue;
      budget -= size;
      void flushPage(id, true);
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
      flush();
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
