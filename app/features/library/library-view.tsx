import { ChevronDown, ChevronUp, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { type CategorySymbols } from "../../domain/category-images";
import { articleFor } from "../../domain/article-classification";
import { hasArtwork } from "../../domain/library-availability";
import { type SoundPreferences } from "../../domain/sound-preferences";
import { SoundSettingsPanel } from "../settings/appearance-view";
import { GameSoundtrackPanel } from "./game-soundtrack-panel";
import { PuzzleLibraryPanel } from "./puzzle-library-panel";
import type { PuzzleLibrary } from "../games/use-puzzle-library";
import { Artwork } from "../../shared/artwork";
import { prepareUploadedImage } from "../../shared/media-storage";
import { type LibraryItem } from "../../shared/types";
import { PageHeader, SectionHeading } from "../../shared/ui/headings";
import { FilePicker, IMAGE_FILE_ACCEPT, IMAGE_FILE_HINT } from "../../shared/ui/file-picker";
import { CheckLine } from "../../shared/ui/form-controls";
import "./library-layout.css";
import { Modal, ModalActions, ModalTitle } from "../../shared/ui/modal";

export function LibraryView({ categorySymbols, onCategorySymbol, onCategoryUpload, items, search, setSearch, onUpload, onEdit, onDelete, sounds, onSoundsChange, puzzles, soundtrackUploadOpen, onSoundtrackUploadClose }: { puzzles: PuzzleLibrary; soundtrackUploadOpen: boolean; onSoundtrackUploadClose: () => void; categorySymbols: CategorySymbols; onCategorySymbol: (category: string, id: string) => void; onCategoryUpload: (category: string, image: string) => Promise<void>; items: LibraryItem[]; search: string; setSearch: (value: string) => void; onUpload: (kind: "word" | "sentence" | "puzzle" | "soundtrack") => void; onEdit: (item: LibraryItem) => void; onDelete: (item: LibraryItem) => void; sounds: SoundPreferences; onSoundsChange: (sounds: SoundPreferences) => void }) {
  const [reviewOnly, setReviewOnly] = useState(false);
  const [wordsExpanded, setWordsExpanded] = useState(false);
  const [sentencesExpanded, setSentencesExpanded] = useState(false);
  const words = items.filter((item) => !item.categorySymbolOnly && item.contentKind !== "sentence");
  const sentences = items.filter((item) => item.contentKind === "sentence");
  const reviewCount = words.filter((item) => item.syllableStatus === "needs-review").length;
  const normalizedSearch = search.toLocaleLowerCase("it-IT");
  const matches = (item: LibraryItem) => `${item.word} ${item.category} ${item.syllabification ?? ""} ${item.subject ?? ""} ${item.verb ?? ""}`.toLocaleLowerCase("it-IT").includes(normalizedSearch);
  const filteredWords = words.filter((item) => (!reviewOnly || item.syllableStatus === "needs-review") && matches(item));
  const filteredSentences = sentences.filter(matches);
  const searching = Boolean(normalizedSearch.trim());
  const visibleWords = wordsExpanded || searching || reviewOnly ? filteredWords : filteredWords.slice(0, 4);
  const visibleSentences = sentencesExpanded || searching ? filteredSentences : filteredSentences.slice(0, 4);
  const expansion = (label: string, entries: LibraryItem[], visible: LibraryItem[], expanded: boolean, setExpanded: (value: boolean) => void) => entries.length > 4 && !searching && !(label === "immagini" && reviewOnly) ? <div className="library-expansion"><span>Mostrati {visible.length} di {entries.length}</span><button type="button" className="ghost-button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}{expanded ? "Riduci" : `Mostra tutte le ${label}`}</button></div> : null;
  const cards = (entries: LibraryItem[], sentence = false) => <div className="library-grid">{entries.map((item) => <article className="library-card" key={item.id}><div className="library-art"><Artwork item={item} />{item.privateUpload && <span className="private-badge">Privata</span>}{!hasArtwork(item) && <span className="word-only-badge">Solo parola</span>}<div className="card-actions"><button onClick={() => onEdit(item)} aria-label={`Modifica ${item.word}`} title="Modifica"><Pencil /></button><button className="delete" onClick={() => onDelete(item)} aria-label={`Elimina ${item.word}`} title="Elimina"><Trash2 /></button></div></div><div className="library-copy"><span className="category">{sentence ? `${item.subject} · ${item.verb}` : `${item.category}${articleFor(item) ? ` · ${articleFor(item)}` : " · NON USATA IN IL/LA"}`}</span><h3>{item.word.toLocaleUpperCase("it-IT")}</h3>{sentence ? <p className="syllables">SOGGETTO + VERBO</p> : <p className={item.syllableStatus === "needs-review" ? "syllables needs-review" : "syllables"}>{item.syllabification?.toLocaleUpperCase("it-IT")} · {item.syllableCount} sillabe{item.syllableStatus === "needs-review" ? " · Da verificare" : ""}</p>}<p>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.source}</a> : item.source} · {item.licenseUrl ? <a href={item.licenseUrl} target="_blank" rel="noreferrer">{item.license}</a> : item.license}</p><small>Autore: {item.author}</small></div></article>)}</div>;
  return <div className="page library-sections">
    <PageHeader eyebrow="CONTENUTI" title="Libreria" description="Gestisci immagini singole, frasi d’azione, puzzle e suoni." />
    <div className="toolbar">
      <label className="search-box"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca nei contenuti…" /></label>
      <div className="provider-note"><Sparkles size={16} />Catalogo demo autorizzato</div>
    </div>
    <section className="panel library-area" aria-labelledby="library-words">
      <SectionHeading id="library-words" title="Parole e immagini" description="Contenuti per riconoscimento, categorie, articoli e denominazione.">
        <button type="button" className="primary-button" onClick={() => onUpload("word")}><Plus size={18} aria-hidden="true" />Aggiungi immagine</button>
      </SectionHeading>
      <button type="button" className={`filter-chip ${reviewOnly ? "selected" : ""}`} onClick={() => setReviewOnly((value) => !value)} aria-pressed={reviewOnly}>Sillabazione da verificare <span>{reviewCount}</span></button>
      {cards(visibleWords)}
      {!filteredWords.length && <div className="empty-state compact"><Search /><h3>Nessuna immagine singola</h3></div>}
      {expansion("immagini", filteredWords, visibleWords, wordsExpanded, setWordsExpanded)}
    </section>
    <section className="panel library-area sentence-library-area" aria-labelledby="library-scenes">
      <SectionHeading id="library-scenes" title="Scene soggetto + verbo" description="Immagini d’azione usate da Abbina la frase.">
        <button type="button" className="primary-button" onClick={() => onUpload("sentence")}><Plus size={18} aria-hidden="true" />Aggiungi frase</button>
      </SectionHeading>
      {cards(visibleSentences, true)}
      {!filteredSentences.length && <div className="empty-state compact"><Search /><h3>Nessuna frase</h3></div>}
      {expansion("frasi", filteredSentences, visibleSentences, sentencesExpanded, setSentencesExpanded)}
    </section>
    <LibraryCategories items={items} symbols={categorySymbols} onSelect={onCategorySymbol} onUpload={onCategoryUpload} search={search} />
    <PuzzleLibraryPanel catalog={puzzles} search={search} onAdd={() => onUpload("puzzle")} />
    <SoundSettingsPanel sounds={sounds} onChange={onSoundsChange} />
    <GameSoundtrackPanel open={soundtrackUploadOpen} onOpen={() => onUpload("soundtrack")} onClose={onSoundtrackUploadClose} />
  </div>;
}

