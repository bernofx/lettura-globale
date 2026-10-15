"use client";

import { BarChart3, BookOpenCheck, Check, ChevronRight, CircleHelp, Cloud, FolderHeart, Home, ImagePlus, Library, Menu, MousePointer2, Play, Plus, Search, Settings, Sparkles, Upload, UserRound, X } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type View = "home" | "library" | "exercises" | "session" | "stats";
type Mode = "teaching" | "test";
type LibraryItem = { id: string; word: string; emoji?: string; image?: string; category: string; source: string; license: string; author: string; privateUpload?: boolean };
type Exercise = { id: string; title: string; promptId: string; optionIds: string[]; updatedAt: string };
type Sequence = { id: string; title: string; exerciseIds: string[] };
type Attempt = { id: string; exerciseId: string; answerId: string; correct: boolean; firstAttempt: boolean; mode: Mode; createdAt: string };
type HelpEvent = { id: string; exerciseId: string; label: string; createdAt: string };

const stockItems: LibraryItem[] = [
  { id: "mela", word: "Mela", emoji: "🍎", category: "Cibo", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "gatto", word: "Gatto", emoji: "🐈", category: "Animali", source: "Catalogo demo", license: "CC BY-SA demo", author: "OpenMoji demo" },
  { id: "pane", word: "Pane", emoji: "🍞", category: "Cibo", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "casa", word: "Casa", emoji: "🏠", category: "Luoghi", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "palla", word: "Palla", emoji: "⚽", category: "Giochi", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "sole", word: "Sole", emoji: "☀️", category: "Natura", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "auto", word: "Auto", emoji: "🚗", category: "Trasporti", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "fiore", word: "Fiore", emoji: "🌼", category: "Natura", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
];
const initialExercises: Exercise[] = [
  { id: "ex-mela", title: "Trova la mela", promptId: "mela", optionIds: ["mela", "gatto", "pane"], updatedAt: "Oggi" },
  { id: "ex-gatto", title: "Trova il gatto", promptId: "gatto", optionIds: ["gatto", "casa", "palla"], updatedAt: "Oggi" },
  { id: "ex-pane", title: "Trova il pane", promptId: "pane", optionIds: ["pane", "mela", "sole"], updatedAt: "Ieri" },
];
const initialSequences: Sequence[] = [{ id: "seq-prime", title: "Prime parole", exerciseIds: ["ex-mela", "ex-gatto", "ex-pane"] }];
const helpTypes = ["Indicazione verbale", "Gesto", "Riduci le opzioni", "Evidenzia", "Dimostrazione"];

function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const loaded = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const saved = localStorage.getItem(key); if (saved) setValue(JSON.parse(saved) as T); } catch { /* storage can be unavailable */ }
      loaded.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key]);
  useEffect(() => { if (!loaded.current) return; try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* keep the prototype usable */ } }, [key, value]);
  return [value, setValue] as const;
}

function Artwork({ item, compact = false }: { item: LibraryItem; compact?: boolean }) {
  if (item.image) return <img className="artwork-image" src={item.image} alt={item.word} />;
  return <span className={compact ? "artwork-emoji compact" : "artwork-emoji"} aria-hidden="true">{item.emoji}</span>;
}

