import { type SyllableFilter } from "../../domain/syllabification";
import { type CategoryOptions, type DistractorSource, type Presentation } from "../../shared/types";
import { CheckLine } from "../../shared/ui/form-controls";

export function CategoryExerciseOptions({ value, onChange }: { value: CategoryOptions; onChange: (next: CategoryOptions) => void }) {
  return <fieldset className="category-options"><legend>Presentazione parola e categorie</legend>{([
    ["categorySpeakWord", "Pronuncia la parola all’inizio del turno"],
    ["categoryShowTargetImage", "Mostra anche l’immagine della parola"],
    ["categoryShowSymbols", "Mostra le immagini delle categorie"],
  ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(value[key])} onChange={(event) => onChange({ ...value, [key]: event.target.checked })} />{label}</label>)}<small>Le immagini delle categorie si assegnano nella libreria. La conferma vocale dopo la risposta corretta rimane indipendente.</small></fieldset>;
}

export function WizardBack({ onClick }: { onClick: () => void }) {
  return <button className="wizard-back" type="button" onClick={onClick}>← Indietro</button>;
}

export function CorrectMatchPronunciation({ kind, checked, onChange }: { kind: "articles" | "word-categories"; checked: boolean; onChange: (value: boolean) => void }) {
  return <CheckLine className="pronunciation-option" checked={checked} onChange={onChange} title="Pronuncia dopo l’abbinamento corretto" detail={kind === "articles" ? "Legge articolo e parola, ad esempio: il gatto." : "Legge il nome della categoria corretta."} />;
}

export function RecognitionPresentationFields({ presentation, autoPronounce, onPresentationChange, onAutoPronounceChange }: { presentation: Presentation; autoPronounce: boolean; onPresentationChange: (value: Presentation) => void; onAutoPronounceChange: (value: boolean) => void }) {
  return <><label>Presentazione<select value={presentation} onChange={(event) => onPresentationChange(event.target.value as Presentation)}><option value="images">Foto + parole</option><option value="words">Solo parole</option></select></label><CheckLine className="pronunciation-option" checked={autoPronounce} onChange={onAutoPronounceChange} title="Pronuncia automatica" detail="Legge la parola quando compare, con immagini o con sole parole." /></>;
}

export function RecognitionRandomParameterFields({ distractorCount, distractorSource, syllables, onDistractorCountChange, onDistractorSourceChange, onSyllablesChange }: { distractorCount: 1 | 2 | 3 | 4; distractorSource: DistractorSource; syllables: SyllableFilter; onDistractorCountChange: (value: 1 | 2 | 3 | 4) => void; onDistractorSourceChange: (value: DistractorSource) => void; onSyllablesChange: (value: SyllableFilter) => void }) {
  return <><label>Distrattori<select value={distractorCount} onChange={(event) => onDistractorCountChange(Number(event.target.value) as 1 | 2 | 3 | 4)}><option value={1}>1 distrattore</option><option value={2}>2 distrattori</option><option value={3}>3 distrattori</option><option value={4}>4 distrattori</option></select></label><label>Origine distrattori<select value={distractorSource} onChange={(event) => onDistractorSourceChange(event.target.value as DistractorSource)}><option value="mixed">Tutte le parole selezionate</option><option value="same-category">Solo stessa categoria</option></select></label><label>Numero di sillabe<select value={syllables} onChange={(event) => onSyllablesChange(event.target.value as SyllableFilter)}><option value="all">Tutte</option><option value="2">2 sillabe</option><option value="3">3 sillabe</option><option value="2-3">2 o 3 sillabe</option><option value="4+">4 o più sillabe</option></select></label></>;
}

export function QuantityLearningOptions({ speakNumbers, errorless, onSpeakNumbersChange, onErrorlessChange }: { speakNumbers: boolean; errorless: boolean; onSpeakNumbersChange: (value: boolean) => void; onErrorlessChange: (value: boolean) => void }) {
  return <><CheckLine className="pronunciation-option quick-wide-setting" checked={speakNumbers} onChange={onSpeakNumbersChange} title="Pronuncia i numeri selezionati" detail="Conta uno, due, tre… quando viene selezionato un oggetto. Rispetta il volume della sessione." /><CheckLine className="pronunciation-option quick-wide-setting" checked={errorless} onChange={onErrorlessChange} title="Apprendimento senza errori" detail="Al raggiungimento della quantità corretta registra il successo e blocca gli oggetti. Nessun timer di errore o avanzamento automatico: prosegui solo con Continua o dal telefono. Modalità indicata separatamente nelle statistiche." /></>;
}
