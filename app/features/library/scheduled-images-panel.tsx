"use client";

import { Copy, ExternalLink, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_SCHEDULED_INPUT_LENGTH, SCHEDULED_IMAGES_URL, SCHEDULED_REPOSITORY,
  parseScheduledWords, scheduledCategories, scheduledImageMetadata, scheduledImageStatuses, type ScheduledImageMetadata, type ScheduledImageRequest,
} from "../../domain/scheduled-images";
import type { SupportedImageType } from "../../domain/image-validation";
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
/** Requests holding an image already paid for: discarding them asks for confirmation. */
const holdsImage = new Set(["generated", "approved"]);
const statusTone: Record<ScheduledImageRequest["status"], "action" | "warning" | "error" | "progress" | "done" | "muted"> = {
  generated: "action", needs_review: "warning", failed: "error",
  queued: "progress", processing: "progress", approved: "progress", pull_request: "progress",
  published: "done", existing: "done", cancelled: "muted",
};
const toneOrder = { action: 0, warning: 1, error: 1, progress: 2, done: 3, muted: 3 };

/** Keep the technical reference of a provider error out of the main sentence. */
function splitReference(message: string) {
  const match = /\s*\((HTTP [^)]+)\)/.exec(message);
  return match ? { text: message.replace(match[0], ""), reference: match[1] } : { text: message, reference: "" };
}
type Proposal = { id: string; word: string; metadata: ScheduledImageMetadata; image: string; imageType: SupportedImageType; digest: string };

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
  const [discard, setDiscard] = useState<ScheduledImageRequest>();
  const [copied, setCopied] = useState(false);
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
      setCopied(false);
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
      if (!metadata || !["image/webp", "image/png", "image/jpeg"].includes(result.imageType)) throw new Error("invalid_proposal");
      setProposalLoaded(false);
      setProposal({ ...result, id, metadata });
    } catch {
      setError("Anteprima non disponibile. Aggiorna la coda e riprova.");
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }

  function cancel(item: ScheduledImageRequest) {
    setDiscard(undefined);
    setProposal(undefined);
    void change({ action: "cancel", id: item.id }, setQueue);
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("Copia non riuscita: seleziona la chiave e copiala a mano.");
    }
  }

  const items = [...queue?.requests ?? []].sort((a, b) => toneOrder[statusTone[a.status]] - toneOrder[statusTone[b.status]]);
  const generation = queue?.generation;
  const limitReached = Boolean(generation && generation.used >= generation.limit);
  const canGenerate = Boolean(generation && !limitReached);
  const validMetadata = proposal ? scheduledImageMetadata(proposal.word, proposal.metadata) : null;
  const visible = expanded ? items : items.slice(0, 6);
  const proposalItem = proposal && items.find(item => item.id === proposal.id);
  return <>
    <section className="panel library-area scheduled-images-panel" aria-labelledby="scheduled-images-new">
      <SectionHeading id="scheduled-images-new" title="Nuove parole" description="Le parole senza foto vengono illustrate da OpenAI; poi verifichi e approvi ogni immagine." />
      {generation && <div className="scheduled-images-usage">
        <span>{generation.used} di {generation.limit} generazioni usate questo mese{limitReached && " · limite raggiunto"}</span>
        <meter min={0} max={generation.limit} value={generation.used} aria-label="Generazioni usate questo mese" />
        <small>Contano anche i tentativi non riusciti.</small>
      </div>}
      {queue && !generation && <p>Generazione disattivata per questo account.</p>}
      <form className="scheduled-images-form" onSubmit={event => { event.preventDefault(); generate(); }}>
        <label htmlFor="scheduled-images-words">Parole da illustrare</label>
        <textarea id="scheduled-images-words" rows={3} value={words} onChange={event => setWords(event.target.value)}
          placeholder={"Clessidra\nPesca | il frutto"} maxLength={MAX_SCHEDULED_INPUT_LENGTH} aria-describedby="scheduled-images-hint" disabled={busy || !canGenerate} />
        <small id="scheduled-images-hint">Una parola per riga. Dopo | puoi aggiungere una precisazione visiva. Usa termini generici, senza dati personali.</small>
        <button type="submit" className="primary-button" aria-describedby="scheduled-images-submit-hint" disabled={busy || !canGenerate || !words.trim()}>
          <Sparkles size={18} aria-hidden="true" />Genera con OpenAI
        </button>
        <small id="scheduled-images-submit-hint">Le parole che hanno già un’immagine vengono saltate.</small>
      </form>
      {error && !proposal && !discard && <p className="form-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
    <section className="panel library-area scheduled-images-panel" aria-labelledby="scheduled-images-title">
      <SectionHeading id="scheduled-images-title" title="Richieste" description="In alto quelle che aspettano una tua scelta.">
        <button type="button" className="ghost-button scheduled-images-refresh" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw size={16} aria-hidden="true" />Aggiorna
        </button>
      </SectionHeading>
      {queue && !items.length && <p>Non ci sono richieste.</p>}
      {items.length > 0 && <ul className="scheduled-images-list">
        {visible.map(item => {
          const note = splitReference(item.message);
          return <li key={item.id}>
            <div className="scheduled-images-item">
              <div className="scheduled-images-title">
                <strong>{item.word}</strong>
                <span className={`scheduled-images-status ${statusTone[item.status]}`}>{scheduledImageStatuses[item.status]}</span>
              </div>
              {item.detail && <small>{item.detail}</small>}
              {note.text && <small>{note.text}{note.reference && <span className="scheduled-images-reference"> · {note.reference}</span>}</small>}
            </div>
            <div className="scheduled-images-actions">
              {item.status === "generated" && <button type="button" className="primary-button" disabled={busy}
                onClick={() => void review(item.id)}>Verifica immagine</button>}
              {item.prNumber && <a className="text-button" href={`${SCHEDULED_REPOSITORY}/pull/${item.prNumber}`} target="_blank" rel="noreferrer"
                aria-label={`Pubblicazione di ${item.word} su GitHub, PR ${item.prNumber}`}>Vedi su GitHub<ExternalLink size={14} aria-hidden="true" /></a>}
              {(item.status === "needs_review" || item.status === "failed") && <button type="button" className="ghost-button" disabled={busy || !canGenerate}
                onClick={() => { setWords(item.detail ? `${item.word} | ${item.detail}` : item.word); document.getElementById("scheduled-images-words")?.focus(); }}>
                Riproponi
              </button>}
              {cancellable.has(item.status) && (holdsImage.has(item.status)
                ? <button type="button" className="danger-button subtle" disabled={busy} aria-label={`Scarta l’immagine di ${item.word}`}
                  onClick={() => setDiscard(item)}><Trash2 aria-hidden="true" />Scarta</button>
                : <button type="button" className="ghost-button" disabled={busy} aria-label={`Annulla la richiesta di ${item.word}`}
                  onClick={() => cancel(item)}>Annulla richiesta</button>)}
            </div>
          </li>;
        })}
      </ul>}
      {items.length > 6 && <button type="button" className="ghost-button" aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}>{expanded ? "Mostra meno" : `Mostra tutte (${items.length})`}</button>}
      <details className="scheduled-images-connection">
        <summary>Configurazione pubblicazione</summary>
        {queue && <p>Identificativo account <code>{queue.accountId}</code></p>}
        <button type="button" className="ghost-button" disabled={busy || !queue}
          onClick={() => queue?.publisherConfigured ? setConfirmRotation(true) : rotateKey()}>
          {queue?.publisherConfigured ? "Sostituisci" : "Crea"} chiave di pubblicazione
        </button>
        {token && <div className="scheduled-images-token">
          <label htmlFor="scheduled-images-token">Copia ora la chiave <code>SCHEDULED_IMAGES_PUBLISHER_TOKEN</code>: non verrà più mostrata.</label>
          <div>
            <input id="scheduled-images-token" type="text" readOnly value={token} spellCheck={false} autoComplete="off" onFocus={event => event.target.select()} />
            <button type="button" className="ghost-button" onClick={() => void copyToken()}><Copy size={16} aria-hidden="true" />{copied ? "Copiata" : "Copia"}</button>
          </div>
          {copied && <span role="status" className="visually-hidden">Chiave copiata negli appunti.</span>}
        </div>}
      </details>
    </section>
    {confirmRotation && <ConfirmDialog labelledBy="scheduled-key-confirm" eyebrow="GENERAZIONE IMMAGINI" title="Sostituire la chiave di pubblicazione?"
      confirmLabel="Sostituisci chiave" onCancel={() => setConfirmRotation(false)} onConfirm={rotateKey}>
      La chiave precedente smetterà di funzionare. Le richieste restano salvate.
    </ConfirmDialog>}
    {discard && <ConfirmDialog labelledBy="scheduled-discard-confirm" eyebrow="GENERAZIONE IMMAGINI" title={`Scartare l’immagine di ${discard.word}?`}
      confirmLabel="Scarta immagine" onCancel={() => setDiscard(undefined)} onConfirm={() => cancel(discard)}>
      La generazione resta conteggiata nel limite del mese. Potrai riproporre la parola in seguito.
    </ConfirmDialog>}
    {proposal && !discard && <Modal labelledBy="scheduled-preview-title" className="scheduled-images-review" onClose={busy ? undefined : () => setProposal(undefined)} closeButton>
      <ModalTitle id="scheduled-preview-title" eyebrow="VERIFICA IMMAGINE">{proposal.word}</ModalTitle>
      <p>Controlla che l’immagine rappresenti chiaramente la parola, poi conferma i dati per gli esercizi.</p>
      {/* Private image already authenticated and size bounded by the queue API. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="scheduled-images-preview" src={`data:${proposal.imageType};base64,${proposal.image}`} alt={proposal.word}
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
            <option value="">Non usare nell’esercizio</option>
            <option>IL</option>
            <option>LA</option>
          </select>
        </label>
        <label className="scheduled-images-syllables">Divisione in sillabe
          <input value={proposal.metadata.syllabification} maxLength={96} disabled={busy} aria-describedby="scheduled-syllables-hint"
            onChange={event => setProposal({ ...proposal, metadata: { ...proposal.metadata, syllabification: event.target.value } })}
            aria-invalid={!validMetadata} />
          <small id="scheduled-syllables-hint">Separa le sillabe con i trattini, per esempio lan-ter-na.</small>
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <ModalActions onCancel={() => setProposal(undefined)} cancelLabel="Chiudi" cancelDisabled={busy}>
        {proposalItem && <button type="button" className="danger-button" disabled={busy} onClick={() => setDiscard(proposalItem)}>
          <Trash2 aria-hidden="true" />Scarta</button>}
        <button type="button" className="primary-button" disabled={busy || !proposalLoaded || !validMetadata}
          onClick={() => void change({ action: "approve", id: proposal.id, digest: proposal.digest, metadata: validMetadata }, result => {
            setQueue(result);
            setProposal(undefined);
          })}>Approva per la pubblicazione</button>
      </ModalActions>
    </Modal>}
  </>;
}