export default function HomePage() {
  const [view, setView] = useState<View>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [library, setLibrary] = useStoredState<LibraryItem[]>("lg-library", stockItems);
  const [exercises, setExercises] = useStoredState<Exercise[]>("lg-exercises", initialExercises);
  const [sequences, setSequences] = useStoredState<Sequence[]>("lg-sequences", initialSequences);
  const [attempts, setAttempts] = useStoredState<Attempt[]>("lg-attempts", []);
  const [helps, setHelps] = useStoredState<HelpEvent[]>("lg-helps", []);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [sessionMode, setSessionMode] = useState<Mode>("test");
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [answerState, setAnswerState] = useState<"idle" | "wrong" | "correct">("idle");
  const [currentAttempts, setCurrentAttempts] = useState(0);

  const activeSequence = sequences[0] ?? initialSequences[0];
  const sessionExercises = activeSequence.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is Exercise => Boolean(exercise));
  const currentExercise = sessionExercises[sessionIndex] ?? sessionExercises[0];
  const promptItem = library.find((item) => item.id === currentExercise?.promptId);
  const firstAttempts = attempts.filter((attempt) => attempt.firstAttempt);
  const firstCorrect = firstAttempts.filter((attempt) => attempt.correct).length;
  const accuracy = firstAttempts.length ? Math.round((firstCorrect / firstAttempts.length) * 100) : 0;

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2600); };
  const navigate = (next: View) => { setView(next); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const startSession = () => { setSessionIndex(0); setCurrentAttempts(0); setAnswerState("idle"); setSessionActive(true); setView("session"); };
  const chooseAnswer = (answerId: string) => {
    if (!currentExercise || answerState === "correct") return;
    const correct = answerId === currentExercise.promptId;
    setAttempts((current) => [...current, { id: crypto.randomUUID(), exerciseId: currentExercise.id, answerId, correct, firstAttempt: currentAttempts === 0, mode: sessionMode, createdAt: new Date().toISOString() }]);
    setCurrentAttempts((count) => count + 1);
    setAnswerState(correct ? "correct" : "wrong");
  };
  const addHelp = (label: string) => {
    if (!currentExercise) return;
    setHelps((current) => [...current, { id: crypto.randomUUID(), exerciseId: currentExercise.id, label, createdAt: new Date().toISOString() }]);
    notify(`Aiuto registrato: ${label}`);
  };
  const nextExercise = () => {
    if (sessionIndex >= sessionExercises.length - 1) { setSessionActive(false); setAnswerState("idle"); notify("Sessione completata e salvata"); setView("stats"); return; }
    setSessionIndex((index) => index + 1); setCurrentAttempts(0); setAnswerState("idle");
  };

  return (
    <div className="app-shell">
      <Sidebar view={view} onNavigate={navigate} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="main-content">
        <Topbar onMenu={() => setMenuOpen(true)} />
        {view === "home" && <Dashboard libraryCount={library.length} exerciseCount={exercises.length} accuracy={accuracy} attemptCount={firstAttempts.length} onStart={startSession} onNavigate={navigate} />}
        {view === "library" && <LibraryView items={library} search={search} setSearch={setSearch} onUpload={() => setShowUpload(true)} />}
        {view === "exercises" && <ExercisesView exercises={exercises} sequences={sequences} library={library} onBuild={() => setShowBuilder(true)} onStart={startSession} />}
        {view === "session" && <SessionView active={sessionActive} mode={sessionMode} setMode={setSessionMode} currentIndex={sessionIndex} total={sessionExercises.length} exercise={currentExercise} prompt={promptItem} library={library} answerState={answerState} onChoose={chooseAnswer} onHelp={addHelp} onStart={startSession} onNext={nextExercise} />}
        {view === "stats" && <StatsView attempts={attempts} helps={helps} exercises={exercises} library={library} />}
      </main>
      {showUpload && <UploadDialog onClose={() => setShowUpload(false)} onSave={(item) => { setLibrary((current) => [item, ...current]); setShowUpload(false); notify("Immagine privata aggiunta alla libreria"); }} />}
      {showBuilder && <ExerciseBuilder library={library} onClose={() => setShowBuilder(false)} onSave={(exercise) => { setExercises((current) => [exercise, ...current]); setSequences((current) => current.length ? [{ ...current[0], exerciseIds: [...current[0].exerciseIds, exercise.id] }, ...current.slice(1)] : [{ id: crypto.randomUUID(), title: "La mia sequenza", exerciseIds: [exercise.id] }]); setShowBuilder(false); notify("Esercizio salvato e aggiunto alla sequenza"); }} />}
      {toast && <div className="toast" role="status"><Check size={18} />{toast}</div>}
    </div>
  );
}

const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Oggi", icon: Home }, { id: "library", label: "Libreria", icon: Library }, { id: "exercises", label: "Esercizi", icon: BookOpenCheck }, { id: "session", label: "Sessione", icon: Play }, { id: "stats", label: "Progressi", icon: BarChart3 },
];

