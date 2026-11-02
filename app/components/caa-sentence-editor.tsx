"use client";
import { ArrowDown, ArrowUp, ImagePlus, Link2, Scissors, Trash2 } from "lucide-react";
import { sentenceText, type CaaSentence } from "../domain/caa-stories";
import { CaaArtwork } from "./caa-print";

export function CaaSentenceEditor({ sentence,index,total,owner,uppercase,book,onText,onMove,onRemove,onPick,onJoin,onSplit,onPageBreak }: {
  sentence: CaaSentence; index: number; total: number; owner: string; uppercase: boolean; book: boolean;
  onText: (text: string) => void; onMove: (delta: number) => void; onRemove: () => void;
  onPick: (id: string) => void; onJoin: (position: number) => void; onSplit: (id: string) => void; onPageBreak: (value: boolean) => void;
}) {
  return <article className="panel caa-sentence-editor">
    <div className="caa-sentence-heading"><div><span className="eyebrow">FRASE {index + 1}</span><h3>Testo e simboli</h3></div><div className="caa-sentence-actions">
      <button type="button" className="icon-button" disabled={index === 0} onClick={() => onMove(-1)} title="Sposta prima" aria-label={"Sposta frase " + (index + 1) + " prima"}><ArrowUp size={18} aria-hidden="true" /></button>
      <button type="button" className="icon-button" disabled={index === total - 1} onClick={() => onMove(1)} title="Sposta dopo" aria-label={"Sposta frase " + (index + 1) + " dopo"}><ArrowDown size={18} aria-hidden="true" /></button>
      <button type="button" className="icon-button caa-danger-action" onClick={onRemove} title="Elimina frase" aria-label={"Elimina frase " + (index + 1)}><Trash2 size={18} aria-hidden="true" /></button>
    </div></div>
    <label>Testo della frase<textarea rows={2} maxLength={500} value={sentenceText(sentence)} onChange={event => onText(event.target.value)} /></label>
    <div className={"caa-token-editor " + (uppercase ? "caa-uppercase" : "")}>{sentence.tokens.map((token,position) => <div key={token.id}>
      <button className={"caa-token-button " + (token.symbol ? "has-symbol" : "needs-symbol")} type="button" title={"Scegli o cambia il simbolo per “" + token.text + "”"} onClick={() => onPick(token.id)}>
        {token.symbol ? <CaaArtwork symbol={token.symbol} owner={owner} alt={token.text} /> : <span className="caa-symbol-placeholder"><ImagePlus size={24} aria-hidden="true" /><span>Scegli simbolo</span></span>}<strong>{token.text}</strong>
      </button>
      {position < sentence.tokens.length - 1 && <button type="button" className="caa-token-operation" aria-label={"Unisci “" + token.text + "” alla parola successiva"} onClick={() => onJoin(position)}><Link2 size={14} aria-hidden="true" />Unisci</button>}
      {token.text.includes(" ") && <button type="button" className="caa-token-operation" onClick={() => onSplit(token.id)}><Scissors size={14} aria-hidden="true" />Dividi</button>}
    </div>)}</div>
    {book && index > 0 && <label className="check-line"><input type="checkbox" checked={sentence.pageBreak} onChange={event => onPageBreak(event.target.checked)} />Inizia una nuova pagina prima di questa frase</label>}
  </article>;
}
