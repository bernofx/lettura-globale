"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_SCHEDULED_INPUT_LENGTH, SCHEDULED_IMAGES_URL, SCHEDULED_REPOSITORY,
  parseScheduledWords, scheduledCategories, scheduledImageMetadata, scheduledImageStatuses, type ScheduledImageMetadata, type ScheduledImageRequest,
} from "../../domain/scheduled-images";
import { fetchWithTimeout } from "../../shared/cloud-client";
import { SectionHeading } from "../../shared/ui/headings";
import { ConfirmDialog, Modal, ModalActions, ModalTitle } from "../../shared/ui/modal";
import "./scheduled-images-panel.css";

type Queue = {
  requests: ScheduledImageRequest[];
  generation: { used: number; limit: number } | null;
  publisherConfigured: boolean;
  accountId: string;
};
type QueueReply = Queue & { accepted: number; submitted: number; dispatchDelayed: boolean; token: string };
const cancellable = new Set(["queued", "generated", "approved", "needs_review", "failed"]);
type Proposal = { id: string; word: string; metadata: ScheduledImageMetadata; image: string; digest: string };

export function ScheduledImagesPanel({ profileId }: { profileId: string }) {
  const [words, setWords] = useState("");
  const [queue, setQueue] = useState<Queue>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [confirmRotation, setConfirmRotation] = useState(false);
  const [proposal, setProposal] = useState<Proposal>();
  const [proposalLoaded, setProposalLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const requestId = useRef<symbol | null>(null);
  const mutating = useRef(false);

  const pending = queue?.requests.some(item => item.status === "queued" || item.status === "processing") ?? false;

  const request = useCallback(async (body?: Record<string, unknown>) => {
    const headers = { "x-scheduled-images-profile": profileId, ...(body ? { "content-type": "application/json" } : {}) };
    const response = await fetchWithTimeout(SCHEDULED_IMAGES_URL, {
      headers, cache: "no-store", method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(failure?.error ?? "queue_unavailable");
    }
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
    }, pending ? 5_000 : 30_000);
    window.addEventListener("online", refresh);
    return () => {
      requestId.current = null;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
    };
  }, [refresh, pending]);

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
      const reason = cause instanceof Error ? cause.message : "";
      if (current === requestId.current) setError(
        reason === "request_changed" ? "La richiesta è già cambiata. Aggiorna la lista."
          : reason === "invalid_metadata" ? "Controlla categoria, articolo e sillabazione."
            : reason === "generation_unavailable" ? "La generazione di immagini è disattivata per questo account."
              : "Modifica non salvata nel cloud. Riprova.");

    } finally {
      mutating.current = false;
      if (current === requestId.current) setBusy(false);
    }
  }

  function generate() {
    try { parseScheduledWords(words); }
    catch { setError("Inserisci da 1 a 20 parole o locuzioni, una per riga. Dopo | puoi aggiungere una precisazione visiva senza contatti o link."); return; }
    void change({ action: "generate", words }, result => {
      setQueue(result);
      setWords("");
      const ignored = result.submitted - result.accepted;
      const recorded = ignored ? `Richieste registrate ${result.accepted}. Già registrate ${ignored}.` : `Richieste registrate ${result.accepted}.`;
      setMessage(result.dispatchDelayed ? `${recorded} L’avvio verrà riprovato in automatico.` : recorded);
    });
  }

  function rotateKey() {
    setConfirmRotation(false);
    void change({ action: "rotate_publisher_key" }, result => {
      setToken(result.token);
      setQueue(result);
    });
  }

  async function review(id: string) {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetchWithTimeout(`${SCHEDULED_IMAGES_URL}?preview=${id}`, {
        headers: { "x-scheduled-images-profile": profileId }, cache: "no-store",
      });
      if (!response.ok) throw new Error("request_changed");
      const result = await response.json() as Omit<Proposal, "id" | "metadata"> & { metadata: string };
      const metadata = scheduledImageMetadata(result.word, JSON.parse(result.metadata));
      if (!metadata) throw new Error("invalid_proposal");
      setProposalLoaded(false);
      setProposal({ ...result, id, metadata });
    } catch {
      setError("Anteprima non disponibile. Aggiorna la coda e riprova.");
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  const items = queue?.requests ?? [];
  const generation = queue?.generation;
  const limitReached = Boolean(generation && generation.used >= generation.limit);
  const canGenerate = Boolean(generation && !limitReached);
  const validMetadata = proposal ? scheduledImageMetadata(proposal.word, proposal.metadata) : null;
  const visible = expanded ? items : items.slice(0, 6);
  return <section className="panel library-area scheduled-images-panel" aria-labelledby="scheduled-images-title">
    <SectionHeading id="scheduled-images-title" title="Richieste di generazione">
      <button type="button" className="ghost-button" onClick={() => void refresh()} disabled={busy}>
        <RefreshCw size={16} aria-hidden="true" />Aggiorna
      </button>
    </SectionHeading>
    {generation && <p>{generation.used} / {generation.limit} richieste all’API questo mese.{limitReached && " Limite mensile raggiunto."}</p>}
    {queue && !generation && <p>Generazione disattivata per questo account.</p>}
    <form className="scheduled-images-form" onSubmit={event => { event.preventDefault(); generate(); }}>
      <label htmlFor="scheduled-images-words">Parole da illustrare</label>
      <textarea id="scheduled-images-words" rows={3} value={words} onChange={event => setWords(event.target.value)}
        placeholder={"Clessidra\nPesca | il frutto"} maxLength={MAX_SCHEDULED_INPUT_LENGTH} aria-describedby="scheduled-images-hint" disabled={busy || !canGenerate} />
      <small id="scheduled-images-hint">Inserisci una parola o un elenco, una per riga. Dopo | puoi aggiungere una precisazione visiva. Usa termini generici, senza dati personali.</small>
      <small id="scheduled-images-submit-hint">Il pulsante invia a OpenAI le nuove parole senza foto. Ogni chiamata conta nel limite mensile.</small>
      <button type="submit" className="primary-button" aria-describedby="scheduled-images-submit-hint" disabled={busy || !canGenerate || !words.trim()}>
        <Sparkles size={18} aria-hidden="true" />Genera con OpenAI
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
          {item.status === "generated" && <button type="button" className="primary-button" disabled={busy}
            onClick={() => void review(item.id)}>Verifica immagine</button>}
          {item.prNumber && <a href={`${SCHEDULED_REPOSITORY}/pull/${item.prNumber}`} target="_blank" rel="noreferrer">PR #{item.prNumber}</a>}
          {(item.status === "needs_review" || item.status === "failed") && <button type="button" className="ghost-button" disabled={busy || !canGenerate}
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
      <summary>Configurazione pubblicazione</summary>
      {queue && <p>Identificativo account <code>{queue.accountId}</code></p>}
      <button type="button" className="ghost-button" disabled={busy || !queue}
        onClick={() => queue?.publisherConfigured ? setConfirmRotation(true) : rotateKey()}>
        {queue?.publisherConfigured ? "Sostituisci" : "Crea"} chiave di pubblicazione
      </button>
      {token && <label className="scheduled-images-token">
        Copia ora la chiave <code>SCHEDULED_IMAGES_PUBLISHER_TOKEN</code>.
        <input type="text" readOnly value={token} spellCheck={false} autoComplete="off" onFocus={event => event.target.select()} />
      </label>}
    </details>
    {confirmRotation && <ConfirmDialog labelledBy="scheduled-key-confirm" eyebrow="GENERAZIONE IMMAGINI" title="Sostituire la chiave di pubblicazione?"
      confirmLabel="Sostituisci chiave" onCancel={() => setConfirmRotation(false)} onConfirm={rotateKey}>
      La chiave precedente smetterà di funzionare. Le richieste restano salvate.
    </ConfirmDialog>}
    {proposal && <Modal labelledBy="scheduled-preview-title" onClose={busy ? undefined : () => setProposal(undefined)} closeButton>
      <ModalTitle id="scheduled-preview-title">{proposal.word}</ModalTitle>
      {/* Private image already authenticated and size bounded by the queue API. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="scheduled-images-preview" src={`data:image/webp;base64,${proposal.image}`} alt={proposal.word}
        onLoad={() => setProposalLoaded(true)} onError={() => setProposalLoaded(false)} />
      <div className="scheduled-images-metadata">
        <label>Categoria
          <select value={proposal.metadata.category} disabled={busy} onChange={event => {
            const category = scheduledCategories.find(value => value === event.target.value);
            if (category) setProposal({ ...proposal, metadata: { ...proposal.metadata, category } });
          }}>
            {scheduledCategories.map(category => <option key={category}>{category}</option>)}
          </select>
        </label>
        <label>Articolo nell’esercizio IL / LA
          <select value={proposal.metadata.article ?? ""} disabled={busy} onChange={event => {
            const value = event.target.value;
            const article = value === "IL" || value === "LA" ? value : null;
            setProposal({ ...proposal, metadata: { ...proposal.metadata, article } });
          }}>
            <option value="">Nessuno</option>
            <option>IL</option>
            <option>LA</option>
          </select>
        </label>
        <label>Divisione in sillabe
          <input value={proposal.metadata.syllabification} maxLength={96} disabled={busy}
            onChange={event => setProposal({ ...proposal, metadata: { ...proposal.metadata, syllabification: event.target.value } })}
            aria-invalid={!validMetadata} />
        </label>
      </div>
      <p>Verifica che l’immagine rappresenti la parola. Nel campo delle sillabe usa i trattini, per esempio lan-ter-na.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <ModalActions onCancel={() => setProposal(undefined)} cancelDisabled={busy}>
        <button type="button" className="primary-button" disabled={busy || !proposalLoaded || !validMetadata}
          onClick={() => void change({ action: "approve", id: proposal.id, digest: proposal.digest, metadata: validMetadata }, result => {
            setQueue(result);
            setProposal(undefined);
          })}>Approva per la pubblicazione</button>
      </ModalActions>
    </Modal>}
  </section>;
}
