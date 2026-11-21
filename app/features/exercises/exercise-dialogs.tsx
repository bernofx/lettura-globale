import { AlertTriangle, Save, Trash2, X } from "lucide-react";
import { useState } from "react";
import { type Sequence } from "../../shared/types";

export function SequenceDialog({ sequence, therapistId, onClose, onSave }: { sequence?: Sequence; therapistId: string; onClose: () => void; onSave: (sequence: Sequence) => void }) {
  const [title, setTitle] = useState(sequence?.title ?? "");
  const save = () => onSave({ ...sequence, id: sequence?.id ?? crypto.randomUUID(), title: title.trim(), exerciseIds: sequence?.exerciseIds ?? [], therapistId: sequence?.therapistId ?? therapistId, updatedAt: new Date().toISOString(), deleted: false });
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="sequence-dialog-title"><div className="modal"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">{sequence ? "MODIFICA SEQUENZA" : "NUOVA SEQUENZA"}</span><h2 id="sequence-dialog-title">{sequence ? "Rinomina la sequenza" : "Crea una sequenza"}</h2><p>Gli esercizi si aggiungono e si riordinano dalla pagina successiva.</p><label>Nome della sequenza<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Es. Parole della settimana" /></label><div className="modal-actions"><button className="ghost-button" type="button" onClick={onClose}>Annulla</button><button className="primary-button" type="button" disabled={!title.trim()} onClick={save}><Save />Salva sequenza</button></div></div></div>;
}

export function ContentDeleteDialog({ title, detail, onCancel, onConfirm }: { title: string; detail: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="content-delete-title"><div className="modal delete-modal"><span className="delete-icon"><AlertTriangle /></span><span className="eyebrow">CONFERMA ELIMINAZIONE</span><h2 id="content-delete-title">{title}</h2><p>{detail}</p><div className="modal-actions"><button className="ghost-button" type="button" onClick={onCancel}>Annulla</button><button className="danger-button solid" type="button" onClick={onConfirm}><Trash2 />Elimina</button></div></div></div>;
}
