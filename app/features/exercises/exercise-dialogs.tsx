import { Save } from "lucide-react";
import { useState } from "react";
import { type Sequence } from "../../shared/types";
import { ConfirmDialog, Modal, ModalActions, ModalTitle } from "../../shared/ui/modal";

export function SequenceDialog({ sequence, therapistId, onClose, onSave }: { sequence?: Sequence; therapistId: string; onClose: () => void; onSave: (sequence: Sequence) => void }) {
  const [title, setTitle] = useState(sequence?.title ?? "");
  const save = () => onSave({ ...sequence, id: sequence?.id ?? crypto.randomUUID(), title: title.trim(), exerciseIds: sequence?.exerciseIds ?? [], therapistId: sequence?.therapistId ?? therapistId, updatedAt: new Date().toISOString(), deleted: false });
  return <Modal labelledBy="sequence-dialog-title" onClose={onClose} closeButton>
    <ModalTitle id="sequence-dialog-title" eyebrow={sequence ? "MODIFICA SEQUENZA" : "NUOVA SEQUENZA"}>{sequence ? "Rinomina la sequenza" : "Crea una sequenza"}</ModalTitle>
    <p>Gli esercizi si aggiungono e si riordinano dalla pagina successiva.</p>
    <label>Nome della sequenza<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Es. Parole della settimana" /></label>
    <ModalActions onCancel={onClose}>
      <button className="primary-button" type="button" disabled={!title.trim()} onClick={save}><Save />Salva sequenza</button>
    </ModalActions>
  </Modal>;
}

export function ContentDeleteDialog({ title, detail, onCancel, onConfirm }: { title: string; detail: string; onCancel: () => void; onConfirm: () => void }) {
  return <ConfirmDialog labelledBy="content-delete-title" eyebrow="CONFERMA ELIMINAZIONE" title={title} confirmLabel="Elimina" onCancel={onCancel} onConfirm={onConfirm}>
    <p>{detail}</p>
  </ConfirmDialog>;
}
