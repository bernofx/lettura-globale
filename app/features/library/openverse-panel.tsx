"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { commonsLicenses, OPENVERSE_CATALOG_HEADER, OPENVERSE_CATALOG_URL, type CatalogSearchReply, type OpenversePreview, type OpenverseResult } from "../../domain/openverse-catalog";
import { isScheduledWord, scheduledImageMetadata, scheduledWordKey } from "../../domain/scheduled-images";
import { fetchWithTimeout } from "../../shared/cloud-client";
import type { LibraryItem } from "../../shared/types";
import { SectionHeading } from "../../shared/ui/headings";
import { Modal, ModalActions, ModalTitle } from "../../shared/ui/modal";
import { CatalogMetadataFields } from "./catalog-metadata-fields";
import "./scheduled-images-panel.css";

const errors: Record<string, string> = {
  authentication_required: "Accedi di nuovo per cercare nel catalogo pubblico.",
  administrator_required: "La ricerca è riservata agli amministratori abilitati.",
  search_unavailable: "Wikimedia Commons non risponde. Riprova tra poco.",
  catalog_import_unavailable: "La ricerca è disattivata per questo account.",
  invalid_search: "Inserisci una parola valida e cerca usando termini generici.",
  invalid_metadata: "Controlla categoria, articolo e sillabazione.",
  license_unverified: "La fonte non conferma una licenza valida per questa immagine. Scegli un altro risultato.",
  image_unavailable: "Questa immagine non è disponibile in un formato adatto. Scegli un altro risultato.",
  word_has_image: "Questa parola ha già un’immagine.",
  source_changed: "La fonte è cambiata. Chiudi e riapri l’anteprima prima di pubblicare.",
  source_rate_limited: "Il catalogo pubblico ha raggiunto il limite di richieste. Riprova tra poco.",
};

