import { ArrowRight, Save } from "lucide-react";
import { useState } from "react";
import { applyExerciseForm } from "../../domain/sequence-exercise-editor";
import type { Exercise } from "../../shared/types";
import { Modal, ModalActions, ModalTitle } from "../../shared/ui/modal";

type BuilderModalProps = {
  summary: string;
  exercise?: Exercise;
  editNotice?: string;
  build: () => Exercise;
  heading: string;
  description?: string;
  navigation?: { step: number; back: () => void; next?: () => void; canContinue?: boolean };
  title: string;
  onTitleChange: (title: string) => void;
  titlePlaceholder: string;
  saveDisabled?: boolean;
  onSave: (draft: Exercise) => void;
  onClose: () => void;
  children: React.ReactNode;
};

/** Shared frame of every exercise editor: heading, title field and Annulla/Salva footer. */
export function BuilderModal({ navigation, summary, exercise, editNotice, build, heading, description, title, onTitleChange, titlePlaceholder, saveDisabled, onSave, onClose, children }: BuilderModalProps) {
  const [initialForm] = useState(() => exercise ? build() : null);
  const [blankTitle, setBlankTitle] = useState(false);
  const showSave = !navigation || navigation.step === 3;
  const back = navigation && navigation.step > 1 ? navigation.back : undefined;
  const submit = () => {
    const draft = build();
    onSave(exercise && initialForm ? applyExerciseForm(exercise, initialForm, draft) : draft);
  };
  return <Modal labelledBy="exercise-builder-title" className="wide exercise-builder" onClose={onClose} closeButton trapFocus>
    <ModalTitle id="exercise-builder-title" eyebrow={exercise ? "MODIFICA ESERCIZIO" : "NUOVO ESERCIZIO"}>{heading}</ModalTitle>
    {description && <p>{description}</p>}
    {editNotice && <p className="field-note">{editNotice}</p>}
    {children}
    {showSave && <>
      <label>Titolo<input id="exercise-title" value={title || (blankTitle ? "" : titlePlaceholder)}
        onBlur={() => setBlankTitle(false)} onChange={(event) => { setBlankTitle(!event.target.value); onTitleChange(event.target.value); }} placeholder={titlePlaceholder} /></label>
      <p className="builder-summary">{summary}</p>
    </>}
    <ModalActions onCancel={back ?? onClose} cancelLabel={back ? "Indietro" : "Annulla"}>
      {showSave && <button className="primary-button" type="button" disabled={saveDisabled} onClick={submit}><Save />Salva esercizio</button>}
      {navigation?.next && <button className="primary-button" type="button" disabled={!navigation.canContinue} onClick={navigation.next}>Avanti<ArrowRight /></button>}
    </ModalActions>
  </Modal>;
}
