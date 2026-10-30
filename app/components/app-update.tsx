"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { APP_VERSION } from "../app-version";
import { readUpdateCheckpoint, UPDATE_CHECKPOINT_KEY, UpdateRegistry } from "../domain/update-checkpoint";

type UpdateContextValue = {
  registry: UpdateRegistry;
  available: string;
  updating: boolean;
  error: string;
  update: () => void;
};
const UpdateContext = createContext<UpdateContextValue | null>(null);
const identity = () => localStorage.getItem("lg-therapist-session") ?? "public";
const path = () => window.location.pathname + window.location.search;

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [registry] = useState(() => new UpdateRegistry());
  const updateLock = useRef(false);
  const [available, setAvailable] = useState("");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      let values = {};
      try {
        values = readUpdateCheckpoint(sessionStorage.getItem(UPDATE_CHECKPOINT_KEY), identity(), path())?.values ?? {};
        sessionStorage.removeItem(UPDATE_CHECKPOINT_KEY);
      } catch { /* Normal startup still works without storage. */ }
      registry.restore(values);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [registry]);
  useEffect(() => {
    let disposed = false;
    let checking = false;
    const check = async () => {
      if (document.visibilityState === "hidden" || !navigator.onLine || checking) return;
      checking = true;
      try {
        const response = await fetch("/api/app-version", { cache: "no-store", signal: AbortSignal.timeout(8000) });
        if (!response.ok) return;
        const data = await response.json() as { version?: unknown };
        if (!disposed && typeof data.version === "string" && /^r\d+-[a-f0-9]{7,40}$/.test(data.version)) setAvailable(data.version === APP_VERSION ? "" : data.version);
      } catch { /* No false update notification when offline or during a deploy. */ }
      finally { checking = false; }
    };
    void check();
    const timer = window.setInterval(check, 60_000);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    navigator.serviceWorker?.addEventListener("message", check);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener("online", check); document.removeEventListener("visibilitychange", check); navigator.serviceWorker?.removeEventListener("message", check); };
  }, []);
  const update = async () => {
    if (updateLock.current) return;
    updateLock.current = true;
    setError("");
    setUpdating(true);
    try {
      await registry.prepare();
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.setTimeout(resolve, 0)));
      const values = registry.capture();
      sessionStorage.setItem(UPDATE_CHECKPOINT_KEY, JSON.stringify({ schema: 1, at: Date.now(), identity: identity(), path: path(), values }));
      // The navigation is network-first. Keep the URL (especially public tokens).
      window.location.reload();
    } catch { updateLock.current = false; setUpdating(false); setError("Aggiornamento sospeso: verifica rete e salvataggio. La sessione resta aperta."); }
  };
  return <UpdateContext.Provider value={{ registry, available, updating, error, update }}><div style={{ display: "contents" }} inert={updating}>{ready ? children : <main className="auth-loading">Caricamento…</main>}</div>{updating && <div className="app-update-overlay" role="status">Salvataggio e aggiornamento…</div>}</UpdateContext.Provider>;
}

export function useBeforeAppUpdate(key: string, prepare: () => Promise<void>) {
  const context = useContext(UpdateContext);
  const current = useRef(prepare);
  useEffect(() => { current.current = prepare; });
  const registry = context?.registry;
  useEffect(() => registry?.before(key, () => current.current()), [registry, key]);
}

export function useAppUpdating() { return useContext(UpdateContext)?.updating ?? false; }

/** Register committed state; write it only when the adult explicitly updates. */
export function useUpdateState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(UpdateContext);
  const [value, setValue] = useState<T>(() => {
    const fallback = typeof initial === "function" ? (initial as () => T)() : initial;
    return context ? context.registry.initial(key, fallback) : fallback;
  });
  const current = useRef(value);
  const registry = context?.registry;
  useEffect(() => { current.current = value; registry?.consume(key); });
  useEffect(() => {
    if (!registry) return;
    const read = () => current.current;
    return registry.register(key, read);
  }, [key, registry]);
  return [value, setValue];
}

export function AppVersionBadge() {
  const context = useContext(UpdateContext);
  return <div className={`app-version ${context?.available ? "has-update" : ""}`}>
    <span title={`Versione applicazione ${APP_VERSION}`}>v{APP_VERSION}</span>
    {context?.available && <><span className="app-update-label" role="status" title={`Disponibile v${context.available}`}>Nuova versione disponibile</span><button type="button" onClick={context.update} disabled={context.updating} title="Aggiorna e riprendi la sessione dal punto attuale">{context.updating ? "Aggiornamento…" : "Aggiorna"}</button></>}
    {context?.error && <span role="alert">{context.error}</span>}
  </div>;
}
