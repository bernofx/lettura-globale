import { useEffect, useMemo } from "react";
import { COLORING_DRAWINGS_URL, MAX_DRAWING_BYTES, compareColoringDrawings, type ColoringArea, type ColoringDrawing } from "../../domain/coloring-drawings";
import { coloringPages, type ColoringPage } from "../../domain/coloring-pages";
import { fetchWithTimeout } from "../../shared/cloud-client";

type DeviceDrawing = { drawing: ColoringDrawing; pending: boolean; etag?: string };
type CloudDrawing = { scope: string; drawing?: ColoringDrawing | null; etag?: string; drawings?: Array<{ id: string; etag: string }> };
export type ColoringPreviews = Partial<Record<string, ColoringArea[]>>;

function createColoringStorage(profileId: string, email: string) {
  const prefix = `lg-coloring:${encodeURIComponent(profileId)}:${encodeURIComponent(email.trim().toLowerCase())}:`;
  const memory = new Map<string, DeviceDrawing>();
  const inFlight = new Set<string>();
  let scope = "";
  let timer = 0;

  function readDevice(id: string): DeviceDrawing | undefined {
    let device: DeviceDrawing | undefined;
    try { device = JSON.parse(localStorage.getItem(prefix + id) ?? "null") ?? undefined; } catch { /* Browser storage can be unavailable. */ }
    if (device && (device.drawing?.version !== 1 || !Array.isArray(device.drawing.areas))) device = undefined;
    const latest = memory.get(id);
    return latest && (!device || compareColoringDrawings(latest.drawing, device.drawing) >= 0) ? latest : device;
  }

  function writeDevice(id: string, entry: DeviceDrawing) {
    const previous = readDevice(id);
    if (previous && compareColoringDrawings(previous.drawing, entry.drawing) > 0) return true;
    memory.set(id, entry);
    try {
      localStorage.setItem(prefix + id, JSON.stringify(entry));
      return true;
    } catch {
      return false;
    }
  }

  function headers() {
    if (!scope) {
      try { scope = localStorage.getItem(prefix + "scope") ?? ""; } catch { /* Retry without a known scope. */ }
    }
    const result = new Headers({ "x-coloring-profile": profileId });
    if (scope) result.set("x-coloring-scope", scope);
    return result;
  }

  async function getCloud(query = ""): Promise<CloudDrawing | undefined> {
    if (!navigator.onLine) return undefined;
    try {
      const response = await fetchWithTimeout(COLORING_DRAWINGS_URL + query, { cache: "no-store", headers: headers() }, 2500);
      if (!response.ok) return undefined;
      const data = await response.json() as CloudDrawing;
      if (!data.scope) return undefined;
      scope = data.scope;
      try { localStorage.setItem(prefix + "scope", scope); } catch { /* The session still has the verified scope in memory. */ }
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

  async function flushPage(id: string) {
    if (!navigator.onLine || inFlight.has(id)) return;
    inFlight.add(id);
    try {
      let entry = readDevice(id);
      while (entry?.pending) {
        const body = JSON.stringify(entry.drawing);
        if (body.length > MAX_DRAWING_BYTES) return;
        if (!headers().has("x-coloring-scope") && !await getCloud()) return;
        const requestHeaders = headers();
        requestHeaders.set("content-type", "application/json");
        const response = await fetchWithTimeout(COLORING_DRAWINGS_URL + "?drawing=" + id, {
          method: "PUT", cache: "no-store", headers: requestHeaders, body, keepalive: body.length < 60_000,
        });
        if (!response.ok) return;
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

  function flush() {
    if (!navigator.onLine) return;
    const ids = new Set(memory.keys());
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith(prefix) && key !== prefix + "scope") ids.add(key.slice(prefix.length));
      }
    } catch { /* Pending edits from this tab are also in memory. */ }
    for (const id of ids) if (readDevice(id)?.pending) void flushPage(id);
  }

  return {
    async loadGallery(signal: AbortSignal, show: (previews: ColoringPreviews) => void) {
      const snapshot = (): ColoringPreviews => Object.fromEntries(coloringPages.flatMap(({ id }) => {
        const areas = readDevice(id)?.drawing.areas;
        return areas?.length ? [[id, areas]] : [];
      }));
      if (signal.aborted) return;
      show(snapshot());
      const cloud = await getCloud("?gallery=1");
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
      if (device?.pending) void flushPage(page.id);
      if (!cloud || cloud.drawing || device?.pending) return device?.drawing.areas ?? [];
      // The cloud has no drawing for this page and there are no pending edits.
      return [];
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
      window.addEventListener("pagehide", flush);
      flush();
      return () => {
        window.clearInterval(retry);
        window.clearTimeout(timer);
        window.removeEventListener("online", flush);
        window.removeEventListener("pagehide", flush);
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
