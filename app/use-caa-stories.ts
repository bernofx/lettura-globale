"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { caaCachePut, caaCachedMedia, caaCachedStories, caaIdentityCache } from "./caa-cache";
import { newCaaStory, parseCaaStory, type CaaStored, type CaaStory, type CaaSummary, type CaaSymbol } from "./domain/caa-stories";
import { useBeforeAppUpdate } from "./components/app-update";

async function request(url: string,init?: RequestInit) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(),10_000);
  try { return await fetch(url,{ ...init,signal: controller.signal,cache: "no-store" }); } finally { clearTimeout(timeout); }
}
export function useCaaStories(profileId: string | null) {
  const [identity,setIdentity] = useState<{ profileId: string; scope: string } | null>(null);
  const [identityError,setIdentityError] = useState("");
  useEffect(() => {
    if (!profileId) return;
    let disposed = false;
    const resolve = async () => {
      const session = localStorage.getItem("lg-therapist-session") ?? "";
      const cached = await caaIdentityCache(profileId).catch(() => undefined);
      try {
        if (navigator.onLine) {
          const response = await request("/api/caa-stories",{ headers: { "x-caa-profile": profileId } });
          if (response.status === 401) { if (!disposed) { setIdentity(null); setIdentityError("Rientra nel profilo adulto per aprire le storie: la sessione cloud è cambiata o scaduta."); } return; }
          if (!response.ok) throw new Error("unavailable");
          const result = await response.json() as { scope?: string };
          if (!result.scope || !/^[a-f0-9]{32}$/.test(result.scope)) throw new Error("invalid_scope");
          if (disposed) return;
          await caaIdentityCache(profileId,{ profileId,session,scope: result.scope }).catch(() => undefined);
          if (!disposed) { setIdentity({ profileId,scope: result.scope }); setIdentityError(""); } return;
        }
      } catch { /* Reopen offline only under the same previously verified login. */ }
      if (disposed) return;
      if (cached?.session === session && /^[a-f0-9]{32}$/.test(cached.scope)) { setIdentity({ profileId,scope: cached.scope }); setIdentityError(""); }
      else setIdentityError("Connettiti almeno una volta con questo profilo per inizializzare l’archivio delle storie.");
    };
    void resolve(); window.addEventListener("online",resolve);
    return () => { disposed = true; window.removeEventListener("online",resolve); };
  },[profileId]);
  const owner = identity?.profileId === profileId ? identity.scope : null;
  const scoped = useScopedCaaStories(owner,profileId);
  return { ...scoped,owner: owner ?? "",ready: Boolean(owner && scoped.ready),error: identityError || scoped.error };
}

