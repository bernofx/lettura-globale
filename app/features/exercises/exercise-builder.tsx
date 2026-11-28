import { BuilderModal } from "./builder-modal";
import { RecognitionWizard } from "./recognition-wizard";
import { Check, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { categoryImageError, type CategorySymbols } from "../../domain/category-images";
import { availableForWordCategories, wordCategoryNames } from "../../domain/word-category-content";
import { articleFor } from "../../domain/article-classification";
import { NumericField } from "../../components/numeric-field";
import { hasArtwork } from "../../domain/library-availability";
import { type SessionActivity } from "../../domain/session-compilation";
import { type QuantityObjectSet } from "../../domain/quantity-exercise";
import { isSimpleSentenceScene, type SentenceDifficulty, sentenceMatchingAvailability, type SentenceOptionCount } from "../../domain/sentence-matching";
import { CategoryExerciseOptions, CorrectMatchPronunciation, QuantityLearningOptions } from "./exercise-fields";
import { Artwork } from "../../shared/artwork";
import { type Exercise, type LibraryItem } from "../../shared/types";
import { CheckLine } from "../../shared/ui/form-controls";

type ExerciseBuilderProps = { editNotice?: string; categorySymbols: CategorySymbols; kind: SessionActivity; exercise?: Exercise; library: LibraryItem[]; onClose: () => void; onSave: (exercise: Exercise) => void };

export function ExerciseBuilder(props: ExerciseBuilderProps) {
  return props.kind === "recognition" ? <RecognitionWizard {...props} /> : <OtherExerciseBuilder {...props} />;
}

function OtherExerciseBuilder({ editNotice, categorySymbols, kind, exercise, library, onClose, onSave }: ExerciseBuilderProps) {
  const [title, setTitle] = useState(exercise?.title ?? "");
  const [namingItemIds, setNamingItemIds] = useState<string[]>(exercise?.namingItemIds ?? []);
  const [namingCategories, setNamingCategories] = useState<string[]>(exercise?.namingCategories ?? []);
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
  const normalizedItemSearch = itemSearch.trim().toLocaleLowerCase("it-IT");
  const matchesItemSearch = (item: LibraryItem) => !normalizedItemSearch || `${item.word} ${item.category}`.toLocaleLowerCase("it-IT").includes(normalizedItemSearch);
  const itemSearchField = <label className="search-box builder-search"><Search /><input type="search" aria-label="Cerca per parola o categoria" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Cerca per parola o categoria…" /></label>;
  const frame = { exercise, editNotice, onSave, onClose, title, onTitleChange: setTitle };
  if (kind === "sentence-matching") {
    const selectedIds = sentenceItemIds.filter((id) => sentenceCandidates.some((item) => item.id === id));
    const availability = sentenceMatchingAvailability(sentenceCandidates, { rounds: Math.max(1, rounds), optionCount: sentenceOptionCount, difficulty: sentenceDifficulty, allowedIds: selectedIds });
    const toggleSentenceItem = (id: string) => setSentenceItemIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]);
    const buildSentenceExercise = (): Exercise => ({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Abbina la frase", kind: "sentence-matching", promptId: "", optionIds: [], sentenceItemIds: selectedIds, sentenceOptionCount, sentenceDifficulty, rounds: Math.min(50, Math.max(1, Math.trunc(rounds))), presentation: "images", autoPronounce: true, updatedAt: new Date().toISOString(), deleted: false });
    return <BuilderModal {...frame}
      heading="Abbina la frase" description="La frase soggetto + verbo viene letta ad alta voce. Il bambino sceglie l’immagine corrispondente."
      titlePlaceholder="Abbina la frase" saveDisabled={!availability.valid}
      summary={`${turns(rounds)} · ${selectedIds.length} scene · ${sentenceOptionCount} immagini per turno`}
      build={buildSentenceExercise}>
      <div className="builder-inline-fields">
        <label>Numero di turni<NumericField min={1} max={50} value={rounds} onValueChange={setRounds} /></label>
      </div>
      <div className="builder-label">Scene disponibili <span>{selectedIds.length} scelte</span></div>
      {itemSearchField}
      <div className="builder-grid">{sentenceCandidates.filter(matchesItemSearch).map((item) => <button type="button" key={item.id} className={selectedIds.includes(item.id) ? "selected" : ""} onClick={() => toggleSentenceItem(item.id)} aria-pressed={selectedIds.includes(item.id)}><Artwork item={item} compact /><span>{item.word}</span>{selectedIds.includes(item.id) && <i><Check /></i>}</button>)}</div>
      {!availability.valid && <p className="wizard-error" role="alert">La selezione non contiene abbastanza combinazioni compatibili. {sentenceDifficulty === 2 ? "Servono almeno due soggetti e due azioni presenti in tutte e quattro le combinazioni." : `Per ogni frase servono almeno ${sentenceOptionCount - 1} azioni alternative dello stesso soggetto.`}</p>}
      <Advanced summary={`${sentenceOptionCount} immagini · ${sentenceDifficulty === 1 ? "varia l’azione" : "variano soggetto e azione"}`}>
        <div className="builder-inline-fields">
          <label>Immagini per turno<select value={sentenceOptionCount} onChange={(event) => { const count = Number(event.target.value) as SentenceOptionCount; setSentenceOptionCount(count); if (count === 2) setSentenceDifficulty(1); }}><option value={2}>2 immagini</option><option value={4}>4 immagini</option></select></label>
          <label>Gradi di libertà<select value={sentenceDifficulty} onChange={(event) => setSentenceDifficulty(Number(event.target.value) as SentenceDifficulty)}><option value={1}>1 · cambia l’azione</option><option value={2} disabled={sentenceOptionCount !== 4}>2 · cambiano soggetto e azione</option></select></label>
        </div>
        <p className="field-note">Con 1 grado il soggetto resta uguale e cambia l’azione. Con 2 gradi vengono mostrate quattro combinazioni soggetto × azione.</p>
      </Advanced>
    </BuilderModal>;
  }
  if (kind === "number-quantity") {
    const safeMin = Math.min(10, Math.max(1, Math.trunc(quantityMin)));
    const safeMax = Math.min(10, Math.max(safeMin, Math.trunc(quantityMax)));
    const buildQuantityExercise = (): Exercise => ({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Numero quantità", kind: "number-quantity", promptId: "", optionIds: [], rounds: Math.min(50, Math.max(1, Math.trunc(rounds))), quantityMin: safeMin, quantityMax: safeMax, quantityObjectSet, quantityAutoComplete, quantitySpeakNumbers, quantityErrorless, quantityIdleSeconds: Math.min(10, Math.max(1, Math.trunc(quantityIdleSeconds))), updatedAt: new Date().toISOString(), deleted: false });
    return <BuilderModal {...frame}
      heading="Numero quantità" description="Il bambino tocca il numero richiesto di oggetti. In valutazione l’adulto conferma l’esito, salvo la modalità senza errori che riconosce subito la quantità corretta."
      titlePlaceholder="Numero quantità"
      summary={`${turns(rounds)} · quantità da ${safeMin} a ${safeMax}`}
      build={buildQuantityExercise}>
      <div className="builder-inline-fields">
        <label>Numero di turni<NumericField min={1} max={50} value={rounds} onValueChange={setRounds} /></label>
        <label>Quantità minima<NumericField min={1} max={10} value={quantityMin} onValueChange={(nextValue) => setQuantityMin(nextValue)} /></label>
        <label>Quantità massima<NumericField min={safeMin} max={10} value={quantityMax} onValueChange={(nextValue) => setQuantityMax(nextValue)} /></label>
      </div>
      <Advanced summary={[objectSetLabel[quantityObjectSet], quantitySpeakNumbers ? "conteggio a voce" : "conteggio silenzioso", quantityErrorless ? "senza errori" : quantityAutoComplete ? `rilevamento dopo ${quantityIdleSeconds} s` : "conferma adulta"].join(" · ")}>
        <div className="builder-inline-fields">
          <label>Oggetti<select value={quantityObjectSet} onChange={(event) => setQuantityObjectSet(event.target.value as QuantityObjectSet)}><option value="mixed">Casuali a ogni turno</option><option value="candy">Caramelle</option><option value="ladybug">Coccinelle</option><option value="stone">Sassolini</option></select></label>
          <label>Secondi di inattività<NumericField min={1} max={10} value={quantityIdleSeconds} onValueChange={(nextValue) => setQuantityIdleSeconds(nextValue)} /></label>
        </div>
        <QuantityLearningOptions speakNumbers={quantitySpeakNumbers} errorless={quantityErrorless} onSpeakNumbersChange={setQuantitySpeakNumbers} onErrorlessChange={setQuantityErrorless} />
        <CheckLine className="pronunciation-option" disabled={quantityErrorless} checked={quantityAutoComplete} onChange={setQuantityAutoComplete} title="Rileva automaticamente il numero corretto in insegnamento" detail="La barra mostra lo stesso tempo per risposte giuste ed errate. Dopo l’esito il terapista può proseguire; dopo un errore può anche far riprovare. Se disattivato, la risposta corretta richiede conferma adulta. Il link condiviso usa sempre il timer." />
      </Advanced>
    </BuilderModal>;
  }
  if (kind === "naming") {
    const categoryCandidates = library.filter((item) => !item.categorySymbolOnly && hasArtwork(item) && (!namingCategories.length || namingCategories.includes(item.category)));
    const selectedCandidates = namingItemIds.length ? categoryCandidates.filter((item) => namingItemIds.includes(item.id)) : categoryCandidates;
    const toggleNamingCategory = (category: string) => setNamingCategories((current) => current.includes(category) ? current.filter((value) => value !== category) : [...current, category]);
    const toggleNamingItem = (id: string) => setNamingItemIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    const buildNamingExercise = (): Exercise => ({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Mix and vary", kind: "naming", promptId: "", optionIds: [], namingItemIds, namingCategories, rounds: Math.min(Math.max(1, rounds), selectedCandidates.length), updatedAt: new Date().toISOString(), deleted: false });
    return <BuilderModal {...frame}
      heading="Mix and vary" description="Mostra una foto senza testo. L’adulto indica se la risposta è corretta o errata e se il bambino è stato aiutato."
      titlePlaceholder="Mix and vary" saveDisabled={!selectedCandidates.length}
      summary={`${turns(Math.min(Math.max(1, rounds), selectedCandidates.length))} · ${selectedCandidates.length} immagini disponibili`}
      build={buildNamingExercise}>
      <label>Numero di turni<NumericField min={1} max={Math.max(1, selectedCandidates.length)} value={Math.min(Math.max(1, rounds), selectedCandidates.length || 1)} onValueChange={setRounds} /></label>
      <div className="builder-label">Immagini specifiche <span>{namingItemIds.length ? `${namingItemIds.length} scelte` : "Casuali dal filtro"}</span></div>
      {itemSearchField}
      <div className="builder-grid">{categoryCandidates.filter(matchesItemSearch).map((item) => <button type="button" key={item.id} className={namingItemIds.includes(item.id) ? "selected" : ""} onClick={() => toggleNamingItem(item.id)} aria-pressed={namingItemIds.includes(item.id)}><Artwork item={item} compact /><span>{item.word.toLocaleUpperCase("it-IT")}</span>{namingItemIds.includes(item.id) && <i><Check /></i>}</button>)}</div>
      <Advanced summary={namingCategories.length ? namingCategories.join(", ") : "Tutte le categorie"}>
        <div className="builder-label">Filtra per categorie <span>{namingCategories.length ? `${namingCategories.length} scelte` : "Tutte"}</span></div>
        <div className="filter-chips">{availableCategories.map((category) => <button type="button" key={category} className={namingCategories.includes(category) ? "selected" : ""} onClick={() => toggleNamingCategory(category)} aria-pressed={namingCategories.includes(category)}>{category}</button>)}</div>
      </Advanced>
    </BuilderModal>;
  }
  if (kind === "articles") {
    const selectedIds = articleItemIds.filter((id) => articleCandidates.some((item) => item.id === id));
    const finalRounds = Math.min(Math.max(1, rounds), selectedIds.length || 1);
    const toggleArticleItem = (id: string) => setArticleItemIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]);
    const buildArticleExercise = (): Exercise => ({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Classifica IL o LA", kind: "articles", promptId: "", optionIds: [], autoPronounce, articleItemIds: selectedIds, rounds: finalRounds, updatedAt: new Date().toISOString(), deleted: false });
    return <BuilderModal {...frame}
      heading="Categorie IL / LA" description="Scegli le immagini disponibili e quante mostrarne, una alla volta, durante ogni esecuzione."
      titlePlaceholder="Classifica IL o LA" saveDisabled={!selectedIds.length}
      summary={`${turns(finalRounds)} · ${selectedIds.length} immagini da classificare`}
      build={buildArticleExercise}>
      <label>Numero di turni<NumericField min={1} max={Math.max(1, selectedIds.length)} value={finalRounds} onValueChange={setRounds} /></label>
      <div className="builder-label">Immagini da classificare <span>{selectedIds.length} scelte</span></div>
      {itemSearchField}
      <div className="builder-grid">{articleCandidates.filter(matchesItemSearch).map((item) => <button type="button" key={item.id} className={selectedIds.includes(item.id) ? "selected" : ""} onClick={() => toggleArticleItem(item.id)} aria-pressed={selectedIds.includes(item.id)}><Artwork item={item} compact /><span>{item.word.toLocaleUpperCase("it-IT")} · {articleFor(item)}</span>{selectedIds.includes(item.id) && <i><Check /></i>}</button>)}</div>
      <Advanced summary={autoPronounce ? "Pronuncia articolo e parola" : "Pronuncia disattivata"}>
        <CorrectMatchPronunciation kind="articles" checked={autoPronounce} onChange={setAutoPronounce} />
      </Advanced>
    </BuilderModal>;
  }
  if (kind === "word-categories") {
    const eligibleItems = availableForWordCategories(library).filter((item) => categoryNames.includes(item.category));
    const selectedIds = categoryItemIds.filter((id) => eligibleItems.some((item) => item.id === id));
    const toggleCategory = (category: string) => setCategoryNames((current) => current.includes(category) ? current.filter((value) => value !== category) : current.length < 4 ? [...current, category] : current);
    const toggleCategoryItem = (id: string) => setCategoryItemIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    const categoryError = categoryImageError({ kind, categoryNames, categoryItemIds: selectedIds, categoryShowSymbols, categoryShowTargetImage }, library, categorySymbols);
    const buildCategoryExercise = (): Exercise => ({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Metti la parola nella categoria", kind: "word-categories", promptId: "", optionIds: [], autoPronounce, categorySpeakWord, categoryShowTargetImage, categoryShowSymbols, categoryNames, categoryItemIds: selectedIds, rounds: Math.min(Math.max(1, rounds), selectedIds.length), updatedAt: new Date().toISOString(), deleted: false });
    return <BuilderModal {...frame}
      heading="Parola nella categoria" description="Mostra una parola alla volta e scegli in quale categoria inserirla."
      titlePlaceholder="Metti la parola nella categoria" saveDisabled={Boolean(categoryError) || categoryNames.length < 2 || categoryNames.length > 4 || !selectedIds.length}
      summary={`${turns(Math.min(Math.max(1, rounds), selectedIds.length))} · ${selectedIds.length} parole · ${categoryNames.length} categorie`}
      build={buildCategoryExercise}>
      {categoryError && <p className="feedback wrong" role="alert">{categoryError}</p>}
      <label>Numero di turni<NumericField min={1} max={Math.max(1, selectedIds.length)} value={Math.min(Math.max(1, rounds), selectedIds.length || 1)} onValueChange={setRounds} /></label>
      <div className="builder-label">Categorie <span>{categoryNames.length} scelte · massimo 4</span></div>
      <div className="filter-chips">{availableCategories.map((category) => <button type="button" key={category} className={categoryNames.includes(category) ? "selected" : ""} onClick={() => toggleCategory(category)} aria-pressed={categoryNames.includes(category)}>{category}</button>)}</div>
      <div className="builder-label">Parole da classificare <span>{selectedIds.length} scelte</span></div>
      {itemSearchField}
      <div className="builder-grid">{eligibleItems.filter(matchesItemSearch).map((item) => <button type="button" key={item.id} className={selectedIds.includes(item.id) ? "selected" : ""} onClick={() => toggleCategoryItem(item.id)} aria-pressed={selectedIds.includes(item.id)}><strong className="builder-word">{item.word.toLocaleUpperCase("it-IT")}</strong><span>{item.category}</span>{selectedIds.includes(item.id) && <i><Check /></i>}</button>)}</div>
      <Advanced summary={[categorySpeakWord && "voce iniziale", autoPronounce && "conferma vocale", categoryShowTargetImage && "immagine bersaglio", categoryShowSymbols && "simboli delle categorie"].filter(Boolean).join(" · ") || "Solo testo, senza voce"}>
        <CorrectMatchPronunciation kind="word-categories" checked={autoPronounce} onChange={setAutoPronounce} />
        <CategoryExerciseOptions value={{ categorySpeakWord, categoryShowTargetImage, categoryShowSymbols }} onChange={(next) => { setCategorySpeakWord(Boolean(next.categorySpeakWord)); setCategoryShowTargetImage(Boolean(next.categoryShowTargetImage)); setCategoryShowSymbols(Boolean(next.categoryShowSymbols)); }} />
      </Advanced>
    </BuilderModal>;
  }
  return null;
}

const objectSetLabel: Record<QuantityObjectSet, string> = { mixed: "Oggetti casuali", candy: "Caramelle", ladybug: "Coccinelle", stone: "Sassolini" };

function turns(count: number) {
  return `${count} ${count === 1 ? "turno" : "turni"}`;
}

function Advanced({ summary, children }: { summary: string; children: React.ReactNode }) {
  return <details className="builder-advanced">
    <summary>Opzioni avanzate <small>{summary}</small></summary>
    <div>{children}</div>
  </details>;
}