export function OpenversePanel({ profileId, library, onCatalogPublished }: { profileId: string; library: LibraryItem[]; onCatalogPublished: () => Promise<void> }) {
  const [word, setWord] = useState("");
  const [detail, setDetail] = useState("");
  const [search, setSearch] = useState<CatalogSearchReply & { word: string; detail: string }>();
  const [preview, setPreview] = useState<OpenversePreview & { id: string; word: string }>();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function request<T>(body: Record<string, unknown>): Promise<T> {
    const response = await fetchWithTimeout(OPENVERSE_CATALOG_URL, {
      method: "POST", cache: "no-store", headers: { [OPENVERSE_CATALOG_HEADER]: profileId, "content-type": "application/json" },
      body: JSON.stringify(body),
    }, 26_000);
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !payload) {
      const code = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error : "catalog_import_failed";
      throw new Error(code);
    }
    return payload as T;
  }

  async function run(task: () => Promise<void>) {
    if (busy) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await task();
    } catch (cause) {
      setError((cause instanceof Error ? errors[cause.message] : undefined) ?? "Il catalogo pubblico non è disponibile al momento. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  function searchImages(next = false) {
    const target = next && search ? search : { word: word.trim(), detail: detail.trim(), page: 0, results: [], source: undefined };
    if (!isScheduledWord(target.word)) { setError(errors.invalid_search); return; }
    void run(async () => {
      const page = target.page + 1;
      const reply = await request<CatalogSearchReply>({ action: "search", word: target.word, detail: target.detail, page, source: target.source });
      const previous = target.source === reply.source ? target.results : [];
      const known = new Set(previous.map(result => result.id));
      setSearch({ ...reply, word: target.word, detail: target.detail, results: [...previous, ...reply.results.filter(result => !known.has(result.id))] });
    });
  }

  function review(result: OpenverseResult) {
    if (!search) return;
    const target = search.word;
    void run(async () => {
      const data = await request<OpenversePreview>({ action: "preview", word: target, id: result.id });
      setImageLoaded(false);
      setPreview({ ...data, id: result.id, word: target });
    });
  }

  const wordKey = scheduledWordKey(preview?.word ?? word);
  const alreadyIllustrated = Boolean(wordKey && library.some(item => !item.deleted && !item.categorySymbolOnly &&
    item.contentKind !== "sentence" && (item.image || item.remoteImageId) && scheduledWordKey(item.word) === wordKey));
  const metadata = preview && scheduledImageMetadata(preview.word, preview.metadata);
  function publish() {
    if (!preview || !metadata || !imageLoaded || alreadyIllustrated) return;
    void run(async () => {
      await request({ action: "publish", word: preview.word, id: preview.id, digest: preview.digest, metadata });
      setMessage(`${preview.word} è disponibile nella Libreria condivisa.`);
      setPreview(undefined);
      setSearch(undefined);
      await onCatalogPublished();
    });
  }

  const edited = search && (search.word !== word.trim() || search.detail !== detail.trim());
  return <>
    <section className="panel library-area scheduled-images-panel" aria-labelledby="openverse-search">
      <SectionHeading id="openverse-search" title="Cerca immagini" description="Cerca in Wikimedia Commons. Verifichiamo le licenze CC0 e CC BY 4.0 alla fonte." />
      <form className="scheduled-images-form openverse-form" onSubmit={event => { event.preventDefault(); searchImages(); }}>
        <label>Parola dell’esercizio<input value={word} maxLength={48} required placeholder="Camion" disabled={busy}
          onChange={event => setWord(event.target.value)} /></label>
        <label>Ricerca nell’archivio (facoltativa)<input value={detail} maxLength={200} placeholder="Camion dei pompieri" disabled={busy}
          onChange={event => setDetail(event.target.value)} /></label>
        <button className="primary-button" type="submit" disabled={busy || !word.trim()}><Search size={18} aria-hidden="true" />Cerca</button>
      </form>
      {alreadyIllustrated && <p>La scheda ha già un’immagine. Puoi consultare i risultati.</p>}
      {busy && !preview && <p role="status">Caricamento dal catalogo pubblico…</p>}
      {message && <p role="status">{message}</p>}
      {error && !preview && <p className="form-error" role="alert">{error}</p>}
      {search && !edited && <>
        {search.results.length ? <ul className="openverse-results">
          {search.results.map(result => <li key={result.id}>
            <button className="ghost-button" type="button" onClick={() => review(result)} disabled={busy}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.thumbnail} referrerPolicy="no-referrer" loading="lazy" alt="" />
              <strong>{result.title}</strong><small>{commonsLicenses[result.license].name}</small>
            </button>
          </li>)}
        </ul> : <p>Nessun risultato con le licenze supportate in questa pagina.</p>}
        {search.more && <button className="ghost-button" type="button" disabled={busy} onClick={() => searchImages(true)}>Altri risultati</button>}
      </>}
    </section>
    {preview && <Modal labelledBy="openverse-preview-title" className="scheduled-images-review" closeButton
      onClose={busy ? undefined : () => setPreview(undefined)}>
      <ModalTitle id="openverse-preview-title" eyebrow="VERIFICA IMMAGINE">{preview.word}</ModalTitle>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="scheduled-images-preview" src={`data:${preview.imageType};base64,${preview.image}`} alt={preview.word}
        onLoad={() => setImageLoaded(true)} onError={() => setError(errors.image_unavailable)} />
      <p>{preview.credit.author} · <a href={preview.credit.sourceUrl} target="_blank" rel="noreferrer">Fonte originale</a>
        {" · "}<a href={commonsLicenses[preview.credit.license].url} target="_blank" rel="noreferrer">{commonsLicenses[preview.credit.license].name}</a></p>
      <p>{alreadyIllustrated ? "La scheda ha già un’immagine." : "Con l’approvazione la foto sarà disponibile nel catalogo condiviso."}</p>
      <CatalogMetadataFields metadata={preview.metadata} disabled={busy} valid={Boolean(metadata)}
        onChange={value => setPreview({ ...preview, metadata: value })} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <ModalActions onCancel={() => { setError(""); setPreview(undefined); }} cancelLabel="Chiudi" cancelDisabled={busy}>
        <button className="primary-button" type="button" onClick={publish} disabled={alreadyIllustrated || !metadata || !imageLoaded || busy}>Approva e pubblica</button>
      </ModalActions>
    </Modal>}
  </>;
}
