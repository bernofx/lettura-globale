import { Check, X } from "lucide-react";
import { useContext, useEffect, useRef } from "react";
import { useUpdateState } from "../../../components/app-update";
import { usePointerDrop } from "../../../use-pointer-drop";
import { AnswerLabel, HelpDock, SessionTools } from "../session-chrome";
import { type SessionNavigationProps } from "../session-view";
import { Artwork } from "../../../shared/artwork";
import { speakWord } from "../../../shared/audio";
import { RewardActiveContext, useRemoteComponentCommand } from "../../../shared/hooks";
import { type Exercise, type LibraryItem, type Mode, type Presentation } from "../../../shared/types";
import { shuffled } from "../../../shared/utils";

export function RecognitionSession({ previewLabel, mode, manualAdvance = false, presentation, currentIndex, total, exercise, prompt, library, answerState, wrongAnswerId, onChoose, onHelp, onNext, onExit, soundEffects, onToggleSound, canPrevious, canForward, onPrevious, onForward }: { previewLabel?: "Anteprima" | "Prova"; mode: Mode; manualAdvance?: boolean; presentation: Presentation; currentIndex: number; total: number; exercise: Exercise; prompt: LibraryItem; library: LibraryItem[]; answerState: "idle" | "wrong" | "correct"; wrongAnswerId: string | null; onChoose: (id: string) => void; onHelp: (label: string, wordId?: string) => void; onNext: () => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void } & SessionNavigationProps) {
  const [optionIds, setOptionIds] = useUpdateState(`RecognitionSession:${exercise.id}:${currentIndex}:optionIds`, () => exercise.sourceExerciseId ? exercise.optionIds : shuffled(exercise.optionIds));
  const rewardActive = useContext(RewardActiveContext);
  const wordDrag = usePointerDrop(answerState === "correct", onChoose);
  const onNextRef = useRef(onNext);
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);
  useRemoteComponentCommand((event) => {
    if (event.command === "shuffle") setOptionIds((current) => shuffled(current));
  });
  useEffect(() => {
    if (answerState !== "correct") return;
    if (manualAdvance || rewardActive) return;
    let cancelled = false;
    let completionTimer: number | null = null;
    const timer = window.setTimeout(() => {
      if (presentation === "words") {
        speakWord(prompt.word, () => {
          if (cancelled) return;
          completionTimer = window.setTimeout(() => onNextRef.current(), 180);
        });
      } else {
        onNextRef.current();
      }
    }, presentation === "words" ? (soundEffects ? 360 : 120) : 750);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (completionTimer) window.clearTimeout(completionTimer);
    };
  }, [answerState, manualAdvance, presentation, prompt.word, soundEffects, rewardActive]);
  return <div className="session-screen recognition-session">
    <div className="session-header">
      <div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">{presentation === "images" ? "Foto + parole" : "Solo parole"}</span><strong>{exercise.title}</strong></div>
      <div className="session-progress"><span>{currentIndex + 1} di {total}</span><div><i style={{ width: `${((currentIndex + 1) / total) * 100}%` }} /></div></div>
      <SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} protectedExit={!previewLabel} canPrevious={canPrevious} canForward={canForward} onPrevious={onPrevious} onForward={onForward} />
    </div>
    <div className={`session-body ${presentation === "words" ? "words-session" : ""}`}>
      <p className="instruction">{presentation === "images" ? "Tocca l’immagine corretta oppure trascina la parola sopra l’immagine." : "Tocca la parola corretta oppure trascina la parola nel box."}</p>
      <button
        type="button"
        className={`draggable-word-prompt ${wordDrag.offset.active ? "pointer-dragging" : ""}`}
        style={wordDrag.offset.active ? { transform: `translate3d(${wordDrag.offset.x}px, ${wordDrag.offset.y}px, 0)` } : undefined}
        aria-label={`${prompt.word}. Trascina la parola sul box corretto oppure tocca per ascoltarla`}
        disabled={answerState === "correct"}
        onClick={(event) => {
          if (wordDrag.consumeDraggedClick()) { event.preventDefault(); return; }
          speakWord(prompt.word);
        }}
        onPointerDown={wordDrag.onPointerDown}
        onPointerMove={wordDrag.onPointerMove}
        onPointerUp={wordDrag.onPointerUp}
        onPointerCancel={wordDrag.onPointerCancel}
      ><strong>{prompt.word.toLocaleUpperCase("it-IT")}</strong><small>{presentation === "images" ? "Trascina sulle immagini" : "Trascina sulle parole · tocca per ascoltare"}</small></button>
      <div className={`answer-grid options-${optionIds.length}`}>{optionIds.map((id) => {
        const item = library.find((entry) => entry.id === id);
        if (!item) return null;
        const isCorrect = id === exercise.promptId;
        const isWrong = wrongAnswerId === id;
        return <button key={id} data-answer-id={id} aria-label={`${item.word}${isWrong ? ", risposta errata" : ""}`} className={`${answerState === "correct" && isCorrect ? "answer-card correct" : "answer-card"} ${isWrong ? "wrong" : ""} ${presentation === "words" ? "word-only" : ""}`} onClick={() => onChoose(id)}>{presentation === "images" && <div className="answer-art"><Artwork item={item} /></div>}<AnswerLabel word={item.word} wordOnly={presentation === "words"} />{answerState === "correct" && isCorrect && <i className="choice-mark correct-mark"><Check /></i>}{isWrong && <i className="choice-mark wrong-mark"><X /></i>}</button>;
      })}</div>
      {answerState === "wrong" && <div className="feedback wrong" role="status"><span>Riproviamo insieme.</span><small>{previewLabel ? "Questa prova non viene registrata." : "Il primo tentativo è stato registrato separatamente."}</small></div>}
      {answerState === "correct" && <div className="feedback correct auto-feedback" role="status"><span>{manualAdvance ? "Risposta registrata. Attendi l’adulto." : currentIndex === total - 1 ? (previewLabel ? "Attività completata" : "Sessione completata") : "Ottimo! Passiamo alla prossima parola…"}</span></div>}
    </div>
    {!previewLabel && <HelpDock onHelp={(label) => onHelp(label, prompt.id)} />}
  </div>;
}
