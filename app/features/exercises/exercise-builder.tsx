import { applyExerciseForm } from "../../domain/sequence-exercise-editor";
import { Check, Save, Search, Settings, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { hasSameCategoryDistractors, recognitionTargetsFor } from "../../domain/activity-generation";
import { categoryImageError, type CategorySymbols } from "../../domain/category-images";
import { availableForWordCategories, wordCategoryNames } from "../../domain/word-category-content";
import { articleFor } from "../../domain/article-classification";
import { NumericField } from "../../components/numeric-field";
import { matchesSyllableFilter, type SyllableFilter } from "../../domain/syllabification";
import { availableForRecognition, hasArtwork } from "../../domain/library-availability";
import { type SessionActivity } from "../../domain/session-compilation";
import { type QuantityObjectSet } from "../../domain/quantity-exercise";
import { isSimpleSentenceScene, type SentenceDifficulty, sentenceMatchingAvailability, type SentenceOptionCount } from "../../domain/sentence-matching";
import { CategoryExerciseOptions, CorrectMatchPronunciation, QuantityLearningOptions, RecognitionPresentationFields, RecognitionRandomParameterFields } from "./exercise-fields";
import { FullTextItemPicker } from "../library/full-text-item-picker";
import { Artwork } from "../../shared/artwork";
import { type DistractorSource, type Exercise, type LibraryItem, type Presentation } from "../../shared/types";
import { Modal, ModalActions, ModalTitle } from "../../shared/ui/modal";
import { CheckLine } from "../../shared/ui/form-controls";

export function ExerciseBuilder({ editNotice, categorySymbols, kind, exercise, library, onClose, onSave }: { editNotice?: string; categorySymbols: CategorySymbols; kind: SessionActivity; exercise?: Exercise; library: LibraryItem[]; onClose: () => void; onSave: (exercise: Exercise) => void }) {
  const initialPresentation = exercise?.presentation ?? "images";
  const initialRecognitionLibrary = availableForRecognition(library, initialPresentation);
  const initialPromptId = exercise?.promptId ?? initialRecognitionLibrary[0]?.id ?? "";
  const [title, setTitle] = useState(exercise?.title ?? "");
  const [promptId, setPromptId] = useState(initialPromptId);
  const [options, setOptions] = useState<string[]>(exercise?.optionIds ?? initialRecognitionLibrary.slice(0, 3).map((item) => item.id));
  const [recognitionMode, setRecognitionMode] = useState<"fixed" | "random">(exercise?.recognitionMode ?? (exercise ? "fixed" : "random"));
  const [randomPromptMode, setRandomPromptMode] = useState<"random" | "fixed">(exercise?.recognitionMode === "random" && exercise.promptId ? "fixed" : "random");
  const [recognitionItemIds, setRecognitionItemIds] = useState<string[]>(exercise?.recognitionItemIds ?? []);
  const [targetIds, setTargetIds] = useState<string[]>(exercise?.recognitionMode === "random" && exercise.promptId ? recognitionTargetsFor(exercise) : []);
  const [recognitionCategories, setRecognitionCategories] = useState<string[]>(exercise?.recognitionCategories ?? []);
  const [recognitionSyllables, setRecognitionSyllables] = useState<SyllableFilter>(exercise?.recognitionSyllables ?? "all");
  const [namingItemIds, setNamingItemIds] = useState<string[]>(exercise?.namingItemIds ?? []);
  const [namingCategories, setNamingCategories] = useState<string[]>(exercise?.namingCategories ?? []);
  const [distractorCount, setDistractorCount] = useState<1 | 2 | 3 | 4>(exercise?.distractorCount ?? 3);
  const [distractorSource, setDistractorSource] = useState<DistractorSource>(exercise?.distractorSource ?? "mixed");
  const [exercisePresentation, setExercisePresentation] = useState<Presentation>(initialPresentation);
  const [autoPronounce, setAutoPronounce] = useState(exercise?.autoPronounce ?? exercise?.presentation === "words");
  const [itemSearch, setItemSearch] = useState("");
  const articleCandidates = useMemo(() => library.filter((item) => hasArtwork(item) && articleFor(item)), [library]);
  const [articleItemIds, setArticleItemIds] = useState<string[]>(exercise?.articleItemIds ?? articleCandidates.slice(0, 6).map((item) => item.id));
  const availableCategories = useMemo(() => kind === "word-categories" ? wordCategoryNames(library) : Array.from(new Set(library.filter((item) => !item.categorySymbolOnly).map((item) => item.category))).sort((a, b) => a.localeCompare(b, "it")), [kind, library]);
  const defaultCategoryNames = ["Cibi", "Animali", "Trasporti"].filter((category) => availableCategories.includes(category));
  const [categorySpeakWord, setCategorySpeakWord] = useState(exercise?.categorySpeakWord ?? false);
  const [categoryShowTargetImage, setCategoryShowTargetImage] = useState(exercise?.categoryShowTargetImage ?? false);
  const [categoryShowSymbols, setCategoryShowSymbols] = useState(exercise?.categoryShowSymbols ?? false);
  const [categoryNames, setCategoryNames] = useState<string[]>(() => wordCategoryNames(library, exercise?.categoryNames ?? defaultCategoryNames));
  const [categoryItemIds, setCategoryItemIds] = useState<string[]>(exercise?.categoryItemIds ?? defaultCategoryNames.flatMap((category) => library.filter((item) => item.category === category).slice(0, 3).map((item) => item.id)));
  const [rounds, setRounds] = useState(exercise?.rounds ?? 6);
  const [quantityMin, setQuantityMin] = useState(exercise?.quantityMin ?? 1);
  const [quantityMax, setQuantityMax] = useState(exercise?.quantityMax ?? 10);
  const [quantityObjectSet, setQuantityObjectSet] = useState<QuantityObjectSet>(exercise?.quantityObjectSet ?? "mixed");
  const [quantityAutoComplete, setQuantityAutoComplete] = useState(exercise?.quantityAutoComplete ?? true);
  const [quantitySpeakNumbers, setQuantitySpeakNumbers] = useState(exercise?.quantitySpeakNumbers ?? false);
  const [quantityErrorless, setQuantityErrorless] = useState(exercise?.quantityErrorless ?? false);
  const [quantityIdleSeconds, setQuantityIdleSeconds] = useState(exercise?.quantityIdleSeconds ?? 5);
  const sentenceCandidates = useMemo(() => library.filter(isSimpleSentenceScene), [library]);
  const [sentenceItemIds, setSentenceItemIds] = useState<string[]>(exercise?.sentenceItemIds ?? sentenceCandidates.map((item) => item.id));
  const [sentenceOptionCount, setSentenceOptionCount] = useState<SentenceOptionCount>(exercise?.sentenceOptionCount ?? 2);
  const [sentenceDifficulty, setSentenceDifficulty] = useState<SentenceDifficulty>(exercise?.sentenceDifficulty ?? 1);
  const recognitionCandidates = availableForRecognition(library, exercisePresentation);
  const effectivePromptId = recognitionCandidates.some((item) => item.id === promptId) ? promptId : recognitionCandidates[0]?.id ?? "";
  const compatibleRandomCandidates = recognitionCandidates.filter((item) => (!recognitionCategories.length || recognitionCategories.includes(item.category)) && matchesSyllableFilter(item, recognitionSyllables));
  const randomCandidates = randomPromptMode === "fixed" ? compatibleRandomCandidates : compatibleRandomCandidates.filter((item) => !recognitionItemIds.length || recognitionItemIds.includes(item.id));
  const prompt = recognitionCandidates.find((item) => item.id === effectivePromptId);
  // Chosen targets (one or more): each one needs enough compatible distractors of its own.
  const targets = targetIds.flatMap((id) => recognitionCandidates.filter((item) => item.id === id));
  const distractorsFor = (target: LibraryItem) => randomCandidates.filter((item) => item.id !== target.id && (distractorSource !== "same-category" || item.category === target.category));
  const shortTargets = targets.filter((target) => distractorsFor(target).length < distractorCount);
  const randomConfigValid = randomPromptMode === "fixed"
    ? targets.length > 0 && shortTargets.length === 0
    : randomCandidates.length >= distractorCount + 1 && (distractorSource === "mixed" || hasSameCategoryDistractors(randomCandidates, distractorCount));
  const randomConfigError = randomConfigValid ? "" : randomPromptMode === "fixed" && !targets.length
    ? "Scegli almeno una parola da trovare."
    : randomPromptMode === "fixed"
      ? `Servono almeno ${distractorCount} distrattori compatibili per ${shortTargets.map((item) => item.word.toLocaleUpperCase("it-IT")).join(", ")}; prova a togliere qualche filtro.`
      : distractorSource === "same-category"
        ? `Serve almeno una categoria con ${distractorCount + 1} parole compatibili con i filtri.`
        : `Servono almeno ${distractorCount + 1} parole compatibili con i filtri; al momento ce ne sono ${randomCandidates.length}.`;
  const normalizedItemSearch = itemSearch.trim().toLocaleLowerCase("it-IT");
  const matchesItemSearch = (item: LibraryItem) => !normalizedItemSearch || `${item.word} ${item.category}`.toLocaleLowerCase("it-IT").includes(normalizedItemSearch);
  const itemSearchField = <label className="search-box builder-search"><Search /><input type="search" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Cerca per parola o categoria…" /></label>;
  const finalOptions = Array.from(new Set([effectivePromptId, ...options])).filter((id) => recognitionCandidates.some((item) => item.id === id)).slice(0, 4);
  const buildFixed = (): Exercise => ({
    id: exercise?.id ?? crypto.randomUUID(),
    title: title.trim() || `Trova ${prompt?.word.toLowerCase() ?? "la parola"}`,
    kind: "recognition",
    recognitionMode: "fixed",
    presentation: exercisePresentation,
    autoPronounce,
    promptId: effectivePromptId,
    optionIds: finalOptions,
    updatedAt: new Date().toISOString(),
    deleted: false,
  });
  const targetWords = targets.map((item) => item.word.toLowerCase());
  const targetsTitle = targetWords.length > 3 ? `Trova ${targetWords.slice(0, 3).join(", ")} e altre ${targetWords.length - 3}` : `Trova ${targetWords.join(", ") || "la parola"}`;
  const buildRandom = (): Exercise => ({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || (randomPromptMode === "fixed" ? targetsTitle : "Trova la parola · casuale"), kind: "recognition", recognitionMode: "random", presentation: exercisePresentation, autoPronounce, promptId: randomPromptMode === "fixed" ? targets[0]?.id ?? "" : "", recognitionTargetIds: randomPromptMode === "fixed" && targets.length > 1 ? targets.map((item) => item.id) : undefined, optionIds: [], recognitionItemIds: recognitionItemIds.filter((id) => randomPromptMode !== "fixed" || !targetIds.includes(id)), recognitionCategories, recognitionSyllables, distractorCount, distractorSource, rounds: Math.max(1, rounds), updatedAt: new Date().toISOString(), deleted: false });
  if (kind === "sentence-matching") {
    const selectedIds = sentenceItemIds.filter((id) => sentenceCandidates.some((item) => item.id === id));
    const availability = sentenceMatchingAvailability(sentenceCandidates, { rounds: Math.max(1, rounds), optionCount: sentenceOptionCount, difficulty: sentenceDifficulty, allowedIds: selectedIds });
    const toggleSentenceItem = (id: string) => setSentenceItemIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]);
    const buildSentenceExercise = (): Exercise => ({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Abbina la frase", kind: "sentence-matching", promptId: "", optionIds: [], sentenceItemIds: selectedIds, sentenceOptionCount, sentenceDifficulty, rounds: Math.min(50, Math.max(1, Math.trunc(rounds))), presentation: "images", autoPronounce: true, updatedAt: new Date().toISOString(), deleted: false });
    return <BuilderModal exercise={exercise} onSave={onSave} editNotice={editNotice} heading="Abbina la frase" description="La frase soggetto + verbo viene letta ad alta voce. Il bambino sceglie l’immagine corrispondente." title={title} onTitleChange={setTitle} titlePlaceholder="Abbina la frase" saveDisabled={!availability.valid} build={buildSentenceExercise} onClose={onClose}><div className="builder-inline-fields"><label>Numero di turni<NumericField min={1} max={50} value={rounds} onValueChange={(nextValue) => setRounds(nextValue)} /></label><label>Immagini per turno<select value={sentenceOptionCount} onChange={(event) => { const count = Number(event.target.value) as SentenceOptionCount; setSentenceOptionCount(count); if (count === 2) setSentenceDifficulty(1); }}><option value={2}>2 immagini</option><option value={4}>4 immagini</option></select></label><label>Gradi di libertà<select value={sentenceDifficulty} onChange={(event) => setSentenceDifficulty(Number(event.target.value) as SentenceDifficulty)}><option value={1}>1 · cambia l’azione</option><option value={2} disabled={sentenceOptionCount !== 4}>2 · cambiano soggetto e azione</option></select></label></div><p className="field-note">Con 1 grado il soggetto resta uguale e cambia l’azione. Con 2 gradi vengono mostrate quattro combinazioni soggetto × azione.</p><div className="builder-label">Scene disponibili <span>{selectedIds.length} scelte</span></div>{itemSearchField}<div className="builder-grid">{sentenceCandidates.filter(matchesItemSearch).map((item) => <button type="button" key={item.id} className={selectedIds.includes(item.id) ? "selected" : ""} onClick={() => toggleSentenceItem(item.id)} aria-pressed={selectedIds.includes(item.id)}><Artwork item={item} compact /><span>{item.word}</span>{selectedIds.includes(item.id) && <i><Check /></i>}</button>)}</div>{!availability.valid && <p className="wizard-error" role="alert">La selezione non contiene abbastanza combinazioni compatibili. {sentenceDifficulty === 2 ? "Servono almeno due soggetti e due azioni presenti in tutte e quattro le combinazioni." : `Per ogni frase servono almeno ${sentenceOptionCount - 1} azioni alternative dello stesso soggetto.`}</p>}</BuilderModal>;
  }
  if (kind === "number-quantity") {
    const safeMin = Math.min(10, Math.max(1, Math.trunc(quantityMin)));
    const safeMax = Math.min(10, Math.max(safeMin, Math.trunc(quantityMax)));
    const buildQuantityExercise = (): Exercise => ({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Numero quantità", kind: "number-quantity", promptId: "", optionIds: [], rounds: Math.min(50, Math.max(1, Math.trunc(rounds))), quantityMin: safeMin, quantityMax: safeMax, quantityObjectSet, quantityAutoComplete, quantitySpeakNumbers, quantityErrorless, quantityIdleSeconds: Math.min(10, Math.max(1, Math.trunc(quantityIdleSeconds))), updatedAt: new Date().toISOString(), deleted: false });
    return <BuilderModal exercise={exercise} onSave={onSave} editNotice={editNotice} heading="Numero quantità" description="Il bambino tocca il numero richiesto di oggetti. In valutazione l’adulto conferma l’esito, salvo la modalità senza errori che riconosce subito la quantità corretta." title={title} onTitleChange={setTitle} titlePlaceholder="Numero quantità" build={buildQuantityExercise} onClose={onClose}><div className="builder-inline-fields"><label>Numero di turni<NumericField min={1} max={50} value={rounds} onValueChange={(nextValue) => setRounds(nextValue)} /></label><label>Quantità minima<NumericField min={1} max={10} value={quantityMin} onValueChange={(nextValue) => setQuantityMin(nextValue)} /></label><label>Quantità massima<NumericField min={safeMin} max={10} value={quantityMax} onValueChange={(nextValue) => setQuantityMax(nextValue)} /></label><label>Oggetti<select value={quantityObjectSet} onChange={(event) => setQuantityObjectSet(event.target.value as QuantityObjectSet)}><option value="mixed">Casuali a ogni turno</option><option value="candy">Caramelle</option><option value="ladybug">Coccinelle</option><option value="stone">Sassolini</option></select></label><label>Secondi di inattività<NumericField min={1} max={10} value={quantityIdleSeconds} onValueChange={(nextValue) => setQuantityIdleSeconds(nextValue)} /></label></div><QuantityLearningOptions speakNumbers={quantitySpeakNumbers} errorless={quantityErrorless} onSpeakNumbersChange={setQuantitySpeakNumbers} onErrorlessChange={setQuantityErrorless} /><CheckLine className="pronunciation-option" disabled={quantityErrorless} checked={quantityAutoComplete} onChange={setQuantityAutoComplete} title="Rileva automaticamente il numero corretto in insegnamento" detail="La barra mostra lo stesso tempo per risposte giuste ed errate. Dopo l’esito il terapista può proseguire; dopo un errore può anche far riprovare. Se disattivato, la risposta corretta richiede conferma adulta. Il link condiviso usa sempre il timer." /></BuilderModal>;
  }
  if (kind === "naming") {
    const categoryCandidates = library.filter((item) => !item.categorySymbolOnly && hasArtwork(item) && (!namingCategories.length || namingCategories.includes(item.category)));
    const selectedCandidates = namingItemIds.length ? categoryCandidates.filter((item) => namingItemIds.includes(item.id)) : categoryCandidates;
    const toggleNamingCategory = (category: string) => setNamingCategories((current) => current.includes(category) ? current.filter((value) => value !== category) : [...current, category]);
    const toggleNamingItem = (id: string) => setNamingItemIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    const buildNamingExercise = (): Exercise => ({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Mix and vary", kind: "naming", promptId: "", optionIds: [], namingItemIds, namingCategories, rounds: Math.min(Math.max(1, rounds), selectedCandidates.length), updatedAt: new Date().toISOString(), deleted: false });
    return <BuilderModal exercise={exercise} onSave={onSave} editNotice={editNotice} heading="Mix and vary" description="Mostra una foto senza testo. L’adulto indica se la risposta è corretta o errata e se il bambino è stato aiutato." title={title} onTitleChange={setTitle} titlePlaceholder="Mix and vary" saveDisabled={!selectedCandidates.length} build={buildNamingExercise} onClose={onClose}><label>Numero di turni<NumericField min={1} max={Math.max(1, selectedCandidates.length)} value={Math.min(Math.max(1, rounds), selectedCandidates.length || 1)} onValueChange={(nextValue) => setRounds(nextValue)} /></label><div className="builder-label">Filtra per categorie <span>{namingCategories.length ? `${namingCategories.length} scelte` : "Tutte"}</span></div><div className="filter-chips">{availableCategories.map((category) => <button type="button" key={category} className={namingCategories.includes(category) ? "selected" : ""} onClick={() => toggleNamingCategory(category)} aria-pressed={namingCategories.includes(category)}>{category}</button>)}</div><div className="builder-label">Immagini specifiche <span>{namingItemIds.length ? `${namingItemIds.length} scelte` : "Casuali dal filtro"}</span></div>{itemSearchField}<div className="builder-grid">{categoryCandidates.filter(matchesItemSearch).map((item) => <button type="button" key={item.id} className={namingItemIds.includes(item.id) ? "selected" : ""} onClick={() => toggleNamingItem(item.id)} aria-pressed={namingItemIds.includes(item.id)}><Artwork item={item} compact /><span>{item.word.toLocaleUpperCase("it-IT")}</span>{namingItemIds.includes(item.id) && <i><Check /></i>}</button>)}</div></BuilderModal>;
  }
  if (kind === "articles") {
    const selectedIds = articleItemIds.filter((id) => articleCandidates.some((item) => item.id === id));
    const finalRounds = Math.min(Math.max(1, rounds), selectedIds.length || 1);
    const toggleArticleItem = (id: string) => setArticleItemIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]);
    const buildArticleExercise = (): Exercise => ({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Classifica IL o LA", kind: "articles", promptId: "", optionIds: [], autoPronounce, articleItemIds: selectedIds, rounds: finalRounds, updatedAt: new Date().toISOString(), deleted: false });
    return <BuilderModal exercise={exercise} onSave={onSave} editNotice={editNotice} heading="Categorie IL / LA" description="Scegli le immagini disponibili e quante mostrarne, una alla volta, durante ogni esecuzione." title={title} onTitleChange={setTitle} titlePlaceholder="Classifica IL o LA" saveDisabled={!selectedIds.length} build={buildArticleExercise} onClose={onClose}><CorrectMatchPronunciation kind="articles" checked={autoPronounce} onChange={setAutoPronounce} /><label>Numero di turni<NumericField min={1} max={Math.max(1, selectedIds.length)} value={finalRounds} onValueChange={(nextValue) => setRounds(nextValue)} /></label><div className="builder-label">Immagini da classificare <span>{selectedIds.length} scelte</span></div>{itemSearchField}<div className="builder-grid">{articleCandidates.filter(matchesItemSearch).map((item) => <button type="button" key={item.id} className={selectedIds.includes(item.id) ? "selected" : ""} onClick={() => toggleArticleItem(item.id)} aria-pressed={selectedIds.includes(item.id)}><Artwork item={item} compact /><span>{item.word.toLocaleUpperCase("it-IT")} · {articleFor(item)}</span>{selectedIds.includes(item.id) && <i><Check /></i>}</button>)}</div></BuilderModal>;
  }
  if (kind === "word-categories") {
    const eligibleItems = availableForWordCategories(library).filter((item) => categoryNames.includes(item.category));
    const selectedIds = categoryItemIds.filter((id) => eligibleItems.some((item) => item.id === id));
    const toggleCategory = (category: string) => setCategoryNames((current) => current.includes(category) ? current.filter((value) => value !== category) : current.length < 4 ? [...current, category] : current);
    const toggleCategoryItem = (id: string) => setCategoryItemIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    const categoryError = categoryImageError({ kind, categoryNames, categoryItemIds: selectedIds, categoryShowSymbols, categoryShowTargetImage }, library, categorySymbols);
    const buildCategoryExercise = (): Exercise => ({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Metti la parola nella categoria", kind: "word-categories", promptId: "", optionIds: [], autoPronounce, categorySpeakWord, categoryShowTargetImage, categoryShowSymbols, categoryNames, categoryItemIds: selectedIds, rounds: Math.min(Math.max(1, rounds), selectedIds.length), updatedAt: new Date().toISOString(), deleted: false });
    return <BuilderModal exercise={exercise} onSave={onSave} editNotice={editNotice} heading="Parola nella categoria" description="Mostra una parola alla volta e scegli in quale categoria inserirla." title={title} onTitleChange={setTitle} titlePlaceholder="Metti la parola nella categoria" saveDisabled={Boolean(categoryError) || categoryNames.length < 2 || categoryNames.length > 4 || !selectedIds.length} build={buildCategoryExercise} onClose={onClose}><CorrectMatchPronunciation kind="word-categories" checked={autoPronounce} onChange={setAutoPronounce} /><CategoryExerciseOptions value={{ categorySpeakWord, categoryShowTargetImage, categoryShowSymbols }} onChange={(next) => { setCategorySpeakWord(Boolean(next.categorySpeakWord)); setCategoryShowTargetImage(Boolean(next.categoryShowTargetImage)); setCategoryShowSymbols(Boolean(next.categoryShowSymbols)); }} />{categoryError && <p className="feedback wrong" role="alert">{categoryError}</p>}<label>Numero di turni<NumericField min={1} max={Math.max(1, selectedIds.length)} value={Math.min(Math.max(1, rounds), selectedIds.length || 1)} onValueChange={(nextValue) => setRounds(nextValue)} /></label><div className="builder-label">Categorie <span>{categoryNames.length} scelte · massimo 4</span></div><div className="filter-chips">{availableCategories.map((category) => <button type="button" key={category} className={categoryNames.includes(category) ? "selected" : ""} onClick={() => toggleCategory(category)} aria-pressed={categoryNames.includes(category)}>{category}</button>)}</div><div className="builder-label">Parole da classificare <span>{selectedIds.length} scelte</span></div>{itemSearchField}<div className="builder-grid">{eligibleItems.filter(matchesItemSearch).map((item) => <button type="button" key={item.id} className={selectedIds.includes(item.id) ? "selected" : ""} onClick={() => toggleCategoryItem(item.id)} aria-pressed={selectedIds.includes(item.id)}><strong className="builder-word">{item.word.toLocaleUpperCase("it-IT")}</strong><span>{item.category}</span>{selectedIds.includes(item.id) && <i><Check /></i>}</button>)}</div></BuilderModal>;
  }
  return (
    <BuilderModal
      exercise={exercise} onSave={onSave} editNotice={editNotice}
      heading="Trova la parola"
      description="Puoi scegliere una parola precisa con distrattori casuali, rendere casuale anche il bersaglio oppure configurare tutte le opzioni a mano."
      title={title}
      onTitleChange={setTitle}
      titlePlaceholder={recognitionMode === "random" ? randomPromptMode === "fixed" ? targetsTitle : "Trova la parola · casuale" : prompt ? `Trova ${prompt.word.toLowerCase()}` : "Titolo esercizio"}
      saveDisabled={recognitionMode === "fixed" ? !effectivePromptId || finalOptions.length < 2 : !randomConfigValid}
      build={recognitionMode === "random" ? buildRandom : buildFixed}
      onClose={onClose}
    >
        <RecognitionPresentationFields presentation={exercisePresentation} autoPronounce={autoPronounce} onPresentationChange={setExercisePresentation} onAutoPronounceChange={setAutoPronounce} />
        <div className="builder-mode">
          <button type="button" className={recognitionMode === "random" ? "selected" : ""} onClick={() => setRecognitionMode("random")}><Sparkles /><strong>Distrattori casuali</strong><small>Scegli se mantenere fisso o variare il bersaglio</small></button>
          <button type="button" className={recognitionMode === "fixed" ? "selected" : ""} onClick={() => setRecognitionMode("fixed")}><Settings /><strong>Tutto fisso</strong><small>Configura manualmente ogni opzione</small></button>
        </div>
        {recognitionMode === "random" ? <>
          <div className="builder-label">Parola da trovare</div>
          <div className="selection-tabs">
            <button type="button" className={randomPromptMode === "fixed" ? "selected" : ""} onClick={() => setRandomPromptMode("fixed")}>Parole precise</button>
            <button type="button" className={randomPromptMode === "random" ? "selected" : ""} onClick={() => setRandomPromptMode("random")}>Casuale a ogni turno</button>
          </div>
          {randomPromptMode === "fixed" && <>
            <div className="builder-label">{exercisePresentation === "words" ? "Parole da riconoscere" : "Immagini da riconoscere"} <span>{targets.length === 1 ? "1 scelta" : `${targets.length} scelte`}</span></div>
            <p className="field-note">Scegline una o più: a ogni turno ne compare una, a rotazione e in ordine mescolato.</p>
            <FullTextItemPicker items={recognitionCandidates} selectedIds={targets.map((item) => item.id)} onChange={(ids) => { setTargetIds(ids); setRecognitionItemIds((current) => current.filter((id) => !ids.includes(id))); }} multiple presentation={exercisePresentation} placeholder="Cerca e aggiungi le parole da riconoscere…" />
          </>}
          <div className="builder-inline-fields">
            <label>Numero di turni<NumericField min={1} max={50} value={Math.max(1, rounds)} onValueChange={(nextValue) => setRounds(nextValue)} /></label>
            <RecognitionRandomParameterFields distractorCount={distractorCount} distractorSource={distractorSource} syllables={recognitionSyllables} onDistractorCountChange={setDistractorCount} onDistractorSourceChange={setDistractorSource} onSyllablesChange={setRecognitionSyllables} />
          </div>
          <div className="builder-label">Filtra i {randomPromptMode === "fixed" ? "distrattori" : "bersagli e distrattori"} per categorie <span>{recognitionCategories.length ? `${recognitionCategories.length} scelte` : "Tutte"}</span></div>
          <div className="filter-chips">{availableCategories.map((category) => <button type="button" key={category} className={recognitionCategories.includes(category) ? "selected" : ""} onClick={() => setRecognitionCategories((current) => current.includes(category) ? current.filter((value) => value !== category) : [...current, category])} aria-pressed={recognitionCategories.includes(category)}>{category}</button>)}</div>
          <div className="builder-label">{randomPromptMode === "fixed" ? "Distrattori preferiti (facoltativo)" : "Limita a parole specifiche"} <span>{recognitionItemIds.length ? `${recognitionItemIds.length} scelte` : randomPromptMode === "fixed" ? "Scelta automatica" : "Tutte"}</span></div>
          {randomPromptMode === "fixed" && <p className="field-note">Se non ne scegli abbastanza, l’app completa automaticamente le opzioni con elementi compatibili della libreria.</p>}
          <FullTextItemPicker items={compatibleRandomCandidates.filter((item) => randomPromptMode !== "fixed" || !targetIds.includes(item.id))} selectedIds={recognitionItemIds} onChange={setRecognitionItemIds} multiple presentation={exercisePresentation} placeholder={randomPromptMode === "fixed" ? "Cerca uno o più distrattori preferiti…" : "Cerca e aggiungi più parole…"} />
          {randomConfigError && <p className="wizard-error" role="alert">{randomConfigError}</p>}
        </> : <>
          <div className="builder-label">{exercisePresentation === "words" ? "Parola da riconoscere" : "Immagine da riconoscere"} <span>{prompt?.word}</span></div>
          <FullTextItemPicker items={recognitionCandidates} selectedIds={effectivePromptId ? [effectivePromptId] : []} onChange={(ids) => { const nextId = ids[0] ?? ""; setPromptId(nextId); setOptions((current) => current.filter((id) => id !== nextId)); }} multiple={false} presentation={exercisePresentation} placeholder="Cerca la parola da riconoscere…" />
          <div className="builder-label">{exercisePresentation === "words" ? "Parole da mostrare" : "Immagini da mostrare"} <span>{finalOptions.length}/4</span></div>
          <FullTextItemPicker items={recognitionCandidates.filter((item) => item.id !== effectivePromptId)} selectedIds={options.filter((id) => id !== effectivePromptId)} onChange={(ids) => setOptions(ids.slice(0, 3))} multiple presentation={exercisePresentation} placeholder="Cerca e aggiungi fino a 3 alternative…" max={3} />
        </>}
    </BuilderModal>
  );
}

type BuilderModalProps = {
  exercise?: Exercise;
  editNotice?: string;
  build: () => Exercise;
  heading: string;
  description: string;
  title: string;
  onTitleChange: (title: string) => void;
  titlePlaceholder: string;
  saveDisabled?: boolean;
  onSave: (draft: Exercise) => void;
  onClose: () => void;
  children: React.ReactNode;
};

/** Shared frame of every exercise editor: heading, title field and Annulla/Salva footer. */
function BuilderModal({ exercise, editNotice, build, heading, description, title, onTitleChange, titlePlaceholder, saveDisabled, onSave, onClose, children }: BuilderModalProps) {
  const [initialForm] = useState(() => exercise ? build() : null);
  const submit = () => {
    const draft = build();
    onSave(exercise && initialForm ? applyExerciseForm(exercise, initialForm, draft) : draft);
  };
  return <Modal labelledBy="exercise-builder-title" className="wide" onClose={onClose} closeButton>
    <ModalTitle id="exercise-builder-title" eyebrow={exercise ? "MODIFICA ESERCIZIO" : "NUOVO ESERCIZIO"}>{heading}</ModalTitle>
    <p>{description}</p>
    {editNotice && <p className="field-note">{editNotice}</p>}
    <label>Titolo<input value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder={titlePlaceholder} /></label>
    {children}
    <ModalActions onCancel={onClose}>
      <button className="primary-button" type="button" disabled={saveDisabled} onClick={submit}><Save />Salva esercizio</button>
    </ModalActions>
  </Modal>;
}
