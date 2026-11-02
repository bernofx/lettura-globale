"use client";
import { useEffect, useState } from "react";
import { Archive, BookOpen, Check, ChevronDown, ChevronRight, Cloud, CloudUpload, Copy, FileText, Inbox, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import type { CaaStore } from "../use-caa-stories";
import { CAA_MAX_SENTENCES, CAA_MAX_TEXT, caaPages, editCaaSentence, newCaaStory, normalizeCaaTerm, parseCaaStory, sentenceText, splitCaaText, type CaaSentence, type CaaStory, type CaaSymbol } from "../domain/caa-stories";
import { useUpdateState } from "./app-update";
import { CaaPreview } from "./caa-print";
import { CaaSymbolPicker, caaLibrarySymbol, type CaaLibraryItem } from "./caa-symbol-picker";
import { CaaSharing, CaaReceived } from "./caa-sharing";
import { CaaCaseOption, CaaFormatOptions } from "./caa-format-options";
import { CaaSentenceEditor } from "./caa-sentence-editor";

export function CaaStoriesView({ owner,store,library,prepareImage }: { owner: string; store: CaaStore; library: CaaLibraryItem[]; prepareImage: (file: File) => Promise<string> }) {
  const [selected,setSelected] = useUpdateState<string | null>(`caa:${owner}:selected`,null);
  const [step,setStep] = useUpdateState<1 | 2 | 3>(`caa:${owner}:step`,1);
  const [picking,setPicking] = useState<{ sentence: string; token: string } | null>(null);
  const [message,setMessage] = useState("");
  const [opening,setOpening] = useState(false);
  const [showArchived,setShowArchived] = useState(false);
  const [storyQuery,setStoryQuery] = useState("");
  const [listOpen,setListOpen] = useState(false);
  const record = store.records.find(item => item.story.id === selected);
  const story = record?.story;
  const allItems = showArchived ? store.archivedItems : store.items;
  const visibleItems = allItems.filter(item => normalizeCaaTerm(item.title).includes(normalizeCaaTerm(storyQuery)));
  const unappliedText = Boolean(story && story.draftText !== story.sentences.map(sentenceText).join("\n"));
  const openStory = store.open;
  const storeReady = store.ready;
  useEffect(() => {
    if (!selected || !storeReady) return;
    let disposed = false;
    const start = async () => { setOpening(true); const opened = await openStory(selected); if (!disposed) { if (opened && (!opened.sentences.length || opened.draftText !== opened.sentences.map(sentenceText).join("\n"))) setStep(1); setOpening(false); } };
    void start(); return () => { disposed = true; };
  },[selected,storeReady,openStory,setStep]);
  const update = (next: CaaStory) => { try { store.save(next); setMessage(""); return true; } catch { setMessage("Modifica non applicata: controlla immagini e relativi metadati, oppure i limiti di 32 frasi, 300 parole/espressioni e 4.000 caratteri."); return false; } };
  const updateSentences = (sentences: CaaSentence[]) => { if (story) update({ ...story,sentences,draftText: sentences.map(sentenceText).join("\n") }); };
  const create = () => { const next = store.create(); setSelected(next.id); setStep(1); setStoryQuery(""); setListOpen(false); setMessage(""); };
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
  return <div className="page caa-stories-page">
    <div className="page-title-row"><div><span className="eyebrow">CONTENUTI E COMUNICAZIONE</span><h1>Storie in CAA</h1><p>Prepara storie con parole e simboli, da leggere insieme o stampare.</p></div><div className="caa-page-actions">
      <a className="ghost-button" href="#caa-received"><Inbox size={17} aria-hidden="true" />Ricevute</a>
      <button className="primary-button" type="button" disabled={!store.ready} onClick={create}><Plus size={18} aria-hidden="true" />Nuova storia</button>
    </div></div>
    <details className="caa-guidance"><summary><ShieldCheck size={18} aria-hidden="true" /><span>Usa dati dimostrativi, non dati reali di minori</span><span className="caa-disclosure-label">Indicazioni d’uso</span></summary><p>Le storie restano private finché non ne condividi esplicitamente una copia. Non sono esercizi e non producono statistiche. Le associazioni dei simboli richiedono sempre la revisione dell’adulto. La revisione AI del testo arriverà in una fase successiva.</p></details>
    {store.error && <p className="caa-error" role="alert">{store.error} <button type="button" className="ghost-button" onClick={() => void store.flush()}>Riprova salvataggio</button></p>}
    <div className="caa-workspace">
      <aside className={"panel caa-story-list" + (listOpen ? " is-open" : "")} aria-label="Le tue storie">
        <button type="button" className="caa-library-toggle ghost-button" aria-expanded={listOpen} aria-controls="caa-story-options" onClick={() => setListOpen(value => !value)}><BookOpen size={18} aria-hidden="true" /><b>Le tue storie ({allItems.length})</b><ChevronDown size={18} aria-hidden="true" /></button>
        <div id="caa-story-options" className="caa-story-options">
        <div className="caa-list-heading"><h2>{showArchived ? "Archivio" : "Le tue storie"}</h2><span className="caa-count">{allItems.length}</span></div>
        <label className="caa-story-search"><Search size={17} aria-hidden="true" /><input type="search" value={storyQuery} onChange={event => setStoryQuery(event.target.value)} placeholder="Cerca una storia" aria-label="Cerca una storia" /></label>
        <button type="button" className="ghost-button caa-archive-toggle" onClick={() => { setShowArchived(value => !value); setStoryQuery(""); }}><Archive size={16} aria-hidden="true" />{showArchived ? "Torna alle storie" : "Archiviate (" + store.archivedItems.length + ")"}</button>
        {!store.ready ? <p className="caa-list-empty" role="status">Caricamento archivio…</p> : !visibleItems.length ? <p className="caa-list-empty">{storyQuery ? "Nessuna storia corrisponde alla ricerca." : showArchived ? "Le storie archiviate compariranno qui." : "Non hai ancora storie. Crea la prima con Nuova storia."}</p> : visibleItems.map(item => <button className={"caa-story-item " + (selected === item.id ? "selected" : "")} aria-pressed={selected === item.id} key={item.id} type="button" onClick={() => { setSelected(item.id); setStep(2); setListOpen(false); setMessage(""); }}><BookOpen size={18} aria-hidden="true" /><span><strong>{item.title || "Senza titolo"}</strong><small>Modificata il {new Date(item.updatedAt).toLocaleDateString("it-IT")}</small></span><ChevronRight size={15} aria-hidden="true" /></button>)}
        </div>
      </aside>
      <section className="caa-editor">{!story ? <div className="panel caa-empty"><span className="caa-empty-icon"><BookOpen size={30} aria-hidden="true" /></span><span className="eyebrow">CREA · PERSONALIZZA · STAMPA</span><h2>{opening ? "Apertura storia…" : "Una storia, un passo alla volta"}</h2><p>Scrivi un breve testo, scegli i simboli e prepara il tuo foglio o libretto.</p><ol><li><span>1</span>Scrivi o incolla il testo</li><li><span>2</span>Rivedi frasi, formato e simboli</li><li><span>3</span>Controlla l’anteprima e stampa</li></ol></div> : <>
        <div className="caa-editor-heading"><div className="caa-editor-title"><span className="eyebrow">LA TUA STORIA</span><h2>{story.title || "Senza titolo"}</h2><div className={"caa-save-state " + (record.conflict ? "conflict" : record.pending ? "pending" : "saved")} role="status" aria-live="polite">{record.conflict ? <><Cloud size={15} aria-hidden="true" />Conflitto: conserva una copia</> : record.pending ? <><CloudUpload size={15} aria-hidden="true" />{store.busy ? "Salvataggio nel cloud…" : "Bozza sul dispositivo · da sincronizzare"}</> : <><Check size={15} aria-hidden="true" />Salvata nel cloud</>}</div></div><div className="caa-editor-actions"><button type="button" className="ghost-button" onClick={copy}><Copy size={16} aria-hidden="true" />Duplica / salva copia</button><button type="button" className="text-button" onClick={() => { if (story.archived) { update({ ...story,archived: false }); setShowArchived(false); } else if (window.confirm("Archiviare questa storia? Non verranno toccati gli esercizi.")) { update({ ...story,archived: true }); setSelected(null); } }}><Archive size={16} aria-hidden="true" />{story.archived ? "Ripristina" : "Archivia"}</button></div></div>
        <nav className="caa-steps" aria-label="Preparazione storia">{([1,2,3] as const).map(number => <button type="button" className={step === number ? "selected" : ""} aria-current={step === number ? "step" : undefined} key={number} disabled={number > 1 && (!story.sentences.length || unappliedText)} title={number > 1 && unappliedText ? "Applica prima le modifiche al testo" : undefined} onClick={() => setStep(number)}><span className="caa-step-index">{number}.</span>{" "}<span>{number === 1 ? "Testo" : number === 2 ? "Frasi e formato" : "Anteprima"}</span></button>)}</nav>
        {unappliedText && <p className="caa-inline-note" role="status"><FileText size={17} aria-hidden="true" /><span>Hai modificato il testo: premi “Dividi in frasi e continua” per applicarlo prima dell’anteprima.</span></p>}
        {message && <p className="caa-error" role="alert">{message}</p>}
        {step === 1 && <section className="panel caa-text-form"><div className="panel-heading"><div><span className="eyebrow">PASSO 1</span><h2>Scrivi la tua storia</h2><p>Parti dal testo; potrai scegliere un simbolo per ogni parola o espressione.</p></div><FileText size={24} aria-hidden="true" /></div><CaaCaseOption story={story} onChange={update} /><label>Titolo<input maxLength={140} value={story.title} onChange={event => update({ ...story,title: event.target.value })} /></label><label>Testo della storia<textarea rows={8} maxLength={CAA_MAX_TEXT} value={story.draftText} placeholder={"Il gatto si sveglia.\nIl gatto beve il latte.\nPoi va in giardino."} onChange={event => update({ ...story,draftText: event.target.value })} /><small className="caa-field-counter">{story.draftText.length} / {CAA_MAX_TEXT} caratteri</small></label><p className="caa-hint">Incolla tutta la storia o usa un a capo per separare le frasi. Le parole rimaste uguali conservano i simboli già scelti.</p><div className="caa-toolbar caa-step-actions"><button className="ghost-button" type="button" disabled={Boolean(story.draftText.trim())} onClick={() => update({ ...story,title: "La giornata del gatto",draftText: "Il gatto si sveglia.\nIl gatto mangia.\nPoi il gatto dorme." })}><FileText size={16} aria-hidden="true" />Inserisci un esempio</button><button className="primary-button" type="button" onClick={structure}>Dividi in frasi e continua<ChevronRight size={18} aria-hidden="true" /></button></div></section>}
        {step === 2 && <><CaaFormatOptions story={story} onChange={update} />
          <div className="caa-toolbar caa-section-heading"><div><span className="eyebrow">PERSONALIZZA LA STORIA</span><h2>Frasi e simboli <span className="caa-count">{story.sentences.length}</span></h2></div><button type="button" className="ghost-button" onClick={suggest}><RefreshCw size={16} aria-hidden="true" />Riusa simboli e immagini note</button></div><p className="caa-hint">Tocca una parola per scegliere il simbolo. Puoi lasciare solo il testo o unire parole vicine in un’espressione.</p>
          {story.sentences.map((sentence,index) => <CaaSentenceEditor key={sentence.id} sentence={sentence} index={index} total={story.sentences.length} owner={owner} uppercase={story.letterCase === "uppercase"} book={story.format === "book"} onText={text => updateSentences(story.sentences.map(s => s.id === sentence.id ? editCaaSentence(s,text) : s))} onMove={delta => move(index,index + delta)} onRemove={() => updateSentences(story.sentences.filter(s => s.id !== sentence.id))} onPick={token => setPicking({ sentence: sentence.id,token })} onJoin={position => updateSentences(story.sentences.map(s => s.id !== sentence.id ? s : { ...s,tokens: [...s.tokens.slice(0,position),{ id: s.tokens[position].id,text: s.tokens[position].text + " " + s.tokens[position + 1].text },...s.tokens.slice(position + 2)] }))} onSplit={id => updateSentences(story.sentences.map(s => s.id !== sentence.id ? s : { ...s,tokens: s.tokens.flatMap(t => t.id === id ? t.text.split(/\s+/).map(text => ({ id: crypto.randomUUID(),text })) : [t]) }))} onPageBreak={pageBreak => updateSentences(story.sentences.map(s => s.id === sentence.id ? { ...s,pageBreak } : s))} />)}
          <div className="caa-toolbar caa-step-actions"><button type="button" className="ghost-button" disabled={story.sentences.length >= CAA_MAX_SENTENCES} onClick={() => updateSentences([...story.sentences,{ id: crypto.randomUUID(),tokens: [],pageBreak: false }])}><Plus size={17} aria-hidden="true" />Aggiungi frase</button><span className="caa-hint">{caaPages(story).length} {story.format === "book" ? "pagine di lettura" : "foglio"}</span><button type="button" className="primary-button" onClick={() => setStep(3)}>Apri anteprima<ChevronRight size={18} aria-hidden="true" /></button></div>
        </>}
        <CaaSharing key={story.id} owner={owner} profileId={store.profileId} record={record} store={store} />
        {step === 3 && <CaaPreview story={story} owner={owner} onChangeStory={update} />}
      </>}</section>
    </div>
    {store.ready && <CaaReceived key={owner} owner={owner} profileId={store.profileId} />}
    {story && picking && pickToken && <CaaSymbolPicker key={pickToken.id} text={pickToken.text} owner={owner} library={library} nonCommercial={story.nonCommercial} onNonCommercial={() => update({ ...story,nonCommercial: true })} onChoose={choose} onClose={() => setPicking(null)} onUpload={store.upload} prepareImage={prepareImage} />}
  </div>;
}