function Sidebar({ view, onNavigate, open, onClose }: { view: View; onNavigate: (view: View) => void; open: boolean; onClose: () => void }) {
  return <>{open && <button className="sidebar-backdrop" onClick={onClose} aria-label="Chiudi menu" />}<aside className={`sidebar ${open ? "open" : ""}`}><div className="brand"><span className="brand-mark"><Sparkles size={21} /></span><span>Lettura<br /><strong>Globale</strong></span></div><nav aria-label="Navigazione principale">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => onNavigate(id)}><Icon size={20} strokeWidth={2} /><span>{label}</span></button>)}</nav><div className="sidebar-note"><span className="status-dot" /><div><strong>Dati locali</strong><small>Prototipo privato</small></div></div><button className="profile-card"><span className="avatar">GB</span><span><strong>Adulto</strong><small>Terapista</small></span><Settings size={17} /></button></aside></>;
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  return <header className="topbar"><button className="icon-button menu-button" onClick={onMenu} aria-label="Apri menu"><Menu /></button><div className="child-pill"><span className="child-avatar">L</span><span><small>Profilo attivo</small><strong>Luca</strong></span><ChevronRight size={16} /></div><div className="topbar-right"><span className="private-pill"><Cloud size={15} />Salvataggio locale</span><button className="icon-button" aria-label="Profilo adulto"><UserRound /></button></div></header>;
}

function Dashboard({ libraryCount, exerciseCount, accuracy, attemptCount, onStart, onNavigate }: { libraryCount: number; exerciseCount: number; accuracy: number; attemptCount: number; onStart: () => void; onNavigate: (view: View) => void }) {
  return <div className="page dashboard-page"><section className="welcome-row"><div><span className="eyebrow">MERCOLEDÌ, 15 OTTOBRE</span><h1>Buongiorno, Giulia</h1><p>Tutto è pronto per la prossima attività con Luca.</p></div><button className="primary-button" onClick={onStart}><Play size={19} fill="currentColor" />Avvia sessione</button></section><section className="hero-card"><div className="hero-copy"><span className="soft-label">ATTIVITÀ CONSIGLIATA</span><h2>Prime parole</h2><p>Una sequenza breve di 3 associazioni già pronta. Puoi scegliere gli aiuti durante l’attività.</p><div className="hero-meta"><span>3 esercizi</span><i /><span>~ 5 minuti</span><i /><span>Verifica</span></div><button onClick={onStart}>Inizia ora <ChevronRight size={18} /></button></div><div className="hero-art" aria-hidden="true"><div className="orbit one">A</div><div className="orbit two">🍎</div><div className="orbit three">Aa</div><div className="hero-sun"><Sparkles /></div></div></section><section className="metric-grid"><Metric icon={<MousePointer2 />} label="Primi tentativi" value={String(attemptCount)} detail="registrati senza correzioni" tone="lilac" /><Metric icon={<BarChart3 />} label="Accuratezza" value={`${accuracy}%`} detail="sui primi tentativi" tone="mint" /><Metric icon={<BookOpenCheck />} label="Esercizi pronti" value={String(exerciseCount)} detail="in 1 sequenza" tone="peach" /><Metric icon={<FolderHeart />} label="Parole in libreria" value={String(libraryCount)} detail="con immagini e licenze" tone="sky" /></section><section className="two-columns"><div className="panel"><div className="panel-heading"><div><span className="eyebrow">ACCESSO RAPIDO</span><h3>Prepara la prossima attività</h3></div></div><div className="quick-list"><Quick icon={<ImagePlus />} title="Aggiungi una parola" detail="Carica un’immagine privata" onClick={() => onNavigate("library")} /><Quick icon={<BookOpenCheck />} title="Crea un esercizio" detail="Scegli parola e alternative" onClick={() => onNavigate("exercises")} /><Quick icon={<BarChart3 />} title="Guarda i progressi" detail="Primi tentativi e aiuti" onClick={() => onNavigate("stats")} /></div></div><div className="panel calm-panel"><div className="calm-icon"><CircleHelp /></div><h3>L’adulto resta al comando</h3><p>In Lettura Globale nessun aiuto parte in automatico. Durante ogni prova sei tu a decidere se e come intervenire.</p><button onClick={() => onNavigate("session")}>Scopri la sessione <ChevronRight size={17} /></button></div></section></div>;
}

function Metric({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: string }) { return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>; }
function Quick({ icon, title, detail, onClick }: { icon: React.ReactNode; title: string; detail: string; onClick: () => void }) { return <button className="quick-item" onClick={onClick}><span>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight size={18} /></button>; }

