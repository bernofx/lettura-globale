import { Check } from "lucide-react";
import { useEffect } from "react";
import { useUpdateState } from "../../../components/app-update";
import { articleFor } from "../../../domain/article-classification";
import { correctMatchSpeech } from "../../../domain/correct-match-feedback";
import { usePointerDrop } from "../../../use-pointer-drop";
import { HelpDock, SessionTools } from "../session-chrome";
import { type SessionNavigationProps } from "../session-view";
import { useCorrectMatchFeedback } from "../use-correct-match-feedback";
import { Artwork } from "../../../shared/artwork";
import { playFeedbackTone } from "../../../shared/audio";
import { type Article, type Exercise, type LibraryItem, type Mode } from "../../../shared/types";
import { shuffled } from "../../../shared/utils";

export function ArticleSortSession({ previewLabel, exercise, library, mode, manualAdvance = false, currentIndex, total, onAttempt, onComplete, onHelp, onExit, soundEffects, onToggleSound, canPrevious, canForward, onPrevious, onForward }: { previewLabel?: "Anteprima" | "Prova"; exercise: Exercise; library: LibraryItem[]; mode: Mode; manualAdvance?: boolean; currentIndex: number; total: number; onAttempt: (itemId: string, answer: string, correct: boolean) => void; onComplete: () => void; onHelp: (label: string, wordId?: string) => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void } & SessionNavigationProps) {
  const [initialIds] = useUpdateState(`ArticleSortSession:${exercise.id}:${currentIndex}:initialIds`, () => shuffled((exercise.articleItemIds ?? []).filter((id) => library.some((item) => item.id === id && articleFor(item)))).slice(0, Math.max(1, exercise.rounds ?? 6)));
  const [remainingIds, setRemainingIds] = useUpdateState(`ArticleSortSession:${exercise.id}:${currentIndex}:remainingIds`, initialIds);
  const [selectedId, setSelectedId] = useUpdateState<string | null>(`ArticleSortSession:${exercise.id}:${currentIndex}:selectedId`, null);
  const [wrongId, setWrongId] = useUpdateState<string | null>(`ArticleSortSession:${exercise.id}:${currentIndex}:wrongId`, null);
  const [wrongArticle, setWrongArticle] = useUpdateState<Article | null>(`ArticleSortSession:${exercise.id}:${currentIndex}:wrongArticle`, null);
  const [correctId, setCorrectId] = useUpdateState<string | null>(`ArticleSortSession:${exercise.id}:${currentIndex}:correctId`, null);
  const [correctArticle, setCorrectArticle] = useUpdateState<Article | null>(`ArticleSortSession:${exercise.id}:${currentIndex}:correctArticle`, null);
  const [feedback, setFeedback] = useUpdateState(`ArticleSortSession:${exercise.id}:${currentIndex}:feedback`, "");
  useEffect(() => {
    if (!wrongId) return;
    const timer = window.setTimeout(() => { setWrongId(null); setWrongArticle(null); }, 900);
    return () => window.clearTimeout(timer);
  }, [wrongId, setWrongId, setWrongArticle]);
  useEffect(() => {
    remainingIds.slice(0, 3).forEach((id) => {
      const source = library.find((item) => item.id === id)?.image;
      if (!source) return;
      const preload = new window.Image();
      preload.decoding = "async";
      preload.src = source;
    });
  }, [remainingIds, library]);
  const place = (article: Article, explicitId?: string) => {
    if (correctId) return;
    const itemId = explicitId ?? selectedId ?? currentId;
    if (!itemId) return;
    const item = library.find((entry) => entry.id === itemId);
    const correct = Boolean(item && articleFor(item) === article);
    onAttempt(itemId, article, correct);
    playFeedbackTone(correct ? "correct" : "wrong", soundEffects);
    if (correct) {
      setSelectedId(null);
      setWrongId(null);
      setWrongArticle(null);
      setCorrectId(itemId);
      setCorrectArticle(article);
      setFeedback("Giusto! L’immagine è stata abbinata.");
    } else {
      setWrongId(itemId);
      setWrongArticle(article);
      setSelectedId(null);
      setFeedback("Non è il box giusto: l’immagine torna al suo posto.");
    }
  };
  const completed = remainingIds.length === 0;
  const currentId = remainingIds[0];
  const currentItem = library.find((entry) => entry.id === currentId);
  const articleDrag = usePointerDrop(!currentId || Boolean(correctId), (article) => {
    if (article === "IL" || article === "LA") place(article, currentId);
  }, { selector: "[data-article]", dataKey: "article" });
  useCorrectMatchFeedback(correctId, correctMatchSpeech("articles", exercise.autoPronounce, library.find((item) => item.id === correctId)?.word ?? "", correctArticle ?? ""), manualAdvance, soundEffects, () => {
    if (remainingIds.length <= 1) onComplete();
    else {
      setRemainingIds((current) => current.filter((id) => id !== correctId));
      setCorrectId(null);
      setCorrectArticle(null);
    }
  });
  return <div className="session-screen article-session">
    <div className="session-header">
      <div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">Categorie</span><strong>{exercise.title}</strong></div>
      <div className="session-progress"><span>{currentIndex + 1} di {total}</span><div><i style={{ width: `${((currentIndex + 1) / total) * 100}%` }} /></div></div>
      <SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} protectedExit={!previewLabel} canPrevious={canPrevious} canForward={canForward} onPrevious={onPrevious} onForward={onForward} />
    </div>
    <div className="article-body">
      <p className="instruction">Tocca l’articolo corretto oppure trascina l’immagine nel box.</p>
      <h1>IL O LA?</h1>
      {completed ? <div className="article-complete"><span className="complete-check"><Check /></span><h2>Ottimo lavoro!</h2><p>Tutte le immagini sono state abbinate.</p><button className="primary-button large" onClick={onComplete}>{currentIndex === total - 1 ? (previewLabel ? "Chiudi" : "Concludi") : "Prossimo esercizio"}</button></div> : currentItem ? <>
        <div className="article-tray single">
          <button
            type="button"
            draggable={false}
            aria-pressed={selectedId === currentId}
            aria-label={`Immagine ${currentItem.word}. Scegli IL o LA, oppure trascinala nel box${wrongId === currentId ? ". Scelta errata" : ""}`}
            className={`article-card ${selectedId === currentId ? "selected" : ""} ${wrongId === currentId ? "wrong-return" : ""} ${correctId === currentId ? "correct" : ""} ${articleDrag.offset.active ? "pointer-dragging" : ""}`}
            style={articleDrag.offset.active ? { transform: `translate3d(${articleDrag.offset.x}px, ${articleDrag.offset.y}px, 0)` } : undefined}
            onClick={(event) => {
              if (articleDrag.consumeDraggedClick()) { event.preventDefault(); return; }
              setSelectedId((current) => current === currentId ? null : currentId);
            }}
            onPointerDown={articleDrag.onPointerDown}
            onPointerMove={articleDrag.onPointerMove}
            onPointerUp={articleDrag.onPointerUp}
            onPointerCancel={articleDrag.onPointerCancel}
          >
            <div className="article-art"><Artwork key={currentItem.id} item={currentItem} eager /></div>
            <strong>{currentItem.word.toLocaleUpperCase("it-IT")}</strong>
            {correctId === currentId && <i className="choice-mark correct-mark"><Check /></i>}
          </button>
        </div>
        <div className="article-boxes">{(["IL", "LA"] as Article[]).map((article) => <button type="button" data-article={article} className={`article-dropbox ${wrongArticle === article ? "wrong" : ""} ${correctArticle === article ? "correct" : ""}`} key={article} aria-label={`Assegna ${currentItem.word} a ${article}${wrongArticle === article ? ". Scelta errata" : ""}`} onClick={() => place(article)}><span>{article}</span><small>{correctArticle === article ? "Corretto" : "Tocca qui"}</small></button>)}</div>
        <p className={wrongId ? "article-feedback wrong" : correctId ? "article-feedback correct" : "article-feedback"} role="status">{feedback}</p>
      </> : null}
    </div>
    {!previewLabel && currentId && <HelpDock onHelp={(label) => onHelp(label, currentId)} />}
  </div>;
}
