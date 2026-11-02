"use client";
import { useEffect, useState } from "react";
import type { CaaStore } from "../use-caa-stories";
import { CAA_MAX_SENTENCES, CAA_MAX_TEXT, caaPages, editCaaSentence, newCaaStory, normalizeCaaTerm, parseCaaStory, sentenceText, splitCaaText, type CaaSentence, type CaaStory, type CaaSymbol } from "../domain/caa-stories";
import { useUpdateState } from "./app-update";
import { CaaArtwork, CaaPreview } from "./caa-print";
import { CaaSymbolPicker, caaLibrarySymbol, type CaaLibraryItem } from "./caa-symbol-picker";
import { CaaSharing, CaaReceived } from "./caa-sharing";

export function CaaStoriesView({ owner,store,library,prepareImage }: { owner: string; store: CaaStore; library: CaaLibraryItem[]; prepareImage: (file: File) => Promise<string> }) {
  const [selected,setSelected] = useUpdateState<string | null>(`caa:${owner}:selected`,null);
  const [step,setStep] = useUpdateState<1 | 2 | 3>(`caa:${owner}:step`,1);
  const [picking,setPicking] = useState<{ sentence: string; token: string } | null>(null);
  const [message,setMessage] = useState("");
  const [opening,setOpening] = useState(false);
  const [showArchived,setShowArchived] = useState(false);
  const record = store.records.find(item => item.story.id === selected);
  const story = record?.story;
  const unappliedText = Boolean(story && story.draftText !== story.sentences.map(sentenceText).join("\n"));
  const openStory = store.open;
  const storeReady = store.ready;
  useEffect(() => {
    if (!selected || !storeReady) return;
    let disposed = false;
    const start = async () => { setOpening(true); await openStory(selected); if (!disposed) setOpening(false); };
    void start(); return () => { disposed = true; };
  },[selected,storeReady,openStory]);
  const update = (next: CaaStory) => { try { store.save(next); setMessage(""); return true; } catch { setMessage("Modifica non applicata: controlla immagini e relativi metadati, oppure i limiti di 32 frasi, 300 parole/espressioni e 4.000 caratteri."); return false; } };
  const updateSentences = (sentences: CaaSentence[]) => { if (story) update({ ...story,sentences,draftText: sentences.map(sentenceText).join("\n") }); };
  const create = () => { const next = store.create(); setSelected(next.id); setStep(1); setMessage(""); };
  const structure = () => {
    if (!story?.draftText.trim()) { setMessage("Inserisci almeno una frase."); return; }
    const lines = splitCaaText(story.draftText);
    if (lines.length > CAA_MAX_SENTENCES) { setMessage("Usa al massimo 32 frasi per storia."); return; }
    const available = [...story.sentences];
    const sentences = lines.map((line,index) => {
      const match = available.findIndex(sentence => sentenceText(sentence) === line);
      const previous = match >= 0 ? available.splice(match,1)[0] : available.find(s => s.id === story.sentences[index]?.id) ?? { id: crypto.randomUUID(),tokens: [],pageBreak: false };
      if (match < 0) { const used = available.findIndex(s => s.id === previous.id); if (used >= 0) available.splice(used,1); }
      return editCaaSentence(previous,line);
    });
    try { update(parseCaaStory({ ...story,sentences,draftText: sentences.map(sentenceText).join("\n") })); setStep(2); } catch { setMessage("Testo troppo lungo: riduci il numero di parole o la lunghezza delle frasi."); }
  };
  const suggest = () => {
    if (!story) return;
    const byWord = new Map<string,CaaSymbol>();
    for (const sentence of story.sentences) for (const token of sentence.tokens) if (token.symbol && !byWord.has(normalizeCaaTerm(token.text))) byWord.set(normalizeCaaTerm(token.text),token.symbol);
    for (const item of library) { const symbol = caaLibrarySymbol(item); if (symbol && !byWord.has(normalizeCaaTerm(item.word))) byWord.set(normalizeCaaTerm(item.word),symbol); }
    update({ ...story,sentences: story.sentences.map(sentence => ({ ...sentence,tokens: sentence.tokens.map(token => token.symbol || !byWord.get(normalizeCaaTerm(token.text)) ? token : { ...token,symbol: byWord.get(normalizeCaaTerm(token.text))! }) })) });
  };
  const pickSentence = story?.sentences.find(sentence => sentence.id === picking?.sentence);
  const pickToken = pickSentence?.tokens.find(token => token.id === picking?.token);
  const choose = (symbol?: CaaSymbol) => {
    if (!story || !picking) return false;
    const applied = update({ ...story,sentences: story.sentences.map(sentence => sentence.id !== picking.sentence ? sentence : { ...sentence,tokens: sentence.tokens.map(token => token.id === picking.token ? { id: token.id,text: token.text,...(symbol ? { symbol } : {}) } : token) }) });
    if (applied) setPicking(null);
    return applied;
  };
  const move = (from: number,to: number) => { if (!story || to < 0 || to >= story.sentences.length) return; const sentences = [...story.sentences]; [sentences[from],sentences[to]] = [sentences[to],sentences[from]]; updateSentences(sentences); };
  const copy = () => { if (!story) return; const next = { ...story,id: newCaaStory().id,title: `${story.title.slice(0,120)} (copia)`,archived: false }; store.save(next); setSelected(next.id); setStep(2); };
  return <div className="page caa-stories-page"><div className="page-title-row"><div><span className="eyebrow">LABORATORIO · PRIMA VERSIONE</span><h1>Storie in CAA</h1><p>Brevi storie con testo e simboli, da leggere, stampare o trasformare in un libretto.</p></div><button className="primary-button" type="button" disabled={!store.ready} onClick={create}>＋ Nuova storia</button></div>
    <p className="caa-hint">Prototipo: usa soltanto contenuti dimostrativi, senza dati reali di minori. Le storie restano private finché non ne condividi esplicitamente una copia. Non sono esercizi e non producono statistiche. Le associazioni proposte richiedono sempre la revisione dell’adulto. La revisione AI del testo arriverà in una fase successiva.</p>
    {store.ready && <CaaReceived key={owner} owner={owner} profileId={store.profileId} />}
    {store.error && <p className="caa-error" role="alert">{store.error} <button type="button" onClick={() => void store.flush()}>Riprova salvataggio</button></p>}
    <div className="caa-workspace"><aside className="caa-story-list" aria-label="Le tue storie"><button type="button" onClick={() => setShowArchived(value => !value)}>{showArchived ? "Torna alle storie" : `Archiviate (${store.archivedItems.length})`}</button>{!store.ready ? <p>Caricamento archivio…</p> : !(showArchived ? store.archivedItems : store.items).length ? <p>Non hai ancora storie. Crea la prima o inserisci un piccolo testo di prova.</p> : (showArchived ? store.archivedItems : store.items).map(item => <button className={selected === item.id ? "selected" : ""} key={item.id} type="button" onClick={() => { setSelected(item.id); setStep(2); setMessage(""); }}><strong>{item.title || "Senza titolo"}</strong><small>{new Date(item.updatedAt).toLocaleDateString("it-IT")}</small></button>)}</aside>
    <section className="caa-editor">{!story ? <div className="panel caa-empty"><h2>{opening ? "Apertura storia…" : "Una storia, un passo alla volta"}</h2><p>1. Scrivi o incolla il testo.</p><p>2. Rivedi frasi, formato e simboli.</p><p>3. Controlla l’anteprima e stampa.</p></div> : <>
      <div className="caa-editor-heading"><div className="caa-save-state" role="status">{record.conflict ? "⚠ Conflitto: conserva una copia" : record.pending ? store.busy ? "Salvataggio nel cloud…" : "Bozza sul dispositivo · da sincronizzare" : "✓ Salvata nel cloud"}</div><div><button type="button" className="ghost-button" onClick={copy}>Duplica / salva copia</button><button type="button" className="text-button" onClick={() => { if (story.archived) { update({ ...story,archived: false }); setShowArchived(false); } else if (window.confirm("Archiviare questa storia? Non verranno toccati gli esercizi.")) { update({ ...story,archived: true }); setSelected(null); } }}>{story.archived ? "Ripristina" : "Archivia"}</button></div></div>
      <nav className="caa-steps" aria-label="Preparazione storia">{([1,2,3] as const).map(number => <button type="button" className={step === number ? "selected" : ""} key={number} disabled={number > 1 && (!story.sentences.length || unappliedText)} onClick={() => setStep(number)}>{number}. {number === 1 ? "Testo" : number === 2 ? "Frasi e formato" : "Anteprima"}</button>)}</nav>
      {unappliedText && <p className="caa-hint" role="status">Hai modificato il testo: premi “Dividi in frasi e continua” per applicarlo prima dell’anteprima.</p>}
      {message && <p className="caa-error" role="alert">{message}</p>}
      {step === 1 && <section className="panel caa-text-form"><label>Titolo<input maxLength={140} value={story.title} onChange={event => update({ ...story,title: event.target.value })} /></label><label>Testo della storia<textarea rows={10} maxLength={CAA_MAX_TEXT} value={story.draftText} placeholder="Il gatto si sveglia.\nIl gatto beve il latte.\nPoi va in giardino." onChange={event => update({ ...story,draftText: event.target.value })} /></label><p className="caa-hint">Puoi incollare tutta la storia. Un a capo suggerisce una nuova frase; l’app divide anche dopo punto, domanda o esclamazione. Le parole rimaste uguali conservano i simboli già scelti.</p><div className="caa-toolbar"><button className="ghost-button" type="button" disabled={Boolean(story.draftText.trim())} onClick={() => update({ ...story,title: "La giornata del gatto",draftText: "Il gatto si sveglia.\nIl gatto mangia.\nPoi il gatto dorme." })}>Inserisci un esempio</button><button className="primary-button" type="button" onClick={structure}>Dividi in frasi e continua →</button></div></section>}
      {step === 2 && <><section className="panel caa-format"><h2>Formato</h2><div className="caa-format-fields"><label>Produzione<select value={story.format} onChange={event => update({ ...story,format: event.target.value as CaaStory["format"] })}><option value="sheet">Foglio singolo</option><option value="book">Libretto da tagliare e rilegare</option></select></label>{story.format === "sheet" ? <label>Foglio<select value={story.paper} onChange={event => update({ ...story,paper: event.target.value as CaaStory["paper"] })}><option value="a4-portrait">A4 verticale</option><option value="a4-landscape">A4 orizzontale</option><option value="a5-portrait">A5 verticale</option><option value="a5-landscape">A5 orizzontale</option></select></label> : <><label>Frasi per pagina<select value={story.sentencesPerPage} onChange={event => update({ ...story,sentencesPerPage: Number(event.target.value) as 1 | 2 | 3 })}><option value={1}>Una</option><option value={2}>Due</option><option value={3}>Tre</option></select></label><label className="check-line"><input type="checkbox" checked={story.cover} onChange={event => update({ ...story,cover: event.target.checked })} />Copertina con il titolo</label></>}<label>Dimensione simboli<select value={story.symbolSize} onChange={event => update({ ...story,symbolSize: Number(event.target.value) as 20 | 26 | 32 })}><option value={20}>Compatta · 20 mm</option><option value={26}>Media · 26 mm</option><option value={32}>Grande · 32 mm</option></select></label></div><p className="caa-hint">{story.format === "book" ? "Pagine A5 verticali su fogli A4 orizzontali, solo fronte. La disposizione di stampa permette di impilare, tagliare a metà e rilegare." : "Una sola pagina: se il testo non entra, l’anteprima chiederà di ridurlo o cambiare formato."}</p></section>
      <div className="caa-toolbar"><h2>Frasi e simboli</h2><button type="button" className="ghost-button" onClick={suggest}>Riusa simboli e immagini note</button></div><p className="caa-hint">Tocca una parola per scegliere il simbolo. Gli articoli possono restare solo testo. Unisci parole vicine per rappresentare un’espressione con un solo simbolo.</p>
      {story.sentences.map((sentence,index) => <article className="panel caa-sentence-editor" key={sentence.id}><div className="caa-sentence-heading"><strong>Frase {index + 1}</strong><div><button type="button" disabled={index === 0} onClick={() => move(index,index - 1)} aria-label={`Sposta frase ${index + 1} prima`}>↑</button><button type="button" disabled={index === story.sentences.length - 1} onClick={() => move(index,index + 1)} aria-label={`Sposta frase ${index + 1} dopo`}>↓</button><button type="button" onClick={() => updateSentences(story.sentences.filter(s => s.id !== sentence.id))} aria-label={`Elimina frase ${index + 1}`}>×</button></div></div><label>Testo della frase<textarea rows={2} maxLength={500} value={sentenceText(sentence)} onChange={event => updateSentences(story.sentences.map(s => s.id === sentence.id ? editCaaSentence(s,event.target.value) : s))} /></label><div className="caa-token-editor">{sentence.tokens.map((token,position) => <div key={token.id}><button className="caa-token-button" type="button" onClick={() => setPicking({ sentence: sentence.id,token: token.id })}>{token.symbol ? <CaaArtwork symbol={token.symbol} owner={owner} alt={token.text} /> : <span className="caa-symbol-placeholder">＋ simbolo</span>}<strong>{token.text}</strong></button>{position < sentence.tokens.length - 1 && <button type="button" className="caa-token-operation" onClick={() => updateSentences(story.sentences.map(s => s.id !== sentence.id ? s : { ...s,tokens: [...s.tokens.slice(0,position),{ id: token.id,text: `${token.text} ${s.tokens[position + 1].text}` },...s.tokens.slice(position + 2)] }))}>Unisci →</button>}{token.text.includes(" ") && <button type="button" className="caa-token-operation" onClick={() => updateSentences(story.sentences.map(s => s.id !== sentence.id ? s : { ...s,tokens: s.tokens.flatMap(t => t.id === token.id ? t.text.split(/\s+/).map(text => ({ id: crypto.randomUUID(),text })) : [t]) }))}>Dividi</button>}</div>)}</div>{story.format === "book" && index > 0 && <label className="check-line"><input type="checkbox" checked={sentence.pageBreak} onChange={event => updateSentences(story.sentences.map(s => s.id === sentence.id ? { ...s,pageBreak: event.target.checked } : s))} />Inizia una nuova pagina prima di questa frase</label>}</article>)}
      <div className="caa-toolbar"><button type="button" className="ghost-button" disabled={story.sentences.length >= CAA_MAX_SENTENCES} onClick={() => updateSentences([...story.sentences,{ id: crypto.randomUUID(),tokens: [],pageBreak: false }])}>＋ Aggiungi frase</button><span>{caaPages(story).length} {story.format === "book" ? "pagine di lettura" : "foglio"}</span><button type="button" className="primary-button" onClick={() => setStep(3)}>Apri anteprima →</button></div></>}
      <CaaSharing key={story.id} owner={owner} profileId={store.profileId} record={record} store={store} />
      {step === 3 && <CaaPreview story={story} owner={owner} />}
    </>}</section></div>
    {story && picking && pickToken && <CaaSymbolPicker key={pickToken.id} text={pickToken.text} owner={owner} library={library} nonCommercial={story.nonCommercial} onNonCommercial={() => update({ ...story,nonCommercial: true })} onChoose={choose} onClose={() => setPicking(null)} onUpload={store.upload} prepareImage={prepareImage} />}
  </div>;
}