function LibraryCategories({ items, symbols, onSelect, onUpload, search }: { items: LibraryItem[]; symbols: CategorySymbols; onSelect: (name: string, id: string) => void; onUpload: (name: string, image: string) => Promise<void>; search: string }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [image, setImage] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imageSearch, setImageSearch] = useState("");
  const names = Array.from(new Set(items.filter((item) => !item.categorySymbolOnly).map((item) => item.category))).sort((a, b) => a.localeCompare(b, "it")).filter((name) => name.toLocaleLowerCase("it").includes(search.toLocaleLowerCase("it")));
  const visible = expanded || search ? names : names.slice(0, 4);
  const open = (name: string) => { setEditing(name); setSelected(symbols[name] ?? ""); setImage(""); setRights(false); setError(""); setImageSearch(""); };
  const save = async () => {
    if (!editing || busy || (image && !rights)) return;
    setBusy(true); setError("");
    try { if (image) await onUpload(editing, image); else onSelect(editing, selected); setEditing(null); }
    catch { setError("Impossibile caricare l’immagine nel cloud. La scelta non è stata persa: riprova."); }
    finally { setBusy(false); }
  };
  async function chooseFile(file: File) {
    setBusy(true);
    setError("");
    try {
      setImage(await prepareUploadedImage(file));
      setRights(false);
    } catch {
      setError("Immagine non valida. Usa JPG, PNG o WebP.");
    } finally {
      setBusy(false);
    }
  }

  const selectedItem = items.find(item => item.id === selected && hasArtwork(item));

  return <section className="panel library-area" aria-labelledby="library-categories">
    <SectionHeading id="library-categories" title="Immagini delle categorie"
      description="Scegli l’immagine che rappresenta ogni categoria negli esercizi." />
    <div className="category-library-grid">
      {visible.map(name => {
        const symbol = items.find(item => item.id === symbols[name] && hasArtwork(item));
        return <article className="category-library-card" key={name}>
          <div className="category-library-art">{symbol ? <Artwork item={symbol} /> : <span>Immagine da assegnare</span>}</div>
          <h3>{name}</h3>
          <button type="button" className="ghost-button" onClick={() => open(name)}>{symbol ? "Cambia immagine" : "Assegna immagine"}</button>
        </article>;
      })}
    </div>
    {names.length > 4 && !search && <div className="library-expansion">
      <span>Mostrati {visible.length} di {names.length}</span>
      <button type="button" className="ghost-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}{expanded ? "Riduci" : "Mostra tutte le categorie"}
      </button>
    </div>}
    {editing && <Modal labelledBy="category-image-title" className="wide" onClose={busy ? undefined : () => setEditing(null)}
      closeButton>
      <ModalTitle id="category-image-title">Immagine per {editing}</ModalTitle>
      <label>Cerca nella libreria<input type="search" disabled={busy} value={imageSearch} onChange={event => setImageSearch(event.target.value)} /></label>
      <label>Immagine esistente
        <select value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setImage(""); setRights(false); setError(""); }}>
          <option value="">Nessuna immagine</option>
          {items.filter(item => hasArtwork(item) && (item.id === selected || item.word.toLocaleLowerCase("it").includes(imageSearch.toLocaleLowerCase("it"))))
            .map(item => <option key={item.id} value={item.id}>{item.word} · {item.category}</option>)}
        </select>
      </label>
      {!image && selectedItem && <div className="category-library-art"><Artwork item={selectedItem} /></div>}
      <FilePicker accept={IMAGE_FILE_ACCEPT} hint={IMAGE_FILE_HINT} image={image} selection={image ? "Immagine selezionata" : undefined}
        label={busy ? "Attendi…" : image ? "Cambia immagine" : "Scegli un’immagine dal dispositivo"} compact disabled={busy}
        onFiles={([file]) => void chooseFile(file)} />
      {image && <CheckLine checked={rights} onChange={setRights} disabled={busy} title="Confermo di avere i diritti per usare questa immagine." />}
      {error && <p className="form-error" role="alert">{error}</p>}
      <ModalActions onCancel={() => setEditing(null)} cancelDisabled={busy}>
        <button className="primary-button" type="button" disabled={busy || Boolean(image && !rights)} onClick={() => void save()}>
          {busy ? "Attendi…" : "Salva associazione"}
        </button>
      </ModalActions>
    </Modal>}
  </section>;
}
