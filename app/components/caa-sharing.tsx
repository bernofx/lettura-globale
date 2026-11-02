"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { CaaStore } from "../use-caa-stories";
import type { CaaStored } from "../domain/caa-stories";
type Sent = { token: string; recipientEmail: string | null; expiresAt: number; revoked: boolean };
const sharingHeaders = (owner: string,profileId: string) => ({ "x-caa-scope": owner,"x-caa-profile": profileId,"content-type": "application/json" });
export function CaaSharing({ owner,profileId,record,store }: { owner: string; profileId: string; record: CaaStored; store: CaaStore }) {
  const [expanded,setExpanded] = useState(false);
  const [items,setItems] = useState<Sent[]>([]);
  const [email,setEmail] = useState(""); const [consent,setConsent] = useState(false);
  const [busy,setBusy] = useState(false); const [message,setMessage] = useState(""); const [url,setUrl] = useState("");
  const [now,setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()),30_000); return () => clearInterval(timer); },[]);
  const endpoint = `/api/caa-stories/${record.story.id}/shares`;
  useEffect(() => {
    if (!expanded) return;
    let stopped = false;
    void fetch(endpoint,{ cache: "no-store",headers: sharingHeaders(owner,profileId) }).then(async response => { if (!response.ok) throw new Error(); const result = await response.json() as { items: Sent[] }; if (!stopped) setItems(result.items); }).catch(() => { if (!stopped) setMessage("Elenco condivisioni non disponibile: riprova online."); });
    return () => { stopped = true; };
  },[expanded,endpoint,owner,profileId]);
  const publish = async (isPublic: boolean) => {
    setBusy(true); setMessage(""); setUrl("");
    try {
      if (!navigator.onLine) throw new Error("Connettiti alla rete per condividere una copia salvata nel cloud.");
      const baseEtag = await store.shareBase(record.story.id,record.operationId);
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)),n => n.toString(16).padStart(2,"0")).join("");
      const response = await fetch(endpoint,{ method: "POST",headers: sharingHeaders(owner,profileId),body: JSON.stringify({ token,baseEtag,public: isPublic,recipientEmail: isPublic ? undefined : email,consent }) });
      const result = await response.json() as Sent & { error?: string };
      if (!response.ok) {
        const messages: Record<string,string> = { recipient_unavailable: "Destinatario non disponibile. Verifica l’email di accesso di un terapista, supervisore o amministratore già registrato nel cloud.",missing_image: "Manca un’immagine nel cloud. Attendi il salvataggio o sostituiscila prima di condividere.",story_changed: "La storia è cambiata nel cloud: riaprila e riprova.",share_limit: "Raggiunto il limite di 100 condivisioni del prototipo.",too_many_images: "La condivisione supporta al massimo 60 immagini proprie diverse.",images_too_large: "Le immagini superano il limite complessivo di 30 MB." };
        throw new Error(messages[result.error ?? ""] ?? "Condivisione non riuscita. Verifica accesso e salvataggio cloud e riprova.");
      }
      setItems(previous => [result,...previous.filter(item => item.token !== result.token)]);
      if (isPublic) setUrl(`${window.location.origin}/caa?share=${result.token}`);
      setMessage(isPublic ? "Link pubblico creato. Chi lo possiede può leggere la storia e le sue immagini." : "Storia inviata: il destinatario la troverà in Storie in CAA → Ricevute.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Condivisione non disponibile."); }
    finally { setBusy(false); }
  };
  const revoke = async (token: string) => {
    setBusy(true); setMessage("");
    try { const response = await fetch(`${endpoint}?token=${token}`,{ method: "DELETE",headers: sharingHeaders(owner,profileId) }); if (!response.ok) throw new Error(); setItems(previous => previous.map(item => item.token === token ? { ...item,revoked: true } : item)); setUrl(""); setMessage("Accesso revocato. Le copie già scaricate o stampate non possono essere ritirate."); }
    catch { setMessage("Revoca non confermata: riprova online."); } finally { setBusy(false); }
  };
  return <section className="panel caa-sharing"><button type="button" className="ghost-button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>Condividi questa storia {expanded ? "−" : "+"}</button>{expanded && <><p className="caa-hint">Invia una copia di sola lettura della versione attuale, immagini comprese. Le modifiche successive richiedono una nuova condivisione. Accesso per 30 giorni, revocabile; nessuna apertura dell’intera libreria.</p><label className="check-line"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>Confermo i diritti di condivisione di testi e immagini e l’assenza di dati reali di minori. Un link pubblico può essere inoltrato: non usarlo per contenuti riservati. Mantengo le licenze originali, incluso l’uso non commerciale ARASAAC.</span></label><label>Email di accesso del terapista destinatario<input type="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label><div className="caa-toolbar"><button type="button" disabled={!consent || busy || !email.trim() || record.story.archived} onClick={() => void publish(false)}>Invia al terapista</button><button type="button" disabled={!consent || busy || record.story.archived} onClick={() => void publish(true)}>Crea link pubblico</button></div>{message && <p role="status">{message}</p>}{url && <label>Link pubblico<input readOnly value={url} onFocus={event => event.target.select()} /><button type="button" onClick={() => void navigator.clipboard.writeText(url).then(() => setMessage("Link copiato.")).catch(() => setMessage("Seleziona e copia il link dal campo."))}>Copia link</button></label>}<ul>{items.map(item => <li key={item.token}><span>{item.recipientEmail ?? "Link pubblico"} · {item.revoked ? "Revocato" : item.expiresAt <= now ? "Scaduto" : `fino al ${new Date(item.expiresAt).toLocaleDateString("it-IT")}`}</span>{!item.revoked && item.expiresAt > now && <><button type="button" disabled={busy} onClick={() => void revoke(item.token)}>Revoca</button>{!item.recipientEmail && <button type="button" onClick={() => setUrl(`${window.location.origin}/caa?share=${item.token}`)}>Mostra link</button>}</>}</li>)}</ul></>}</section>;
}
export function CaaReceived({ owner,profileId }: { owner: string; profileId: string }) {
  const [items,setItems] = useState<Array<{ token: string; title: string }>>([]);
  const [error,setError] = useState("");
  useEffect(() => {
    let disposed = false;
    const refresh = async () => { if (document.visibilityState === "hidden") return; try { const response = await fetch("/api/caa-shares",{ cache: "no-store",headers: sharingHeaders(owner,profileId) }); if (!response.ok) throw new Error(); const result = await response.json() as { items: Array<{ token: string; title: string }> }; if (!disposed) { setItems(result.items); setError(""); } } catch { if (!disposed) setError("Storie ricevute non disponibili. Riprova quando sei online."); } };
    void refresh(); const timer = setInterval(() => void refresh(),30_000); document.addEventListener("visibilitychange",refresh); window.addEventListener("online",refresh);
    return () => { disposed = true; clearInterval(timer); document.removeEventListener("visibilitychange",refresh); window.removeEventListener("online",refresh); };
  },[owner,profileId]);
  return <section className="panel caa-received"><h2>Ricevute da altri terapisti ({items.length})</h2>{error && <p role="status">{error}</p>}{items.length ? <div className="caa-toolbar">{items.map(item => <Link className="ghost-button" href={`/caa?share=${item.token}`} key={item.token}>{item.title || "Senza titolo"}</Link>)}</div> : <p>Le storie condivise con la tua email di accesso compariranno qui, in sola lettura.</p>}</section>;
}
