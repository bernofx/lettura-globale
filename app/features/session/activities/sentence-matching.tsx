import { Check, Volume2 } from "lucide-react";
import { useContext, useEffect, useRef } from "react";
import { useUpdateState } from "../../../components/app-update";
import { usePointerDrop } from "../../../use-pointer-drop";
import { HelpDock, SessionTools } from "../session-chrome";
import { type SessionNavigationProps } from "../session-view";
import { Artwork } from "../../../shared/artwork";
import { speakWord } from "../../../shared/audio";
import { RewardActiveContext, useRemoteComponentCommand } from "../../../shared/hooks";
import { type Exercise, type LibraryItem, type Mode } from "../../../shared/types";
import { shuffled } from "../../../shared/utils";

export function SentenceMatchingSession({ previewLabel, mode, manualAdvance = false, currentIndex, total, exercise, prompt, library, answerState, wrongAnswerId, onChoose, onHelp, onNext, onExit, soundEffects, onToggleSound, canPrevious, canForward, onPrevious, onForward }: { previewLabel?: "Anteprima" | "Prova"; mode: Mode; manualAdvance?: boolean; currentIndex: number; total: number; exercise: Exercise; prompt: LibraryItem; library: LibraryItem[]; answerState: "idle" | "wrong" | "correct"; wrongAnswerId: string | null; onChoose: (id: string) => void; onHelp: (label: string, wordId?: string) => void; onNext: () => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void } & SessionNavigationProps) {
  const [optionIds, setOptionIds] = useUpdateState(`SentenceMatchingSession:${exercise.id}:${currentIndex}:optionIds`, () => exercise.sourceExerciseId ? exercise.optionIds : shuffled(exercise.optionIds));
  const rewardActive = useContext(RewardActiveContext);
  const sentenceDrag = usePointerDrop(answerState === "correct", onChoose);
  const onNextRef = useRef(onNext);
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);
  useRemoteComponentCommand((event) => { if (event.command === "shuffle") setOptionIds((current) => shuffled(current)); });
  useEffect(() => {
    if (answerState !== "correct" || manualAdvance || rewardActive) return;
    const timer = window.setTimeout(() => onNextRef.current(), 750);
    return () => window.clearTimeout(timer);
  }, [answerState, manualAdvance, rewardActive]);
  return <div className="session-screen sentence-matching-session">
    <div className="session-header">
      <div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">Frase → immagine</span><strong>{exercise.title}</strong></div>
      <div className="session-progress"><span>{currentIndex + 1} di {total}</span><div><i style={{ width: `${((currentIndex + 1) / total) * 100}%` }} /></div></div>
      <SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} protectedExit={!previewLabel} canPrevious={canPrevious} canForward={canForward} onPrevious={onPrevious} onForward={onForward} />
    </div>
    <div className="session-body">
      <button
        type="button"
        className={`sentence-prompt ${sentenceDrag.offset.active ? "pointer-dragging" : ""}`}
        style={sentenceDrag.offset.active ? { transform: `translate3d(${sentenceDrag.offset.x}px, ${sentenceDrag.offset.y}px, 0)` } : undefined}
        disabled={answerState === "correct"}
        onClick={(event) => {
          if (sentenceDrag.consumeDraggedClick()) { event.preventDefault(); return; }
          speakWord(prompt.word);
        }}
        onPointerDown={sentenceDrag.onPointerDown}
        onPointerMove={sentenceDrag.onPointerMove}
        onPointerUp={sentenceDrag.onPointerUp}
        onPointerCancel={sentenceDrag.onPointerCancel}
        aria-label={`${prompt.word}. Trascina la frase sull’immagine corretta oppure tocca per ascoltarla`}
      ><strong>{prompt.word}</strong><Volume2 /><small>Trascina sull’immagine giusta · tocca qui per riascoltare</small></button>
      <div className={`answer-grid sentence-answer-grid options-${optionIds.length}`}>{optionIds.map((id) => {
        const item = library.find((candidate) => candidate.id === id);
        if (!item) return null;
        const status = answerState === "correct" && id === prompt.id ? "correct" : wrongAnswerId === id ? "wrong" : "";
        return <button type="button" data-answer-id={id} aria-label={`Immagine: ${item.word}`} className={`answer-card sentence-answer-card ${status}`} disabled={answerState === "correct"} key={id} onClick={() => onChoose(id)}><span className="answer-art"><Artwork item={item} eager /></span>{status === "correct" && <i><Check /></i>}</button>;
      })}</div>
      {answerState === "wrong" && <div className="feedback wrong"><strong>Riprova</strong><small>Guarda bene chi compie l’azione e che cosa sta facendo.</small></div>}
      {answerState === "correct" && <div className="feedback correct"><span>Ben fatto!</span>{manualAdvance && <small>Il terapista passa al prossimo turno dal telefono.</small>}</div>}
    </div>
    {!previewLabel && <HelpDock onHelp={(label) => onHelp(label, prompt.id)} />}
  </div>;
}
