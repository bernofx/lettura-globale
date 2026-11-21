"use client";

import { Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { PuzzleImage } from "../../domain/puzzle-library";
import { ConfirmDialog } from "../../shared/ui/modal";
import type { PuzzleLibrary } from "../games/use-puzzle-library";
import "./puzzle-library-panel.css";

export function PuzzleLibraryPanel({ catalog, search }: { catalog: PuzzleLibrary; search: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<PuzzleImage | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const query = search.trim().toLocaleLowerCase("it");
  const images = catalog.images.filter(image => image.title.toLocaleLowerCase("it").includes(query));
  const visible = expanded || query ? images : images.slice(0, 4);

  async function upload() {
    if (busy || !catalog.ready || !rights || !files.length) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const { saved, queued, failed } = await catalog.upload(files);
      if (saved) setMessage(saved === 1 ? "Immagine salvata." : saved + " immagini salvate.");
      if (failed) setError(failed === files.length
        ? "Caricamento non riuscito. Riprova con file JPEG, PNG o WebP."
        : failed + " file non sono stati salvati. Riprova a caricare quei file.");
      if (saved || queued) {
        setFiles([]);
        setRights(false);
        if (input.current) input.current.value = "";
      }
    } finally {
      setBusy(false);
    }
  }

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
      </div>
      <form className="puzzle-library-form" onSubmit={event => { event.preventDefault(); void upload(); }}>
        <label>Immagini per i puzzle
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy}
            onChange={event => {
              setFiles(Array.from(event.target.files ?? []));
              setRights(false);
              setMessage("");
              setError("");
            }} />
        </label>
        {files.length > 0 && <label className="check-line">
          <input type="checkbox" checked={rights} disabled={busy} onChange={event => setRights(event.target.checked)} />
          Confermo di avere i diritti per usare queste immagini.
        </label>}
        <button className="primary-button" type="submit" disabled={!catalog.ready || !files.length || !rights || busy}>
          <Upload size={18} aria-hidden="true" /> Carica immagini
        </button>
      </form>
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
