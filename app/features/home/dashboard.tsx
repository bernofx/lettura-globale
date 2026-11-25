import { BarChart3, BookOpenCheck, ChevronRight, CircleHelp, FolderHeart, ImagePlus, MousePointer2, Play } from "lucide-react";
import { WhatsNew } from "../../components/whats-new";
import { type ChildProfile, type Therapist, type View } from "../../shared/types";
import { PanelHeading } from "../../shared/ui/headings";

type ActiveSequenceSummary = { title: string; exerciseTitles: string[] };

type DashboardProps = {
  therapist: Therapist;
  child: ChildProfile;
  libraryCount: number;
  illustratedCount: number;
  exerciseCount: number;
  sequenceTotal: number;
  activeSequence?: ActiveSequenceSummary;
  accuracy: number;
  attemptCount: number;
  onStart: () => void;
  onNavigate: (view: View) => void;
};

export function Dashboard({ therapist, child, libraryCount, illustratedCount, exerciseCount, sequenceTotal, activeSequence, accuracy, attemptCount, onStart, onNavigate }: DashboardProps) {
  const sequenceLength = activeSequence?.exerciseTitles.length ?? 0;
  const minutes = Math.max(5, Math.round(sequenceLength * 1.5));
  const hasSequence = Boolean(activeSequence && sequenceLength);
  return <div className="page dashboard-page">
    <section className="welcome-row"><div><span className="eyebrow">AREA TERAPISTA</span><h1>Buongiorno, {therapist.firstName}</h1><p>Tutto è pronto per la prossima attività con {child.firstName}.</p></div></section>
    <WhatsNew />
    <section className={hasSequence ? "hero-card" : "hero-card hero-card-compact"} aria-labelledby="dashboard-next-title">
      <div className="hero-copy">
        <span className="soft-label">{hasSequence ? "SEQUENZA ATTIVA" : "PROSSIMA ATTIVITÀ"}</span>
        <h2 id="dashboard-next-title">{hasSequence ? activeSequence!.title : "Nessuna sequenza pronta"}</h2>
        <p>{hasSequence
          ? `Nella sessione scegli la modalità e avvii la sequenza con ${child.firstName}.`
          : "Puoi usare l’avvio rapido nella sessione oppure preparare una sequenza da riutilizzare."}</p>
        {hasSequence && <div className="hero-meta"><span>{sequenceLength} {sequenceLength === 1 ? "esercizio" : "esercizi"}</span><i /><span>circa {minutes} minuti</span></div>}
        <div className="hero-actions">
          <button type="button" onClick={onStart}><Play size={18} fill="currentColor" />Avvia sessione</button>
          {!hasSequence && <button type="button" className="hero-secondary" onClick={() => onNavigate("exercises")}>Crea una sequenza <ChevronRight size={18} /></button>}
        </div>
      </div>
      {hasSequence && <ol className="hero-sequence" aria-label="Esercizi della sequenza">
        {activeSequence!.exerciseTitles.slice(0, 4).map((title, index) => <li key={`${title}-${index}`}><span>{index + 1}</span>{title}</li>)}
        {sequenceLength > 4 && <li className="hero-sequence-more">+ altri {sequenceLength - 4}</li>}
      </ol>}
    </section>
    <section className="metric-grid">
      <Metric icon={<MousePointer2 />} label="Primi tentativi" value={String(attemptCount)} detail={`registrati per ${child.firstName}`} tone="lilac" />
      <Metric icon={<BarChart3 />} label="Accuratezza" value={attemptCount ? `${accuracy}%` : "—"} detail={attemptCount ? "sui primi tentativi" : "nessun tentativo ancora"} tone="mint" />
      <Metric icon={<BookOpenCheck />} label="Esercizi pronti" value={String(exerciseCount)} detail={sequenceTotal === 1 ? "1 sequenza salvata" : `${sequenceTotal} sequenze salvate`} tone="peach" />
      <Metric icon={<FolderHeart />} label="Parole in libreria" value={String(libraryCount)} detail={`${illustratedCount} con immagine`} tone="sky" />
    </section>
    <section className="two-columns">
      <div className="panel"><PanelHeading level={3} eyebrow="ACCESSO RAPIDO" title="Prepara la prossima attività" /><div className="quick-list">
        <Quick icon={<ImagePlus />} title="Aggiungi parola o foto" detail="Dalla Libreria, anche foto del dispositivo" onClick={() => onNavigate("library")} />
        <Quick icon={<BookOpenCheck />} title="Crea un esercizio" detail="Scegli parola e alternative" onClick={() => onNavigate("exercises")} />
        <Quick icon={<BarChart3 />} title="Guarda i progressi" detail="Primi tentativi e aiuti" onClick={() => onNavigate("stats")} />
      </div></div>
      <div className="panel calm-panel"><div className="calm-icon"><CircleHelp /></div><h3>L’adulto resta al comando</h3><p>In Lettura Globale nessun aiuto parte in automatico. Durante ogni prova sei tu a decidere se e come intervenire.</p><button type="button" onClick={() => onNavigate("session")}>Scopri la sessione <ChevronRight size={17} /></button></div>
    </section>
  </div>;
}

function Metric({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: string }) { return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>; }

function Quick({ icon, title, detail, onClick }: { icon: React.ReactNode; title: string; detail: string; onClick: () => void }) { return <button type="button" className="quick-item" onClick={onClick}><span>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight size={18} /></button>; }
