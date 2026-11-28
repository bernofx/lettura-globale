import { useEffect, useRef, useState } from "react";
import { hasSameCategoryDistractors, recognitionModeFor, recognitionTargetsFor } from "../../domain/activity-generation";
import { availableForRecognition, hasArtwork } from "../../domain/library-availability";
import { matchesSyllableFilter, type SyllableFilter } from "../../domain/syllabification";
import { NumericField } from "../../components/numeric-field";
import type { DistractorSource, Exercise, LibraryItem, Presentation } from "../../shared/types";
import { CheckLine } from "../../shared/ui/form-controls";
import { FullTextItemPicker } from "../library/full-text-item-picker";
import { BuilderModal } from "./builder-modal";

type TargetSource = "random" | "categories" | "chosen";
type AlternativeSource = DistractorSource | "manual";
type Count = 1 | 2 | 3 | 4;
const counts = [1, 2, 3, 4] as const;
const stepNames = ["Origine delle parole", "Distrattori", "Opzioni e riepilogo"];

function Choices<T extends string | number>({ label, values, selected, onSelect, compact }: {
  compact?: boolean; label: string; values: ReadonlyArray<readonly [T, string]>; selected: T; onSelect: (value: T) => void;
}) {
  return <fieldset className="recognition-choices"><legend>{label}</legend>
    <div className={compact ? "builder-mode recognition-modes compact-choices" : "builder-mode recognition-modes"}>
      {values.map(([value, text]) => <button type="button" key={value} aria-pressed={selected === value}
        className={selected === value ? "selected" : ""} onClick={() => onSelect(value)}>{text}</button>)}
    </div>
  </fieldset>;
}

function Categories({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (values: string[]) => void }) {
  return <div className="filter-chips" role="group" aria-label="Categorie disponibili">
    {options.map(category => <button type="button" key={category} aria-pressed={selected.includes(category)}
      className={selected.includes(category) ? "selected" : ""} onClick={() => onChange(selected.includes(category)
        ? selected.filter(value => value !== category) : [...selected, category])}>{category}</button>)}
  </div>;
}

