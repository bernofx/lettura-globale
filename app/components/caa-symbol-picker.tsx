"use client";
import { useEffect, useRef, useState } from "react";
import { ARASAAC_CREDIT, arasaacResults, caaSymbolUrl, normalizeCaaTerm, type CaaSymbol } from "../domain/caa-stories";
import { CaaArtwork } from "./caa-print";
export type CaaLibraryItem = { id: string; word: string; image?: string; remoteImageId?: string; source: string; author: string; license: string };
export function caaLibrarySymbol(item: CaaLibraryItem): CaaSymbol | null {
  if (!item.source || !item.author || !item.license) return null;
  const rights = { source: item.source,author: item.author,license: item.license };
  if (item.remoteImageId) return { kind: "media",id: item.remoteImageId,...rights };
  if (item.image && /^\/images\/[a-zA-Z0-9/_-]+\.(webp|png|jpg|jpeg)$/.test(item.image)) return { kind: "bundled",path: item.image,...rights };
  return null;
}
export function CaaSymbolPicker({ text,owner,library,nonCommercial,onNonCommercial,onChoose,onClose,onUpload,prepareImage }: { text: string; owner: string; library: CaaLibraryItem[]; nonCommercial: boolean; onNonCommercial: () => void; onChoose: (symbol?: CaaSymbol) => void; onClose: () => void; onUpload: (image: string) => Promise<CaaSymbol>; prepareImage: (file: File) => Promise<string> }) {
  const [query,setQuery] = useState(normalizeCaaTerm(text));
  const [results,setResults] = useState<Array<{ id: number; label: string }>>([]);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [rights,setRights] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; abort.current?.abort(); }; },[]);
  const search = async () => {
    if (!nonCommercial || query.trim().length < 2 || query.length > 60) return;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const timer = setTimeout(() => controller.abort(),8000);
    setBusy(true); setError("");
    try {
      const response = await fetch(`https://api.arasaac.org/v1/pictograms/it/search/${encodeURIComponent(query.trim())}`,{ credentials: "omit",referrerPolicy: "no-referrer",signal: controller.signal });
      if (!response.ok) throw new Error("search_failed");
      const found = arasaacResults(await response.json());
      if (active.current && abort.current === controller) { setResults(found); if (!found.length) setError("Nessun simbolo trovato. Prova il singolare o l’infinito del verbo, oppure scegli una tua immagine."); }
    } catch { if (active.current && abort.current === controller) setError("Ricerca ARASAAC non disponibile. Puoi riprovare o usare la libreria e le immagini proprie."); }
    finally { clearTimeout(timer); if (active.current && abort.current === controller) setBusy(false); }
  };
  const upload = async (file?: File) => {
    if (!file || !rights) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 10_000_000) { setError("Scegli JPEG, PNG o WebP entro 10 MB."); return; }
    setBusy(true); setError("");
    try { const symbol = await onUpload(await prepareImage(file)); if (active.current) onChoose(symbol); }
    catch { if (active.current) setError("Impossibile preparare o conservare la foto. Riprova prima di chiudere la pagina."); }
    finally { if (active.current) setBusy(false); }
  };
  const matches = library.filter(item => item.image && normalizeCaaTerm(item.word).includes(normalizeCaaTerm(query))).slice(0,24);
  return <div className="modal-layer caa-modal" role="dialog" aria-modal="true" aria-labelledby="caa-picker-title" onKeyDown={event => { if (event.key === "Escape") onClose(); if (event.key === "Tab") { const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]')]; const first = controls[0],last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}><div className="modal wide"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi scelta simbolo">×</button><h2 id="caa-picker-title">Simbolo per “{text}”</h2><label>Termine di ricerca<input autoFocus maxLength={60} value={query} onChange={event => setQuery(event.target.value)} /></label><p className="caa-hint">Le ricerche ARASAAC sono esplicite: viene inviato questo termine, non la storia completa. Non inserire nomi o dati personali; il servizio esterno vede anche l’indirizzo IP del browser.</p>
    <label className="check-line"><input type="checkbox" checked={nonCommercial} onChange={event => { if (event.target.checked) onNonCommercial(); }} /><span>Uso ARASAAC soltanto per questa prova non commerciale e manterrò attribuzione e licenza CC BY-NC-SA anche nei materiali derivati. <a href="https://arasaac.org/terms-of-use" target="_blank" rel="noreferrer">Condizioni</a></span></label>
    <div className="caa-toolbar"><button type="button" className="primary-button" disabled={!nonCommercial || busy || query.trim().length < 2} onClick={() => void search()}>{busy ? "Attendi…" : "Cerca in ARASAAC"}</button><button type="button" className="ghost-button" onClick={() => onChoose(undefined)}>Lascia solo il testo</button></div>
    {error && <p className="caa-error" role="alert">{error}</p>}
    {results.length > 0 && <><p className="caa-attribution">{ARASAAC_CREDIT}</p><div className="caa-symbol-results" data-source="arasaac">{results.map(result => <button type="button" key={result.id} onClick={() => onChoose({ kind: "arasaac",id: result.id })}><img src={caaSymbolUrl({ kind: "arasaac",id: result.id })} alt={result.label} referrerPolicy="no-referrer" /><span>{result.label}</span></button>)}</div></>}
    <h3>Dalla tua libreria</h3><div className="caa-symbol-results" data-source="library">{matches.map(item => { const symbol = caaLibrarySymbol(item); return <button key={item.id} type="button" disabled={!symbol} title={!symbol ? "Attendi il salvataggio dell’immagine nel cloud e verifica i metadati." : item.word} onClick={() => symbol && onChoose(symbol)}>{symbol ? <CaaArtwork symbol={symbol} owner={owner} alt={item.word} /> : <span>In attesa del cloud</span>}<span>{item.word}</span></button>; })}</div>{!matches.length && <p>Nessuna immagine corrispondente nella libreria.</p>}
    <h3>Una tua immagine</h3><label className="check-line"><input type="checkbox" checked={rights} onChange={event => setRights(event.target.checked)} /><span>Ho i diritti per usare e stampare questa immagine e il consenso delle persone eventualmente ritratte.</span></label><label className="caa-upload">Carica JPEG, PNG o WebP<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!rights || busy} onChange={event => void upload(event.target.files?.[0])} /></label>
  </div></div>;
}
