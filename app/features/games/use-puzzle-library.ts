"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PUZZLE_IMAGES_URL, type PuzzleCatalog, type PuzzleImage } from "../../domain/puzzle-library";
import { THERAPIST_SESSION_STORAGE_KEY } from "../../domain/therapist-session";
import { fetchWithTimeout } from "../../shared/cloud-client";
import { prepareUploadedImage } from "../../shared/media-storage";

type PendingImage = { id: string; title: string; data: string };
type LibraryState = PuzzleCatalog & { profile: string; pending: number; error: string };
type SaveResult = { image: PuzzleImage } | "retry" | "rejected" | "removed";

const identityKey = (profile: string) => "lg-puzzle-identity:" + profile;
const pendingPrefix = (scope: string) => "lg-puzzle-upload:" + scope + ":";
const imageUrl = (id: string) => PUZZLE_IMAGES_URL + "?image=" + encodeURIComponent(id);

function knownScope(profile: string) {
  try {
    const session = localStorage.getItem(THERAPIST_SESSION_STORAGE_KEY);
    const stored = JSON.parse(localStorage.getItem(identityKey(profile)) ?? "null");
    return session && stored?.session === session && /^[a-f0-9]{32}$/.test(stored.scope) ? String(stored.scope) : "";
  } catch { return ""; }
}

function rememberScope(profile: string, scope: string) {
  try {
    localStorage.setItem(identityKey(profile), JSON.stringify({ session: localStorage.getItem(THERAPIST_SESSION_STORAGE_KEY), scope }));
  } catch { /* Online uploads still work with browser storage disabled. */ }
}

function queuedImages(scope: string): PendingImage[] {
  const entries: PendingImage[] = [];
  try {
    const prefix = pendingPrefix(scope);
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const entry = JSON.parse(localStorage.getItem(key) ?? "null") as PendingImage | null;
      if (entry?.id && typeof entry.title === "string" && typeof entry.data === "string" && entry.data.startsWith("data:image/webp;")) entries.push(entry);
    }
  } catch { /* Other local preferences must not block a cloud read. */ }
  return entries;
}

async function saveImage(profile: string, scope: string, entry: PendingImage): Promise<SaveResult> {
  try {
    const body = await fetch(entry.data).then(response => response.blob());
    const result = await fetchWithTimeout(imageUrl(entry.id), { method: "PUT", cache: "no-store", body, headers: {
      "content-type": body.type, "x-puzzle-profile": profile, "x-puzzle-scope": scope,
      "x-puzzle-rights": "confirmed", "x-puzzle-title": encodeURIComponent(entry.title),
    } }, 10000);
    if (result.status >= 500 || result.status === 429) return "retry";
    if (result.status === 410) return "removed";
    if (!result.ok) return "rejected";
    return await result.json() as { image: PuzzleImage };
  } catch { return "retry"; }
}

