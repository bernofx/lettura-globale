import { useState, type ComponentProps } from "react";
import { differentExerciseSettings, exerciseEditStatus } from "../../domain/exercise-edit-version";
import { exerciseKind } from "../../shared/constants";
import type { Exercise, LibraryItem } from "../../shared/types";
import { Modal, ModalActions, ModalTitle } from "../../shared/ui/modal";
import { ExerciseBuilder } from "./exercise-builder";

const settingNames: Partial<Record<keyof Exercise, string>> = {
  title: "Titolo", kind: "Attività", promptId: "Bersaglio", optionIds: "Opzioni", rounds: "Turni",
  articleItemIds: "Immagini IL/LA", categoryItemIds: "Immagini da classificare", categoryNames: "Categorie",
  categorySpeakWord: "Pronuncia iniziale", categoryShowTargetImage: "Immagine bersaglio", categoryShowSymbols: "Simboli delle categorie",
  categorySymbolIds: "Immagini delle categorie", recognitionMode: "Scelta delle parole", recognitionItemIds: "Parole disponibili",
  recognitionTargetIds: "Parole bersaglio", recognitionCategories: "Categorie disponibili", recognitionSyllables: "Sillabe",
  namingItemIds: "Immagini da nominare", namingCategories: "Categorie da nominare", quantityMin: "Quantità minima",
  quantityMax: "Quantità massima", quantityObjectSet: "Oggetti da contare", quantityTarget: "Quantità richiesta",
  quantityObject: "Oggetto", quantityAutoComplete: "Conferma automatica", quantitySpeakNumbers: "Pronuncia dei numeri",
  quantityErrorless: "Apprendimento senza errori", quantityIdleSeconds: "Secondi di attesa", sentenceItemIds: "Frasi",
  sentenceOptionCount: "Immagini per turno", sentenceDifficulty: "Gradi di libertà", distractorCount: "Distrattori",
  distractorSource: "Origine dei distrattori", presentation: "Presentazione", autoPronounce: "Pronuncia automatica",
};

const optionLabels: Record<string, string> = {
  recognition: "Trova la parola", articles: "IL/LA", "word-categories": "Parola nella categoria", naming: "Mix and vary",
  "number-quantity": "Numero quantità", "sentence-matching": "Abbina la frase", fixed: "Fissa", random: "Casuale",
  images: "Immagini", words: "Parole", "same-category": "Stessa categoria", all: "Tutte",
  candy: "Caramelle", stone: "Sassolini", ladybug: "Coccinelle",
};

function settingValue(exercise: Exercise, key: keyof Exercise, library: LibraryItem[]) {
  const value = exercise[key];
  const word = (id: string) => library.find(item => item.id === id)?.word ?? "Immagine non disponibile";
  if (value === undefined || value === null || value === "") return "Predefinito";
  if (Array.isArray(value)) return (key.endsWith("Ids") ? value.map(word) : value).join(", ") || "Nessuna selezione";
  if (typeof value === "object") return Object.entries(value).map(([name, id]) => name + " · " + word(id)).join(", ");
  if (typeof value === "boolean") return value ? "Sì" : "No";
  if (key === "promptId") return word(String(value));
  if (key === "title") return String(value);
  if (value === "mixed") return key === "quantityObjectSet" ? "Oggetti casuali" : "Tutta la libreria";
  return Object.hasOwn(optionLabels, value) ? optionLabels[value] : String(value);
}

type Props = ComponentProps<typeof ExerciseBuilder> & { current?: Exercise; recovered?: boolean };

export function ExerciseEditor({ exercise, current, recovered, kind, onSave, onClose, ...props }: Props) {
  const [baseline, setBaseline] = useState(recovered ? exercise : current);
  const [form, setForm] = useState(exercise);
  const [review, setReview] = useState<{ draft: Exercise; seen?: Exercise } | null>(recovered && exercise ? { draft: exercise, seen: current } : null);
  const [formVersion, setFormVersion] = useState(0);

  const save = (draft: Exercise) => {
    if (!exercise) return onSave(draft);
    if (!baseline || !current || exerciseEditStatus(baseline, current) !== "current") {
      setReview({ draft, seen: current });
      return;
    }
    onSave({ ...draft, ownerAdultId: current.ownerAdultId, sequenceId: current.sequenceId,
      templateExerciseId: current.templateExerciseId, sourceExerciseId: current.sourceExerciseId });
  };

  const available = baseline && current && exerciseEditStatus(baseline, current) !== "unavailable";
  const reviewed = review?.seen && current && exerciseEditStatus(review.seen, current) === "current";
  const differences = review && current && available ? differentExerciseSettings(review.draft, current) : [];
  return <>
    <div hidden={Boolean(review)}>
      <ExerciseBuilder key={formVersion} {...props} kind={form ? exerciseKind(form) : kind} exercise={form} onClose={onClose} onSave={save} />
    </div>
    {review && <Modal labelledBy="exercise-edit-conflict" className="wide exercise-edit-conflict" trapFocus onClose={() => setReview(null)}>
      <ModalTitle id="exercise-edit-conflict">{available ? "L’esercizio è cambiato" : "Esercizio non più disponibile"}</ModalTitle>
      {available && current ? <>
        <p>Confronta la tua bozza con le impostazioni aggiornate. Se prosegui con la bozza, premi «Salva esercizio» nel modulo per sostituirle.</p>
        <dl>{differences.map(key => <div key={key}><dt>{settingNames[key] ?? key}</dt>
          <dd><b>La tua bozza</b> {settingValue(review.draft, key, props.library)}</dd>
          <dd><b>Versione aggiornata</b> {settingValue(current, key, props.library)}</dd></div>)}</dl>
        {!differences.length && <p>Le due configurazioni coincidono.</p>}
        {!reviewed && <p role="status">È arrivato un altro aggiornamento.</p>}
        <ModalActions onCancel={() => { setBaseline(current); setForm(current); setFormVersion(v => v + 1); setReview(null); }} cancelLabel="Usa la versione aggiornata">
          {reviewed ? <button type="button" className="primary-button" onClick={() => { setBaseline(current); setReview(null); }}>Prosegui con la mia bozza</button>
            : <button type="button" className="primary-button" onClick={() => setReview({ ...review, seen: current })}>Rivedi il confronto</button>}
        </ModalActions>
      </> : <>
        <p>La bozza è ancora nel modulo. L’esercizio è stato rimosso o non è più accessibile da questo profilo.</p>
        <ModalActions onCancel={onClose} cancelLabel="Chiudi senza salvare"><button className="primary-button" type="button" onClick={() => setReview(null)}>Torna alla bozza</button></ModalActions>
      </>}
    </Modal>}
  </>;
}
