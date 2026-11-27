import { BookOpenCheck, Check, Copy, MousePointer2, Pencil, Plus, Search, Share2, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { type SessionActivity } from "../../domain/session-compilation";
import { moveItem, reorderVisible } from "../../domain/reorder";
import { quantityObjectLabel } from "../../domain/quantity-exercise";
import { Artwork } from "../../shared/artwork";
import { exerciseKind } from "../../shared/constants";
import { type Exercise, type LibraryItem, type Sequence, type Therapist } from "../../shared/types";
import { syllableFilterLabel } from "../../shared/utils";
import { PageHeader } from "../../shared/ui/headings";
import { SequenceOrderList } from "./sequence-order-list";
import { Modal, ModalActions, ModalTitle } from "../../shared/ui/modal";

type SharedLinkSummary = { token: string; kind: "exercise" | "sequence"; contentId: string; title: string; createdAt: number; expiresAt: number };

function SharedLinksDialog({ onClose }: { onClose: () => void }) {
  const [links, setLinks] = useState<SharedLinkSummary[] | null>(null);
  const [error, setError] = useState("");
  const [revoking, setRevoking] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/shared-launch", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("shared_links_load_failed");
      const result = await response.json() as { links: SharedLinkSummary[] };
      if (active) setLinks(result.links);
    }).catch(() => { if (active) setError("Non è stato possibile caricare i link condivisi."); });
    return () => { active = false; };
  }, []);
  const revoke = async (token: string) => {
    setRevoking(token);
    setError("");
    try {
      const response = await fetch(`/api/shared-launch/${encodeURIComponent(token)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("shared_link_revoke_failed");
      setLinks((current) => current?.filter((link) => link.token !== token) ?? []);
    } catch { setError("Non è stato possibile revocare il link."); }
    finally { setRevoking(""); }
  };
  return <Modal labelledBy="shared-links-title" onClose={onClose}><ModalTitle id="shared-links-title" eyebrow="CONDIVISIONI">Link condivisi attivi</ModalTitle><p>I link scadono automaticamente dopo 30 giorni. Puoi revocarli subito senza eliminare esercizi o immagini.</p>{error && <p className="form-error" role="alert">{error}</p>}{links === null && !error ? <p>Caricamento…</p> : links?.length ? <div className="sequence-order-list">{links.map((link) => <article key={link.token}><span>{link.kind === "sequence" ? "SEQ" : "EX"}</span><div><strong>{link.title}</strong><small>Scade il {new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" }).format(link.expiresAt)}</small></div><button className="danger-button subtle" type="button" disabled={revoking === link.token} onClick={() => void revoke(link.token)}><Trash2 />{revoking === link.token ? "Revoca…" : "Revoca"}</button></article>)}</div> : <div className="empty-mini"><Share2 /><p>Nessun link attivo.</p></div>}<ModalActions><button className="primary-button" type="button" onClick={onClose}>Chiudi</button></ModalActions></Modal>;
}

export function ExercisesView({ exercises, sequences, activeSequence, canEditActiveSequence, canManageSequence, onEditStep, adultId, therapists, showSequenceOwners, library, onSelectSequence, onCreateSequence, onRenameSequence, onDeleteSequence, onBuild, onEdit, onDuplicate, onDelete, onAddToSequence, onChangeSteps, onTry, onShareSequence, onShareExercise }: { exercises: Exercise[]; sequences: Sequence[]; activeSequence?: Sequence; canEditActiveSequence: boolean; canManageSequence: boolean; onEditStep?: (sequence: Sequence, slot: number) => void; adultId: string; therapists: Therapist[]; showSequenceOwners: boolean; library: LibraryItem[]; onSelectSequence: (id: string) => void; onCreateSequence: () => void; onRenameSequence: () => void; onDeleteSequence: () => void; onBuild: (kind: SessionActivity) => void; onEdit: (exercise: Exercise) => void; onDuplicate: (exercise: Exercise) => void; onDelete: (exercise: Exercise) => void; onAddToSequence: (exerciseId: string) => void; onChangeSteps: (reviewed: Sequence, ids: string[]) => void; onTry: (exerciseId: string) => void; onShareSequence: () => void; onShareExercise: (exercise: Exercise) => void }) {
  const [sharedLinksOpen, setSharedLinksOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<SessionActivity | "all">("all");
  const [mineOnly, setMineOnly] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase("it");
  const models = exercises.filter(exercise => !exercise.sequenceId);
  const catalog = models.map((exercise, index) => ({ exercise, number: index + 1 })).filter(({ exercise }) => (!mineOnly || exercise.ownerAdultId === adultId) && (kindFilter === "all" || exerciseKind(exercise) === kindFilter) && (!normalizedQuery || exercise.title.toLocaleLowerCase("it").includes(normalizedQuery)));
  const byId = new Map(exercises.map(exercise => [exercise.id, exercise]));
  const occurrences = new Map<string, number>();
  const sequenceRows = (activeSequence?.exerciseIds ?? []).flatMap((id, slot) => {
    const exercise = byId.get(id);
    if (!exercise) return [];
    const occurrence = (occurrences.get(id) ?? 0) + 1;
    occurrences.set(id, occurrence);
    return [{ id: JSON.stringify([id, occurrence]), title: exercise.title, exercise, slot }];
  });
  const slotsByModel = new Map<string, number[]>();
  for (const { exercise, slot } of sequenceRows) {
    const modelId = exercise.templateExerciseId ?? exercise.id;
    const slots = slotsByModel.get(modelId);
    if (slots) slots.push(slot);
    else slotsByModel.set(modelId, [slot]);
  }
  const removeStep = (slot: number) => {
    if (activeSequence) onChangeSteps(activeSequence, activeSequence.exerciseIds.filter((_, index) => index !== slot));
  };
  const moveStep = (rowId: string, to: number) => {
    if (!activeSequence) return;
    const from = sequenceRows.findIndex(row => row.id === rowId);
    if (from < 0 || from === to) return;
    const ids = moveItem(sequenceRows, from, to).map(row => row.exercise.id);
    onChangeSteps(activeSequence, reorderVisible(activeSequence.exerciseIds, ids));
  };
  const therapistName = (therapistId: string) => { const owner = therapists.find((item) => item.id === therapistId); return owner ? `${owner.firstName} ${owner.lastName}` : "Terapista non disponibile"; };
  return <div className="page exercises-page">
    <PageHeader eyebrow="PROGRAMMAZIONE" title="Esercizi e sequenze" description="Crea, modifica ed elimina esercizi e sequenze. L’avvio delle attività si trova nella sezione Sessione."><button className="ghost-button" type="button" onClick={() => setSharedLinksOpen(true)}><Share2 />Link condivisi</button></PageHeader>
    {activeSequence ? <section className="sequence-banner sequence-manager"><div className="sequence-symbol"><span>1</span><span>2</span><span>3</span></div><div className="sequence-copy"><span className="soft-label">SEQUENZA</span><select value={activeSequence.id} onChange={(event) => onSelectSequence(event.target.value)} aria-label="Seleziona sequenza">{sequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.title}{showSequenceOwners ? ` · ${therapistName(sequence.therapistId)}` : ""}</option>)}</select><p>{sequenceRows.length} esercizi · {showSequenceOwners ? `terapista: ${therapistName(activeSequence.therapistId)} · ` : ""}{canEditActiveSequence ? "salvata nel cloud" : "sola lettura"}</p><div className="sequence-actions"><button type="button" className="primary-button" onClick={onCreateSequence}><Plus />Nuova</button><button type="button" className="ghost-button" disabled={!canManageSequence} onClick={onRenameSequence}><Pencil />Rinomina</button><button type="button" className="ghost-button" onClick={onShareSequence}><Share2 />Condividi</button><button type="button" className="danger-button" disabled={!canManageSequence} onClick={onDeleteSequence}><Trash2 />Elimina</button></div></div></section> : <section className="sequence-banner sequence-manager empty-sequence-manager"><div className="sequence-symbol"><span>1</span><span>2</span><span>3</span></div><div className="sequence-copy"><span className="soft-label">SEQUENZE</span><h2>Nessuna sequenza disponibile</h2><p>Crea la prima sequenza per organizzare i tuoi esercizi.</p><div className="sequence-actions"><button type="button" className="primary-button" onClick={onCreateSequence}><Plus />Nuova sequenza</button></div></div></section>}
    {activeSequence && <section className="sequence-editor"><div className="section-heading"><div><h2>Ordine della sequenza</h2><p>{canEditActiveSequence ? "Trascina dai puntini o toccali per scegliere una posizione. Da tastiera puoi anche usare le frecce." : "Il proprietario o un amministratore può modificare questa sequenza."}</p></div><span>{sequenceRows.length} elementi</span></div>{sequenceRows.length ? <fieldset className="sequence-order-fieldset" disabled={!canEditActiveSequence}><SequenceOrderList key={activeSequence.id} items={sequenceRows} onMove={moveStep} onEdit={onEditStep ? rowId => { const row = sequenceRows.find(item => item.id === rowId); if (row) onEditStep(activeSequence, row.slot); } : undefined} onRemove={rowId => { const row = sequenceRows.find(item => item.id === rowId); if (row) removeStep(row.slot); }} /></fieldset> : <div className="empty-state compact"><BookOpenCheck /><h3>Sequenza vuota</h3><p>Aggiungi almeno un esercizio dal catalogo qui sotto.</p></div>}</section>}
    <div className="catalog-actions"><span className="soft-label">NUOVO ESERCIZIO</span><div className="new-exercise-actions"><button className="ghost-button" onClick={() => onBuild("recognition")}><Plus size={19} />Trova la parola</button><button className="ghost-button" onClick={() => onBuild("sentence-matching")}><Plus size={19} />Abbina la frase</button><button className="ghost-button" onClick={() => onBuild("articles")}><Plus size={19} />IL / LA</button><button className="ghost-button" onClick={() => onBuild("word-categories")}><Plus size={19} />Parola → categoria</button><button className="ghost-button" onClick={() => onBuild("naming")}><Plus size={19} />Mix and vary</button><button className="ghost-button" onClick={() => onBuild("number-quantity")}><Plus size={19} />Numero quantità</button></div></div>
    <div className="section-heading exercise-catalog-heading"><div><h2>Catalogo esercizi</h2><p>{canEditActiveSequence ? "Modifica, duplica o aggiungi gli esercizi alla sequenza attiva." : "Modifica o duplica gli esercizi. Per aggiungerli, seleziona una sequenza modificabile."}</p></div><span>{catalog.length === models.length ? `${models.length} totali` : `${catalog.length} di ${models.length}`}</span></div>
    <div className="toolbar catalog-toolbar"><label className="search-box"><Search size={19} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca per titolo…" aria-label="Cerca nel catalogo esercizi" /></label><label className="catalog-kind-filter"><span>Autore</span><select value={mineOnly ? "mine" : "all"} onChange={event => setMineOnly(event.target.value === "mine")}><option value="all">Tutti</option><option value="mine">I miei</option></select></label><label className="catalog-kind-filter"><span>Tipologia</span><select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as SessionActivity | "all")}><option value="all">Tutte</option><option value="recognition">Trova la parola</option><option value="sentence-matching">Abbina la frase</option><option value="articles">IL / LA</option><option value="word-categories">Parola → categoria</option><option value="naming">Mix and vary</option><option value="number-quantity">Numero quantità</option></select></label></div>
    {!catalog.length && <div className="empty-state compact"><Search /><h3>Nessun esercizio trovato</h3><p>Cambia la ricerca o i filtri.</p><button className="ghost-button" type="button" onClick={() => { setQuery(""); setKindFilter("all"); setMineOnly(false); }}>Mostra tutti</button></div>}
    <div className="exercise-list">{catalog.map(({ exercise, number }) => { const prompt = library.find((item) => item.id === exercise.promptId); const includedSlots = slotsByModel.get(exercise.id) ?? []; const included = includedSlots.length > 0; const kind = exerciseKind(exercise); const isArticles = kind === "articles"; const isWordCategories = kind === "word-categories"; const isNaming = kind === "naming"; const isQuantity = kind === "number-quantity"; const isSentence = kind === "sentence-matching"; const description = isSentence ? `Frase → immagine · ${exercise.rounds ?? 6} turni · ${exercise.sentenceOptionCount ?? 2} immagini · ${exercise.sentenceDifficulty ?? 1} ${exercise.sentenceDifficulty === 2 ? "gradi" : "grado"} di libertà` : isArticles ? `IL / LA · ${Math.min(exercise.rounds ?? 6, exercise.articleItemIds?.length ?? 0)} turni · ${exercise.articleItemIds?.length ?? 0} immagini scelte` : isWordCategories ? `Parola → categoria · ${exercise.rounds ?? 6} turni · ${exercise.categoryNames?.length ?? 0} categorie` : isNaming ? `Nomina l’immagine · ${exercise.rounds ?? 6} turni` : isQuantity ? `${exercise.quantityErrorless ? "Apprendimento senza errori · " : ""}${exercise.rounds ?? 6} turni · quantità ${exercise.quantityMin ?? 1}–${exercise.quantityMax ?? 10} · ${exercise.quantityObjectSet === "mixed" || !exercise.quantityObjectSet ? "oggetti casuali" : quantityObjectLabel(exercise.quantityObjectSet, 2)} · ${exercise.quantityAutoComplete ? `auto dopo ${exercise.quantityIdleSeconds ?? 3}s in insegnamento` : "conferma adulta"}` : exercise.recognitionMode === "random" ? `${exercise.promptId ? (exercise.recognitionTargetIds?.length ?? 1) > 1 ? `${exercise.recognitionTargetIds!.length} parole precise` : "Parola precisa" : "Casuale"} · ${exercise.rounds ?? 6} turni · ${exercise.distractorCount ?? 3} distrattori · ${exercise.distractorSource === "same-category" ? "stessa categoria" : "tutte le parole"} · ${exercise.presentation === "words" ? "solo parole" : "foto + parole"} · ${syllableFilterLabel(exercise.recognitionSyllables)}` : `Parola → scelta · ${exercise.optionIds.length} opzioni · ${exercise.presentation === "words" ? "solo parole" : "foto + parole"}`; return <article className="exercise-row" key={exercise.id}><span className="exercise-number">{String(number).padStart(2, "0")}</span><div className={`tiny-art ${isArticles || isWordCategories || isNaming || isQuantity || isSentence ? "article-icon" : ""}`}>{isSentence ? <strong>S<br />V</strong> : isArticles ? <strong>IL<br />LA</strong> : isWordCategories ? <strong>A<br />B</strong> : isNaming ? <MousePointer2 /> : isQuantity ? <strong>1<br />2</strong> : exercise.recognitionMode === "random" ? <Sparkles /> : prompt && <Artwork item={prompt} compact />}</div><div className="exercise-copy"><h3>{exercise.title}</h3><small>{exercise.ownerAdultId ? "di " + therapistName(exercise.ownerAdultId) : "condiviso"}</small><p>{description}</p>{(kind === "recognition" || isSentence) && <small>Pronuncia {isSentence || (exercise.autoPronounce ?? exercise.presentation === "words") ? "automatica" : "manuale"}</small>}</div>{activeSequence && <button type="button" className={`sequence-toggle ${included ? "included" : ""}`} onClick={() => included && !onEditStep ? removeStep(includedSlots[0]) : onAddToSequence(exercise.id)} title={onEditStep && included ? "Aggiungi un’altra copia alla sequenza" : includedSlots.length > 1 ? "Per rimuovere una delle occorrenze, scegli la riga nella sequenza" : undefined} disabled={!canEditActiveSequence || (!onEditStep && includedSlots.length > 1)} aria-pressed={onEditStep ? undefined : included}>{included ? <><Check />{onEditStep ? "Nella sequenza · Aggiungi ancora" : "Nella sequenza"}</> : <><Plus />Aggiungi</>}</button>}<div className="exercise-actions"><button onClick={() => onTry(exercise.id)}>Prova</button><button onClick={() => onShareExercise(exercise)} aria-label={`Condividi ${exercise.title}`} title="Condividi"><Share2 /></button><button onClick={() => onEdit(exercise)} aria-label={`Modifica ${exercise.title}`} title="Modifica"><Pencil /></button><button onClick={() => onDuplicate(exercise)} aria-label={`Duplica ${exercise.title}`} title="Duplica"><Copy /></button><button className="delete" onClick={() => onDelete(exercise)} aria-label={`Elimina ${exercise.title}`} title="Elimina"><Trash2 /></button></div></article>; })}</div>
    {sharedLinksOpen && <SharedLinksDialog onClose={() => setSharedLinksOpen(false)} />}
  </div>;
}
