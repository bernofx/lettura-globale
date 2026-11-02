"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { parseCaaStory, type CaaStory } from "../domain/caa-stories";
import { CaaPreview, CaaSharedImages } from "./caa-print";
const subscribeLocation = (changed: () => void) => { window.addEventListener("popstate",changed); return () => window.removeEventListener("popstate",changed); };
export function CaaPublicEntry() {
  const token = useSyncExternalStore(subscribeLocation,() => new URLSearchParams(window.location.search).get("share") ?? "invalid",() => "");
  return token ? <CaaSharedView key={token} token={/^[a-f0-9]{64}$/.test(token) ? token : "invalid"} /> : <main className="page"><p>Caricamento storia…</p></main>;
}

export function CaaSharedView({ token,onClose }: { token: string; onClose?: () => void }) {
  const [data,setData] = useState<{ story: CaaStory; expiresAt: number } | null>(null);
  const [error,setError] = useState("");
  const [retry,setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(),10_000);
    void fetch(`/api/caa-shares/${token}`,{ cache: "no-store",signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(response.status === 404 ? "Link scaduto, revocato o riservato a un altro profilo. Per una storia ricevuta, accedi prima con il profilo destinatario." : "Storia momentaneamente non disponibile. Riprova.");
      const result = await response.json() as { story: unknown; expiresAt: number }; const story = parseCaaStory(result.story);
      if (!controller.signal.aborted) { setData(previous => previous?.story.updatedAt === story.updatedAt ? previous : { story,expiresAt: result.expiresAt }); setError(""); }
    }).catch(error => { setData(null); if (!controller.signal.aborted) setError(error.message); else setError("Caricamento interrotto: controlla la connessione e riprova."); }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  },[token,retry]);
  const verifyPrint = async () => {
    const response = await fetch(`/api/caa-shares/${token}`,{ cache: "no-store",signal: AbortSignal.timeout(10_000) });
    if (!response.ok) { setData(null); setError("Accesso non disponibile: il link potrebbe essere scaduto o revocato. Riprova online."); throw new Error("share_unavailable"); }
  };
  // Recheck access on return and before printing; a downloaded/printed copy cannot be recalled.
  useEffect(() => { const check = () => { if (document.visibilityState === "visible") setRetry(n => n + 1); }; document.addEventListener("visibilitychange",check); const timer = setInterval(check,60_000); return () => { document.removeEventListener("visibilitychange",check); clearInterval(timer); }; },[]);
  return <main className="page caa-shared-view"><div className="page-title-row"><div><span className="eyebrow">STORIA CAA CONDIVISA · SOLA LETTURA</span><h1>{data?.story.title ?? "Storia condivisa"}</h1></div>{onClose ? <button type="button" className="ghost-button" onClick={onClose}>← Torna alle storie</button> : <Link href="/" className="ghost-button">Home / Accedi</Link>}</div>
    {error ? <p className="caa-error" role="alert">{error} <button type="button" onClick={() => setRetry(n => n + 1)}>Riprova</button></p> : !data ? <p role="status">Caricamento storia…</p> : <><p className="caa-hint">Copia condivisa il cui accesso scade il {new Date(data.expiresAt).toLocaleDateString("it-IT")}. Puoi leggerla e stamparla; l’originale non viene modificato. I crediti delle immagini restano obbligatori.</p><CaaSharedImages.Provider value={token}><CaaPreview story={data.story} owner={`shared:${token}`} beforePrint={verifyPrint} /></CaaSharedImages.Provider></>}
  </main>;
}