function useScopedCaaStories(owner: string | null,profileId: string | null) {
  const scopedRequest = useCallback((url: string,init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("x-caa-profile",profileId ?? ""); headers.set("x-caa-scope",owner ?? "");
    return request(url,{ ...init,headers });
  },[owner,profileId]);
  const currentOwner = useRef(owner);
  useEffect(() => { currentOwner.current = owner; },[owner]);
  const records = useRef(new Map<string,CaaStored>());
  const [summaries,setSummaries] = useState<Array<CaaSummary & { owner: string }>>([]);
  const [snapshots,setSnapshots] = useState<CaaStored[]>([]);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [ready,setReady] = useState(false);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const flight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | null>(null);
  const refresh = useCallback(async () => {
    if (!owner) return;
    const response = await scopedRequest("/api/caa-stories");
    if (!response.ok) throw new Error(response.status === 401 ? "Accesso scaduto: rientra nel profilo per salvare le storie." : "Archivio cloud non disponibile. Le bozze locali restano conservate.");
    const result = await response.json() as { items: CaaSummary[] };
    if (currentOwner.current === owner && Array.isArray(result.items)) setSummaries(result.items.map(item => ({ ...item,owner })));
  },[owner,scopedRequest]);
  const persist = useCallback((record: CaaStored) => {
    records.current.set(`${record.owner}:${record.story.id}`,record);
    if (currentOwner.current === record.owner) setSnapshots([...records.current.values()]);
    const task = writes.current.catch(() => undefined).then(() => caaCachePut("stories",`${record.owner}:${record.story.id}`,record));
    writes.current = task;
    void task.catch(() => { if (currentOwner.current === record.owner) setError("Copia locale non disponibile: non chiudere la pagina finché il cloud non conferma il salvataggio."); });
    return task;
  },[]);
  const flush = useCallback(async (required = false) => {
    if (!owner) return;
    while (flight.current) { await flight.current.catch(() => undefined); }
    const task = (async () => {
      await writes.current.catch(() => undefined);
      const pending = () => [...records.current.values()].filter(record => record.owner === owner && record.pending);
      if (!pending().length) return;
      if (!navigator.onLine) { if (required) throw new Error("offline"); return; }
      if (currentOwner.current === owner) setBusy(true);
      try {
        for (let count = 0; count < 30; count++) {
          if (currentOwner.current !== owner) return;
          const record = pending().find(record => !record.conflict);
          if (!record) break;
          const images = record.story.sentences.flatMap(sentence => sentence.tokens.flatMap(token => token.symbol?.kind === "media" ? [token.symbol.id] : []));
          for (const id of new Set(images)) {
            const media = await caaCachedMedia(owner,id).catch(() => undefined);
            if (!media || media.uploaded) continue;
            if (currentOwner.current !== owner) return;
            const result = await scopedRequest("/api/media",{ method: "POST",headers: { "content-type": media.blob.type,"x-media-id": id },body: media.blob });
            if (!result.ok) throw new Error("Immagine non salvata: riproverò con il cloud disponibile.");
            await caaCachePut("media",`${owner}:${id}`,{ ...media,uploaded: true });
          }
          const response = await scopedRequest(`/api/caa-stories/${record.story.id}`,{ method: "PUT",headers: { "content-type": "application/json" },body: JSON.stringify({ story: record.story,baseEtag: record.etag,operationId: record.operationId }) });
          if (currentOwner.current !== owner) return;
          const key = `${owner}:${record.story.id}`;
          const latest = records.current.get(key)!;
          if (response.status === 409) {
            const reason = await response.json() as { error?: string };
            if (reason.error === "story_limit") throw new Error("La prova supporta al massimo 100 storie per profilo, incluse quelle archiviate.");
            await persist({ ...latest,conflict: true }); setError("Questa storia è cambiata su un altro dispositivo. Conserva la bozza salvandola come nuova copia."); continue;
          }
          if (!response.ok) throw new Error(response.status === 401 ? "Accesso scaduto: rientra per sincronizzare. La bozza resta sul dispositivo." : "Salvataggio cloud non riuscito: la bozza resta sul dispositivo e verrà ritentata.");
          const result = await response.json() as { etag: string };
          if (typeof result.etag !== "string") throw new Error("Conferma cloud non valida");
          const unchanged = latest.operationId === record.operationId;
          await persist({ ...latest,etag: result.etag,pending: !unchanged,conflict: false });
          setSummaries(items => [{ owner,id: record.story.id,title: record.story.title,archived: record.story.archived,updatedAt: record.story.updatedAt,etag: result.etag }, ...items.filter(item => item.owner === owner && item.id !== record.story.id)]);
          setError("");
        }
        if (required && pending().length) throw new Error("pending_story");
      } finally { if (currentOwner.current === owner) setBusy(false); }
    })();
    flight.current = task;
    try { await task; } catch (error) { if (currentOwner.current === owner) setError(error instanceof Error ? error.message : "Salvataggio non disponibile"); if (required) throw error; }
    finally { if (flight.current === task) flight.current = null; }
  },[owner,persist,scopedRequest]);
  useBeforeAppUpdate("caa-stories",() => flush(true));
  useEffect(() => {
    if (!owner) return;
    let disposed = false;
    const start = async () => {
      const cached = await caaCachedStories(owner).catch(() => []);
      if (disposed) return;
      for (const record of cached) { const key = `${owner}:${record.story.id}`; if (!records.current.has(key)) { try { records.current.set(key,{ ...record,story: parseCaaStory(record.story) }); } catch { /* Malformed cache never replaces cloud data. */ } } }
      setSnapshots([...records.current.values()]); setReady(true); setError(""); setBusy(false);
      if (navigator.onLine) { await flush(); await refresh(); }
    };
    const resume = () => { if (document.visibilityState !== "hidden" && navigator.onLine) void flush().then(refresh).catch(error => { if (!disposed) setError(error.message); }); };
    void start().catch(error => { if (!disposed) setError(error.message); });
    const retry = window.setInterval(resume,30_000);
    window.addEventListener("online",resume); document.addEventListener("visibilitychange",resume);
    return () => { disposed = true; clearInterval(retry); window.removeEventListener("online",resume); document.removeEventListener("visibilitychange",resume); };
  },[owner,flush,refresh]);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); },[]);
  const save = useCallback((story: CaaStory) => {
    if (!owner) return;
    const clean = parseCaaStory({ ...story,updatedAt: new Date().toISOString() });
    const previous = records.current.get(`${owner}:${clean.id}`);
    const record: CaaStored = { owner,story: clean,etag: previous?.etag ?? null,pending: true,operationId: crypto.randomUUID(),conflict: previous?.conflict };
    void persist(record).catch(() => undefined);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; void flush(); },650);
  },[owner,persist,flush]);
  const open = useCallback(async (id: string) => {
    if (!owner) return null;
    const cached = records.current.get(`${owner}:${id}`);
    if (cached?.pending || !navigator.onLine) return cached?.story ?? null;
    try {
      const response = await scopedRequest(`/api/caa-stories/${id}`);
      if (!response.ok) throw new Error("Impossibile aprire la storia dal cloud.");
      const result = await response.json() as { story: unknown; etag: string };
      if (currentOwner.current !== owner) return null;
      const latest = records.current.get(`${owner}:${id}`);
      if (latest?.pending) return latest.story;
      const story = parseCaaStory(result.story);
      await persist({ owner,story,etag: result.etag,pending: false,operationId: "" });
      return story;
    } catch (error) { setError(error instanceof Error ? error.message : "Apertura non riuscita"); return cached?.story ?? null; }
  },[owner,persist,scopedRequest]);
  const upload = useCallback(async (image: string): Promise<CaaSymbol> => {
    if (!owner) throw new Error("authentication_required");
    const id = crypto.randomUUID();
    const blob = await fetch(image).then(response => response.blob());
    await caaCachePut("media",`${owner}:${id}`,{ owner,id,blob,uploaded: false });
    return { kind: "media",id,source: "Upload privato",author: "Utente",license: "Diritti e consenso confermati dall’adulto" };
  },[owner]);
  // Never expose the previous adult's cache during a profile transition.
  const local = snapshots.filter(record => record.owner === owner);
  const byId = new Map<string,CaaSummary>(summaries.filter(item => item.owner === owner).map(item => [item.id,item]));
  for (const record of local) if (record.pending || !byId.has(record.story.id)) byId.set(record.story.id,{ id: record.story.id,title: record.story.title,updatedAt: record.story.updatedAt,archived: record.story.archived,etag: record.etag ?? "" });
  return { items: [...byId.values()].filter(item => !item.archived).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)), archivedItems: [...byId.values()].filter(item => item.archived), records: local,ready,error,busy,save,open,upload,flush,create: () => { const story = newCaaStory(); save(story); return story; } };
}
export type CaaStore = ReturnType<typeof useCaaStories>;