export function RecognitionWizard({ exercise, library, editNotice, onClose, onSave }: {
  exercise?: Exercise; library: LibraryItem[]; editNotice?: string; onClose: () => void; onSave: (draft: Exercise) => void;
}) {
  const wasManual = Boolean(exercise && recognitionModeFor(exercise) === "fixed");
  const initialTargets = wasManual && exercise?.promptId ? [exercise.promptId] : exercise ? recognitionTargetsFor(exercise) : [];
  const initialSource: TargetSource = wasManual || initialTargets.length ? "chosen" : exercise?.recognitionCategories?.length ? "categories" : "random";
  const [step, setStep] = useState(1);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastStep = useRef(step);
  useEffect(() => {
    if (lastStep.current !== step) {
      heading.current?.closest(".modal")?.scrollTo(0, 0);
      heading.current?.focus({ preventScroll: true });
      lastStep.current = step;
    }
  }, [step]);

  const [targetSource, setTargetSource] = useState(initialSource);
  const [targetIds, setTargetIds] = useState(initialTargets);
  const [targetCategories, setTargetCategories] = useState(initialSource === "categories" ? exercise?.recognitionCategories ?? [] : []);
  const [alternativeCategories, setAlternativeCategories] = useState(initialSource === "chosen" ? exercise?.recognitionCategories ?? [] : []);
  const [poolIds, setPoolIds] = useState(initialSource !== "chosen" ? exercise?.recognitionItemIds ?? [] : []);
  const [preferredIds, setPreferredIds] = useState(initialSource === "chosen" ? exercise?.recognitionItemIds ?? [] : []);
  const [alternativeSource, setAlternativeSource] = useState<AlternativeSource>(wasManual ? "manual" : exercise?.distractorSource ?? "mixed");
  const [manualIds, setManualIds] = useState(() => exercise?.optionIds.filter(id => id !== exercise.promptId) ?? []);
  const [count, setCount] = useState<Count>(wasManual ? counts[Math.min(2, Math.max(0, manualIds.length - 1))] : exercise?.distractorCount ?? 3);
  const [rounds, setRounds] = useState(exercise?.rounds ?? 6);
  const [presentation, setPresentation] = useState<Presentation>(exercise?.presentation ?? "images");
  const [autoPronounce, setAutoPronounce] = useState(exercise?.autoPronounce ?? exercise?.presentation === "words");
  const [syllables, setSyllables] = useState<SyllableFilter>(exercise?.recognitionSyllables ?? "all");
  const [title, setTitle] = useState(exercise?.title ?? "");

  const chosen = targetSource === "chosen";
  const canChooseManually = chosen && targetIds.length === 1;
  const manual = alternativeSource === "manual" && canChooseManually;
  const source = alternativeSource === "same-category" ? "same-category" : "mixed";
  // Text-only cards can be selected before reaching the presentation control at step three.
  const words = availableForRecognition(library, "words");
  const categories = [...new Set(words.map(item => item.category))].sort((a, b) => a.localeCompare(b, "it"));
  const activeCategories = chosen ? alternativeCategories : targetSource === "categories" ? targetCategories : [];
  const allowedIds = chosen ? preferredIds.filter(id => !targetIds.includes(id)) : poolIds;
  const targets = targetIds.flatMap(id => words.filter(item => item.id === id));
  const alternatives = manualIds.filter(id => !targetIds.includes(id));
  const compatible = words.filter(item => (!activeCategories.length || activeCategories.includes(item.category)) && matchesSyllableFilter(item, syllables));
  const targetReady = targetSource === "random" || (chosen ? targets.length > 0 : targetCategories.length > 0);
  function configurationProblem(origin: AlternativeSource, display: Presentation): string {
    if (!targetReady) return "Scegli almeno un bersaglio o una categoria al primo passo.";
    if (display === "images" && chosen && words.some(item =>
      (targetIds.includes(item.id) || (origin === "manual" && alternatives.includes(item.id))) && !hasArtwork(item))) {
      return "Una parola scelta è senza immagine. Usa le risposte in parole o cambia la selezione.";
    }
    if (origin === "manual") return alternatives.length === count ? "" : "Seleziona il numero indicato di distrattori.";
    const pool = availableForRecognition(compatible, display).filter(item =>
      (item.contentKind !== "sentence" || allowedIds.includes(item.id) || (chosen && targetIds.includes(item.id))) &&
      (chosen || !allowedIds.length || allowedIds.includes(item.id)));
    const shortTarget = chosen && targets.find(target => pool.filter(item =>
      item.id !== target.id && (origin === "mixed" || item.category === target.category)).length < count);
    if (shortTarget || pool.length < count + (chosen ? 0 : 1) || (!chosen && origin === "same-category" && !hasSameCategoryDistractors(pool, count))) {
      return `Servono ${count} distrattori compatibili${shortTarget ? " per " + shortTarget.word : ""}. Riduci il numero o modifica i filtri.`;
    }
    return "";
  }
  const selectedOrigin = manual ? "manual" : source;
  const problem = configurationProblem(selectedOrigin, presentation);
  const names = targets.map(item => item.word);
  const targetLabel = chosen ? names.join(", ") : targetSource === "categories" ? targetCategories.join(", ") : "casuali";
  const prefix = targets.some(item => item.contentKind === "sentence") ? "Trova la parola · " : "Trova ";
  const suggestedTitle = chosen && names.length ? prefix + names.slice(0, 3).join(", ") + (names.length > 3 ? " e altre " + (names.length - 3) : "") : chosen ? "Trova la parola" : "Trova la parola · casuale";
  const distractorLabel = manual ? "a mano" : source === "same-category" ? "della stessa categoria" : "dal gruppo disponibile";
  const totalRounds = manual ? 1 : rounds;
  const turnSummary = `${totalRounds} ${totalRounds === 1 ? "turno" : "turni"} · Bersagli: ${targetLabel} · ${count} ${count === 1 ? "distrattore" : "distrattori"} ${distractorLabel}`;
  const optionNames = words.filter(item => alternatives.includes(item.id)).map(item => item.word);
  const summary = [turnSummary, manual && optionNames.join(", "), !manual && chosen && activeCategories.join(", "),
    !manual && allowedIds.length > 0 && `${allowedIds.length} parole ${chosen ? "preferite" : "nel gruppo"}`].filter(Boolean).join(" · ");
  const build = (): Exercise => {
    const common = { id: exercise?.id ?? crypto.randomUUID(), kind: "recognition" as const, title: title.trim() || suggestedTitle,
      presentation, autoPronounce, updatedAt: new Date().toISOString(), deleted: false };
    if (manual) return { ...common, recognitionMode: "fixed", promptId: targetIds[0], optionIds: [targetIds[0], ...alternatives] };
    return { ...common, recognitionMode: "random", promptId: chosen ? targetIds[0] ?? "" : "", optionIds: [],
      recognitionTargetIds: chosen && targetIds.length > 1 ? targetIds : undefined, recognitionCategories: activeCategories,
      recognitionItemIds: allowedIds, recognitionSyllables: syllables, distractorCount: count, distractorSource: source, rounds };
  };
  const selectAlternative = (value: AlternativeSource) => {
    setAlternativeSource(value);
    if (value !== "manual" && !configurationProblem(value, presentation)) setStep(3);
  };
  const next = step < 3 ? () => setStep(step + 1) : undefined;
  const poolPicker = <FullTextItemPicker items={compatible.filter(item => !chosen || !targetIds.includes(item.id))}
    selectedIds={allowedIds} onChange={chosen ? setPreferredIds : setPoolIds} multiple presentation={presentation}
    placeholder={chosen ? "Cerca un distrattore preferito…" : "Cerca le parole del gruppo…"} />;
  return <BuilderModal exercise={exercise} editNotice={editNotice} onClose={onClose} onSave={onSave} heading="Trova la parola"
    title={title} onTitleChange={setTitle} titlePlaceholder={suggestedTitle} build={build} saveDisabled={Boolean(problem)} summary={summary}
    navigation={{ step, back: () => setStep(step - 1), next, canContinue: step === 1 ? targetReady : !problem }}>
    <div className="recognition-wizard" data-step={step}>
      <ol className="recognition-progress" aria-label="Passi della configurazione">
        {["Parole", "Distrattori", "Opzioni"].map((label, index) => {
          const destination = index + 1;
          return <li key={label} aria-current={step === destination ? "step" : undefined}>
            {exercise ? <button type="button" onClick={() => setStep(destination)}
              disabled={destination === 2 && !targetReady || destination === 3 && Boolean(problem)}>{label}</button> : <span>{label}</span>}
          </li>;
        })}
      </ol>
      <h3 ref={heading} tabIndex={-1}><small>Passo {step} di 3</small>{stepNames[step - 1]}</h3>
      {step === 1 && <>
        <Choices label="Quali parole deve trovare?" selected={targetSource} values={[["random", "A caso"], ["categories", "Categorie selezionate"], ["chosen", "Le scelgo io"]]}
          onSelect={value => { setTargetSource(value); if (value === "random") setStep(2); }} />
        {targetSource === "categories" && <Categories options={categories} selected={targetCategories} onChange={setTargetCategories} />}
        {chosen && <FullTextItemPicker items={words} selectedIds={targetIds} onChange={setTargetIds} multiple presentation={presentation} placeholder="Cerca le parole da trovare…" />}
      </>}
      {step === 2 && <>
        <Choices compact label="Numero di distrattori" selected={count} values={counts.map(n => [n, String(n)] as const)} onSelect={n => {
          setCount(n); if (n === 4 && manual) setAlternativeSource("mixed");
        }} />
        <Choices<AlternativeSource> label="Origine dei distrattori" selected={manual ? "manual" : source}
          values={[["mixed", "A caso tra le parole disponibili"], ["same-category", "Stessa categoria del bersaglio"],
            ...(canChooseManually && count <= 3 ? [["manual", "Li scelgo io"]] as const : [])]} onSelect={selectAlternative} />
        {manual && <>
          <div className="builder-label">Alternative da mostrare <span>{alternatives.length}/{count}</span></div>
          <FullTextItemPicker items={words.filter(item => !targetIds.includes(item.id))} selectedIds={alternatives}
            onChange={setManualIds} multiple presentation={presentation} placeholder="Cerca le alternative…" max={count} />
        </>}
        {problem && <div>
          <p className="wizard-error" role="alert">{problem}</p>
          {presentation === "images" && !configurationProblem(selectedOrigin, "words") &&
            <button type="button" className="ghost-button" onClick={() => setPresentation("words")}>Usa risposte in parole</button>}
        </div>}
        {!manual && <details className="builder-advanced" key={targetSource}>
          <summary>Filtri facoltativi <small>{syllables === "all" ? "Parole e sillabe" : `Sillabe: ${syllables}`}</small></summary>
          <div>{chosen && <Categories options={categories} selected={alternativeCategories} onChange={setAlternativeCategories} />}
            <Choices<SyllableFilter> compact label="Numero di sillabe" selected={syllables} values={[["all","Tutte"],["2","2"],["3","3"],["2-3","2 o 3"],["4+","4 o più"]]} onSelect={setSyllables} />
            {poolPicker}
            {chosen && <p className="field-note">Con distrattori casuali, il gioco completa le alternative mancanti con parole compatibili.</p>}
          </div>
        </details>}
      </>}
      {step === 3 && <>
        {manual ? <p className="field-note">Un turno con bersaglio e alternative scelti a mano.</p> :
          <label>Numero di turni<NumericField min={1} max={50} value={rounds} onValueChange={setRounds} /></label>}
        <div className="builder-switches">
          <CheckLine role="switch" checked={presentation === "images"} onChange={show => setPresentation(show ? "images" : "words")} title="Mostra le immagini nelle risposte" />
          <CheckLine role="switch" checked={autoPronounce} onChange={setAutoPronounce} title="Pronuncia il bersaglio all’inizio del turno" />
        </div>
        {problem && <p className="wizard-error" role="alert">{problem}</p>}
      </>}
    </div>
  </BuilderModal>;
}