export function usePuzzleLibrary(profile: string | undefined, visible: boolean) {
  const [state, setState] = useState<LibraryState | null>(null);
  const currentProfile = useRef(profile);
  const flight = useRef<{ profile: string; promise: Promise<void> } | null>(null);
  useEffect(() => { currentProfile.current = profile; }, [profile]);

  const refresh = useCallback(() => {
    if (!profile) return Promise.resolve();
    if (flight.current?.profile === profile) return flight.current.promise;
    const publish = (next: LibraryState) => {
      if (currentProfile.current === profile) setState(next);
    };
    const promise = (async () => {
      const cached = knownScope(profile);
      const unavailable = (error: string) => {
        if (currentProfile.current !== profile) return;
        setState(previous => ({
          profile, scope: cached, images: previous?.profile === profile && previous.scope === cached ? previous.images : [],
          pending: cached ? queuedImages(cached).length : 0, error,
        }));
      };
      if (!navigator.onLine) { unavailable(""); return; }
      try {
        const response = await fetchWithTimeout(PUZZLE_IMAGES_URL, { cache: "no-store", headers: { "x-puzzle-profile": profile } });
        if (response.status === 401) {
          publish({ profile, scope: "", images: [], pending: 0, error: "Accedi di nuovo per aprire le immagini dei puzzle." });
          return;
        }
        if (!response.ok) throw new Error();
        const { scope, images } = await response.json() as PuzzleCatalog;
        if (!/^[a-f0-9]{32}$/.test(scope) || !Array.isArray(images) || currentProfile.current !== profile) return;
        rememberScope(profile, scope);
        const combined = new Map(images.map(image => [image.id, image]));
        for (const entry of queuedImages(scope)) {
          if (currentProfile.current !== profile) return;
          const result = await saveImage(profile, scope, entry);
          if (result === "retry" || result === "rejected") break;
          if (result === "removed") combined.delete(entry.id);
          else combined.set(entry.id, result.image);
          try { localStorage.removeItem(pendingPrefix(scope) + entry.id); } catch { /* PUT is safe to retry. */ }
        }
        publish({ profile, scope, images: [...combined.values()], pending: queuedImages(scope).length, error: "" });
      } catch {
        unavailable("Impossibile aggiornare il catalogo dei puzzle.");
      }
    })();
    flight.current = { profile, promise };
    void promise.finally(() => { if (flight.current?.promise === promise) flight.current = null; });
    return promise;
  }, [profile]);

  const current = state?.profile === profile ? state : null;
  const pending = current?.pending ?? 0;
  useEffect(() => {
    if (!profile) return;
    const relevant = () => {
      const scope = knownScope(profile);
      if (visible || (scope && queuedImages(scope).length)) void refresh();
    };
    relevant();
    window.addEventListener("online", relevant);
    return () => window.removeEventListener("online", relevant);
  }, [profile, visible, refresh]);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => { if (navigator.onLine) void refresh(); }, 30000);
    return () => window.clearInterval(timer);
  }, [pending, refresh]);

  async function upload(files: File[]) {
    const result = { saved: 0, queued: 0, failed: 0 };
    if (!profile || !current?.scope) return { ...result, failed: files.length };
    const { scope } = current;
    for (const file of files) {
      if (currentProfile.current !== profile) break;
      try {
        const entry = {
          id: crypto.randomUUID(),
          title: Array.from(file.name.replace(/\.[^.]+$/, "").trim() || "Immagine puzzle").slice(0, 100).join(""),
          data: await prepareUploadedImage(file),
        };
        if (currentProfile.current !== profile || !entry.data.startsWith("data:image/webp;")) throw new Error();
        const saved = navigator.onLine ? await saveImage(profile, scope, entry) : "retry";
        if (saved === "rejected" || saved === "removed") throw new Error();
        if (saved === "retry") {
          localStorage.setItem(pendingPrefix(scope) + entry.id, JSON.stringify(entry));
          result.queued++;
        } else {
          result.saved++;
        }
      } catch { result.failed++; }
    }
    if (currentProfile.current === profile) {
      setState(previous => previous?.profile === profile && previous.scope === scope
        ? { ...previous, pending: queuedImages(scope).length }
        : previous);
      if (result.saved) {
        await flight.current?.promise;
        await refresh();
      }
    }
    return result;
  }

  async function remove(id: string) {
    if (!profile || !current?.scope) throw new Error();
    const response = await fetchWithTimeout(imageUrl(id), { method: "DELETE", headers: {
      "x-puzzle-profile": profile, "x-puzzle-scope": current.scope,
    } });
    if (!response.ok) throw new Error();
    await flight.current?.promise;
    await refresh();
  }

  return { images: current?.images ?? [], ready: Boolean(current?.scope), pending, error: current?.error ?? "", upload, remove };
}

export type PuzzleLibrary = ReturnType<typeof usePuzzleLibrary>;
