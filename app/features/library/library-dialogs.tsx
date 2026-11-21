import { AlertTriangle, Save } from "lucide-react";
import { useState } from "react";
import { articleFor } from "../../domain/article-classification";
import { analyzeItalianSyllables, countSyllables, hydrateSyllables, type SyllableStatus } from "../../domain/syllabification";
import { hasArtwork } from "../../domain/library-availability";
import { libraryCategories } from "../../shared/constants";
import { prepareUploadedImage } from "../../shared/media-storage";
import { type Article, type LibraryItem } from "../../shared/types";
import { FilePicker, IMAGE_FILE_ACCEPT, IMAGE_FILE_HINT } from "../../shared/ui/file-picker";
import { CheckLine } from "../../shared/ui/form-controls";
import { ConfirmDialog, Modal, ModalActions, ModalTitle } from "../../shared/ui/modal";

export function UploadDialog({ kind, onClose, onSave }: { kind: "word" | "sentence"; onClose: () => void; onSave: (item: LibraryItem) => Promise<void> }) {
  const [word, setWord] = useState(""); const [category, setCategory] = useState("Altro"); const [article, setArticle] = useState<Article | "">(""); const [image, setImage] = useState<string | null>(null); const [rights, setRights] = useState(false); const [processing, setProcessing] = useState(false); const [fileError, setFileError] = useState(""); const [syllabification, setSyllabification] = useState(""); const [syllableStatus, setSyllableStatus] = useState<SyllableStatus>("automatic");
  const [subject, setSubject] = useState(""); const [verb, setVerb] = useState("");
  const sentence = `${subject.trim()} ${verb.trim()}`.trim();
  const updateWord = (value: string) => { setWord(value); const analysis = analyzeItalianSyllables(value); setSyllabification(value.trim() ? analysis.syllabification : ""); setSyllableStatus(analysis.syllableStatus); };
  const updateSyllabification = (value: string) => { setSyllabification(value); setSyllableStatus("verified"); };
  const handleFile = async (file: File) => { setProcessing(true); setFileError(""); try { setImage(await prepareUploadedImage(file)); setRights(false); } catch { setFileError("Non è stato possibile elaborare questa immagine."); } finally { setProcessing(false); } };
  const save = async () => {
    if (processing || (image && !rights)) return;
    if (kind === "sentence") {
      if (!sentence || !subject.trim() || !verb.trim() || !image) return;
      setProcessing(true);
      await onSave({ id: crypto.randomUUID(), word: sentence, image, category: "Azioni", contentKind: "sentence", phraseStructure: "subject-verb", subject: subject.trim(), verb: verb.trim(), complement: "", source: "Upload privato", license: "Diritto d’uso dichiarato", author: "Utente", privateUpload: true, article: null });
      setProcessing(false);
      return;
    }
    if (!word.trim() || !syllabification.trim()) return;
    setProcessing(true); await onSave({ id: crypto.randomUUID(), word: word.trim(), ...(image ? { image, source: "Upload privato", license: "Diritto d’uso dichiarato", author: "Utente", privateUpload: true } : { source: "Elemento testuale", license: "Nessuna immagine", author: "—" }), category, article: image ? article || null : null, contentKind: "word", syllabification: syllabification.trim().toLocaleLowerCase("it-IT"), syllableCount: countSyllables(syllabification), syllableStatus }); setProcessing(false);
  };
  const valid = kind === "sentence" ? Boolean(subject.trim() && verb.trim() && image && rights) : Boolean(word.trim() && syllabification.trim() && (!image || rights));
  return <Modal labelledBy="upload-library-title" onClose={onClose} closeButton><ModalTitle id="upload-library-title" eyebrow={kind === "sentence" ? "NUOVA FRASE" : "NUOVO ELEMENTO"}>{kind === "sentence" ? "Aggiungi una scena d’azione" : "Aggiungi alla libreria"}</ModalTitle><p>{kind === "sentence" ? "Inserisci una frase semplice soggetto + verbo e la relativa immagine. Il complemento è predisposto ma non ancora attivo." : "La parola è obbligatoria. Puoi aggiungere una fotografia ora oppure in seguito."}</p>
    <FilePicker accept={IMAGE_FILE_ACCEPT} hint={IMAGE_FILE_HINT} image={image} selection={image ? "Immagine selezionata" : undefined}
      label={processing ? "Attendi…" : image ? "Cambia immagine" : kind === "sentence" ? "Scegli l’immagine della scena" : "Scegli un’immagine (opzionale)"}
      disabled={processing} onFiles={([file]) => void handleFile(file)} />
    {fileError && <p className="form-error" role="alert">{fileError}</p>}{kind === "sentence" ? <><div className="builder-inline-fields"><label>Soggetto<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Es. Il gatto" /></label><label>Verbo<input value={verb} onChange={(event) => setVerb(event.target.value)} placeholder="Es. mangia" /></label></div><label>Frase<input value={sentence} readOnly aria-readonly="true" placeholder="La frase viene composta automaticamente" /></label><label>Complemento <small>Prossimamente</small><input disabled placeholder="Non disponibile in questa versione" /></label></> : <><label>Parola<input value={word} onChange={(event) => updateWord(event.target.value)} placeholder="Es. Bicchiere" /></label><label>Sillabazione<input value={syllabification} onChange={(event) => updateSyllabification(event.target.value)} placeholder="Es. bic-chie-re" /></label>{syllableStatus === "needs-review" && <div className="syllable-review"><AlertTriangle /><span>Controlla la divisione proposta.</span><button type="button" onClick={() => setSyllableStatus("verified")}>Conferma proposta</button></div>}<label>Categoria<select value={category} onChange={(event) => setCategory(event.target.value)}>{libraryCategories.filter((value) => value !== "Azioni").map((value) => <option key={value}>{value}</option>)}</select></label><label>Articolo nell’esercizio IL / LA<select value={article} disabled={!image} onChange={(event) => setArticle(event.target.value as Article | "")}><option value="">Non usare nell’esercizio</option><option value="IL">IL</option><option value="LA">LA</option></select></label><p className="field-note">Questa opzione si attiva quando aggiungi un’immagine.</p></>}{image && <CheckLine checked={rights} onChange={setRights} disabled={processing} title="Confermo di avere il diritto di usare questa immagine." />}<ModalActions onCancel={onClose}><button className="primary-button" type="button" disabled={!valid || processing} onClick={save}>{processing ? "Salvataggio…" : kind === "sentence" ? "Aggiungi frase" : "Aggiungi elemento"}</button></ModalActions></Modal>;
}

export function EditLibraryDialog({ item, onClose, onSave }: { item: LibraryItem; onClose: () => void; onSave: (item: LibraryItem) => Promise<void> }) {
  const isSentence = item.contentKind === "sentence";
  const initialSyllables = hydrateSyllables(item);
  const [word, setWord] = useState(item.word);
  const [category, setCategory] = useState(item.category);
  const [article, setArticle] = useState<Article | "">(articleFor(item) ?? "");
  const [image, setImage] = useState(item.image);
  const [imageChanged, setImageChanged] = useState(false);
  const [rights, setRights] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [fileError, setFileError] = useState("");
  const [syllabification, setSyllabification] = useState(initialSyllables.syllabification);
  const [syllableStatus, setSyllableStatus] = useState<SyllableStatus>(initialSyllables.syllableStatus);
  const [subject, setSubject] = useState(item.subject ?? "");
  const [verb, setVerb] = useState(item.verb ?? "");

  const handleFile = async (file: File) => { setProcessing(true); setFileError(""); try { setImage(await prepareUploadedImage(file)); setRights(false); setImageChanged(true); } catch { setFileError("Non è stato possibile elaborare questa immagine."); } finally { setProcessing(false); } };
  const updateWord = (value: string) => { setWord(value); const analysis = analyzeItalianSyllables(value); setSyllabification(value.trim() ? analysis.syllabification : ""); setSyllableStatus(analysis.syllableStatus); };
  const updateSyllabification = (value: string) => { setSyllabification(value); setSyllableStatus("verified"); };
  const save = async () => {
    if (processing || (imageChanged && !rights) || (isSentence ? !subject.trim() || !verb.trim() || !image : !word.trim() || !syllabification.trim())) return;
    setProcessing(true);
    await onSave({ ...item, word: isSentence ? `${subject.trim()} ${verb.trim()}` : word.trim(), category: isSentence ? "Azioni" : category, article: isSentence ? null : article || null, subject: isSentence ? subject.trim() : item.subject, verb: isSentence ? verb.trim() : item.verb, phraseStructure: isSentence ? "subject-verb" : item.phraseStructure, syllabification: isSentence ? undefined : syllabification.trim().toLocaleLowerCase("it-IT"), syllableCount: isSentence ? undefined : countSyllables(syllabification), syllableStatus: isSentence ? undefined : syllableStatus, ...(imageChanged ? { image, emoji: undefined, source: "Upload privato", sourceUrl: undefined, license: "Diritto d’uso dichiarato", licenseUrl: undefined, author: "Utente", privateUpload: true } : {}) });
    setProcessing(false);
  };
  const valid = isSentence ? Boolean(subject.trim() && verb.trim() && image) : Boolean(word.trim() && syllabification.trim());
  return <Modal labelledBy="edit-library-title" onClose={onClose} closeButton><ModalTitle id="edit-library-title" eyebrow="MODIFICA ELEMENTO">{isSentence ? "Modifica la frase" : "Modifica la scheda"}</ModalTitle><p>{isSentence ? "Aggiorna soggetto, verbo o immagine della scena." : "Cambia la parola, aggiungi una foto o aggiorna la sillabazione."}</p>
    <FilePicker accept={IMAGE_FILE_ACCEPT} hint={IMAGE_FILE_HINT} image={image} selection={image ? (imageChanged ? "Immagine selezionata" : "Immagine attuale") : undefined}
      label={processing ? "Attendi…" : hasArtwork(item) || image ? "Sostituisci immagine" : "Scegli un’immagine"}
      disabled={processing} onFiles={([file]) => void handleFile(file)} />
    {fileError && <p className="form-error" role="alert">{fileError}</p>}{isSentence ? <><div className="builder-inline-fields"><label>Soggetto<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label>Verbo<input value={verb} onChange={(event) => setVerb(event.target.value)} /></label></div><label>Frase<input value={`${subject.trim()} ${verb.trim()}`.trim()} readOnly /></label><label>Complemento <small>Prossimamente</small><input disabled placeholder="Non disponibile in questa versione" /></label></> : <><label>Parola<input value={word} onChange={(event) => updateWord(event.target.value)} /></label><label>Sillabazione<input value={syllabification} onChange={(event) => updateSyllabification(event.target.value)} /></label>{syllableStatus === "needs-review" && <div className="syllable-review"><AlertTriangle /><span>Controlla la divisione proposta.</span><button type="button" onClick={() => setSyllableStatus("verified")}>Conferma proposta</button></div>}<label>Categoria<select value={category} onChange={(event) => setCategory(event.target.value)}>{libraryCategories.filter((value) => value !== "Azioni").map((value) => <option key={value}>{value}</option>)}</select></label><label>Articolo nell’esercizio IL / LA<select value={article} disabled={!image && !item.emoji} onChange={(event) => setArticle(event.target.value as Article | "")}><option value="">Non usare nell’esercizio</option><option value="IL">IL</option><option value="LA">LA</option></select></label><p className="field-note">L’immagine comparirà nel gioco soltanto se scegli IL o LA.</p></>}{imageChanged && <CheckLine checked={rights} onChange={setRights} disabled={processing} title="Confermo di avere il diritto di usare questa immagine." />}<ModalActions onCancel={onClose}><button className="primary-button" type="button" disabled={!valid || processing || (imageChanged && !rights)} onClick={save}><Save />{processing ? "Salvataggio…" : "Salva modifiche"}</button></ModalActions></Modal>;
}

export function LibraryDeleteDialog({ item, onCancel, onConfirm }: { item: LibraryItem; onCancel: () => void; onConfirm: () => void }) {
  return <ConfirmDialog labelledBy="library-delete-title" eyebrow="ARCHIVIA ELEMENTO" title={`Rimuovere ${item.word} dalla libreria?`} confirmLabel="Archivia elemento" onCancel={onCancel} onConfirm={onConfirm}>
    <p>La scheda non sarà più proposta nei nuovi esercizi. Il contenuto resterà archiviato per conservare intatti gli storici che lo utilizzano.</p>
  </ConfirmDialog>;
}
