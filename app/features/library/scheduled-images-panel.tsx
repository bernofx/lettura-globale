"use client";

import { Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_SCHEDULED_INPUT_LENGTH, SCHEDULED_IMAGES_URL, SCHEDULED_REPOSITORY,
  parseScheduledWords, scheduledImageStatuses, type ScheduledImageRequest,
} from "../../domain/scheduled-images";
import { fetchWithTimeout } from "../../shared/cloud-client";
import { SectionHeading } from "../../shared/ui/headings";
import { ConfirmDialog } from "../../shared/ui/modal";
import "./scheduled-images-panel.css";

type Queue = { requests: ScheduledImageRequest[]; workerConfigured: boolean };
type QueueReply = Queue & { accepted: number; submitted: number; token: string };
const cancellable = new Set(["queued", "needs_review", "failed"]);

export function ScheduledImagesPanel({ profileId }: { profileId: string }) {
  const [words, setWords] = useState("");
  const [queue, setQueue] = useState<Queue>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [confirmRotation, setConfirmRotation] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const requestId = useRef<symbol | null>(null);
  const mutating = useRef(false);

  const request = useCallback(async (body?: Record<string, unknown>) => {
    const headers = { "x-scheduled-images-profile": profileId, ...(body ? { "content-type": "application/json" } : {}) };
    const response = await fetchWithTimeout(SCHEDULED_IMAGES_URL, {
      headers, cache: "no-store", method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(response.status === 409 ? "request_changed" : "queue_unavailable");
    return await response.json() as QueueReply;
  }, [profileId]);

  const refresh = useCallback(async () => {
    if (mutating.current) return;
    const current = Symbol();
    requestId.current = current;
    try {
      const result = await request();
      if (current === requestId.current) {
        setQueue(result);
        setError("");
      }
    } catch {
      if (current === requestId.current) setError("Impossibile leggere la coda cloud. Riprova.");
    }
  }, [request]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh();
    }, 30_000);
    window.addEventListener("online", refresh);
    return () => {
      requestId.current = null;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
    };
  }, [refresh]);

  async function change(body: Record<string, unknown>, apply: (result: QueueReply) => void) {
    if (mutating.current) return;
    mutating.current = true;
    const current = Symbol();
    requestId.current = current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await request(body);
      if (current === requestId.current) apply(result);
    } catch (cause) {
      if (current === requestId.current) setError(cause instanceof Error && cause.message === "request_changed"
        ? "La richiesta è già cambiata. Aggiorna la lista." : "Modifica non salvata nel cloud. Riprova.");
    } finally {
      mutating.current = false;
      if (current === requestId.current) setBusy(false);
    }
  }

  function enqueue() {
    try { parseScheduledWords(words); }
    catch { setError("Inserisci da 1 a 20 parole o locuzioni, una per riga. Se serve, aggiungi una precisazione dopo il simbolo |."); return; }
    void change({ action: "enqueue", words }, result => {
      setQueue(result);
      setWords("");
      const ignored = result.submitted - result.accepted;
      setMessage(ignored ? `Richieste registrate ${result.accepted}. Già registrate ${ignored}.` : `Richieste registrate ${result.accepted}.`);
    });
  }

  function rotateKey() {
    setConfirmRotation(false);
    void change({ action: "rotate_key" }, result => {
      setToken(result.token);
      setQueue(previous => ({ requests: previous?.requests ?? [], workerConfigured: true }));
    });
  }

  const items = queue?.requests ?? [];
  const visible = expanded ? items : items.slice(0, 6);
  return <section className="panel library-area scheduled-images-panel" aria-labelledby="scheduled-images-title">
    <SectionHeading id="scheduled-images-title" title="Generazione programmata"
      description="Accoda parole per le immagini del catalogo condiviso. Usa soltanto termini e descrizioni che possono essere pubblicati.">
      <button type="button" className="ghost-button" onClick={() => void refresh()} disabled={busy}>
        <RefreshCw size={16} aria-hidden="true" />Aggiorna
      </button>
    </SectionHeading>
    <form className="scheduled-images-form" onSubmit={event => { event.preventDefault(); enqueue(); }}>
      <label htmlFor="scheduled-images-words">Parole da illustrare</label>
      <textarea id="scheduled-images-words" rows={3} value={words} onChange={event => setWords(event.target.value)}
        placeholder={"Clessidra\nPesca | il frutto"} maxLength={MAX_SCHEDULED_INPUT_LENGTH} aria-describedby="scheduled-images-hint" disabled={busy} />
      <small id="scheduled-images-hint">Una parola per riga. Per chiarire il significato, scrivi una breve descrizione dopo |.</small>
      <button type="submit" className="primary-button" disabled={busy || !words.trim()}>
        <Plus size={18} aria-hidden="true" />Aggiungi alla coda
      </button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {queue && !items.length && <p>La coda è vuota.</p>}
    {items.length > 0 && <ul className="scheduled-images-list">
      {visible.map(item => <li key={item.id}>
        <div className="scheduled-images-item">
          <strong>{item.word}</strong>
          <span>{scheduledImageStatuses[item.status]}</span>
          {item.detail && <small>{item.detail}</small>}
          {item.message && <small>{item.message}</small>}
        </div>
        <div className="scheduled-images-actions">
          {item.prNumber && <a href={`${SCHEDULED_REPOSITORY}/pull/${item.prNumber}`} target="_blank" rel="noreferrer">PR #{item.prNumber}</a>}
          {(item.status === "needs_review" || item.status === "failed") && <button type="button" className="ghost-button" disabled={busy}
            onClick={() => { setWords(item.detail ? `${item.word} | ${item.detail}` : item.word); document.getElementById("scheduled-images-words")?.focus(); }}>
            Riproponi
          </button>}
          {cancellable.has(item.status) && <button type="button" className="ghost-button" disabled={busy} aria-label={`Annulla ${item.word}`}
            onClick={() => void change({ action: "cancel", id: item.id }, setQueue)}>Annulla</button>}
        </div>
      </li>)}
    </ul>}
    {items.length > 6 && <button type="button" className="ghost-button" aria-expanded={expanded}
      onClick={() => setExpanded(value => !value)}>{expanded ? "Mostra meno" : "Mostra altre richieste"}</button>}
    <details className="scheduled-images-connection">
      <summary>Collegamento all’automazione</summary>
      <p>Salva la chiave nei segreti dell’ambiente Codex Cloud come <code>SCHEDULED_IMAGES_TOKEN</code>.</p>
      <button type="button" className="ghost-button" disabled={busy || !queue}
        onClick={() => queue?.workerConfigured ? setConfirmRotation(true) : rotateKey()}>
        {queue?.workerConfigured ? "Sostituisci chiave" : "Crea chiave"}
      </button>
      {token && <label className="scheduled-images-token">
        Copia ora la chiave. Dopo aver lasciato la pagina serve crearne un’altra per recuperarla.
        <input type="text" readOnly value={token} spellCheck={false} autoComplete="off" onFocus={event => event.target.select()} />
      </label>}
    </details>
    {confirmRotation && <ConfirmDialog labelledBy="scheduled-key-confirm" eyebrow="GENERAZIONE PROGRAMMATA" title="Sostituire la chiave dell’automazione?"
      confirmLabel="Sostituisci chiave" onCancel={() => setConfirmRotation(false)} onConfirm={rotateKey}>
      La chiave precedente smetterà di funzionare. Le richieste restano salvate.
    </ConfirmDialog>}
  </section>;
}