function LibraryView({ items, search, setSearch, onUpload }: { items: LibraryItem[]; search: string; setSearch: (value: string) => void; onUpload: () => void }) {
  const filtered = items.filter((item) => `${item.word} ${item.category}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="page"><section className="page-title-row"><div><span className="eyebrow">CONTENUTI</span><h1>Libreria parole</h1><p>Scegli le immagini da usare negli esercizi.</p></div><button className="primary-button" onClick={onUpload}><Upload size={18} />Carica immagine</button></section><div className="toolbar"><label className="search-box"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca parola o categoria…" /></label><div className="filter-chip">Tutte <span>{items.length}</span></div><div className="provider-note"><Sparkles size={16} />Catalogo demo autorizzato</div></div><div className="library-grid">{filtered.map((item) => <article className="library-card" key={item.id}><div className="library-art"><Artwork item={item} />{item.privateUpload && <span className="private-badge">Privata</span>}</div><div className="library-copy"><span className="category">{item.category}</span><h3>{item.word}</h3><p>{item.source} · {item.license}</p><small>Autore: {item.author}</small></div><button className="card-menu" aria-label={`Opzioni per ${item.word}`}>•••</button></article>)}</div>{!filtered.length && <div className="empty-state"><Search /><h3>Nessun risultato</h3><p>Prova un’altra parola o aggiungi una nuova immagine.</p></div>}</div>;
}

function ExercisesView({ exercises, sequences, library, onBuild, onStart }: { exercises: Exercise[]; sequences: Sequence[]; library: LibraryItem[]; onBuild: () => void; onStart: () => void }) {
  return <div className="page"><section className="page-title-row"><div><span className="eyebrow">PROGRAMMAZIONE</span><h1>Esercizi e sequenze</h1><p>Prepara attività brevi, chiare e riutilizzabili.</p></div><button className="primary-button" onClick={onBuild}><Plus size={19} />Nuovo esercizio</button></section><section className="sequence-banner"><div className="sequence-symbol"><span>1</span><span>2</span><span>3</span></div><div><span className="soft-label">SEQUENZA PRONTA</span><h2>{sequences[0]?.title ?? "Prime parole"}</h2><p>{sequences[0]?.exerciseIds.length ?? 0} esercizi · aggiornata oggi</p></div><button onClick={onStart}><Play size={17} fill="currentColor" />Avvia</button></section><div className="section-heading"><div><h2>Esercizi singoli</h2><p>Ogni modifica futura manterrà intatto lo storico delle sessioni.</p></div><span>{exercises.length} totali</span></div><div className="exercise-list">{exercises.map((exercise, index) => { const prompt = library.find((item) => item.id === exercise.promptId); return <article className="exercise-row" key={exercise.id}><span className="exercise-number">{String(index + 1).padStart(2, "0")}</span><div className="tiny-art">{prompt && <Artwork item={prompt} compact />}</div><div className="exercise-copy"><h3>{exercise.title}</h3><p>Parola → immagine · {exercise.optionIds.length} opzioni</p></div><span className="ready-badge"><Check size={14} />Pronto</span><button className="ghost-button" onClick={onStart}>Prova</button></article>; })}</div></div>;
}

function SessionView({ active, mode, setMode, currentIndex, total, exercise, prompt, library, answerState, onChoose, onHelp, onStart, onNext }: { active: boolean; mode: Mode; setMode: (mode: Mode) => void; currentIndex: number; total: number; exercise?: Exercise; prompt?: LibraryItem; library: LibraryItem[]; answerState: "idle" | "wrong" | "correct"; onChoose: (id: string) => void; onHelp: (label: string) => void; onStart: () => void; onNext: () => void }) {
  if (!active || !exercise || !prompt) return <div className="page session-setup"><span className="session-big-icon"><Play /></span><span className="eyebrow">NUOVA SESSIONE</span><h1>Pronto per iniziare?</h1><p>Scegli la modalità. Potrai registrare gli aiuti in qualsiasi momento.</p><div className="mode-picker"><button className={mode === "teaching" ? "selected" : ""} onClick={() => setMode("teaching")}><Sparkles /><strong>Insegnamento</strong><small>Guida, mostra e ripeti</small></button><button className={mode === "test" ? "selected" : ""} onClick={() => setMode("test")}><BookOpenCheck /><strong>Verifica</strong><small>Misura il primo tentativo</small></button></div><button className="primary-button large" onClick={onStart}><Play fill="currentColor" />Avvia “Prime parole”</button></div>;
  return <div className="session-screen"><div className="session-header"><div><span className="mode-tag">{mode === "test" ? "Verifica" : "Insegnamento"}</span><strong>Prime parole</strong></div><div className="session-progress"><span>{currentIndex + 1} di {total}</span><div><i style={{ width: `${((currentIndex + 1) / total) * 100}%` }} /></div></div><button className="ghost-button" onClick={() => window.location.reload()}>Termina</button></div><div className="session-body"><p className="instruction">Scegli l’immagine corretta</p><h1>{prompt.word.toUpperCase()}</h1><div className="answer-grid">{exercise.optionIds.map((id) => { const item = library.find((entry) => entry.id === id); if (!item) return null; const isCorrect = id === exercise.promptId; return <button key={id} className={answerState === "correct" && isCorrect ? "answer-card correct" : "answer-card"} onClick={() => onChoose(id)}><Artwork item={item} /><span>{item.word}</span>{answerState === "correct" && isCorrect && <i><Check /></i>}</button>; })}</div>{answerState === "wrong" && <div className="feedback wrong"><span>Riproviamo insieme.</span><small>Il primo tentativo è stato registrato separatamente.</small></div>}{answerState === "correct" && <div className="feedback correct"><span>Ottimo!</span><button onClick={onNext}>{currentIndex === total - 1 ? "Concludi" : "Prossimo"}<ChevronRight /></button></div>}</div><aside className="help-dock"><div><CircleHelp /><span><strong>Aiuti dell’adulto</strong><small>Scegli solo quando serve</small></span></div><div className="help-actions">{helpTypes.map((help) => <button key={help} onClick={() => onHelp(help)}>{help}</button>)}</div></aside></div>;
}

function StatsView({ attempts, helps, exercises, library }: { attempts: Attempt[]; helps: HelpEvent[]; exercises: Exercise[]; library: LibraryItem[] }) {
  const first = attempts.filter((attempt) => attempt.firstAttempt); const firstCorrect = first.filter((attempt) => attempt.correct).length; const accuracy = first.length ? Math.round((firstCorrect / first.length) * 100) : 0; const teaching = attempts.filter((attempt) => attempt.mode === "teaching").length; const test = attempts.filter((attempt) => attempt.mode === "test").length;
  const rows = exercises.map((exercise) => { const item = library.find((entry) => entry.id === exercise.promptId); const itemFirst = first.filter((attempt) => attempt.exerciseId === exercise.id); const correct = itemFirst.filter((attempt) => attempt.correct).length; return { label: item?.word ?? exercise.title, total: itemFirst.length, percent: itemFirst.length ? Math.round(correct / itemFirst.length * 100) : 0 }; });
  return <div className="page"><section className="page-title-row"><div><span className="eyebrow">RISULTATI</span><h1>Progressi di Luca</h1><p>Dati descrittivi dell’attività, separati tra primo tentativo e correzioni.</p></div><button className="ghost-button" onClick={() => downloadCsv(attempts)}>Esporta CSV</button></section><section className="stats-strip"><div><small>Accuratezza al primo tentativo</small><strong>{accuracy}%</strong><span>su {first.length} prove</span></div><div><small>Aiuti registrati</small><strong>{helps.length}</strong><span>decisi dall’adulto</span></div><div><small>Modalità verifica</small><strong>{test}</strong><span>tentativi totali</span></div><div><small>Modalità insegnamento</small><strong>{teaching}</strong><span>tentativi totali</span></div></section><section className="stats-layout"><div className="panel chart-panel"><div className="panel-heading"><div><span className="eyebrow">PRIMO TENTATIVO</span><h3>Risultati per parola</h3></div><span className="legend"><i />Corretto</span></div><div className="bars">{rows.map((row) => <div className="bar-row" key={row.label}><span>{row.label}</span><div><i style={{ width: `${row.percent}%` }} /></div><strong>{row.total ? `${row.percent}%` : "—"}</strong></div>)}</div></div><div className="panel help-panel"><span className="eyebrow">AIUTI</span><h3>Interventi registrati</h3>{helps.length ? <div className="help-counts">{helpTypes.map((label) => { const count = helps.filter((help) => help.label === label).length; return count ? <div key={label}><span>{label}</span><strong>{count}</strong></div> : null; })}</div> : <div className="empty-mini"><CircleHelp /><p>Nessun aiuto registrato.</p><small>Comparirà qui quando l’adulto ne seleziona uno.</small></div>}</div></section><div className="data-note"><CircleHelp /><p><strong>Come leggere questi dati</strong><br />I risultati descrivono soltanto le attività registrate e non costituiscono una diagnosi o una raccomandazione terapeutica.</p></div></div>;
}

function UploadDialog({ onClose, onSave }: { onClose: () => void; onSave: (item: LibraryItem) => void }) {
  const [word, setWord] = useState(""); const [category, setCategory] = useState("Altro"); const [image, setImage] = useState<string | null>(null); const [rights, setRights] = useState(false); const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !file.type.startsWith("image/")) return; const reader = new FileReader(); reader.onload = () => setImage(String(reader.result)); reader.readAsDataURL(file); };
  const save = () => { if (!word.trim() || !image || !rights) return; onSave({ id: crypto.randomUUID(), word: word.trim(), image, category, source: "Upload privato", license: "Diritto d’uso dichiarato", author: "Utente", privateUpload: true }); };
  return <div className="modal-layer" role="dialog" aria-modal="true"><div className="modal"><button className="modal-close" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">NUOVA IMMAGINE</span><h2>Aggiungi alla libreria</h2><p>Il file resta nel browser in questa versione di prova.</p><button className={`drop-zone ${image ? "has-image" : ""}`} onClick={() => inputRef.current?.click()}>{image ? <img src={image} alt="Anteprima caricamento" /> : <><Upload /><strong>Scegli un’immagine</strong><small>JPG, PNG o WebP</small></>}<input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} /></button><label>Parola<input value={word} onChange={(event) => setWord(event.target.value)} placeholder="Es. Bicchiere" /></label><label>Categoria<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Cibo</option><option>Animali</option><option>Luoghi</option><option>Giochi</option><option>Natura</option><option>Altro</option></select></label><label className="check-line"><input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} />Confermo di avere il diritto di usare questa immagine.</label><div className="modal-actions"><button className="ghost-button" onClick={onClose}>Annulla</button><button className="primary-button" disabled={!word.trim() || !image || !rights} onClick={save}>Aggiungi immagine</button></div></div></div>;
}

function ExerciseBuilder({ library, onClose, onSave }: { library: LibraryItem[]; onClose: () => void; onSave: (exercise: Exercise) => void }) {
  const [promptId, setPromptId] = useState(library[0]?.id ?? ""); const [options, setOptions] = useState<string[]>(library.slice(0, 3).map((item) => item.id)); const prompt = library.find((item) => item.id === promptId); const toggle = (id: string) => setOptions((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 4 ? [...current, id] : current); const finalOptions = useMemo(() => Array.from(new Set([promptId, ...options])).slice(0, 4), [promptId, options]);
  const save = () => onSave({ id: crypto.randomUUID(), title: `Trova ${prompt?.word.toLowerCase() ?? "la parola"}`, promptId, optionIds: finalOptions, updatedAt: "Adesso" });
  return <div className="modal-layer" role="dialog" aria-modal="true"><div className="modal wide"><button className="modal-close" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">NUOVO ESERCIZIO</span><h2>Parola → immagine</h2><p>Scegli la parola corretta e almeno due alternative.</p><label>Parola da riconoscere<select value={promptId} onChange={(event) => { setPromptId(event.target.value); setOptions((current) => Array.from(new Set([event.target.value, ...current]))); }}>{library.map((item) => <option key={item.id} value={item.id}>{item.word}</option>)}</select></label><div className="builder-label">Immagini da mostrare <span>{finalOptions.length}/4</span></div><div className="builder-grid">{library.map((item) => <button key={item.id} className={finalOptions.includes(item.id) ? "selected" : ""} onClick={() => toggle(item.id)}><Artwork item={item} compact /><span>{item.word}</span>{finalOptions.includes(item.id) && <i><Check /></i>}</button>)}</div><div className="modal-actions"><button className="ghost-button" onClick={onClose}>Annulla</button><button className="primary-button" disabled={!promptId || finalOptions.length < 2} onClick={save}>Salva esercizio</button></div></div></div>;
}

function downloadCsv(attempts: Attempt[]) {
  const header = "data,esercizio,risposta,corretto,primo_tentativo,modalita"; const rows = attempts.map((item) => [item.createdAt, item.exerciseId, item.answerId, item.correct, item.firstAttempt, item.mode].join(",")); const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "lettura-globale-progressi.csv"; link.click(); URL.revokeObjectURL(url);
}
