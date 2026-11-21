import { Check } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { pickCategoryRoundIds } from "../../../domain/activity-generation";
import { availableForWordCategories, wordCategoryNames } from "../../../domain/word-category-content";
import { useUpdateState } from "../../../components/app-update";
import { correctMatchSpeech } from "../../../domain/correct-match-feedback";
import { usePointerDrop } from "../../../use-pointer-drop";
import { HelpDock, SessionTools } from "../session-chrome";
import { type SessionNavigationProps } from "../session-view";
import { useCorrectMatchFeedback } from "../use-correct-match-feedback";
import { Artwork } from "../../../shared/artwork";
import { playFeedbackTone, speakWord } from "../../../shared/audio";
import { useRemoteComponentCommand } from "../../../shared/hooks";
import { type Exercise, type LibraryItem, type Mode } from "../../../shared/types";
import { shuffled } from "../../../shared/utils";

export function WordCategorySession({ previewLabel, exercise, library, mode, manualAdvance = false, currentIndex, total, onAttempt, onComplete, onHelp, onExit, soundEffects, onToggleSound, canPrevious, canForward, onPrevious, onForward }: { previewLabel?: "Anteprima" | "Prova"; exercise: Exercise; library: LibraryItem[]; mode: Mode; manualAdvance?: boolean; currentIndex: number; total: number; onAttempt: (itemId: string, answer: string, correct: boolean) => void; onComplete: () => void; onHelp: (label: string, wordId?: string) => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void } & SessionNavigationProps) {
  const categories = useMemo(() => wordCategoryNames(library, exercise.categoryNames ?? []), [exercise.categoryNames, library]);
  const [categoryOrder, setCategoryOrder] = useUpdateState(`WordCategorySession:${exercise.id}:${currentIndex}:categoryOrder`, () => shuffled(categories));
  const candidates = useMemo(() => availableForWordCategories(library).filter((item) => categories.includes(item.category)), [library, categories]);
  const [initialIds] = useUpdateState(`WordCategorySession:${exercise.id}:${currentIndex}:initialIds`, () => pickCategoryRoundIds(candidates, exercise.categoryItemIds, exercise.rounds ?? 6));
  const [remainingIds, setRemainingIds] = useUpdateState(`WordCategorySession:${exercise.id}:${currentIndex}:remainingIds`, initialIds);
  const [selectedId, setSelectedId] = useUpdateState<string | null>(`WordCategorySession:${exercise.id}:${currentIndex}:selectedId`, null);
  const [wrongId, setWrongId] = useUpdateState<string | null>(`WordCategorySession:${exercise.id}:${currentIndex}:wrongId`, null);
  const [wrongCategory, setWrongCategory] = useUpdateState<string | null>(`WordCategorySession:${exercise.id}:${currentIndex}:wrongCategory`, null);
  const [correctId, setCorrectId] = useUpdateState<string | null>(`WordCategorySession:${exercise.id}:${currentIndex}:correctId`, null);
  const [correctCategory, setCorrectCategory] = useUpdateState<string | null>(`WordCategorySession:${exercise.id}:${currentIndex}:correctCategory`, null);
  const [feedback, setFeedback] = useUpdateState(`WordCategorySession:${exercise.id}:${currentIndex}:feedback`, "");
  useEffect(() => {
    if (!wrongId) return;
    const timer = window.setTimeout(() => { setWrongId(null); setWrongCategory(null); }, 900);
    return () => window.clearTimeout(timer);
  }, [wrongId, setWrongId, setWrongCategory]);
  const currentId = remainingIds[0];
  const currentItem = candidates.find((item) => item.id === currentId);
  const completed = remainingIds.length === 0;
  const initialSpeechWord = !correctId && exercise.categorySpeakWord && soundEffects ? currentItem?.word : undefined;
  const initialSpokenId = useRef<string | null>(null);
  useEffect(() => {
    if (!initialSpeechWord || initialSpokenId.current === currentId) return;
    let cancel = () => {};
    const timer = window.setTimeout(() => { initialSpokenId.current = currentId; cancel = speakWord(initialSpeechWord); }, 200);
    return () => { window.clearTimeout(timer); cancel(); };
  }, [initialSpeechWord, currentId]);

  useCorrectMatchFeedback(correctId, correctMatchSpeech("word-categories", exercise.autoPronounce, library.find((item) => item.id === correctId)?.word ?? "", correctCategory ?? ""), manualAdvance, soundEffects, () => {
    if (remainingIds.length <= 1) onComplete();
    else {
      setRemainingIds((current) => current.filter((id) => id !== correctId));
      setCorrectId(null);
      setCorrectCategory(null);
    }
  });
  useRemoteComponentCommand((event) => {
    if (event.command !== "shuffle") return;
    setCategoryOrder((current) => shuffled(current));
    setSelectedId(null); setWrongId(null); setWrongCategory(null); setCorrectId(null); setCorrectCategory(null);
    setFeedback("Le categorie sono state rimescolate. Prova ancora.");
  });
  const place = (category: string, explicitId?: string) => {
    if (correctId) return;
    const itemId = explicitId ?? selectedId ?? currentId;
    if (!itemId) return;
    const item = candidates.find((candidate) => candidate.id === itemId);
    const correct = item?.category === category;
    onAttempt(itemId, category, correct);
    playFeedbackTone(correct ? "correct" : "wrong", soundEffects);
    if (correct) {
      setSelectedId(null); setWrongId(null); setWrongCategory(null);
      setCorrectId(itemId); setCorrectCategory(category);
      setFeedback("Giusto! La parola è nella categoria corretta.");
    } else {
      setSelectedId(null); setWrongId(itemId); setWrongCategory(category);
      setFeedback("Questa non è la categoria giusta. Riprova.");
    }
  };
  const categoryDrag = usePointerDrop(!currentId || Boolean(correctId), (category) => place(category, currentId), { selector: "[data-category]", dataKey: "category" });
  return <div className="session-screen article-session word-category-session"><div className="session-header"><div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">Parola → categoria</span><strong>{exercise.title}</strong></div><div className="session-progress"><span>{currentIndex + 1} di {total}</span><div><i style={{ width: `${((currentIndex + 1) / total) * 100}%` }} /></div></div><SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} protectedExit={!previewLabel} canPrevious={canPrevious} canForward={canForward} onPrevious={onPrevious} onForward={onForward} /></div><div className="article-body"><p className="instruction">Tocca la categoria corretta oppure trascina la parola nel box.</p>{completed ? <div className="article-complete"><span className="complete-check"><Check /></span><h2>Ottimo lavoro!</h2><p>Tutte le parole sono state classificate.</p><button className="primary-button large" onClick={onComplete}>{currentIndex === total - 1 ? (previewLabel ? "Chiudi" : "Concludi") : "Prossimo esercizio"}</button></div> : currentItem ? <><div className="word-category-tray"><button type="button" draggable={false} aria-pressed={selectedId === currentId} aria-label={`${currentItem.word}. Trascina la parola nella categoria corretta oppure tocca per selezionarla${wrongId === currentId ? ". Scelta errata" : ""}`} className={`word-category-card ${selectedId === currentId ? "selected" : ""} ${wrongId === currentId ? "wrong-return" : ""} ${correctId === currentId ? "correct" : ""} ${categoryDrag.offset.active ? "pointer-dragging" : ""}`} style={categoryDrag.offset.active ? { transform: `translate3d(${categoryDrag.offset.x}px, ${categoryDrag.offset.y}px, 0)` } : undefined} onClick={(event) => { if (categoryDrag.consumeDraggedClick()) { event.preventDefault(); return; } if (exercise.categorySpeakWord && !correctId) speakWord(currentItem.word); setSelectedId((current) => current === currentId ? null : currentId); }} onPointerDown={categoryDrag.onPointerDown} onPointerMove={categoryDrag.onPointerMove} onPointerUp={categoryDrag.onPointerUp} onPointerCancel={categoryDrag.onPointerCancel}>{exercise.categoryShowTargetImage && <span className="category-target-art"><Artwork item={currentItem} eager /></span>}<span>{currentItem.word.toLocaleUpperCase("it-IT")}</span>{correctId === currentId && <i className="choice-mark correct-mark"><Check /></i>}</button></div><div className={`article-boxes category-count-${categoryOrder.length}`}>{categoryOrder.map((category) => <button type="button" data-category={category} className={`article-dropbox word-category-box ${wrongCategory === category ? "wrong" : ""} ${correctCategory === category ? "correct" : ""}`} key={category} aria-label={`${category}${wrongCategory === category ? ". Scelta errata" : ""}`} onClick={() => place(category)}>{exercise.categoryShowSymbols && library.find((item) => item.id === exercise.categorySymbolIds?.[category]) && <span className="category-symbol-art"><Artwork item={library.find((item) => item.id === exercise.categorySymbolIds?.[category])!} eager /></span>}<span>{category.toLocaleUpperCase("it-IT")}</span><small>{correctCategory === category ? "Corretto" : "Tocca qui"}</small></button>)}</div><p className={wrongId ? "article-feedback wrong" : correctId ? "article-feedback correct" : "article-feedback"} role="status">{feedback}</p></> : <div className="feedback wrong" role="alert">Nessuna parola disponibile per queste categorie.</div>}</div>{!previewLabel && currentId && <HelpDock onHelp={(label) => onHelp(label, currentId)} />}</div>;
}
