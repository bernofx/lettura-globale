import { readSaveJournal } from "../../domain/save-journal";
import { Modal, ModalActions, ModalTitle } from "../../shared/ui/modal";

export function SaveJournalDialog({ onClose, onRetry }: { onClose: () => void; onRetry?: () => void }) {
  const entries = readSaveJournal(localStorage);
  const copy = async () => { await navigator.clipboard.writeText(JSON.stringify(entries, null, 2)); };
  return <Modal labelledBy="save-journal-title" onClose={onClose} closeButton>
    <ModalTitle id="save-journal-title" eyebrow="DIAGNOSTICA">Journal salvataggi</ModalTitle>
    <p>Le ultime operazioni tecniche di questo dispositivo. Non contiene nomi, parole o immagini.</p>
    <div className="save-journal-list">{entries.length ? entries.slice().reverse().map((entry, index) => <div key={`${entry.at}-${index}`}><time>{entry.at}</time><strong>{entry.event}</strong><small>{[entry.errorCode, entry.reason, entry.httpStatus, entry.revision === undefined ? undefined : `rev ${entry.revision}`, entry.changedSequences === undefined ? undefined : `sequenze ${entry.changedSequences}`, entry.diagnosticId ? `diagnosi ${entry.diagnosticId}` : undefined].filter(Boolean).join(" · ")}</small></div>) : <p>Nessuna operazione registrata.</p>}</div>
    <ModalActions onCancel={onClose} cancelLabel="Chiudi">
      {onRetry && <button className="ghost-button" type="button" onClick={onRetry}>Riprova salvataggio</button>}
      <button className="primary-button" type="button" onClick={() => void copy()}>Copia journal</button>
    </ModalActions>
  </Modal>;
}
