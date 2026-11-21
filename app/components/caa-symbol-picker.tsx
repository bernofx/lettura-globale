"use client";
import { useEffect, useRef, useState } from "react";
import { Library, Search, Type, Upload, X } from "lucide-react";
import { ARASAAC_CREDIT, arasaacResults, caaLibrarySymbol, caaSearchAllowed, caaSearchTerm, caaSymbolUrl, normalizeCaaTerm, type CaaLibraryItem, type CaaSymbol } from "../domain/caa-stories";
import { CaaArtwork } from "./caa-print";
import { FilePicker, IMAGE_FILE_ACCEPT, IMAGE_FILE_HINT } from "../shared/ui/file-picker";
import { CheckLine } from "../shared/ui/form-controls";
export { caaLibrarySymbol, type CaaLibraryItem } from "../domain/caa-stories";
export function CaaSymbolPicker({ text,owner,library,nonCommercial,onNonCommercial,onChoose,onClose,onUpload,prepareImage }: { text: string; owner: string; library: CaaLibraryItem[]; nonCommercial: boolean; onNonCommercial: () => void; onChoose: (symbol?: CaaSymbol) => void | boolean; onClose: () => void; onUpload: (image: string) => Promise<CaaSymbol>; prepareImage: (file: File) => Promise<string> }) {
  const [query,setQuery] = useState(caaSearchTerm(text));
  const [results,setResults] = useState<Array<{ id: number; label: string }>>([]);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [rights,setRights] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const select = (symbol?: CaaSymbol) => { if (onChoose(symbol) === false) setError("L’immagine non è stata applicata. Controlla i metadati e i limiti della storia oppure scegli un’altra immagine."); };
  const abort = useRef<AbortController | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; abort.current?.abort(); }; },[]);
  const search = async () => {
    if (!nonCommercial || !caaSearchAllowed(query)) return;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const timer = setTimeout(() => controller.abort(),8000);
    setBusy(true); setError("");
    try {
      const response = await fetch(`https://api.arasaac.org/v1/pictograms/it/search/${encodeURIComponent(query.trim().normalize("NFC"))}`,{ credentials: "omit",referrerPolicy: "no-referrer",signal: controller.signal });
      if (!response.ok) throw new Error("search_failed");
      const found = arasaacResults(await response.json());
      if (active.current && abort.current === controller) { setResults(found); if (!found.length) setError("Nessun simbolo trovato. Prova il singolare o l’infinito del verbo, oppure scegli una tua immagine."); }
    } catch { if (active.current && abort.current === controller) setError("Ricerca ARASAAC non disponibile. Puoi riprovare o usare la libreria e le immagini proprie."); }
    finally { clearTimeout(timer); if (active.current && abort.current === controller) setBusy(false); }
  };
  function chooseFile(nextFile: File) {
    setRights(false);
    setFile(null);
    setUploadError("");
    if (!IMAGE_FILE_ACCEPT.split(",").includes(nextFile.type) || nextFile.size > 10_000_000) {
      setUploadError("Scegli un file JPG, PNG o WebP entro 10 MB.");
      return;
    }
    setFile(nextFile);
  }

  async function upload() {
    if (!file || !rights || uploading) return;
    setUploading(true);
    setUploadError("");
    try {
      const symbol = await onUpload(await prepareImage(file));
      if (active.current && onChoose(symbol) === false) setUploadError("Impossibile applicare l’immagine. Riprova o scegli un’altra foto.");
    } catch {
      if (active.current) setUploadError("Impossibile preparare o conservare la foto. Riprova prima di chiudere la pagina.");
    } finally {
      if (active.current) setUploading(false);
    }
  }
  const matches = library.filter(item => item.image && normalizeCaaTerm(item.word).includes(normalizeCaaTerm(query))).slice(0,24);
  return <div className="modal-layer caa-modal" role="dialog" aria-modal="true" aria-labelledby="caa-picker-title" onKeyDown={event => { if (event.key === "Escape") onClose(); if (event.key === "Tab") { const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled):not([hidden]),summary,a[href]')].filter(control => control.getClientRects().length); const first = controls[0],last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}><div className="modal wide"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi scelta simbolo"><X size={20} aria-hidden="true" /></button><span className="eyebrow">LIBRERIA SIMBOLI</span><h2 id="caa-picker-title">Simbolo per “{text}”</h2><label>Termine di ricerca<input autoFocus maxLength={60} value={query} onChange={event => setQuery(event.target.value)} /></label><p className="caa-hint">Le ricerche ARASAAC sono esplicite: viene inviato questo termine, non la storia completa. Non inserire nomi o dati personali; il servizio esterno vede anche l’indirizzo IP del browser.</p>
    <label className="check-line"><input type="checkbox" checked={nonCommercial} onChange={event => { if (event.target.checked) onNonCommercial(); }} /><span>Uso ARASAAC soltanto per questa prova non commerciale e manterrò attribuzione e licenza CC BY-NC-SA anche nei materiali derivati. <a href="https://arasaac.org/terms-of-use" target="_blank" rel="noreferrer">Condizioni</a></span></label>
    <p className="caa-hint">Puoi cercare anche le parole di una sola lettera A, E, È, I e O. Consonanti isolate e U sono escluse; per gli altri termini usa almeno due caratteri.</p>
    <div className="caa-toolbar"><button type="button" className="primary-button" disabled={!nonCommercial || busy || uploading || !caaSearchAllowed(query)} onClick={() => void search()}><Search size={17} aria-hidden="true" />{busy ? "Attendi…" : "Cerca in ARASAAC"}</button><button type="button" className="ghost-button" onClick={() => select(undefined)}><Type size={17} aria-hidden="true" />Lascia solo il testo</button></div>
    <details className="caa-personal-image">
      <summary className="ghost-button"><Upload size={17} aria-hidden="true" />Usa una tua immagine</summary>
      <div className="caa-personal-image-content">
        <FilePicker accept={IMAGE_FILE_ACCEPT} hint={`${IMAGE_FILE_HINT} · massimo 10 MB`} compact
          label={file ? "Cambia immagine" : "Scegli un’immagine"} selection={file?.name} disabled={uploading} onFiles={([selected]) => chooseFile(selected)} />
        {file && <>
          <CheckLine checked={rights} onChange={setRights} disabled={uploading}
            title="Confermo di avere i diritti per usare e stampare questa immagine."
            detail="Confermo anche il consenso delle persone eventualmente ritratte." />
          <button type="button" className="primary-button" disabled={!rights || uploading} onClick={() => void upload()}>
            {uploading ? "Attendi…" : "Usa immagine"}
          </button>
        </>}
        {uploadError && <p className="form-error" role="alert">{uploadError}</p>}
      </div>
    </details>
    {error && <p className="caa-error" role="alert">{error}</p>}
    {results.length > 0 && <><p className="caa-attribution">{ARASAAC_CREDIT}</p><div className="caa-symbol-results" data-source="arasaac">{results.map(result => <button type="button" key={result.id} onClick={() => select({ kind: "arasaac",id: result.id })}><img src={caaSymbolUrl({ kind: "arasaac",id: result.id })} alt={result.label} referrerPolicy="no-referrer" /><span>{result.label}</span></button>)}</div></>}
    <h3><Library size={19} aria-hidden="true" />Dalla tua libreria</h3><div className="caa-symbol-results" data-source="library">{matches.map(item => { const symbol = caaLibrarySymbol(item); return <button key={item.id} type="button" disabled={!symbol} title={!symbol ? "Attendi il salvataggio dell’immagine nel cloud e verifica i metadati." : item.word} onClick={() => symbol && select(symbol)}>{symbol ? <CaaArtwork symbol={symbol} owner={owner} alt={item.word} /> : <span>In attesa del cloud</span>}<span>{item.word}</span></button>; })}</div>{!matches.length && <p>Nessuna immagine corrispondente nella libreria.</p>}

  </div></div>;
}
