import { X } from "lucide-react";
import { readSaveJournal } from "../../domain/save-journal";

export function SaveJournalDialog({ onClose }: { onClose: () => void }) {
  const entries = readSaveJournal(localStorage);
  const copy = async () => { await navigator.clipboard.writeText(JSON.stringify(entries, null, 2)); };
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="save-journal-title"><div className="modal"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">DIAGNOSTICA</span><h2 id="save-journal-title">Journal salvataggi</h2><p>Le ultime operazioni tecniche di questo dispositivo. Non contiene nomi, parole o immagini.</p><div className="save-journal-list">{entries.length ? entries.slice().reverse().map((entry, index) => <div key={`${entry.at}-${index}`}><time>{entry.at}</time><strong>{entry.event}</strong><small>{[entry.errorCode, entry.httpStatus, entry.revision === undefined ? undefined : `rev ${entry.revision}`, entry.changedSequences === undefined ? undefined : `sequenze ${entry.changedSequences}`, entry.diagnosticId ? `diagnosi ${entry.diagnosticId}` : undefined].filter(Boolean).join(" · ")}</small></div>) : <p>Nessuna operazione registrata.</p>}</div><div className="modal-actions"><button className="ghost-button" type="button" onClick={onClose}>Chiudi</button><button className="primary-button" type="button" onClick={() => void copy()}>Copia journal</button></div></div></div>;
}
