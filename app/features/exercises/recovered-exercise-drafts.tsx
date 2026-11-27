import { useEffect, useState } from "react";
import { readExerciseDrafts, sequenceDrafts } from "../../domain/exercise-draft-storage";
import { canRestoreStepOrder } from "../../domain/sequence-step-merge";
import { canAccessSequence, canEditSequence } from "../../domain/sequence-access";
import { ConfirmDialog } from "../../shared/ui/modal";
import type { Exercise, Sequence } from "../../shared/types";

type Entry = { key: string; title: string } & (
  { exercise: Exercise } | { sequence: ReturnType<typeof sequenceDrafts.read>[number]["draft"] }
);

export function RecoveredExerciseDrafts({ adultId, revision, onOpen, sequences, exercises, onSelectSequence, role, copyEditorReady, onRestore }: {
  adultId: string; revision: number; onOpen: (exercise: Exercise) => void;
  sequences: Sequence[]; exercises: Exercise[]; onSelectSequence: (id: string) => void; role: string; copyEditorReady: boolean; onRestore: (reviewed: Sequence, order: string[]) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [discard, setDiscard] = useState<Entry | null>(null);
  useEffect(() => {
    const reload = () => {
      try {
        setEntries([
          ...readExerciseDrafts(localStorage, adultId).map(entry => ({ ...entry, title: entry.exercise.title })),
          ...sequenceDrafts.read(localStorage, adultId).map(({ key, draft }) => ({ key, sequence: draft, title: draft.title })),
        ]);
      } catch { /* Storage may be temporarily unavailable. Keep any visible drafts. */ }
    };
    reload();
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, [adultId, revision]);
  if (!entries.length) return null;
  return <section className="panel recovered-exercise-drafts" aria-labelledby="exercise-drafts-heading">
    <h2 id="exercise-drafts-heading">Bozze da verificare</h2>
    <p>Confronta le modifiche di questo dispositivo con la versione aggiornata. Quando hai finito, puoi eliminare la bozza.</p>
    {entries.map(entry => <div key={entry.key}>
      <strong>{entry.title}</strong>
      {"exercise" in entry
        ? <button type="button" className="ghost-button" onClick={() => onOpen(entry.exercise)} aria-label={`Rivedi la bozza di ${entry.title}`}>Rivedi</button>
        : <StepComparison draft={entry.sequence} current={sequences.find(seq => seq.id === entry.sequence.id)} exercises={exercises} onSelect={onSelectSequence} onRestore={onRestore} adultId={adultId} role={role} copyEditorReady={copyEditorReady} />}
      <button type="button" className="ghost-button" aria-label={`Elimina la bozza locale di ${entry.title}`} onClick={() => setDiscard(entry)}>Elimina bozza</button>
    </div>)}
    {discard && <ConfirmDialog labelledBy="discard-exercise-draft" eyebrow="Bozza locale" title={`Eliminare la bozza di “${discard.title}”?`}
      confirmLabel="Elimina bozza locale" onCancel={() => setDiscard(null)} onConfirm={() => {
        localStorage.removeItem(discard.key);
        setEntries(items => items.filter(item => item.key !== discard.key));
        setDiscard(null);
      }}><p>La versione salvata nel cloud resta disponibile.</p></ConfirmDialog>}
  </section>;
}

function StepComparison({ draft, current, exercises, onSelect, onRestore, adultId, role, copyEditorReady }: {
  draft: ReturnType<typeof sequenceDrafts.read>[number]["draft"]; current?: Sequence; exercises: Exercise[]; onSelect: (id: string) => void;
  onRestore: (reviewed: Sequence, order: string[]) => void; adultId: string; role: string; copyEditorReady: boolean;
}) {
  const draftIds = draft.steps.map(step => step.id);
  const titles = new Map(exercises.map(item => [item.id, item.title]));
  return <details className="sequence-draft-comparison">
    <summary>Confronta i passi di {draft.title}</summary>
    <h3>La tua bozza</h3>
    <StepList titles={draft.steps.map(step => step.title)} />
    <h3>Sequenza aggiornata</h3>
    {current ? <>
      <StepList titles={current.exerciseIds.map(id => titles.get(id) ?? "Esercizio non disponibile")} />
      {(copyEditorReady ? canAccessSequence : canEditSequence)(current.therapistId, adultId, role) && canRestoreStepOrder(current.exerciseIds, draftIds) &&
        <button type="button" className="primary-button" onClick={() => onRestore(current, draftIds)}>Usa l’ordine della bozza</button>}
      <button type="button" className="ghost-button" onClick={() => onSelect(current.id)}>Seleziona questa sequenza</button>
    </> : <p>La sequenza è stata rimossa o non è più accessibile.</p>}
  </details>;
}

function StepList({ titles }: { titles: string[] }) {
  return titles.length ? <ol>{titles.map((title, index) => <li key={index}>{title}</li>)}</ol> : <p>Nessun passo</p>;
}
