"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { caaCachedMedia } from "../caa-cache";
import { androidBridge } from "../domain/android-bridge";
import { ARASAAC_CREDIT, caaCutSheets, caaPageSize, caaPages, caaSymbolUrl, type CaaPage, type CaaStory, type CaaSymbol } from "../domain/caa-stories";

export function CaaArtwork({ symbol,owner,alt }: { symbol: CaaSymbol; owner: string; alt: string }) {
  const [local,setLocal] = useState<{ id: string; url: string } | null>(null);
  const mediaId = symbol.kind === "media" ? symbol.id : "";
  useEffect(() => {
    if (!mediaId) return;
    let disposed = false; let url = "";
    void caaCachedMedia(owner,mediaId).then(media => { if (!disposed && media) { url = URL.createObjectURL(media.blob); setLocal({ id: mediaId,url }); } }).catch(() => undefined);
    return () => { disposed = true; if (url) URL.revokeObjectURL(url); };
  },[owner,mediaId]);
  const src = symbol.kind === "media" && local?.id === symbol.id ? local.url : caaSymbolUrl(symbol);
  return <img src={src} alt={alt} referrerPolicy="no-referrer" draggable={false} />;
}
function credits(story: CaaStory) {
  const result = new Set<string>();
  for (const sentence of story.sentences) for (const token of sentence.tokens) {
    if (token.symbol?.kind === "arasaac") result.add(ARASAAC_CREDIT);
    else if (token.symbol) result.add(`${token.symbol.source} · ${token.symbol.author} · ${token.symbol.license}`);
  }
  return [...result].join(" — ");
}
export function CaaPrintedPage({ story,page,owner }: { story: CaaStory; page: CaaPage | null; owner: string }) {
  if (!page) return <div className="caa-paper caa-blank" />;
  return <article className={`caa-paper ${page.cover ? "caa-cover" : ""}`} style={{ "--caa-symbol-size": `${story.symbolSize}mm` } as CSSProperties}>
    <header>{story.title}</header><div className="caa-page-body">
      {page.cover ? <h1>{story.title}</h1> : page.sentences.map(sentence => <div key={sentence.id} className="caa-print-sentence">{sentence.tokens.map(token => <span className={token.symbol ? "caa-word" : "caa-word caa-text-word"} key={token.id}>{token.symbol && <span className="caa-word-image"><CaaArtwork symbol={token.symbol} owner={owner} alt={token.text} /></span>}<span>{token.text}</span></span>)}</div>)}
    </div><footer><span>{credits(story)}</span><b>{page.number}</b></footer>
  </article>;
}
function ScalePaper({ width,height,children }: { width: number; height: number; children: ReactNode }) {
  const parent = useRef<HTMLDivElement>(null);
  const [scale,setScale] = useState(0.7);
  useEffect(() => {
    const element = parent.current; if (!element) return;
    const fit = () => setScale(Math.min(1,element.clientWidth / (width * 96 / 25.4)));
    const observer = new ResizeObserver(fit); observer.observe(element); fit(); return () => observer.disconnect();
  },[width]);
  return <div ref={parent} className="caa-scale-parent" style={{ height: height * 96 / 25.4 * scale }}><div className="caa-scale-paper" style={{ width: `${width}mm`,height: `${height}mm`,transform: `scale(${scale})` }}>{children}</div></div>;
}
export function CaaPreview({ story,owner }: { story: CaaStory; owner: string }) {
  useEffect(() => { document.body.classList.add("caa-print-active"); return () => document.body.classList.remove("caa-print-active"); },[]);
  const [mode,setMode] = useState<"read" | "print">("read");
  const [error,setError] = useState("");
  const [printing,setPrinting] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const pages = caaPages(story); const sheets = caaCutSheets(pages); const size = caaPageSize(story);
  const makePrint = async () => {
    setError(""); setPrinting(true);
    try {
      if (androidBridge()) { setError("In questa prima versione stampa e PDF richiedono il browser: apri il sito in Chrome o su PC."); return; }
      const element = preview.current; if (!element) return;
      const images = [...element.querySelectorAll("img"),...document.querySelectorAll<HTMLImageElement>("#caa-print-root img")];
      for (const image of images) {
        if (image.complete && image.naturalWidth > 0) continue;
        await Promise.race([image.decode(),new Promise((_,reject) => setTimeout(() => reject(new Error("image_timeout")),8000))]);
        if (!image.naturalWidth) throw new Error("missing_image");
      }
      const overflow = [...element.querySelectorAll<HTMLElement>(".caa-page-body,.caa-paper footer")].some(body => body.scrollHeight > body.clientHeight + 2 || body.scrollWidth > body.clientWidth + 2);
      if (overflow) { setError("Una pagina contiene troppo testo, simboli o crediti. Riduci i simboli, dividi la frase o usa un formato più grande prima di stampare."); return; }
      window.print();
    } catch { setError("Alcune immagini non sono ancora disponibili. Controlla la rete, attendi il caricamento o sostituiscile prima di stampare."); }
    finally { setPrinting(false); }
  };
  const page = (page: CaaPage | null) => <CaaPrintedPage story={story} page={page} owner={owner} />;
  return <section className="caa-preview"><div className="caa-preview-actions"><div><button type="button" className={mode === "read" ? "selected" : ""} onClick={() => setMode("read")}>Lettura</button><button type="button" className={mode === "print" ? "selected" : ""} onClick={() => setMode("print")}>Fogli di stampa</button></div><button type="button" className="primary-button" disabled={printing || !story.title.trim() || !story.sentences.some(s => s.tokens.length)} onClick={() => void makePrint()}>{printing ? "Controllo pagine…" : "Stampa / Salva PDF"}</button></div>
    {error && <p className="caa-error" role="alert">{error}</p>}
    <p className="caa-hint">Stampa al 100%, senza margini e senza intestazioni del browser. {story.format === "book" ? "Solo fronte: impila i fogli nell’ordine, taglia sulla linea centrale e metti la pila sinistra prima della destra. Poi rilega." : "Il foglio deve contenere tutta la storia: la stampa viene bloccata se il contenuto non entra."} Nel dialogo di stampa del browser puoi scegliere Salva come PDF. Nell’APK usa il browser per questa funzione.</p>
    <div ref={preview} className="caa-preview-pages">{story.format === "book" && mode === "print" ? sheets.map((sheet,index) => <div key={index}><h3>Foglio {index + 1} · pagine {sheet.left.number} e {sheet.right?.number ?? "vuota"}</h3><ScalePaper width={297} height={210}><div className="caa-cut-sheet">{page(sheet.left)}{page(sheet.right)}</div></ScalePaper></div>) : pages.map(p => <div key={p.number}><h3>Pagina {p.number}</h3><ScalePaper width={size.width} height={size.height}>{page(p)}</ScalePaper></div>)}</div>
    {typeof document !== "undefined" && createPortal(<div id="caa-print-root"><style>{`@media print { @page { size: ${story.format === "book" ? "297mm 210mm" : `${size.width}mm ${size.height}mm`}; margin: 0; } }`}</style>{story.format === "book" ? sheets.map((sheet,index) => <div className="caa-print-sheet caa-cut-sheet" key={index}>{page(sheet.left)}{page(sheet.right)}</div>) : <div className="caa-print-sheet" style={{ width: `${size.width}mm`,height: `${size.height}mm` }}>{page(pages[0])}</div>}</div>,document.body)}
  </section>;
}
