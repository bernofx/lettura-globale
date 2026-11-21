"use client";

import { Upload, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_GAME_SOUNDTRACK, GAME_SOUNDTRACK_URL, MAX_SOUNDTRACK_BYTES, MAX_SOUNDTRACK_SECONDS, type GameSoundtrack } from "../../domain/game-soundtrack";
import { PanelHeading } from "../../shared/ui/headings";

const uploadErrors: Record<string, string> = {
  size_limit: "Scegli un MP3 da massimo 6 MB.",
  duration_limit: "Scegli un MP3 da massimo 5 minuti.",
  mp3_required: "Il file non è un MP3 valido.",
  authentication_required: "Accedi nuovamente per salvare la colonna sonora.",
};

export function GameSoundtrackPanel() {
  const [soundtrack, setSoundtrack] = useState<GameSoundtrack | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${GAME_SOUNDTRACK_URL}?info`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error();
        const data = await response.json() as { soundtrack: GameSoundtrack | null };
        if (!controller.signal.aborted) setSoundtrack(data.soundtrack);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Impossibile verificare la colonna sonora nel cloud.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, []);

  function selectFile(nextFile: File | null) {
    setFile(null);
    setRights(false);
    setMessage("");
    setError("");
    if (!nextFile) return;
    if (!/\.mp3$/i.test(nextFile.name) && !["audio/mpeg", "audio/mp3"].includes(nextFile.type)) {
      setError(uploadErrors.mp3_required);
    } else if (!nextFile.size || nextFile.size > MAX_SOUNDTRACK_BYTES) {
      setError(uploadErrors.size_limit);
    } else {
      setFile(nextFile);
    }
  }

  async function save(method: "PUT" | "DELETE") {
    if (busy || (method === "PUT" && (!file || !rights))) return;
    setBusy(true);
    setError("");
    setMessage("");
    const fallback = method === "PUT" ? "Impossibile salvare la colonna sonora. Riprova." : "Impossibile ripristinare la musica predefinita. Riprova.";
    try {
      const response = await fetch(GAME_SOUNDTRACK_URL, method === "PUT" && file ? {
        method,
        headers: { "content-type": "audio/mpeg", "x-soundtrack-name": encodeURIComponent(Array.from(file.name).slice(0, 80).join("")) },
        body: file,
      } : { method });
      const data = await response.json() as { soundtrack?: GameSoundtrack | null; error?: string };
      if (!response.ok) {
        setError(data.error ? uploadErrors[data.error] ?? fallback : fallback);
        return;
      }
      setSoundtrack(data.soundtrack ?? null);
      setFile(null);
      setRights(false);
      if (input.current) input.current.value = "";
      setMessage(method === "PUT" ? "Colonna sonora salvata nel cloud." : "Musica predefinita ripristinata.");
    } catch {
      setError(fallback);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel game-soundtrack-panel">
      <PanelHeading eyebrow="AUDIO" title="Colonna sonora dei giochi" description="Carica un MP3 da usare come sottofondo nella sezione Giochi." />
      <div className="game-soundtrack-current">
        <strong>{loaded ? soundtrack?.name ?? "Musica predefinita · Tummy-Rumble Calypso" : "Caricamento della colonna sonora…"}</strong>
        {loaded && <audio key={soundtrack?.etag ?? "default"} controls preload="none" aria-label="Ascolta la colonna sonora dei giochi"
          src={soundtrack ? `${GAME_SOUNDTRACK_URL}?v=${encodeURIComponent(soundtrack.etag)}` : DEFAULT_GAME_SOUNDTRACK} />}
      </div>
      <form onSubmit={event => { event.preventDefault(); void save("PUT"); }}>
        <label className="game-soundtrack-file">File audio
          <input ref={input} type="file" accept=".mp3,audio/mpeg" disabled={!loaded || busy} onChange={event => selectFile(event.target.files?.[0] ?? null)} />
          <small>MP3, massimo {MAX_SOUNDTRACK_BYTES / 1_000_000} MB e {MAX_SOUNDTRACK_SECONDS / 60} minuti.</small>
        </label>
        {file && <label className="check-line">
          <input type="checkbox" checked={rights} disabled={busy} onChange={event => setRights(event.target.checked)} />
          Confermo di avere i diritti per usare questo audio.
        </label>}
        <div className="game-soundtrack-actions">
          <button className="primary-button" type="submit" disabled={!file || !rights || busy}><Upload size={18} aria-hidden="true" /> Carica MP3</button>
          {soundtrack && <button className="ghost-button" type="button" disabled={busy} onClick={() => void save("DELETE")}><Undo2 size={18} aria-hidden="true" /> Ripristina musica predefinita</button>}
        </div>
        {busy && <p role="status">Salvataggio nel cloud…</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}
