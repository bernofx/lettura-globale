import { useEffect, useState } from "react";
import { readExerciseDrafts } from "../../domain/exercise-draft-storage";
import { ConfirmDialog } from "../../shared/ui/modal";
import type { Exercise } from "../../shared/types";

export function RecoveredExerciseDrafts({ adultId, revision, onOpen }: {
  adultId: string; revision: number; onOpen: (exercise: Exercise) => void;
}) {
  const [entries, setEntries] = useState<ReturnType<typeof readExerciseDrafts>>([]);
  const [discard, setDiscard] = useState<(typeof entries)[number] | null>(null);
  useEffect(() => {
    const reload = () => {
      try { setEntries(readExerciseDrafts(localStorage, adultId)); }
      catch { /* Storage may be temporarily unavailable. Keep any visible drafts. */ }
    };
    reload();
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, [adultId, revision]);
  if (!entries.length) return null;
  return <section className="panel recovered-exercise-drafts" aria-labelledby="exercise-drafts-heading">
    <h2 id="exercise-drafts-heading">Bozze da verificare</h2>
    <p>Un esercizio è cambiato prima della sincronizzazione. Puoi confrontare la bozza di questo dispositivo con la versione aggiornata. Quando hai finito, puoi eliminare la bozza.</p>
    {entries.map(entry => <div key={entry.key}>
      <strong>{entry.exercise.title}</strong>
      <button type="button" className="ghost-button" onClick={() => onOpen(entry.exercise)} aria-label={`Rivedi la bozza di ${entry.exercise.title}`}>Rivedi</button>
      <button type="button" className="ghost-button" aria-label={`Elimina la bozza locale di ${entry.exercise.title}`} onClick={() => setDiscard(entry)}>Elimina bozza</button>
    </div>)}
    {discard && <ConfirmDialog labelledBy="discard-exercise-draft" eyebrow="Bozza locale" title={`Eliminare la bozza di “${discard.exercise.title}”?`}
      confirmLabel="Elimina bozza locale" onCancel={() => setDiscard(null)} onConfirm={() => {
        localStorage.removeItem(discard.key);
        setEntries(items => items.filter(item => item.key !== discard.key));
        setDiscard(null);
      }}><p>La versione salvata nel cloud resta disponibile.</p></ConfirmDialog>}
  </section>;
}
