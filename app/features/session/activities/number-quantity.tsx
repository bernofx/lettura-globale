import { Bug, Candy, Check, ChevronRight, Circle, CircleHelp, Volume2, X } from "lucide-react";
import { useCallback, useContext, useEffect, useRef } from "react";
import { useUpdateState } from "../../../components/app-update";
import { quantityAnswerId, type QuantityAnswerMethod, quantityIdleDecision, type QuantityObject, quantityObjectLabel, quantitySelectionDecision } from "../../../domain/quantity-exercise";
import { SessionTools } from "../session-chrome";
import { type SessionNavigationProps } from "../session-view";
import { playFeedbackTone, playQuantityTick, speakWord } from "../../../shared/audio";
import { RewardActiveContext, useLocalFallbackAdvance, useRemoteComponentCommand } from "../../../shared/hooks";
import { type Exercise, type Mode } from "../../../shared/types";

function QuantityObjectIcon({ object }: { object: QuantityObject }) {
  if (object === "candy") return <Candy />;
  if (object === "ladybug") return <Bug />;
  return <Circle fill="currentColor" />;
}

export function NumberQuantitySession({ previewLabel, exercise, mode, manualAdvance = false, currentIndex, total, onAttempt, onComplete, onHelp, onExit, soundEffects, onToggleSound, canPrevious, canForward, onPrevious, onForward }: { previewLabel?: "Anteprima" | "Prova"; exercise: Exercise; mode: Mode; manualAdvance?: boolean; currentIndex: number; total: number; onAttempt: (itemId: string, answer: string, correct: boolean) => void; onComplete: () => void; onHelp: (label: string, wordId?: string) => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void } & SessionNavigationProps) {
  const rewardActive = useContext(RewardActiveContext);
  const target = exercise.quantityTarget ?? exercise.quantityMin ?? 1;
  const object = exercise.quantityObject ?? (exercise.quantityObjectSet === "mixed" || !exercise.quantityObjectSet ? "candy" : exercise.quantityObjectSet);
  const itemId = `quantity:${exercise.id}:${target}`;
  const prompt = `Tocca ${target} ${quantityObjectLabel(object, target)}`;
  const errorless = exercise.quantityErrorless === true;
  const teachingFlow = mode === "teaching" || previewLabel === "Anteprima";
  const [selected, setSelected] = useUpdateState<Set<number>>(`NumberQuantitySession:${exercise.id}:${currentIndex}:selected`, () => new Set());
  const selectedRef = useRef<Set<number>>(selected);
  const [judgement, setJudgement] = useUpdateState<"correct" | "wrong" | null>(`NumberQuantitySession:${exercise.id}:${currentIndex}:judgement`, null);
  const idleTimer = useRef<number | null>(null);
  const progressFill = useRef<HTMLSpanElement>(null);
  const progressAnimation = useRef<Animation | null>(null);
  const resolving = useRef(Boolean(judgement));
  const speakPrompt = useCallback(() => speakWord(prompt), [prompt]);
  const completeRound = useCallback((correct: boolean, method: QuantityAnswerMethod, count = selected.size) => {
    if (rewardActive || judgement || resolving.current || (errorless && (!correct || count !== target))) return;
    resolving.current = true;
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    onAttempt(itemId, quantityAnswerId(target, count, method, crypto.randomUUID()), correct);
    playFeedbackTone(correct ? "correct" : "wrong", soundEffects);
    if (!errorless && !teachingFlow && !manualAdvance) { onComplete(); return; }
    setJudgement(correct ? "correct" : "wrong");
  }, [errorless, itemId, judgement, manualAdvance, onAttempt, onComplete, selected.size, soundEffects, target, teachingFlow, rewardActive, setJudgement]);
  const completeRoundRef = useRef(completeRound);
  useEffect(() => { completeRoundRef.current = completeRound; }, [completeRound]);
  useLocalFallbackAdvance(manualAdvance, Boolean(judgement) && !teachingFlow && !errorless, onComplete, 250);
  useEffect(() => { if (!rewardActive) return speakPrompt(); }, [speakPrompt, rewardActive]);
  useEffect(() => {
    if (rewardActive) return;
    const decision = judgement ? null : quantityIdleDecision(mode, selected.size, target, exercise.quantityAutoComplete ?? true, previewLabel === "Anteprima", exercise.quantityIdleSeconds ?? 3, errorless);
    if (!decision) return;
    const restartTimer = () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      progressAnimation.current?.cancel();
      progressAnimation.current = progressFill.current?.animate?.([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: decision.delayMs, fill: "forwards", easing: "linear" }) ?? null;
      idleTimer.current = window.setTimeout(() => {
        idleTimer.current = null;
        if (decision.autoResolve) completeRoundRef.current(decision.correct, decision.method);
      }, decision.delayMs);
    };
    window.addEventListener("pointerdown", restartTimer);
    window.addEventListener("keydown", restartTimer);
    restartTimer();
    return () => {
      window.removeEventListener("pointerdown", restartTimer);
      window.removeEventListener("keydown", restartTimer);
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      idleTimer.current = null;
      progressAnimation.current?.cancel();
      progressAnimation.current = null;
    };
  }, [errorless, exercise.quantityAutoComplete, exercise.quantityIdleSeconds, judgement, mode, previewLabel, selected.size, target, rewardActive]);
  useEffect(() => () => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    progressAnimation.current?.cancel();
  }, []);
  const retry = () => {
    if (errorless && resolving.current) return;
    selectedRef.current = new Set();
    setSelected(selectedRef.current);
    setJudgement(null);
    resolving.current = false;
  };
  useRemoteComponentCommand((event) => {
    if (event.command === "mark_correct") completeRound(true, "adult");
    if (event.command === "mark_wrong") completeRound(false, "adult");
    if (event.command === "retry") retry();
  });
  const toggle = (index: number) => {
    const decision = quantitySelectionDecision(selectedRef.current, index, target, errorless, Boolean(judgement) || resolving.current);
    if (!decision) return;
    selectedRef.current = decision.selected;
    setSelected(decision.selected);
    playQuantityTick(decision.willSelect, soundEffects);
    if (exercise.quantitySpeakNumbers && decision.spokenNumber !== null) speakWord(String(decision.spokenNumber));
    if (decision.correct) completeRound(true, "selection", decision.selected.size);
  };
  return <div className="session-screen quantity-session">
    <div className="session-header"><div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">Numero quantità</span>{errorless && <span className="mode-tag">Apprendimento senza errori</span>}<strong>{exercise.title}</strong></div><div className="session-progress"><span>{currentIndex + 1} di {total}</span><div><i style={{ width: `${((currentIndex + 1) / total) * 100}%` }} /></div></div><SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} protectedExit={!previewLabel} canPrevious={canPrevious} canForward={canForward} onPrevious={onPrevious} onForward={onForward} /></div>
    <div className="quantity-body"><div className="quantity-prompt"><button type="button" className="listen-button" onClick={speakPrompt}><Volume2 /><span><strong>{prompt}</strong><small>Tocca per riascoltare</small></span></button><div className="quantity-count" aria-live="polite"><span>Obiettivo</span><strong>{target}</strong><small>{selected.size} selezionati</small></div></div><div className={`quantity-field ${judgement ?? ""}`}>{Array.from({ length: 10 }, (_, index) => <button type="button" key={index} className={selected.has(index) ? "selected" : ""} onClick={() => toggle(index)} disabled={Boolean(judgement)} aria-pressed={selected.has(index)} aria-label={`${quantityObjectLabel(object, 1)} ${index + 1}${selected.has(index) ? ", selezionata" : ""}`} style={{ "--quantity-offset": `${((index * 17) % 11) - 5}px`, "--quantity-rotate": `${((index * 29) % 18) - 9}deg` } as React.CSSProperties}><QuantityObjectIcon object={object} />{selected.has(index) && <i><Check /></i>}</button>)}{judgement && <i className={`quantity-result-mark ${judgement === "correct" ? "correct-mark" : "wrong-mark"}`} role="status" aria-label={judgement === "correct" ? "Numero corretto" : "Numero errato"}>{judgement === "correct" ? <Check /> : <X />}</i>}</div>{quantityIdleDecision(mode, selected.size, target, exercise.quantityAutoComplete ?? true, previewLabel === "Anteprima", exercise.quantityIdleSeconds ?? 3, errorless) && !judgement && <div className="quantity-time" aria-label={`Tempo di inattività: ${exercise.quantityIdleSeconds ?? 3} secondi`}><div className="quantity-time-track" aria-hidden="true"><span ref={progressFill} /></div></div>}<div className="quantity-controls">{judgement && (teachingFlow || errorless) ? <>{judgement === "wrong" && <button type="button" className="ghost-button" onClick={retry}>Riprova</button>}<button type="button" className="primary-button quantity-continue" onClick={onComplete}><ChevronRight />Continua</button></> : <><button type="button" className="ghost-button" onClick={() => onHelp("Indicazione verbale", itemId)} disabled={Boolean(judgement)}><CircleHelp />Aiuto</button>{errorless ? <span className="data-note">Apprendimento senza errori: raggiungi la quantità richiesta, poi premi Continua.</span> : <><button type="button" className="naming-wrong" onClick={() => completeRound(false, "adult")} disabled={Boolean(judgement)}><X />Numero errato</button><button type="button" className="naming-correct" onClick={() => completeRound(selected.size === target, "adult")} disabled={Boolean(judgement)}><Check />Numero corretto</button></>}</>}</div>
  </div></div>;
}
