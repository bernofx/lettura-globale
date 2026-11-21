"use client";

import { Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PuzzleImage } from "../../domain/puzzle-library";
import { ConfirmDialog, Modal, ModalActions, ModalTitle } from "../../shared/ui/modal";
import type { PuzzleLibrary } from "../games/use-puzzle-library";
import "./puzzle-library-panel.css";
import { supportsMultipleFiles } from "../../domain/android-bridge";

export function PuzzleLibraryPanel({ catalog, search, onAdd }: { catalog: PuzzleLibrary; search: string; onAdd: () => void }) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<PuzzleImage | null>(null);
  const query = search.trim().toLocaleLowerCase("it");
  const images = catalog.images.filter(image => image.title.toLocaleLowerCase("it").includes(query));
  const visible = expanded || query ? images : images.slice(0, 4);

  async function remove(image: PuzzleImage) {
    setConfirm(null);
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await catalog.remove(image.id);
      setMessage("Immagine rimossa dai puzzle.");
    } catch {
      setError("Impossibile rimuovere l’immagine. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="library-area puzzle-library" aria-labelledby="puzzle-library-title">
      <div className="section-heading">
        <div>
          <h2 id="puzzle-library-title">Puzzle</h2>
          <p>Le immagini salvate qui compaiono in Giochi → Puzzle a incastro.</p>
        </div>
        <button type="button" className="primary-button" onClick={onAdd}><Plus size={18} />Aggiungi immagini</button>
      </div>
      {!catalog.ready && !catalog.error && <p role="status">Connettiti al cloud per aprire il catalogo dei puzzle.</p>}
      {busy && <p role="status">Operazione in corso…</p>}
      {catalog.pending > 0 && <p role="status">
        {catalog.pending === 1 ? "Un’immagine in attesa di sincronizzazione." : catalog.pending + " immagini in attesa di sincronizzazione."}
      </p>}
      {(error || catalog.error) && <p className="form-error" role="alert">{error || catalog.error}</p>}
      {message && <p role="status">{message}</p>}
      {visible.length > 0 && (
        <div className="category-library-grid">
          {visible.map(image => (
            <article className="category-library-card" key={image.id}>
              <div className="category-library-art puzzle-library-art" aria-hidden="true"
                style={{ backgroundImage: "url(" + JSON.stringify(image.image) + ")" }} />
              <h3>{image.title}</h3>
              <button type="button" className="ghost-button" disabled={busy} aria-label={"Rimuovi " + image.title}
                onClick={() => setConfirm(image)}><Trash2 size={16} aria-hidden="true" /> Rimuovi</button>
            </article>
          ))}
        </div>
      )}
      {!query && images.length > 4 && (
        <button type="button" className="ghost-button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
          {expanded ? "Riduci anteprime" : "Mostra tutte le immagini puzzle"}
        </button>
      )}
      {confirm && <ConfirmDialog labelledBy="puzzle-delete-title" eyebrow="PUZZLE"
        title={"Rimuovere «" + confirm.title + "» dai puzzle?"} confirmLabel="Rimuovi immagine"
        onCancel={() => setConfirm(null)} onConfirm={() => void remove(confirm)}>
        L’immagine verrà rimossa da tutti i dispositivi dell’account.
      </ConfirmDialog>}
    </section>
  );
}

export function PuzzleUploadDialog({ catalog, onClose, onSaved }: { catalog: PuzzleLibrary; onClose: () => void; onSaved: (count: number) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const [multiple] = useState(() => supportsMultipleFiles());
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function upload() {
    if (busy || !catalog.ready || !rights || !files.length) return;
    setBusy(true);
    setError("");
    try {
      const { saved, queued, failed } = await catalog.upload(files);
      if (!mounted.current) return;
      if (saved) onSaved(saved);
      if (!failed) {
        onClose();
        return;
      }
      setError(failed === files.length
        ? "Caricamento non riuscito. Riprova con file JPG, PNG o WebP."
        : failed + " file non sono stati salvati. Seleziona di nuovo quei file.");
      if (saved || queued) {
        setFiles([]);
        setRights(false);
        if (input.current) input.current.value = "";
      }
    } catch {
      if (mounted.current) setError("Impossibile caricare le immagini. Riprova.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <Modal labelledBy="puzzle-upload-title" className="puzzle-upload-dialog" onClose={busy ? undefined : onClose}
      closeButton onSubmit={event => { event.preventDefault(); void upload(); }}>
      <ModalTitle id="puzzle-upload-title" eyebrow="PUZZLE">Aggiungi immagini ai puzzle</ModalTitle>
      <button className="drop-zone" type="button" disabled={busy} onClick={() => input.current?.click()}>
        <Upload aria-hidden="true" />
        <strong>{files.length === 0 ? (multiple ? "Scegli una o più immagini" : "Scegli un’immagine") : files.length === 1 ? "1 immagine selezionata" : files.length + " immagini selezionate"}</strong>
        <small>{files.length ? "Cambia selezione" : "JPG, PNG o WebP"}</small>
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} hidden disabled={busy}
        onChange={event => {
          setFiles(Array.from(event.target.files ?? []));
          setRights(false);
          setError("");
        }} />
      {files.length > 0 && <label className="check-line">
        <input type="checkbox" checked={rights} disabled={busy} onChange={event => setRights(event.target.checked)} />
        Confermo di avere i diritti per usare queste immagini.
      </label>}
      {!catalog.ready && !catalog.error && <p role="status">Connettiti al cloud per aprire il catalogo dei puzzle.</p>}
      {(error || catalog.error) && <p className="form-error" role="alert">{error || catalog.error}</p>}
      <ModalActions onCancel={onClose} cancelDisabled={busy}>
        <button className="primary-button" type="submit" disabled={!catalog.ready || !files.length || !rights || busy}>
          {busy ? "Caricamento…" : "Carica immagini"}
        </button>
      </ModalActions>
    </Modal>
  );
}
