import { Check, CircleHelp, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useAppUpdating, useUpdateState } from "../../../components/app-update";
import { hasArtwork } from "../../../domain/library-availability";
import { SessionTools, SessionProgress } from "../session-chrome";
import { type SessionNavigationProps } from "../session-view";
import { Artwork } from "../../../shared/artwork";
import { playFeedbackTone } from "../../../shared/audio";
import { useLocalFallbackAdvance, useRemoteComponentCommand } from "../../../shared/hooks";
import { type Exercise, type LibraryItem, type Mode } from "../../../shared/types";
import { shuffled } from "../../../shared/utils";

export function NamingSession({ previewLabel, exercise, library, mode, manualAdvance = false, currentIndex, total, onAttempt, onComplete, onHelp, onExit, soundEffects, onToggleSound, canPrevious, canForward, onPrevious, onForward }: { previewLabel?: "Anteprima" | "Prova"; exercise: Exercise; library: LibraryItem[]; mode: Mode; manualAdvance?: boolean; currentIndex: number; total: number; onAttempt: (itemId: string, answer: string, correct: boolean) => void; onComplete: () => void; onHelp: (label: string, wordId?: string) => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void } & SessionNavigationProps) {
  const candidates = useMemo(() => {
    const allowedIds = exercise.namingItemIds?.length ? new Set(exercise.namingItemIds) : null;
    const categories = exercise.namingCategories?.length ? new Set(exercise.namingCategories) : null;
    return library.filter((item) => hasArtwork(item) && (!allowedIds || allowedIds.has(item.id)) && (!categories || categories.has(item.category)));
  }, [exercise.namingCategories, exercise.namingItemIds, library]);
  const [initialIds] = useUpdateState(`NamingSession:${exercise.id}:${currentIndex}:initialIds`, () => shuffled(candidates.map((item) => item.id)).slice(0, Math.max(1, exercise.rounds ?? 6)));
  const [remainingIds, setRemainingIds] = useUpdateState(`NamingSession:${exercise.id}:${currentIndex}:remainingIds`, initialIds);
  const [judgement, setJudgement] = useUpdateState<"correct" | "wrong" | null>(`NamingSession:${exercise.id}:${currentIndex}:judgement`, null);
  const advanceTimer = useRef<number | null>(null);
  const appUpdating = useAppUpdating();
  useEffect(() => { if (appUpdating && advanceTimer.current !== null) window.clearTimeout(advanceTimer.current); }, [appUpdating]);
  const preloadedImages = useRef(new Map<string, HTMLImageElement>());
  useEffect(() => () => { if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current); }, []);
  useEffect(() => {
    remainingIds.slice(0, 5).forEach((id) => {
      const source = library.find((item) => item.id === id)?.image;
      if (!source || preloadedImages.current.has(source)) return;
      const preload = new window.Image();
      preload.decoding = "async";
      preload.src = source;
      preloadedImages.current.set(source, preload);
      preload.decode?.().catch(() => undefined);
    });
  }, [remainingIds, library]);
  const currentId = remainingIds[0];
  const currentItem = library.find((item) => item.id === currentId);
  const completed = remainingIds.length === 0;
  useLocalFallbackAdvance(manualAdvance, Boolean(judgement), () => {
    if (remainingIds.length <= 1) onComplete();
    else {
      setRemainingIds((current) => current.filter((id) => id !== currentId));
      setJudgement(null);
    }
  }, 650);
  const judge = (correct: boolean, withHelp = false) => {
    if (!currentId || judgement) return;
    onAttempt(currentId, withHelp ? "CORRETTO_CON_AIUTO" : correct ? "CORRETTO" : "ERRATO", correct);
    if (withHelp) onHelp("Risposta aiutata", currentId);
    playFeedbackTone(correct ? "correct" : "wrong", soundEffects);
    setJudgement(correct ? "correct" : "wrong");
    if (manualAdvance) return;
    advanceTimer.current = window.setTimeout(() => {
      if (remainingIds.length <= 1) onComplete();
      else {
        setRemainingIds((current) => current.filter((id) => id !== currentId));
        setJudgement(null);
      }
    }, 650);
  };
  useRemoteComponentCommand((event) => {
    if (event.command === "mark_correct") judge(true);
    if (event.command === "mark_wrong") judge(false);
    if (event.command === "mark_helped") judge(true, true);
  });
  return <div className="session-screen naming-session">
    <div className="session-header">
      <div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">Mix and vary</span><strong>{exercise.title}</strong></div>
      <SessionProgress currentIndex={currentIndex} total={total} />
      <SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} protectedExit={!previewLabel} canPrevious={canPrevious} canForward={canForward} onPrevious={onPrevious} onForward={onForward} />
    </div>
    <div className="article-body naming-body">
      <p className="instruction">Chiedi al bambino di nominare ciò che vede, poi registra l’esito.</p>
      {completed ? <div className="article-complete"><span className="complete-check"><Check /></span><h2>Attività completata</h2><p>Tutte le immagini sono state valutate.</p><button className="primary-button large" onClick={onComplete}>{currentIndex === total - 1 ? (previewLabel ? "Chiudi" : "Concludi") : "Prossimo esercizio"}</button></div> : currentItem ? <>
        <div className={`naming-card ${judgement ?? ""}`} aria-label={`Immagine di ${currentItem.word}`}><Artwork item={currentItem} eager />{judgement && <i className={`choice-mark ${judgement === "correct" ? "correct-mark" : "wrong-mark"}`}>{judgement === "correct" ? <Check /> : <X />}</i>}</div>
        <div className="naming-controls"><div>
          <button className="naming-wrong" type="button" onClick={() => judge(false)} disabled={Boolean(judgement)}><X />Risposta errata</button>
          <button className="naming-helped" type="button" onClick={() => judge(true, true)} disabled={Boolean(judgement)}><CircleHelp />Corretto con aiuti</button>
          <button className="naming-correct" type="button" onClick={() => judge(true)} disabled={Boolean(judgement)}><Check />Risposta corretta</button>
        </div></div>
      </> : <div className="feedback wrong" role="alert">Nessuna immagine disponibile per questo esercizio.</div>}
    </div>
  </div>;
}
