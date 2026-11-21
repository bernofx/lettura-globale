"use client";

import { useEffect, useRef, useState } from "react";
import type { PuzzleImage } from "../../domain/puzzle-library";
import { FilePicker, IMAGE_FILE_ACCEPT, IMAGE_FILE_HINT } from "../../shared/ui/file-picker";
import { SectionHeading } from "../../shared/ui/headings";
import { prepareUploadedImage } from "../../shared/media-storage";
import type { LibraryItem } from "../../shared/types";
import { demoPuzzleImage, puzzleGrids, type PuzzleSize } from "./puzzle-art";
import type { PuzzleSelection } from "./puzzle-game";
import { supportsMultipleFiles } from "../../domain/android-bridge";

type PuzzleSource = { id: string; title: string; image: string };
const examples: PuzzleSource[] = [{ id: "demo:casa", title: "Casa", image: demoPuzzleImage }];
const formats = (Object.keys(puzzleGrids) as PuzzleSize[]).map(size => {
  const { rows, columns } = puzzleGrids[size];
  return { size, label: rows + " × " + columns, pieces: rows * columns };
});

export function PuzzleGallery({ library, puzzleImages, onStart }: { library: LibraryItem[]; puzzleImages: PuzzleImage[]; onStart: (selection: PuzzleSelection) => void }) {
  const [libraryIds, setLibraryIds] = useState<string[]>([]);
  const [localImages, setLocalImages] = useState<PuzzleSource[]>([]);
  const [busy, setBusy] = useState(false);
  // Older Android APKs return no file at all for multi-file pickers: ask for one there.
  const [allowMultiple] = useState(() => supportsMultipleFiles());
  const [error, setError] = useState("");
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const libraryImages = library.flatMap(item => item.image
    ? [{ id: item.id, title: item.word, image: item.image }]
    : []);
  const inGallery = new Set(libraryIds);
  const availableImages = libraryImages.filter(item => !inGallery.has(item.id));
  const sources = [
    ...examples,
    ...puzzleImages,
    ...libraryImages.filter(item => inGallery.has(item.id)).map(item => ({ ...item, id: "library:" + item.id })),
    ...localImages,
  ];

  async function upload(files: File[]) {
    if (!files.length) return;
    setError("");
    setBusy(true);
    const added: PuzzleSource[] = [];
    let failed = false;
    for (const file of files) {
      if (!active.current) return;
      try {
        const image = await prepareUploadedImage(file);
        added.push({
          id: "device:" + crypto.randomUUID(),
          title: file.name.replace(/\.[^.]+$/, "").trim() || "Immagine dal dispositivo",
          image,
        });
      } catch {
        failed = true;
      }
    }
    if (!active.current) return;
    setLocalImages(previous => [...previous, ...added]);
    setError(failed ? "Una o più immagini non si aprono. Scegli file JPEG, PNG o WebP." : "");
    setBusy(false);
  }

  async function start(source: PuzzleSource, size: PuzzleSize) {
    setError("");
    setBusy(true);
    try {
      const image = new Image();
      image.src = source.image;
      await image.decode();
      if (active.current) onStart({ image, size });
    } catch {
      if (active.current) setError("Impossibile caricare «" + source.title + "». Riprova o scegli un’altra immagine.");
    } finally {
      if (active.current) setBusy(false);
    }
  }

  return (
    <>
      <section className="panel puzzle-gallery-tools" aria-labelledby="puzzle-gallery-tools-title">
        <SectionHeading id="puzzle-gallery-tools-title" title="Aggiungi immagini" description="Le immagini aggiunte qui restano disponibili fino all’uscita dalla galleria dei puzzle." />
        <div className="puzzle-gallery-inputs">
          <FilePicker accept={IMAGE_FILE_ACCEPT} hint={IMAGE_FILE_HINT} label={allowMultiple ? "Scegli immagini dal dispositivo" : "Scegli un’immagine dal dispositivo"}
            multiple={allowMultiple} disabled={busy} compact onFiles={files => void upload(files)} />
          {availableImages.length > 0 && <label>Da Libreria
            <select value="" disabled={busy} onChange={event => {
              const id = event.target.value;
              if (id) setLibraryIds(previous => [...previous, id]);
            }}>
              <option value="">Scegli un’immagine</option>
              {availableImages.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>}
        </div>
        {busy && <p role="status">Caricamento immagini…</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
      <section className="puzzle-gallery" aria-label="Immagini dei puzzle">
        {sources.map(source => (
          <article key={source.id} className="puzzle-gallery-card" aria-label={source.title}>
            <div className="puzzle-preview" aria-hidden="true" style={{ backgroundImage: "url(" + JSON.stringify(source.image) + ")" }} />
            <h2>{source.title}</h2>
            <div className="puzzle-formats" role="group" aria-label={"Formato per " + source.title}>
              {formats.map(({ size, label, pieces }) => (
                <button key={size} data-size={size} type="button" className="ghost-button" disabled={busy}
                  aria-label={source.title + " · " + label + " · " + pieces + " pezzi"}
                  onClick={() => void start(source, size)}>{label}</button>
              ))}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
