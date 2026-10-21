"use client";

import { AlertTriangle, ArrowDown, ArrowUp, BarChart3, BookOpenCheck, Bug, Candy, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, CircleHelp, Cloud, Copy, FolderHeart, Home, ImagePlus, KeyRound, Library, LockKeyhole, LogOut, Menu, MousePointer2, Palette, Pause, Pencil, Play, Plus, QrCode, RefreshCw, Save, Search, Settings, Share2, ShieldCheck, Shuffle, Sparkles, Square, Trash2, Upload, UserCog, UserRound, Users, Volume2, VolumeX, Wifi, X } from "lucide-react";
import { ChangeEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasSameCategoryDistractors, normalizeLearningCategory, pickCategoryRoundIds, recognitionModeFor } from "./domain/activity-generation";
import { filterQuickCandidates, quickStartIsValid } from "./domain/session-planning";
import { appendAttempt, appendHelp, shouldRecordSessionEvents, type AttemptEvent, type HelpEventRecord, type SessionMode } from "./domain/session-events";
import { deduplicateLibraryPlaceholders, recoverPendingRemoteUploads, remapLibraryId, remapLibraryIds } from "./domain/library-deduplication";
import { feedbackStartOffset } from "./domain/feedback-audio";
import { buildSessionHistoryItems, historyItemUsesArtwork, type HistoryImageSnapshot, type SessionHistoryRecord } from "./domain/session-history";
import { buildSharedPreviewUrl, parseSharedLaunch, parseSharedPreview, type SharedLaunch } from "./domain/shared-launch";
import { canAccessSequence, canViewAllSequences } from "./domain/sequence-access";
import { analyzeItalianSyllables, countSyllables, hydrateSyllables, matchesSyllableFilter, type SyllableFilter, type SyllableStatus } from "./domain/syllabification";
import { wordOnlyCatalog } from "./domain/word-catalog";
import { availableForRecognition, hasArtwork } from "./domain/library-availability";
import { compileSessionPlan, completesSequenceExercise, type SessionActivity, type SessionExercise } from "./domain/session-compilation";
import { appearancePresetId, appearancePresets, defaultAppearance, hydrateAppearance, type AppearanceSettings, type ControlShape, type ThemePalette } from "./domain/appearance";
import { ACTIVE_SESSION_STORAGE_KEY, parseRecoverableSession, serializeRecoverableSession, type RecoverableSession } from "./domain/session-recovery";
import { retryOperation } from "./domain/retry";
import { buildStateChange, rebaseStateChange } from "./domain/state-changes";
import { createPersistentTherapistSession, parsePersistentTherapistSession, THERAPIST_SESSION_STORAGE_KEY } from "./domain/therapist-session";
import { libraryItemWasEdited } from "./domain/library-edit";
import { parsePendingCloudSave, PENDING_CLOUD_SAVE_STORAGE_KEY, serializePendingCloudSave } from "./domain/pending-cloud-save";
import { appendSaveJournal, readSaveJournal } from "./domain/save-journal";
import { quantityAnswerId, quantityIdleDecision, quantityObjectLabel, type QuantityAnswerMethod, type QuantityObject, type QuantityObjectSet } from "./domain/quantity-exercise";
import { defaultSoundPreferences, hydrateSoundPreferences, soundAsset, soundOptions, type SoundCue, type SoundPreferences } from "./domain/sound-preferences";
import { buildExcelProgressCsv } from "./domain/progress-csv";
import { waitForSpeechVoices } from "./domain/speech-readiness";
import { parseControllerToken, REMOTE_CONTROLLER_POLL_MS, remoteCommandFeedback, type RemoteControllerEvent, type RemoteCommandName, type RemoteSessionSnapshot } from "./domain/remote-controller";
import { useRemoteSessionHost, type RemoteHostState } from "./use-remote-session-host";
import { actionSceneCatalog } from "./domain/action-scene-catalog";
import { isSimpleSentenceScene, sentenceMatchingAvailability, type PhraseStructure, type SentenceDifficulty, type SentenceOptionCount } from "./domain/sentence-matching";

type View = "home" | "library" | "exercises" | "session" | "stats" | "profiles" | "appearance";
type Mode = SessionMode;
type Presentation = "images" | "words";
type Article = "IL" | "LA";
type QuickSelection = "all" | "categories" | "items";
type DistractorSource = "mixed" | "same-category";
type QuickStartConfig = { activity: Exclude<SessionActivity, "sentence-matching">; selection: QuickSelection; categoryNames: string[]; itemIds: string[]; rounds: number; distractorCount: 1 | 2 | 3 | 4; distractorSource: DistractorSource; presentation: Presentation; recognitionSyllables: SyllableFilter; autoPronounce: boolean; quantityMin: number; quantityMax: number; quantityObjectSet: QuantityObjectSet; quantityAutoComplete: boolean; quantityIdleSeconds: number };
type LibraryItem = { id: string; word: string; emoji?: string; image?: string; imageKey?: string; remoteImageId?: string; category: string; source: string; sourceUrl?: string; license: string; licenseUrl?: string; author: string; article?: Article | null; syllabification?: string; syllableCount?: number; syllableStatus?: SyllableStatus; contentKind?: "word" | "sentence"; phraseStructure?: PhraseStructure; subject?: string; verb?: string; complement?: string; privateUpload?: boolean; deleted?: boolean };
type Exercise = SessionExercise;
type Sequence = { id: string; title: string; exerciseIds: string[]; therapistId: string; updatedAt?: string; lastUsedAt?: string; deleted?: boolean };
type Attempt = AttemptEvent;
type HelpEvent = HelpEventRecord;
type ProfileRole = "Amministratore" | "Genitore" | "Supervisore" | "Terapista";
type Therapist = { id: string; firstName: string; lastName: string; email: string; role: ProfileRole; pinHash?: string; pin?: string; childIds: string[] };
type ChildProfile = { id: string; firstName: string; lastName: string; birthYear: string; notes: string; avatarColor: string };
type BackendState = { schemaVersion: 1; therapists: Therapist[]; children: ChildProfile[]; activeChildId: string; activeSequenceId?: string; library: LibraryItem[]; exercises: Exercise[]; sequences: Sequence[]; attempts: Attempt[]; helps: HelpEvent[]; sessionHistory: SessionHistoryRecord[]; appearance?: AppearanceSettings; soundPreferences?: SoundPreferences };
type BackendStatus = "loading" | "migrating" | "ready" | "syncing" | "local" | "error";
type SharedPreviewPayload = { schemaVersion: 1; kind: "exercise" | "sequence"; title: string; exercises: Exercise[]; library: LibraryItem[] };

const REMOTE_COMPONENT_EVENT = "lg:remote-controller-command";

function emitRemoteComponentCommand(event: RemoteControllerEvent) {
  window.dispatchEvent(new CustomEvent<RemoteControllerEvent>(REMOTE_COMPONENT_EVENT, { detail: event }));
}

function useRemoteComponentCommand(handler: (event: RemoteControllerEvent) => void) {
  const handlerRef = useRef(handler);
  useEffect(() => { handlerRef.current = handler; }, [handler]);
  useEffect(() => {
    const listener = (event: Event) => handlerRef.current((event as CustomEvent<RemoteControllerEvent>).detail);
    window.addEventListener(REMOTE_COMPONENT_EVENT, listener);
    return () => window.removeEventListener(REMOTE_COMPONENT_EVENT, listener);
  }, []);
}

function useLocalFallbackAdvance(manualAdvance: boolean, pending: boolean, advance: () => void, delayMs: number) {
  const wasManual = useRef(manualAdvance);
  const advanceRef = useRef(advance);
  useEffect(() => { advanceRef.current = advance; }, [advance]);
  useEffect(() => {
    const controllerDisconnected = wasManual.current && !manualAdvance;
    wasManual.current = manualAdvance;
    if (!controllerDisconnected || !pending) return;
    const timer = window.setTimeout(() => advanceRef.current(), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, manualAdvance, pending]);
}

function syllableFilterLabel(filter?: SyllableFilter) {
  if (!filter || filter === "all") return "tutte le sillabe";
  if (filter === "2-3") return "2 o 3 sillabe";
  if (filter === "4+") return "4 o più sillabe";
  return `${filter} sillabe`;
}

function backendStatusInfo(status: BackendStatus) {
  if (status === "loading") return { tone: "pending", label: "Connessione al cloud…", detail: "Caricamento dei dati" };
  if (status === "migrating") return { tone: "pending", label: "Trasferimento nel cloud…", detail: "Migrazione in corso" };
  if (status === "syncing") return { tone: "pending", label: "Salvataggio…", detail: "Modifiche in sincronizzazione" };
  if (status === "error") return { tone: "error", label: "Non salvato nel cloud", detail: "La copia locale è al sicuro; riproverò automaticamente" };
  if (status === "local") return { tone: "local", label: "Solo su questo dispositivo", detail: "Il cloud non è disponibile" };
  return { tone: "ready", label: "Salvato nel cloud", detail: "Dati sincronizzati e protetti" };
}

function readPendingCloudSave() {
  try { return parsePendingCloudSave(localStorage.getItem(PENDING_CLOUD_SAVE_STORAGE_KEY)); }
  catch { return null; }
}

function storePendingCloudSave(change: unknown) {
  try { localStorage.setItem(PENDING_CLOUD_SAVE_STORAGE_KEY, serializePendingCloudSave(change)); }
  catch { /* The normal cloud save must still proceed when browser storage is full or unavailable. */ }
}

function clearPendingCloudSave() {
  try { localStorage.removeItem(PENDING_CLOUD_SAVE_STORAGE_KEY); }
  catch { /* storage can be unavailable */ }
}

const stockItems: LibraryItem[] = [
  ...actionSceneCatalog,
  { id: "mela", word: "Mela", image: "/images/demo/mela.png", category: "Cibi", source: "OpenAI ImageGen", license: "Uso interno del progetto", author: "OpenAI ImageGen" },
  { id: "gatto", word: "Gatto", image: "/images/demo/gatto.png", category: "Animali", source: "OpenAI ImageGen", license: "Uso interno del progetto", author: "OpenAI ImageGen" },
  { id: "pane", word: "Pane", image: "/images/demo/pane.png", category: "Cibi", source: "OpenAI ImageGen", license: "Uso interno del progetto", author: "OpenAI ImageGen" },
  { id: "casa", word: "Casa", image: "/images/demo/casa.png", category: "Luoghi", source: "OpenAI ImageGen", license: "Uso interno del progetto", author: "OpenAI ImageGen" },
  { id: "palla", word: "Palla", image: "/images/demo/palla.png", category: "Giochi", source: "OpenAI ImageGen", license: "Uso interno del progetto", author: "OpenAI ImageGen" },
  { id: "sole", word: "Sole", image: "/images/demo/sole.png", category: "Oggetti della natura", source: "OpenAI ImageGen", license: "Uso interno del progetto", author: "OpenAI ImageGen" },
  { id: "auto", word: "Auto", image: "/images/demo/auto.png", category: "Trasporti", source: "OpenAI ImageGen", license: "Uso interno del progetto", author: "OpenAI ImageGen" },
  { id: "fiore", word: "Fiore", image: "/images/demo/fiore.png", category: "Oggetti della natura", source: "OpenAI ImageGen", license: "Uso interno del progetto", author: "OpenAI ImageGen" },
  {"id": "caramelle", "word": "Caramelle", "image": "/images/library/caramelle.webp", "category": "Cibi", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Assorted_candies.png", "license": "CC BY-SA 3.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0", "author": "Tiia Monto"},
  {"id": "yogurt", "word": "Yogurt", "image": "/images/library/yogurt.webp", "category": "Cibi", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Yoghurt_in_bowl_011715.jpg", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0", "author": "Susan Slater"},
  {"id": "acqua", "word": "Acqua", "image": "/images/library/acqua.webp", "category": "Cibi", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Glass-of-water.jpg", "license": "Public domain", "licenseUrl": "", "author": "Derek Jensen (Tysto)"},
  {"id": "grissini", "word": "Grissini", "image": "/images/library/grissini.webp", "category": "Cibi", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Soepstengels_(3871017999).jpg", "license": "CC BY-SA 2.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0", "author": "Sander van der Wel from Netherlands"},
  {"id": "bocca", "word": "Bocca", "image": "/images/library/bocca.webp", "category": "Parti del corpo", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Mundpartie_014.jpg", "license": "CC BY-SA 3.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0", "author": "Norden"},
  {"id": "schiena", "word": "Schiena", "image": "/images/library/schiena.webp", "category": "Parti del corpo", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:La_belle_jardiniere.jpg", "license": "CC BY 3.0", "licenseUrl": "https://creativecommons.org/licenses/by/3.0", "author": "Creator:Jonathan abbou"},
  {"id": "telefono", "word": "Telefono", "image": "/images/library/telefono.webp", "category": "Oggetti", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Idea-Aurus-III.jpg", "license": "CC BY-SA 3.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0", "author": "Sam wikione"},
  {"id": "pigiama", "word": "Pigiama", "image": "/images/library/pigiama.webp", "category": "Vestiti", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Pyjamas_wiki.jpg", "license": "CC BY-SA 2.5", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.5", "author": "Janmad"},
  {"id": "bicicletta", "word": "Bicicletta", "image": "/images/library/bicicletta.webp", "category": "Trasporti", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:%D0%9A%D0%BE%D0%BB%D0%B5%D0%BB%D0%BE_%D0%9C%D0%B8%D0%BB%D0%B0%D0%BD.jpg", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0", "author": "StefanZehirov"},
  {"id": "gallo", "word": "Gallo", "image": "/images/library/gallo.webp", "category": "Animali", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Rooster04_adjusted.jpg", "license": "GFDL 1.2", "licenseUrl": "http://www.gnu.org/licenses/old-licenses/fdl-1.2.html", "author": "User:Fir0002"},
  {"id": "gelato", "word": "Gelato", "image": "/images/library/gelato.webp", "category": "Cibi", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Ice_cream_cone_-_superman_flavor.jpg", "license": "CC BY 2.0", "licenseUrl": "https://creativecommons.org/licenses/by/2.0", "author": "Ben Dominguez-Benner"},
  {"id": "maiale", "word": "Maiale", "image": "/images/library/maiale.webp", "category": "Animali", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Tamworth_Pig_in_Camperdown_Zoo_-_geograph.org.uk_-_902120.jpg", "license": "CC BY-SA 2.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0", "author": "Mike Pennington"},
  {"id": "coniglio", "word": "Coniglio", "image": "/images/library/coniglio.webp", "category": "Animali", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Lapin_blanc.jpg", "license": "CC BY-SA 3.0", "licenseUrl": "http://creativecommons.org/licenses/by-sa/3.0/", "author": "Fabien1309"},
  {"id": "maglietta", "word": "Maglietta", "image": "/images/library/maglietta.webp", "category": "Vestiti", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Inuit_t-shirt_from_Greenland.png", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0", "author": "Roberto Fortuna"},
  {"id": "piadina", "word": "Piadina", "image": "/images/library/piadina.webp", "category": "Cibi", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Piadina.jpg", "license": "CC BY-SA 2.5", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.5", "author": "Kobako"},
  {"id": "giacca", "word": "Giacca", "image": "/images/library/giacca.webp", "category": "Vestiti", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Windbreaker_Jacket,_Hood_Outside.jpg", "license": "Public domain", "licenseUrl": "", "author": "Ingolfson"},
  {"id": "camion", "word": "Camion", "image": "/images/library/camion.webp", "category": "Trasporti", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Steam_Whistle_Mack_truck_20110613-IMG_3584.JPG", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0", "author": "Matti Blume"},
  {"id": "granchio", "word": "Granchio", "image": "/images/library/granchio.webp", "category": "Animali", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Ocypode-ceratophthalma-horned-ghost-crab-krabi-thailand.jpg", "license": "CC BY-SA 3.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0", "author": "Rushenb"},
  {"id": "coca-cola", "word": "Coca Cola", "image": "/images/library/coca-cola.webp", "category": "Cibi", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Coca-cola_50cl_can_-_Italia.jpg", "license": "CC BY-SA 3.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0", "author": "M0tty"},
  {"id": "carota", "word": "Carota", "image": "/images/library/carota.webp", "category": "Cibi", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Carrots_..jpg", "license": "CC0", "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en", "author": "Wilfredor"},
  {"id": "sedia", "word": "Sedia", "image": "/images/library/sedia.webp", "category": "Casa", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Asahikawa_furniture_chair.jpg", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0", "author": "Nissy-KITAQ"},
  {"id": "barca", "word": "Barca", "image": "/images/library/barca.webp", "category": "Trasporti", "source": "Wikimedia Commons", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Small_boat_at_high_water_on_the_Ythan_Estuary_-_geograph.org.uk_-_612559.jpg", "license": "CC BY-SA 2.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0", "author": "Martyn Gorman"},
  { id: "cane", word: "Cane", emoji: "🐕", category: "Animali", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "pesce", word: "Pesce", emoji: "🐟", category: "Animali", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "mucca", word: "Mucca", emoji: "🐄", category: "Animali", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "uccello", word: "Uccello", emoji: "🐦", category: "Animali", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "banana", word: "Banana", emoji: "🍌", category: "Cibi", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "pera", word: "Pera", emoji: "🍐", category: "Cibi", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "latte", word: "Latte", emoji: "🥛", category: "Cibi", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "letto", word: "Letto", emoji: "🛏️", category: "Casa", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "porta", word: "Porta", emoji: "🚪", category: "Casa", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "libro", word: "Libro", emoji: "📖", category: "Scuola", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "matita", word: "Matita", emoji: "✏️", category: "Scuola", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "scarpa", word: "Scarpa", emoji: "👟", category: "Oggetti", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "mano", word: "Mano", emoji: "✋", category: "Parti del corpo", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "occhio", word: "Occhio", emoji: "👁️", category: "Parti del corpo", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "luna", word: "Luna", emoji: "🌙", category: "Oggetti della natura", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "albero", word: "Albero", emoji: "🌳", category: "Oggetti della natura", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "treno", word: "Treno", emoji: "🚆", category: "Trasporti", source: "Catalogo demo", license: "CC0 demo", author: "OpenMoji demo" },
  { id: "rana", word: "Rana", emoji: "🐸", category: "Animali", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "topo", word: "Topo", emoji: "🐭", category: "Animali", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "orso", word: "Orso", emoji: "🐻", category: "Animali", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: null },
  { id: "volpe", word: "Volpe", emoji: "🦊", category: "Animali", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "zebra", word: "Zebra", emoji: "🦓", category: "Animali", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "tigre", word: "Tigre", emoji: "🐯", category: "Animali", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "lepre", word: "Lepre", emoji: "🐇", category: "Animali", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "gufo", word: "Gufo", emoji: "🦉", category: "Animali", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "ape", word: "Ape", emoji: "🐝", category: "Animali", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: null },
  { id: "mosca", word: "Mosca", emoji: "🪰", category: "Animali", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "naso", word: "Naso", emoji: "👃", category: "Parti del corpo", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "dito", word: "Dito", emoji: "☝️", category: "Parti del corpo", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "piede", word: "Piede", emoji: "🦶", category: "Parti del corpo", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "gamba", word: "Gamba", emoji: "🦵", category: "Parti del corpo", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "braccio", word: "Braccio", emoji: "💪", category: "Parti del corpo", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "spalla", word: "Spalla", emoji: "🧍", category: "Parti del corpo", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "collo", word: "Collo", emoji: "🧣", category: "Parti del corpo", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "pancia", word: "Pancia", emoji: "🫃", category: "Parti del corpo", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "dente", word: "Dente", emoji: "🦷", category: "Parti del corpo", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "testa", word: "Testa", emoji: "🙂", category: "Parti del corpo", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "gonna", word: "Gonna", emoji: "👗", category: "Vestiti", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "calza", word: "Calza", emoji: "🧦", category: "Vestiti", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "guanto", word: "Guanto", emoji: "🧤", category: "Vestiti", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "felpa", word: "Felpa", emoji: "🧥", category: "Vestiti", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "tuta", word: "Tuta", emoji: "🥋", category: "Vestiti", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "borsa", word: "Borsa", emoji: "👜", category: "Vestiti", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "fascia", word: "Fascia", emoji: "🎽", category: "Vestiti", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "sciarpa", word: "Sciarpa", emoji: "🧣", category: "Vestiti", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "casco", word: "Casco", emoji: "⛑️", category: "Vestiti", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "cuffia", word: "Cuffia", emoji: "🧢", category: "Vestiti", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "sasso", word: "Sasso", emoji: "🪨", category: "Oggetti della natura", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "roccia", word: "Roccia", emoji: "🪨", category: "Oggetti della natura", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "foglia", word: "Foglia", emoji: "🍃", category: "Oggetti della natura", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "ramo", word: "Ramo", emoji: "🌿", category: "Oggetti della natura", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "tronco", word: "Tronco", emoji: "🪵", category: "Oggetti della natura", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "prato", word: "Prato", emoji: "🌱", category: "Oggetti della natura", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "monte", word: "Monte", emoji: "⛰️", category: "Oggetti della natura", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "mare", word: "Mare", emoji: "🌊", category: "Oggetti della natura", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "lago", word: "Lago", emoji: "🏞️", category: "Oggetti della natura", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "neve", word: "Neve", emoji: "❄️", category: "Oggetti della natura", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "pasta", word: "Pasta", emoji: "🍝", category: "Cibi", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "pizza", word: "Pizza", emoji: "🍕", category: "Cibi", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "riso", word: "Riso", emoji: "🍚", category: "Cibi", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "pollo", word: "Pollo", emoji: "🍗", category: "Cibi", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "torta", word: "Torta", emoji: "🍰", category: "Cibi", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "uovo", word: "Uovo", emoji: "🥚", category: "Cibi", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: null },
  { id: "burro", word: "Burro", emoji: "🧈", category: "Cibi", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "IL" },
  { id: "zuppa", word: "Zuppa", emoji: "🥣", category: "Cibi", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "pesca", word: "Pesca", emoji: "🍑", category: "Cibi", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  { id: "noce", word: "Noce", emoji: "🌰", category: "Cibi", source: "Immagine da aggiungere", license: "Da definire", author: "—", article: "LA" },
  ...wordOnlyCatalog.map((item) => ({ ...item, syllableCount: countSyllables(item.syllabification), syllableStatus: "verified" as const, source: "Catalogo parole", license: "Nessuna immagine", author: "—", article: null })),
];
const initialRecognitionExercises: Exercise[] = [
  { id: "ex-mela", title: "Trova la mela", promptId: "mela", optionIds: ["mela", "gatto", "pane"], updatedAt: "Oggi" },
  { id: "ex-gatto", title: "Trova il gatto", promptId: "gatto", optionIds: ["gatto", "casa", "palla"], updatedAt: "Oggi" },
  { id: "ex-pane", title: "Trova il pane", promptId: "pane", optionIds: ["pane", "mela", "sole"], updatedAt: "Ieri" },
  { id: "ex-cane", title: "Trova il cane", promptId: "cane", optionIds: ["cane", "gatto", "pesce"], updatedAt: "Oggi" },
  { id: "ex-pesce", title: "Trova il pesce", promptId: "pesce", optionIds: ["pesce", "uccello", "cane"], updatedAt: "Oggi" },
  { id: "ex-mucca", title: "Trova la mucca", promptId: "mucca", optionIds: ["mucca", "gatto", "uccello"], updatedAt: "Oggi" },
  { id: "ex-uccello", title: "Trova l’uccello", promptId: "uccello", optionIds: ["uccello", "pesce", "mucca"], updatedAt: "Oggi" },
  { id: "ex-banana", title: "Trova la banana", promptId: "banana", optionIds: ["banana", "pera", "mela"], updatedAt: "Oggi" },
  { id: "ex-pera", title: "Trova la pera", promptId: "pera", optionIds: ["pera", "banana", "pane"], updatedAt: "Oggi" },
  { id: "ex-latte", title: "Trova il latte", promptId: "latte", optionIds: ["latte", "acqua", "pane"], updatedAt: "Oggi" },
  { id: "ex-acqua", title: "Trova l’acqua", promptId: "acqua", optionIds: ["acqua", "latte", "pera"], updatedAt: "Oggi" },
  { id: "ex-caramelle", title: "Trova le caramelle", promptId: "caramelle", optionIds: ["caramelle", "yogurt", "grissini"], updatedAt: "Oggi" },
  { id: "ex-yogurt", title: "Trova lo yogurt", promptId: "yogurt", optionIds: ["yogurt", "acqua", "caramelle"], updatedAt: "Oggi" },
  { id: "ex-grissini", title: "Trova i grissini", promptId: "grissini", optionIds: ["grissini", "caramelle", "piadina"], updatedAt: "Oggi" },
  { id: "ex-sedia", title: "Trova la sedia", promptId: "sedia", optionIds: ["sedia", "letto", "porta"], updatedAt: "Oggi" },
  { id: "ex-letto", title: "Trova il letto", promptId: "letto", optionIds: ["letto", "sedia", "casa"], updatedAt: "Oggi" },
  { id: "ex-porta", title: "Trova la porta", promptId: "porta", optionIds: ["porta", "casa", "letto"], updatedAt: "Oggi" },
  { id: "ex-libro", title: "Trova il libro", promptId: "libro", optionIds: ["libro", "matita", "palla"], updatedAt: "Oggi" },
  { id: "ex-matita", title: "Trova la matita", promptId: "matita", optionIds: ["matita", "libro", "scarpa"], updatedAt: "Oggi" },
  { id: "ex-scarpa", title: "Trova la scarpa", promptId: "scarpa", optionIds: ["scarpa", "mano", "sedia"], updatedAt: "Oggi" },
  { id: "ex-mano", title: "Trova la mano", promptId: "mano", optionIds: ["mano", "occhio", "scarpa"], updatedAt: "Oggi" },
  { id: "ex-occhio", title: "Trova l’occhio", promptId: "occhio", optionIds: ["occhio", "mano", "sole"], updatedAt: "Oggi" },
  { id: "ex-luna", title: "Trova la luna", promptId: "luna", optionIds: ["luna", "sole", "fiore"], updatedAt: "Oggi" },
  { id: "ex-albero", title: "Trova l’albero", promptId: "albero", optionIds: ["albero", "fiore", "casa"], updatedAt: "Oggi" },
  { id: "ex-treno", title: "Trova il treno", promptId: "treno", optionIds: ["treno", "auto", "barca"], updatedAt: "Oggi" },
  { id: "ex-barca", title: "Trova la barca", promptId: "barca", optionIds: ["barca", "treno", "auto"], updatedAt: "Oggi" },
];
const initialArticleExercise: Exercise = { id: "ex-articles-il-la", title: "Classifica IL o LA", kind: "articles", promptId: "", optionIds: [], articleItemIds: ["mela", "gatto", "pane", "casa", "palla", "sole"], rounds: 6, updatedAt: "Oggi" };
const initialRandomRecognitionExercise: Exercise = { id: "ex-recognition-random", title: "Trova la parola · casuale", kind: "recognition", recognitionMode: "random", promptId: "", optionIds: [], recognitionItemIds: [], recognitionCategories: [], distractorCount: 3, distractorSource: "mixed", presentation: "images", rounds: 6, updatedAt: "Oggi" };
const initialWordCategoryExercise: Exercise = { id: "ex-word-categories", title: "Metti la parola nella categoria", kind: "word-categories", promptId: "", optionIds: [], categoryItemIds: ["mela", "pane", "gatto", "cane", "auto", "treno"], categoryNames: ["Cibi", "Animali", "Trasporti"], rounds: 6, updatedAt: "Oggi" };
const initialNamingExercise: Exercise = { id: "ex-mix-and-vary", title: "Mix and vary", kind: "naming", promptId: "", optionIds: [], namingItemIds: [], namingCategories: [], rounds: 6, updatedAt: "Oggi" };
const initialExercises: Exercise[] = [initialRandomRecognitionExercise, initialArticleExercise, initialWordCategoryExercise, initialNamingExercise, ...initialRecognitionExercises];
const initialSequences: Sequence[] = [{ id: "seq-prime", title: "Prime parole", exerciseIds: [initialRandomRecognitionExercise.id, initialArticleExercise.id, initialWordCategoryExercise.id], therapistId: "admin-giuseppe" }];
const helpTypes = ["Indicazione verbale", "Gesto", "Riduci le opzioni", "Evidenzia", "Dimostrazione"];
const articlesById: Record<string, Article> = {
  mela: "LA", gatto: "IL", pane: "IL", casa: "LA", palla: "LA", sole: "IL", fiore: "IL",
  cane: "IL", pesce: "IL", mucca: "LA", banana: "LA", pera: "LA", latte: "IL", sedia: "LA",
  letto: "IL", porta: "LA", libro: "IL", matita: "LA", scarpa: "LA", mano: "LA", luna: "LA",
  treno: "IL", barca: "LA", bocca: "LA", schiena: "LA", telefono: "IL", pigiama: "IL",
  bicicletta: "LA", gallo: "IL", gelato: "IL", maiale: "IL", coniglio: "IL", maglietta: "LA",
  piadina: "LA", giacca: "LA", camion: "IL", granchio: "IL", "coca-cola": "LA", carota: "LA",
};
const articleFor = (item: LibraryItem) => item.article !== undefined ? item.article ?? undefined : articlesById[item.id];
const exerciseKind = (exercise: Exercise): SessionActivity => exercise.kind ?? "recognition";
const libraryCategories = ["Azioni", "Animali", "Parti del corpo", "Vestiti", "Oggetti della natura", "Cibi", "Casa", "Trasporti", "Oggetti", "Scuola", "Luoghi", "Giochi", "Persone", "Altro"];
const initialAdministrator: Therapist = { id: "admin-giuseppe", firstName: "Giuseppe", lastName: "Bernasconi", email: "giuseppe.bernasconi@letturaglobale.demo", role: "Amministratore", pinHash: "a1fb4e703a9ef1fa4936801721ff285a97ac85330856674412e054892afe6972", childIds: ["child-luca", "child-sara"] };
const initialTherapists: Therapist[] = [
  initialAdministrator,
  { id: "therapist-giulia", firstName: "Giulia", lastName: "Rossi", email: "giulia@letturaglobale.demo", role: "Terapista", pinHash: "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4", childIds: ["child-luca", "child-sara"] },
  { id: "therapist-marco", firstName: "Marco", lastName: "Neri", email: "marco@letturaglobale.demo", role: "Terapista", pinHash: "f8638b979b2f4f793ddb6dbd197e0ee25a7a6ea32b0ae22f5e3c5d119d839e75", childIds: ["child-luca"] },
];
const initialChildren: ChildProfile[] = [
  { id: "child-luca", firstName: "Luca", lastName: "Bianchi", birthYear: "2019", notes: "Profilo dimostrativo", avatarColor: "#7468df" },
  { id: "child-sara", firstName: "Sara", lastName: "Verdi", birthYear: "2020", notes: "Profilo dimostrativo", avatarColor: "#2f8767" },
];

function mergeById<T extends { id: string }>(saved: T[], seeded: T[]) {
  const existingIds = new Set(saved.map((item) => item.id));
  return [...saved, ...seeded.filter((item) => !existingIds.has(item.id))];
}

function hydrateLibrary(items: LibraryItem[]) {
  return mergeById(items, stockItems).map((item) => {
    const demoItem = stockItems.find((candidate) => candidate.id === item.id);
    const hydratedItem = demoItem?.image && !item.privateUpload ? { ...item, image: demoItem.image, emoji: undefined, source: demoItem.source, sourceUrl: demoItem.sourceUrl, license: demoItem.license, licenseUrl: demoItem.licenseUrl, author: demoItem.author } : item;
    const normalizedItem = { ...hydratedItem, category: normalizeLearningCategory(hydratedItem.category) };
    return normalizedItem.contentKind === "sentence" ? normalizedItem : hydrateSyllables(normalizedItem);
  });
}

function hydrateExercises(items: Exercise[]) {
  return mergeById(items, initialExercises).map((exercise) => ({
    ...exercise,
    categoryNames: exercise.categoryNames?.map(normalizeLearningCategory),
    recognitionCategories: exercise.recognitionCategories?.map(normalizeLearningCategory),
    namingCategories: exercise.namingCategories?.map(normalizeLearningCategory),
  }));
}

function remapExerciseLibraryIds(exercise: Exercise, replacements: Map<string, string>): Exercise {
  return {
    ...exercise,
    promptId: remapLibraryId(exercise.promptId, replacements),
    optionIds: remapLibraryIds(exercise.optionIds, replacements) ?? [],
    articleItemIds: remapLibraryIds(exercise.articleItemIds, replacements),
    categoryItemIds: remapLibraryIds(exercise.categoryItemIds, replacements),
    recognitionItemIds: remapLibraryIds(exercise.recognitionItemIds, replacements),
    namingItemIds: remapLibraryIds(exercise.namingItemIds, replacements),
    sentenceItemIds: remapLibraryIds(exercise.sentenceItemIds, replacements),
  };
}

function hydrateSequences(items: Sequence[]) {
  return mergeById(items, initialSequences).map((sequence) => ({
    ...sequence,
    therapistId: sequence.therapistId || initialAdministrator.id,
  }));
}

function libraryForStorage(items: LibraryItem[]) {
  return items.map((item) => item.imageKey ? { ...item, image: undefined } : item);
}

function openImageDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lettura-globale-media", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("images");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeLibraryImage(key: string, image: string) {
  const database = await openImageDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("images", "readwrite");
    transaction.objectStore("images").put(image, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function readLibraryImage(key: string) {
  const database = await openImageDatabase();
  const image = await new Promise<string | undefined>((resolve, reject) => {
    const request = database.transaction("images", "readonly").objectStore("images").get(key);
    request.onsuccess = () => resolve(request.result as string | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return image;
}

async function prepareUploadedImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossibile elaborare l’immagine");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.78);
}

async function uploadRemoteImage(mediaId: string, image: string) {
  const blob = await fetch(image).then((response) => response.blob());
  const response = await fetch("/api/media", { method: "POST", headers: { "content-type": blob.type || "image/webp", "x-media-id": mediaId }, body: blob });
  if (!response.ok) throw new Error("remote_image_upload_failed");
  return (await response.json()) as { id: string; url: string };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function backendResponseError(response: Response, fallback: string) {
  let code = fallback;
  let diagnosticId = "";
  try {
    const body = await response.clone().json() as { error?: unknown; diagnosticId?: unknown };
    if (typeof body.error === "string" && body.error) code = body.error;
    if (typeof body.diagnosticId === "string") diagnosticId = body.diagnosticId;
  } catch { /* response senza JSON */ }
  return Object.assign(new Error(`${code} (${response.status})`), { status: response.status, code, diagnosticId });
}

function saveErrorDetails(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as { status?: unknown; code?: unknown; name?: unknown; diagnosticId?: unknown };
    const message = error instanceof Error && /^[a-z0-9_]{1,64}$/.test(error.message) ? error.message : undefined;
    return { httpStatus: typeof candidate.status === "number" ? candidate.status : undefined, errorCode: typeof candidate.code === "string" ? candidate.code : candidate.name === "AbortError" ? "timeout" : message ?? "network_error", diagnosticId: typeof candidate.diagnosticId === "string" ? candidate.diagnosticId : undefined };
  }
  return { errorCode: "unknown_error" };
}

function backendStateForStorage(state: BackendState): BackendState {
  return { ...state, library: state.library.map((item) => ({ ...item, image: item.remoteImageId ? undefined : item.image?.startsWith("data:") ? undefined : item.image })) };
}

function useStoredState<T>(key: string, fallback: T, migrate?: (saved: T) => T, prepare?: (value: T) => T) {
  const [value, setValue] = useState<T>(fallback);
  const [isLoaded, setIsLoaded] = useState(false);
  const loaded = useRef(false);
  const migrateRef = useRef(migrate);
  const prepareRef = useRef(prepare);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const saved = localStorage.getItem(key); if (saved) { const parsed = JSON.parse(saved) as T; setValue(migrateRef.current ? migrateRef.current(parsed) : parsed); } } catch { /* storage can be unavailable */ }
      loaded.current = true;
      setIsLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key]);
  useEffect(() => { if (!loaded.current) return; try { localStorage.setItem(key, JSON.stringify(prepareRef.current ? prepareRef.current(value) : value)); } catch { /* storage can be unavailable */ } }, [key, value]);
  return [value, setValue, isLoaded] as const;
}

function Artwork({ item, compact = false, eager = false }: { item: LibraryItem; compact?: boolean; eager?: boolean }) {
  if (item.image) return <img className="artwork-image" src={item.image} alt={item.word} loading={eager ? "eager" : "lazy"} decoding="async" />;
  if (item.emoji) return <span className={compact ? "artwork-emoji compact" : "artwork-emoji"} aria-hidden="true">{item.emoji}</span>;
  return <span className={compact ? "word-only-art compact" : "word-only-art"}><BookOpenCheck aria-hidden="true" /><small>Solo parola</small></span>;
}

const preloadedArtwork = new Map<string, HTMLImageElement>();

function preloadArtwork(items: LibraryItem[]) {
  if (typeof window === "undefined") return;
  items.forEach((item) => {
    if (!item.image || preloadedArtwork.has(item.image)) return;
    const image = new window.Image();
    image.decoding = "async";
    image.src = item.image;
    preloadedArtwork.set(item.image, image);
    void image.decode?.().catch(() => undefined);
  });
}

async function hashPin(pin: string) {
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function shuffled<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapWith]] = [result[swapWith], result[index]];
  }
  return result;
}

let speechRequestId = 0;

function speakWord(word: string, onComplete?: () => void) {
  if (!("speechSynthesis" in window)) { onComplete?.(); return () => undefined; }
  const synthesis = window.speechSynthesis;
  const requestId = ++speechRequestId;
  synthesis.cancel();
  let completed = false;
  let fallback = 0;
  const finish = () => {
    if (completed || requestId !== speechRequestId) return;
    completed = true;
    window.clearTimeout(fallback);
    onComplete?.();
  };
  const speakAttempt = async (retried: boolean) => {
    const voices = await waitForSpeechVoices(synthesis, retried ? 250 : 1200);
    if (completed || requestId !== speechRequestId) return;
    const utterance = new SpeechSynthesisUtterance(`${word}!`);
    utterance.lang = "it-IT";
    const italianVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("it"));
    const preferredVoice = italianVoices.find((voice) => /elsa|isabella|google.*ital/i.test(voice.name)) ?? italianVoices.find((voice) => voice.localService) ?? italianVoices[0];
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 0.72;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onend = finish;
    utterance.onerror = () => {
      window.clearTimeout(fallback);
      fallback = 0;
      if (!retried && requestId === speechRequestId) {
        window.setTimeout(() => void speakAttempt(true), 160);
        return;
      }
      finish();
    };
    if (onComplete) fallback = window.setTimeout(finish, Math.max(3000, Math.min(7000, 1500 + word.length * 300)));
    synthesis.speak(utterance);
  };
  void speakAttempt(false);
  return () => {
    if (requestId !== speechRequestId) return;
    speechRequestId += 1;
    completed = true;
    window.clearTimeout(fallback);
    synthesis.cancel();
  };
}

type FeedbackSound = "correct" | "wrong";
let currentSoundPreferences = defaultSoundPreferences;
const feedbackAudioPlayers: Record<string, HTMLAudioElement> = {};
type PreparedFeedbackSound = { buffer: AudioBuffer; startOffset: number };
const preparedFeedbackSounds: Record<string, PreparedFeedbackSound> = {};
const feedbackSoundPreparation: Partial<Record<string, Promise<void>>> = {};
let feedbackAudioContext: AudioContext | null = null;
let activeFeedbackSource: AudioBufferSourceNode | null = null;

function feedbackContext() {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  if (!feedbackAudioContext) feedbackAudioContext = new AudioContext({ latencyHint: "interactive" });
  return feedbackAudioContext;
}

function feedbackAudioFor(url: string) {
  if (typeof window === "undefined") return null;
  if (!feedbackAudioPlayers[url]) {
    const audio = new window.Audio(url);
    audio.preload = "auto";
    audio.load();
    feedbackAudioPlayers[url] = audio;
  }
  return feedbackAudioPlayers[url] ?? null;
}

function preloadFeedbackSounds() {
  for (const cue of Object.keys(currentSoundPreferences) as SoundCue[]) {
    const url = soundAsset(cue, currentSoundPreferences[cue]);
    if (url) { feedbackAudioFor(url); prepareFeedbackSound(url); }
  }
}

function prepareFeedbackSound(url: string) {
  if (preparedFeedbackSounds[url] || feedbackSoundPreparation[url]) return;
  const context = feedbackContext();
  if (!context) return;
  feedbackSoundPreparation[url] = fetch(url, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("feedback_audio_load_failed");
      return response.arrayBuffer();
    })
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
      preparedFeedbackSounds[url] = { buffer, startOffset: feedbackStartOffset(channels, buffer.sampleRate) };
      const fallback = feedbackAudioPlayers[url];
      if (fallback) fallback.currentTime = preparedFeedbackSounds[url]?.startOffset ?? 0;
    })
    .catch(() => undefined)
    .finally(() => { delete feedbackSoundPreparation[url]; });
}

function primeFeedbackSounds() {
  preloadFeedbackSounds();
  const context = feedbackContext();
  if (context?.state === "suspended") void context.resume().catch(() => undefined);
}

function playSynthesizedSound(cue: SoundCue, choice: string, selected: boolean) {
  const context = feedbackContext();
  if (!context) return;
  if (context.state === "suspended") void context.resume().catch(() => undefined);
  const notes = cue === "wrong" ? [392, 330] : cue === "finish" ? [523, 659, 784, 1046] : cue === "correct" ? choice === "bright" ? [784, 1175, 1568] : [659, 988] : [selected ? 1046 : 784];
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + index * (cue === "finish" ? 0.16 : 0.12);
    oscillator.type = cue === "wrong" ? "sine" : choice === "soft" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, start);
    if (cue === "select") oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.35, start + 0.1);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(cue === "select" ? 0.07 : 0.055, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + (cue === "finish" ? 0.38 : 0.22));
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + (cue === "finish" ? 0.4 : 0.24));
  });
}

function playSoundCue(cue: SoundCue, enabled: boolean, selected = true, override?: string) {
  if (!enabled) return;
  const choice = override ?? currentSoundPreferences[cue];
  const url = soundAsset(cue, choice);
  if (!url) { playSynthesizedSound(cue, choice, selected); return; }
  const context = feedbackContext();
  const prepared = preparedFeedbackSounds[url];
  if (context?.state === "running" && prepared) {
    activeFeedbackSource?.stop();
    const source = context.createBufferSource();
    source.buffer = prepared.buffer;
    source.connect(context.destination);
    source.onended = () => { if (activeFeedbackSource === source) activeFeedbackSource = null; };
    activeFeedbackSource = source;
    source.start(0, prepared.startOffset);
    return;
  }
  if (context?.state === "suspended") void context.resume().catch(() => undefined);
  prepareFeedbackSound(url);
  const audio = feedbackAudioFor(url);
  if (!audio) return;
  Object.values(feedbackAudioPlayers).forEach((player) => {
    player?.pause();
    if (player) player.currentTime = 0;
  });
  audio.currentTime = prepared?.startOffset ?? 0;
  void audio.play().catch(() => undefined);
}

function playFeedbackTone(kind: FeedbackSound, enabled: boolean) { playSoundCue(kind, enabled); }

function playQuantityTick(selected: boolean, enabled: boolean) {
  playSoundCue("select", enabled, selected);
}

function compileExercises(selectedExercises: Exercise[], sourceLibrary: LibraryItem[]) {
  return compileSessionPlan(selectedExercises, sourceLibrary, { articleFor });
}

export default function HomePage() {
  const [view, setView] = useState<View>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [therapists, setTherapists, therapistsLoaded] = useStoredState<Therapist[]>("lg-therapists", initialTherapists, (saved) => {
    if (localStorage.getItem("lg-profiles-v2-seeded")) return mergeById(saved, [initialAdministrator]);
    localStorage.setItem("lg-profiles-v2-seeded", "1");
    return mergeById(saved, initialTherapists);
  });
  const [children, setChildren, childrenLoaded] = useStoredState<ChildProfile[]>("lg-children", initialChildren);
  const [activeChildId, setActiveChildId, activeChildLoaded] = useStoredState<string>("lg-active-child", initialChildren[0].id);
  const [loggedInTherapistId, setLoggedInTherapistId] = useState<string | null>(null);
  const [showTherapistLogin, setShowTherapistLogin] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [controllerToken, setControllerToken] = useState<string | null>(null);
  const [library, setLibrary, libraryLoaded] = useStoredState<LibraryItem[]>("lg-library", stockItems, hydrateLibrary, libraryForStorage);
  const [exercises, setExercises, exercisesLoaded] = useStoredState<Exercise[]>("lg-exercises", initialExercises, hydrateExercises);
  const [sequences, setSequences, sequencesLoaded] = useStoredState<Sequence[]>("lg-sequences", initialSequences, hydrateSequences);
  const [activeSequenceId, setActiveSequenceId, activeSequenceLoaded] = useStoredState<string>("lg-active-sequence", initialSequences[0].id);
  const [attempts, setAttempts, attemptsLoaded] = useStoredState<Attempt[]>("lg-attempts", []);
  const [helps, setHelps, helpsLoaded] = useStoredState<HelpEvent[]>("lg-helps", []);
  const [sessionHistory, setSessionHistory, sessionHistoryLoaded] = useStoredState<SessionHistoryRecord[]>("lg-session-history", []);
  const [appearance, setAppearance, appearanceLoaded] = useStoredState<AppearanceSettings>("lg-appearance", defaultAppearance, hydrateAppearance);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [localLoadSlow, setLocalLoadSlow] = useState(false);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("loading");
  const [saveJournalOpen, setSaveJournalOpen] = useState(false);
  const [backendRetryKey, setBackendRetryKey] = useState(0);
  const [backendRefreshKey, setBackendRefreshKey] = useState(0);
  const [backendSaveRetryKey, setBackendSaveRetryKey] = useState(0);
  const [backendInitialized, setBackendInitialized] = useState(false);
  const backendHydrating = useRef(true);
  const backendSaveTimer = useRef<number | null>(null);
  const backendRevision = useRef(0);
  const lastSyncedBackendState = useRef<BackendState | null>(null);
  const localFallbackBaseline = useRef<BackendState | null>(null);
  const backendSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const granularWritesUnavailable = useRef(false);
  const localMediaRepairing = useRef(false);
  const lastBackendSaveError = useRef("");
  const [showUpload, setShowUpload] = useState<"word" | "sentence" | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [newExerciseKind, setNewExerciseKind] = useState<SessionActivity>("recognition");
  const [pendingExerciseDelete, setPendingExerciseDelete] = useState<Exercise | null>(null);
  const [editingSequence, setEditingSequence] = useState<Sequence | "new" | null>(null);
  const [pendingSequenceDelete, setPendingSequenceDelete] = useState<Sequence | null>(null);
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);
  const [pendingLibraryDelete, setPendingLibraryDelete] = useState<LibraryItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "therapist" | "child"; id: string; name: string } | null>(null);
  const [pendingStatsReset, setPendingStatsReset] = useState(false);
  const [pendingHistoryDelete, setPendingHistoryDelete] = useState<{ id?: string; label: string } | null>(null);
  const [exitPinOpen, setExitPinOpen] = useState(false);
  const [recoveryCandidate, setRecoveryCandidate] = useState<RecoverableSession | null>(null);
  const recoveryCheckedFor = useRef("");
  const [sessionMode, setSessionMode] = useState<Mode>("test");
  const [soundEffects, setSoundEffects] = useStoredState<boolean>("lg-sound-effects", true);
  const [soundPreferences, setSoundPreferences, soundPreferencesLoaded] = useStoredState<SoundPreferences>("lg-sound-preferences", defaultSoundPreferences, hydrateSoundPreferences);
  const [celebratingSequence, setCelebratingSequence] = useState(false);
  const [sessionPresentation, setSessionPresentation] = useState<Presentation>("images");
  const [sessionIndex, setSessionIndex] = useState(0);
  const lastAdvancedSessionItem = useRef("");
  const [sessionFurthestIndex, setSessionFurthestIndex] = useState(0);
  const [sessionPlan, setSessionPlan] = useState<Exercise[]>([]);
  const [sessionRunId, setSessionRunId] = useState("");
  const [sessionChildId, setSessionChildId] = useState("");
  const [sessionStartedAt, setSessionStartedAt] = useState("");
  const [sessionDescriptor, setSessionDescriptor] = useState<{ title: string; source: "sequence" | "quick" }>({ title: "Sessione", source: "sequence" });
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionWizardKey, setSessionWizardKey] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionPaused, setSessionPaused] = useState(false);
  const [awaitingNextExercise, setAwaitingNextExercise] = useState(false);
  const [quickExerciseToSave, setQuickExerciseToSave] = useState<Exercise | null>(null);
  const [sessionFromSharedLink, setSessionFromSharedLink] = useState(false);
  const [sessionIsTrial, setSessionIsTrial] = useState(false);
  const [pendingSharedLaunch, setPendingSharedLaunch] = useState<SharedLaunch | null>(null);
  const [pendingSharedPreviewToken, setPendingSharedPreviewToken] = useState<string | null>(null);
  const [sharedPreview, setSharedPreview] = useState<SharedPreviewPayload | null>(null);
  const [sharedPreviewStatus, setSharedPreviewStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [answerState, setAnswerState] = useState<"idle" | "wrong" | "correct">("idle");
  const [wrongAnswerId, setWrongAnswerId] = useState<string | null>(null);
  const spokenPromptKey = useRef("");
  const wrongFeedbackTimer = useRef<number | null>(null);
  const handledSharedLaunch = useRef("");
  const sessionReturnView = useRef<View>("session");
  const lastResumeCheck = useRef(0);
  const modalHistoryMarker = useRef<string | null>(null);
  const ignoreNextModalPop = useRef(false);
  const modalOpen = showUpload || showBuilder || Boolean(editingSequence) || Boolean(pendingExerciseDelete) || Boolean(pendingSequenceDelete) || Boolean(editingItem) || Boolean(pendingLibraryDelete) || Boolean(pendingDelete) || pendingStatsReset || Boolean(pendingHistoryDelete) || exitPinOpen || Boolean(recoveryCandidate) || saveJournalOpen;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.palette = appearance.palette;
    root.dataset.shape = appearance.shape;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(root).getPropertyValue("--violet").trim() || "#6659d9");
  }, [appearance]);

  useEffect(() => {
    preloadFeedbackSounds();
    const prime = () => primeFeedbackSounds();
    window.addEventListener("pointerdown", prime, { capture: true, once: true });
    window.addEventListener("keydown", prime, { capture: true, once: true });
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => registration.update()).catch(() => undefined);
    }
    const authTimer = window.setTimeout(() => {
      const legacyLaunch = parseSharedLaunch(window.location.search);
      const publicPreview = parseSharedPreview(window.location.search);
      setControllerToken(parseControllerToken(window.location.search));
      setPendingSharedLaunch(legacyLaunch);
      setPendingSharedPreviewToken(publicPreview?.token ?? null);
      const persistentTherapistId = parsePersistentTherapistSession(localStorage.getItem(THERAPIST_SESSION_STORAGE_KEY));
      const legacyTherapistId = sessionStorage.getItem(THERAPIST_SESSION_STORAGE_KEY);
      const restoredTherapistId = persistentTherapistId ?? legacyTherapistId;
      if (legacyTherapistId && !persistentTherapistId) localStorage.setItem(THERAPIST_SESSION_STORAGE_KEY, createPersistentTherapistSession(legacyTherapistId));
      sessionStorage.removeItem(THERAPIST_SESSION_STORAGE_KEY);
      if (!restoredTherapistId) localStorage.removeItem(THERAPIST_SESSION_STORAGE_KEY);
      setLoggedInTherapistId(restoredTherapistId);
      if (!legacyLaunch && !publicPreview) window.history.replaceState({ lgView: "home" }, "", window.location.href);
      setSessionChecked(true);
    }, 0);
    return () => {
      window.clearTimeout(authTimer);
      window.removeEventListener("pointerdown", prime, true);
      window.removeEventListener("keydown", prime, true);
    };
  }, []);

  useEffect(() => {
    currentSoundPreferences = soundPreferences;
    preloadFeedbackSounds();
  }, [soundPreferences]);

  useEffect(() => {
    if (!celebratingSequence) return;
    const timeout = window.setTimeout(() => setCelebratingSequence(false), 6000);
    return () => window.clearTimeout(timeout);
  }, [celebratingSequence]);

  useEffect(() => {
    const resume = (event?: PageTransitionEvent) => {
      if (document.visibilityState === "hidden") return;
      if ("serviceWorker" in navigator) void navigator.serviceWorker.getRegistration().then((registration) => registration?.update()).catch(() => undefined);
      const now = Date.now();
      if (!backendInitialized && (event?.persisted || backendStatus === "loading" || backendStatus === "error" || backendStatus === "local") && navigator.onLine && now - lastResumeCheck.current > 15_000) {
        lastResumeCheck.current = now;
        setBackendStatus("loading");
        setBackendRetryKey((current) => current + 1);
      } else if (backendInitialized && (backendStatus === "ready" || backendStatus === "error") && navigator.onLine && now - lastResumeCheck.current > 15_000) {
        lastResumeCheck.current = now;
        if (backendStatus === "error") setBackendSaveRetryKey((current) => current + 1);
        else setBackendRefreshKey((current) => current + 1);
      }
    };
    const onVisibilityChange = () => resume();
    const onPageShow = (event: PageTransitionEvent) => resume(event);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onVisibilityChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onVisibilityChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [backendInitialized, backendStatus]);

  useEffect(() => {
    if (modalOpen && !modalHistoryMarker.current) {
      const marker = crypto.randomUUID();
      modalHistoryMarker.current = marker;
      window.history.pushState({ ...window.history.state, lgModal: marker }, "", window.location.href);
      return;
    }
    if (!modalOpen && modalHistoryMarker.current) {
      const marker = modalHistoryMarker.current;
      modalHistoryMarker.current = null;
      if (window.history.state?.lgModal === marker) {
        ignoreNextModalPop.current = true;
        window.history.back();
      }
    }
  }, [modalOpen]);

  useEffect(() => {
    if (!pendingSharedPreviewToken) return;
    let cancelled = false;
    fetch(`/api/shared-launch/${encodeURIComponent(pendingSharedPreviewToken)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("preview_load_failed");
        return response.json() as Promise<SharedPreviewPayload>;
      })
      .then((payload) => {
        if (cancelled || payload.schemaVersion !== 1 || !payload.exercises?.length || !Array.isArray(payload.library)) throw new Error("invalid_preview");
        const plan = compileExercises(payload.exercises, payload.library.filter((item) => !item.deleted));
        if (!plan.length) throw new Error("empty_preview");
        setSharedPreview(payload);
        setSessionPlan(plan);
        setSessionRunId(crypto.randomUUID());
        setSessionChildId("");
        setSessionIndex(0);
        setSessionFurthestIndex(0);
        setSessionMode("test");
        setSessionPresentation("images");
        setAnswerState("idle");
        setWrongAnswerId(null);
        setSessionComplete(false);
        setSessionFromSharedLink(true);
        setSessionIsTrial(false);
        setSessionActive(true);
        setView("session");
        setSharedPreviewStatus("ready");
        window.history.replaceState({}, "", window.location.pathname);
      })
      .catch(() => { if (!cancelled) setSharedPreviewStatus("error"); });
    return () => { cancelled = true; };
  }, [pendingSharedPreviewToken]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (ignoreNextModalPop.current) {
        ignoreNextModalPop.current = false;
        return;
      }
      if (modalHistoryMarker.current) {
        modalHistoryMarker.current = null;
      setShowUpload(null);
        setShowBuilder(false);
        setEditingExercise(null);
        setEditingSequence(null);
        setSaveJournalOpen(false);
        setPendingExerciseDelete(null);
        setPendingSequenceDelete(null);
        setEditingItem(null);
        setPendingLibraryDelete(null);
        setPendingDelete(null);
        setPendingStatsReset(false);
        setPendingHistoryDelete(null);
        setExitPinOpen(false);
        setRecoveryCandidate(null);
        return;
      }
      const nextView = (["home", "library", "exercises", "session", "stats", "profiles", "appearance"] as View[]).includes(event.state?.lgView) ? event.state.lgView as View : "home";
      if (sessionActive) {
        window.history.pushState({ lgView: "session", lgActivity: true }, "", window.location.pathname);
        setToast("Per uscire tieni premuto Termina per 4 secondi");
        window.setTimeout(() => setToast(null), 3200);
        return;
      }
      setView(nextView);
      setMenuOpen(false);
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [sessionActive]);

  useEffect(() => {
    let cancelled = false;
    const restoreImages = async () => {
      const missing = library.filter((item) => item.imageKey && !item.image);
      const legacy = library.filter((item) => item.privateUpload && item.image?.startsWith("data:") && !item.imageKey);
      if (!missing.length && !legacy.length) return;
      const restored = new Map<string, string>();
      await Promise.all(missing.map(async (item) => { const image = await readLibraryImage(item.imageKey!); if (image) restored.set(item.id, image); }));
      await Promise.all(legacy.map(async (item) => { const key = `library-image-${item.id}`; await storeLibraryImage(key, item.image!); restored.set(item.id, item.image!); }));
      if (cancelled || !restored.size) return;
      setLibrary((current) => current.map((item) => {
        const legacyItem = legacy.find((candidate) => candidate.id === item.id);
        return restored.has(item.id) ? { ...item, image: restored.get(item.id), imageKey: item.imageKey ?? (legacyItem ? `library-image-${item.id}` : undefined) } : item;
      }));
    };
    restoreImages().catch(() => { setToast("Non è stato possibile recuperare una foto salvata"); window.setTimeout(() => setToast(null), 2600); });
    return () => { cancelled = true; };
  }, [library, setLibrary]);

  const allLocalDataLoaded = therapistsLoaded && childrenLoaded && activeChildLoaded && libraryLoaded && exercisesLoaded && sequencesLoaded && activeSequenceLoaded && attemptsLoaded && helpsLoaded && sessionHistoryLoaded && appearanceLoaded && soundPreferencesLoaded;
  const localBootstrapSnapshot = useRef<BackendState>({ schemaVersion: 1, therapists, children, activeChildId, activeSequenceId, library, exercises, sequences, attempts, helps, sessionHistory, appearance, soundPreferences });

  useEffect(() => {
    localBootstrapSnapshot.current = { schemaVersion: 1, therapists, children, activeChildId, activeSequenceId, library, exercises, sequences, attempts, helps, sessionHistory, appearance, soundPreferences };
  }, [therapists, children, activeChildId, activeSequenceId, library, exercises, sequences, attempts, helps, sessionHistory, appearance, soundPreferences]);

  useEffect(() => {
    if (!backendInitialized || sessionActive || !navigator.onLine || backendStatus === "syncing" || backendSaveTimer.current !== null) return;
    const baseline = lastSyncedBackendState.current;
    if (!baseline) return;
    const local = backendStateForStorage(localBootstrapSnapshot.current);
    if (buildStateChange(baseline, local, crypto.randomUUID(), backendRevision.current)) return;
    let cancelled = false;
    const refresh = async () => {
      await backendSaveQueue.current.catch(() => undefined);
      const response = await fetchWithTimeout("/api/state", { cache: "no-store" }, 6500);
      if (!response.ok) throw await backendResponseError(response, "backend_refresh_failed");
      const result = await response.json() as { state: BackendState | null; revision: number };
      if (cancelled || !result.state || result.revision <= backendRevision.current) return;
      const saved = result.state;
      const savedBaseline: BackendState = {
        schemaVersion: 1,
        therapists: saved.therapists ?? [], children: saved.children ?? [], activeChildId: saved.activeChildId ?? "",
        activeSequenceId: saved.activeSequenceId, library: saved.library ?? [], exercises: saved.exercises ?? [], sequences: saved.sequences ?? [],
        attempts: saved.attempts ?? [], helps: saved.helps ?? [], sessionHistory: saved.sessionHistory ?? [], appearance: saved.appearance, soundPreferences: saved.soundPreferences,
      };
      backendHydrating.current = true;
      backendRevision.current = result.revision;
      lastSyncedBackendState.current = backendStateForStorage(savedBaseline);
      setTherapists(mergeById(saved.therapists ?? [], [initialAdministrator]));
      setChildren(saved.children?.length ? saved.children : initialChildren);
      setActiveChildId(saved.activeChildId || saved.children?.[0]?.id || initialChildren[0].id);
      setLibrary(hydrateLibrary(saved.library ?? stockItems).map((item) => item.remoteImageId ? { ...item, image: `/api/media/${encodeURIComponent(item.remoteImageId)}` } : item));
      setExercises(hydrateExercises(saved.exercises ?? []));
      setSequences(hydrateSequences(saved.sequences ?? []));
      setActiveSequenceId(saved.activeSequenceId || saved.sequences?.[0]?.id || initialSequences[0].id);
      setAttempts(saved.attempts ?? []);
      setHelps(saved.helps ?? []);
      setSessionHistory(saved.sessionHistory ?? []);
      setAppearance(hydrateAppearance(saved.appearance));
      if (saved.soundPreferences) setSoundPreferences(hydrateSoundPreferences(saved.soundPreferences));
      backendHydrating.current = false;
      setBackendStatus("ready");
      setToast("Dati aggiornati dal cloud");
      window.setTimeout(() => setToast(null), 2600);
    };
    void refresh().catch((error) => {
      if (cancelled) return;
      appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "refresh_failed", revision: backendRevision.current, ...saveErrorDetails(error) });
      // This effect only runs when the local snapshot matches the last confirmed
      // cloud revision. A failed read therefore does not mean that data is unsaved.
      setBackendStatus("ready");
    });
    return () => { cancelled = true; };
  }, [backendRefreshKey, backendInitialized, backendStatus, sessionActive, setTherapists, setChildren, setActiveChildId, setLibrary, setExercises, setSequences, setActiveSequenceId, setAttempts, setHelps, setSessionHistory, setAppearance, setSoundPreferences]);

  useEffect(() => {
    if (!backendInitialized || sessionActive) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        if (backendStatus === "error") setBackendSaveRetryKey((current) => current + 1);
        else setBackendRefreshKey((current) => current + 1);
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [backendInitialized, backendStatus, sessionActive]);

  useEffect(() => {
    if (allLocalDataLoaded) return;
    const timer = window.setTimeout(() => setLocalLoadSlow(true), 6000);
    return () => window.clearTimeout(timer);
  }, [allLocalDataLoaded]);

  useEffect(() => {
    if (!libraryLoaded || !exercisesLoaded) return;
    const deduplicated = deduplicateLibraryPlaceholders(library);
    if (!deduplicated.replacements.size) return;
    setLibrary(deduplicated.items);
    setExercises((current) => current.map((exercise) => remapExerciseLibraryIds(exercise, deduplicated.replacements)));
  }, [library, libraryLoaded, exercisesLoaded, setLibrary, setExercises]);

  useEffect(() => {
    if (!allLocalDataLoaded || backendInitialized) return;
    let cancelled = false;
    const initializeBackend = async () => {
      if (!backendInitialized) setBackendStatus("loading");
      const response = await retryOperation(async () => {
        const result = await fetchWithTimeout("/api/state", { cache: "no-store" }, 6500);
        if (result.status >= 500) throw new Error(`backend_http_${result.status}`);
        return result;
      }, { attempts: 3, delayMs: 400 });
      if (response.status === 401) {
        if (!cancelled) {
          localStorage.removeItem(THERAPIST_SESSION_STORAGE_KEY);
          sessionStorage.removeItem(THERAPIST_SESSION_STORAGE_KEY);
          setLoggedInTherapistId(null);
          setBackendStatus("local");
        }
        return;
      }
      if (!response.ok) throw new Error("backend_load_failed");
      const result = await response.json() as { state: BackendState | null; revision: number };
      if (cancelled) return;

      if (result.state) {
        const saved = result.state;
        const savedBaseline: BackendState = {
          schemaVersion: 1,
          therapists: saved.therapists ?? [], children: saved.children ?? [], activeChildId: saved.activeChildId ?? "",
          activeSequenceId: saved.activeSequenceId, library: saved.library ?? [], exercises: saved.exercises ?? [], sequences: saved.sequences ?? [],
          attempts: saved.attempts ?? [], helps: saved.helps ?? [], sessionHistory: saved.sessionHistory ?? [], appearance: saved.appearance, soundPreferences: saved.soundPreferences,
        };
        let restoredState = savedBaseline;
        const pendingSave = readPendingCloudSave();
        let recoveredPendingSave = false;
        if (pendingSave) {
          try {
            restoredState = rebaseStateChange(savedBaseline, pendingSave.change, crypto.randomUUID(), result.revision).state as BackendState;
            recoveredPendingSave = true;
          } catch {
            clearPendingCloudSave();
          }
        }
        const recoveredLibrary = recoverPendingRemoteUploads(restoredState.library, localBootstrapSnapshot.current.library);
        backendRevision.current = result.revision;
        lastSyncedBackendState.current = backendStateForStorage(savedBaseline);
        appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "cloud_loaded", revision: result.revision, sequenceCount: restoredState.sequences.length });
        localFallbackBaseline.current = null;
        setTherapists(mergeById(restoredState.therapists ?? [], [initialAdministrator]));
        setChildren(restoredState.children?.length ? restoredState.children : initialChildren);
        setActiveChildId(restoredState.activeChildId || restoredState.children?.[0]?.id || initialChildren[0].id);
        setLibrary(hydrateLibrary(recoveredLibrary).map((item) => item.remoteImageId ? { ...item, image: `/api/media/${encodeURIComponent(item.remoteImageId)}` } : item));
        setExercises(hydrateExercises(restoredState.exercises ?? []));
        setSequences(hydrateSequences(restoredState.sequences ?? []));
        setActiveSequenceId(restoredState.activeSequenceId || restoredState.sequences?.[0]?.id || initialSequences[0].id);
        setAttempts(restoredState.attempts ?? []);
        setHelps(restoredState.helps ?? []);
        setSessionHistory(restoredState.sessionHistory ?? []);
        setAppearance(hydrateAppearance(restoredState.appearance));
        setSoundPreferences(hydrateSoundPreferences(restoredState.soundPreferences ?? localBootstrapSnapshot.current.soundPreferences));
        backendHydrating.current = false;
        setBackendInitialized(true);
        setBackendStatus(recoveredPendingSave ? "syncing" : "ready");
        return;
      }

      setBackendStatus("migrating");
      const local = localBootstrapSnapshot.current;
      const migratedLibrary: LibraryItem[] = [];
      for (const item of local.library) {
        if (!item.privateUpload || item.remoteImageId) { migratedLibrary.push(item); continue; }
        const localImage = item.image?.startsWith("data:") ? item.image : item.imageKey ? await readLibraryImage(item.imageKey) : undefined;
        if (!localImage) { migratedLibrary.push(item); continue; }
        const remote = await uploadRemoteImage(crypto.randomUUID(), localImage);
        migratedLibrary.push({ ...item, image: localImage, remoteImageId: remote.id });
      }
      const migrated: BackendState = { ...local, library: migratedLibrary };
      const saveResponse = await retryOperation(() => fetchWithTimeout("/api/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(backendStateForStorage(migrated)) }, 6500), { attempts: 2, delayMs: 500 });
      if (!saveResponse.ok) throw new Error("backend_migration_failed");
      const saveResult = await saveResponse.json() as { revision: number };
      if (cancelled) return;
      backendRevision.current = saveResult.revision;
      lastSyncedBackendState.current = backendStateForStorage(migrated);
      setLibrary(migratedLibrary);
      backendHydrating.current = false;
      setBackendInitialized(true);
      setBackendStatus("ready");
    };
    initializeBackend().catch((error) => {
      if (cancelled) return;
      appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "cloud_load_failed", ...saveErrorDetails(error) });
      localFallbackBaseline.current = backendStateForStorage(localBootstrapSnapshot.current);
      backendHydrating.current = false;
      setBackendStatus("local");
    });
    return () => { cancelled = true; };
  }, [allLocalDataLoaded, backendInitialized, backendRetryKey, setTherapists, setChildren, setActiveChildId, setLibrary, setExercises, setSequences, setActiveSequenceId, setAttempts, setHelps, setSessionHistory, setAppearance, setSoundPreferences]);

  useEffect(() => {
    if (backendInitialized || (backendStatus !== "loading" && backendStatus !== "migrating")) return;
    const watchdog = window.setTimeout(() => {
      localFallbackBaseline.current = backendStateForStorage(localBootstrapSnapshot.current);
      backendHydrating.current = false;
      setBackendStatus("local");
    }, 16_000);
    return () => window.clearTimeout(watchdog);
  }, [backendInitialized, backendStatus, backendRetryKey]);

  const enqueueBackendSave = useCallback((snapshot: BackendState) => {
    let attemptedOperationId = "";
    const task = backendSaveQueue.current.catch(() => undefined).then(async () => {
        const previous = lastSyncedBackendState.current;
        if (!previous) throw new Error("missing_sync_baseline");
        const operationId = crypto.randomUUID();
        attemptedOperationId = operationId;
        const change = buildStateChange(previous, snapshot, operationId, backendRevision.current);
        if (!change) return;
        appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "save_started", operationId, revision: backendRevision.current, changedSequences: change.collections.sequences?.upserts.length ?? 0, sequenceCount: snapshot.sequences.length });
        setBackendStatus("syncing");
        let response: Response;
        if (granularWritesUnavailable.current) {
          response = await fetchWithTimeout("/api/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(snapshot) }, 6500);
        } else {
          const body = JSON.stringify(change);
          response = await retryOperation(async () => {
            const result = await fetchWithTimeout("/api/state/changes", { method: "PATCH", headers: { "content-type": "application/json" }, body }, 6500);
            if (result.status >= 500) throw await backendResponseError(result, "backend_save_failed");
            return result;
          }, { attempts: 2, delayMs: 400 });
          if ([404, 405, 501].includes(response.status)) {
            granularWritesUnavailable.current = true;
            response = await fetchWithTimeout("/api/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(snapshot) }, 6500);
          }
        }
        let syncedSnapshot = snapshot;
        if (response.status === 409) {
          const latestResponse = await fetchWithTimeout("/api/state", { cache: "no-store" }, 6500);
          if (!latestResponse.ok) throw new Error("backend_conflict_reload_failed");
          const latest = await latestResponse.json() as { state: BackendState | null; revision: number };
          if (!latest.state || latest.revision < 1) throw new Error("backend_conflict_state_missing");
          const rebased = rebaseStateChange(latest.state, change, crypto.randomUUID(), latest.revision);
          appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "save_rebased", operationId, revision: latest.revision, changedSequences: change.collections.sequences?.upserts.length ?? 0 });
          syncedSnapshot = rebased.state as BackendState;
          response = await retryOperation(async () => {
            const result = await fetchWithTimeout("/api/state/changes", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(rebased.change) }, 6500);
            if (result.status >= 500) throw await backendResponseError(result, "backend_conflict_failed");
            return result;
          }, { attempts: 2, delayMs: 400 });
        }
        if (!response.ok) throw await backendResponseError(response, "backend_save_failed");
        const result = await response.json() as { revision: number };
        lastBackendSaveError.current = "";
        backendRevision.current = result.revision;
        lastSyncedBackendState.current = syncedSnapshot;
        appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "save_succeeded", operationId, revision: result.revision, httpStatus: response.status, changedSequences: change.collections.sequences?.upserts.length ?? 0, sequenceCount: syncedSnapshot.sequences.length });
        if (syncedSnapshot !== snapshot) {
          backendHydrating.current = true;
          setTherapists(mergeById(syncedSnapshot.therapists ?? [], [initialAdministrator]));
          setChildren(syncedSnapshot.children?.length ? syncedSnapshot.children : initialChildren);
          setActiveChildId(syncedSnapshot.activeChildId || syncedSnapshot.children?.[0]?.id || initialChildren[0].id);
          setLibrary(hydrateLibrary(syncedSnapshot.library ?? stockItems).map((item) => item.remoteImageId ? { ...item, image: `/api/media/${encodeURIComponent(item.remoteImageId)}` } : item));
          setExercises(hydrateExercises(syncedSnapshot.exercises ?? []));
          setSequences(hydrateSequences(syncedSnapshot.sequences ?? []));
          setActiveSequenceId(syncedSnapshot.activeSequenceId || syncedSnapshot.sequences?.[0]?.id || initialSequences[0].id);
          setAttempts(syncedSnapshot.attempts ?? []);
          setHelps(syncedSnapshot.helps ?? []);
          setSessionHistory(syncedSnapshot.sessionHistory ?? []);
          setAppearance(hydrateAppearance(syncedSnapshot.appearance));
          setSoundPreferences(hydrateSoundPreferences(syncedSnapshot.soundPreferences));
          backendHydrating.current = false;
        }
        const currentSnapshot = backendStateForStorage(localBootstrapSnapshot.current);
        const stillDirty = Boolean(buildStateChange(syncedSnapshot, currentSnapshot, crypto.randomUUID(), result.revision));
        if (stillDirty) setBackendStatus("syncing");
        else {
          clearPendingCloudSave();
          setBackendStatus("ready");
        }
      }).catch((error) => {
        appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "save_failed", operationId: attemptedOperationId, ...saveErrorDetails(error) });
        throw error;
      });
    backendSaveQueue.current = task;
    return task;
  }, [setTherapists, setChildren, setActiveChildId, setLibrary, setExercises, setSequences, setActiveSequenceId, setAttempts, setHelps, setSessionHistory, setAppearance, setSoundPreferences]);

  useEffect(() => {
    if (backendHydrating.current) return;
    const snapshot = backendStateForStorage({ schemaVersion: 1, therapists, children, activeChildId, activeSequenceId, library, exercises, sequences, attempts, helps, sessionHistory, appearance, soundPreferences });
    if (!backendInitialized) {
      if (!localFallbackBaseline.current) return;
      const localChange = buildStateChange(localFallbackBaseline.current, snapshot, crypto.randomUUID(), 1);
      if (localChange) storePendingCloudSave(localChange);
      return;
    }
    const baseline = lastSyncedBackendState.current;
    if (!baseline) return;
    const pendingChange = buildStateChange(baseline, snapshot, crypto.randomUUID(), backendRevision.current);
    if (!pendingChange) {
      clearPendingCloudSave();
      return;
    }
    storePendingCloudSave(pendingChange);
    window.setTimeout(() => setBackendStatus("syncing"), 0);
    if (backendSaveTimer.current) window.clearTimeout(backendSaveTimer.current);
    backendSaveTimer.current = window.setTimeout(() => {
      backendSaveTimer.current = null;
      void enqueueBackendSave(snapshot).catch(() => setBackendStatus("error"));
    }, 500);
    return () => { if (backendSaveTimer.current) window.clearTimeout(backendSaveTimer.current); backendSaveTimer.current = null; };
  }, [backendInitialized, backendSaveRetryKey, therapists, children, activeChildId, activeSequenceId, library, exercises, sequences, attempts, helps, sessionHistory, appearance, soundPreferences, enqueueBackendSave]);

  useEffect(() => {
    if (!backendInitialized || backendStatus !== "ready" || localMediaRepairing.current) return;
    const candidates = library.filter((item) => item.privateUpload && !item.remoteImageId && (item.image?.startsWith("data:") || item.imageKey));
    if (!candidates.length) return;
    let cancelled = false;
    localMediaRepairing.current = true;
    const repair = async () => {
      const uploaded = new Map<string, string>();
      for (const item of candidates) {
        const image = item.image?.startsWith("data:") ? item.image : item.imageKey ? await readLibraryImage(item.imageKey) : undefined;
        if (!image) continue;
        const remote = await uploadRemoteImage(crypto.randomUUID(), image);
        uploaded.set(item.id, remote.id);
      }
      if (cancelled || !uploaded.size) return;
      const nextLibrary = localBootstrapSnapshot.current.library.map((item) => uploaded.has(item.id) ? { ...item, remoteImageId: uploaded.get(item.id) } : item);
      setLibrary(nextLibrary);
      await enqueueBackendSave(backendStateForStorage({ ...localBootstrapSnapshot.current, library: nextLibrary }));
      if (cancelled) return;
      const labels = candidates.filter((item) => uploaded.has(item.id)).map((item) => item.word).join(", ");
      setToast(`${labels}: immagini recuperate nel cloud`);
      window.setTimeout(() => setToast(null), 3200);
    };
    void repair().catch(() => {
      if (!cancelled) {
        setToast("Le immagini locali non sono ancora state sincronizzate");
        window.setTimeout(() => setToast(null), 3200);
      }
    }).finally(() => { localMediaRepairing.current = false; });
    return () => { cancelled = true; };
  }, [backendInitialized, backendRefreshKey, backendStatus, library, enqueueBackendSave, setLibrary]);

  const therapist = therapists.find((item) => item.id === loggedInTherapistId);
  const canSeeAllSequences = canViewAllSequences(therapist?.role);
  const associatedChildren = useMemo(() => therapist?.role === "Amministratore" ? children : children.filter((child) => therapist?.childIds.includes(child.id)), [children, therapist]);
  const activeChild = associatedChildren.find((child) => child.id === activeChildId) ?? associatedChildren[0];

  useEffect(() => {
    if (!sessionChecked || !allLocalDataLoaded || !therapist || sessionActive || recoveryCheckedFor.current === therapist.id || backendStatus === "loading" || backendStatus === "migrating") return;
    recoveryCheckedFor.current = therapist.id;
    const saved = parseRecoverableSession(localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY));
    if (!saved || saved.therapistId !== therapist.id || !associatedChildren.some((child) => child.id === saved.childId)) {
      if (!saved || saved?.therapistId !== therapist.id) localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      return;
    }
    const timer = window.setTimeout(() => setRecoveryCandidate(saved), 0);
    return () => window.clearTimeout(timer);
  }, [allLocalDataLoaded, associatedChildren, backendStatus, sessionActive, sessionChecked, therapist]);

  useEffect(() => {
    if (!sessionActive || sessionFromSharedLink || !therapist || !sessionPlan.length || !sessionRunId || !sessionChildId) return;
    try {
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, serializeRecoverableSession({
        plan: sessionPlan,
        runId: sessionRunId,
        therapistId: therapist.id,
        childId: sessionChildId,
        startedAt: sessionStartedAt,
        descriptor: sessionDescriptor,
        mode: sessionMode,
        presentation: sessionPresentation,
        currentIndex: sessionIndex,
        furthestIndex: sessionFurthestIndex,
        isTrial: sessionIsTrial,
        returnView: sessionReturnView.current === "exercises" ? "exercises" : "session",
      }));
    } catch { /* localStorage può non essere disponibile */ }
  }, [sessionActive, sessionFromSharedLink, sessionPlan, sessionRunId, sessionChildId, sessionStartedAt, sessionDescriptor, sessionMode, sessionPresentation, sessionIndex, sessionFurthestIndex, sessionIsTrial, therapist]);
  const visibleLibrary = library.filter((item) => !item.deleted);
  const visibleIds = new Set(visibleLibrary.map((item) => item.id));
  const visibleExercises: Exercise[] = exercises.filter((exercise) => !exercise.deleted).map((exercise): Exercise => ({
    ...exercise,
    optionIds: exercise.optionIds.filter((id) => { const item = visibleLibrary.find((candidate) => candidate.id === id); return Boolean(item && (exercise.presentation === "words" || hasArtwork(item))); }),
    articleItemIds: exercise.articleItemIds?.filter((id) => { const item = visibleLibrary.find((candidate) => candidate.id === id); return Boolean(item && hasArtwork(item) && articleFor(item)); }),
    categoryItemIds: exercise.categoryItemIds?.filter((id) => visibleIds.has(id)),
    recognitionItemIds: exercise.recognitionItemIds?.filter((id) => visibleIds.has(id)),
    sentenceItemIds: exercise.sentenceItemIds?.filter((id) => visibleIds.has(id)),
    namingItemIds: exercise.namingItemIds?.filter((id) => { const item = visibleLibrary.find((candidate) => candidate.id === id); return Boolean(item && hasArtwork(item)); }),
  })).filter((exercise) => {
    const kind = exerciseKind(exercise);
    if (kind === "number-quantity") return true;
    if (kind === "sentence-matching") return sentenceMatchingAvailability(visibleLibrary, { rounds: exercise.rounds ?? 6, optionCount: exercise.sentenceOptionCount ?? 2, difficulty: exercise.sentenceDifficulty ?? 1, allowedIds: exercise.sentenceItemIds }).valid;
    if (kind === "articles") return Boolean(exercise.articleItemIds?.length);
    if (kind === "word-categories") return Boolean(exercise.categoryItemIds?.length && exercise.categoryNames?.length && exercise.categoryNames.length >= 2);
    if (kind === "naming") {
      const allowed = exercise.namingItemIds?.length ? new Set(exercise.namingItemIds) : null;
      const categories = exercise.namingCategories?.length ? new Set(exercise.namingCategories) : null;
      return visibleLibrary.some((item) => hasArtwork(item) && (!allowed || allowed.has(item.id)) && (!categories || categories.has(item.category)));
    }
    if (recognitionModeFor(exercise) === "random") {
      const allowed = exercise.recognitionItemIds?.length ? new Set(exercise.recognitionItemIds) : null;
      const categories = exercise.recognitionCategories?.length ? new Set(exercise.recognitionCategories) : null;
      return visibleLibrary.filter((item) => (exercise.presentation === "words" || hasArtwork(item)) && (!allowed || allowed.has(item.id)) && (!categories || categories.has(item.category)) && matchesSyllableFilter(item, exercise.recognitionSyllables)).length >= 2;
    }
    return Boolean(exercise.promptId && visibleIds.has(exercise.promptId) && (exercise.presentation === "words" || hasArtwork(visibleLibrary.find((item) => item.id === exercise.promptId))) && exercise.optionIds.length >= 2);
  });
  const visibleSequences = sequences.filter((sequence) => !sequence.deleted && canAccessSequence(sequence.therapistId, therapist?.id, therapist?.role));
  const activeSequence = visibleSequences.find((sequence) => sequence.id === activeSequenceId) ?? visibleSequences[0];
  const sequenceExercises = activeSequence?.exerciseIds.map((id) => visibleExercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is Exercise => Boolean(exercise)) ?? [];
  const sessionExercises = sessionPlan;
  const currentExercise = sessionExercises[sessionIndex] ?? sessionExercises[0];
  const currentPresentation = currentExercise?.presentation ?? sessionPresentation;
  const sessionLibrary = sessionFromSharedLink && sharedPreview ? sharedPreview.library.filter((item) => !item.deleted) : visibleLibrary;
  const promptItem = sessionLibrary.find((item) => item.id === currentExercise?.promptId);
  const promptWord = promptItem?.word;
  const childAttempts = attempts.filter((attempt) => !attempt.childId || attempt.childId === activeChild?.id);
  const childHelps = helps.filter((help) => !help.childId || help.childId === activeChild?.id);
  const childSessionHistory = sessionHistory.filter((record) => !record.deletedAt && record.childId === activeChild?.id && (
    therapist?.role === "Amministratore" || therapist?.role === "Genitore" || therapist?.role === "Supervisore" || record.therapistId === therapist?.id
  ));
  const completedSessionRecord = sessionHistory.find((record) => record.id === sessionRunId && !record.deletedAt);
  const firstAttempts = childAttempts.filter((attempt) => attempt.firstAttempt);
  const firstCorrect = firstAttempts.filter((attempt) => attempt.correct).length;
  const accuracy = firstAttempts.length ? Math.round((firstCorrect / firstAttempts.length) * 100) : 0;

  useEffect(() => {
    if (visibleSequences.length && !visibleSequences.some((sequence) => sequence.id === activeSequenceId)) setActiveSequenceId(visibleSequences[0].id);
    if (!visibleSequences.length && activeSequenceId) setActiveSequenceId("");
  }, [activeSequenceId, visibleSequences, setActiveSequenceId]);

  useEffect(() => {
    if (!pendingSharedLaunch || !therapist || !activeChild || (!backendInitialized && backendStatus !== "local") || backendStatus === "loading" || backendStatus === "migrating") return;
    const launchTimer = window.setTimeout(() => {
      const launchKey = `${pendingSharedLaunch.kind}:${pendingSharedLaunch.id}`;
      if (handledSharedLaunch.current === launchKey) return;
      handledSharedLaunch.current = launchKey;
      const selectedSequence = pendingSharedLaunch.kind === "sequence" ? visibleSequences.find((sequence) => sequence.id === pendingSharedLaunch.id) : undefined;
      const selectedExercises = pendingSharedLaunch.kind === "exercise"
        ? visibleExercises.filter((exercise) => exercise.id === pendingSharedLaunch.id)
        : selectedSequence?.exerciseIds.map((id) => visibleExercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is Exercise => Boolean(exercise)) ?? [];
      window.history.replaceState({}, "", window.location.pathname);
      setPendingSharedLaunch(null);
      if (!selectedExercises.length) {
        setToast("Il contenuto condiviso non è più disponibile");
        window.setTimeout(() => setToast(null), 3200);
        setView("home");
        return;
      }
      if (selectedSequence) setActiveSequenceId(selectedSequence.id);
      const plan = compileExercises(selectedExercises, visibleLibrary);
      if (!plan.length) return;
      setSessionPlan(plan);
      setSessionRunId(crypto.randomUUID());
      setSessionChildId(activeChild.id);
      setSessionIndex(0);
      setSessionFurthestIndex(0);
      setAnswerState("idle");
      setWrongAnswerId(null);
      setSessionFromSharedLink(true);
      setSessionIsTrial(false);
      setSessionActive(true);
      setView("session");
    }, 0);
    return () => window.clearTimeout(launchTimer);
  }, [activeChild, backendInitialized, backendStatus, pendingSharedLaunch, setActiveSequenceId, therapist, visibleExercises, visibleLibrary, visibleSequences]);

  useEffect(() => {
    const kind = currentExercise ? exerciseKind(currentExercise) : undefined;
    const shouldAutoPronounce = kind === "sentence-matching" || (currentExercise?.autoPronounce ?? currentPresentation === "words");
    if (!sessionActive || awaitingNextExercise || !currentExercise || (kind !== "recognition" && kind !== "sentence-matching") || !shouldAutoPronounce || !promptWord) return;
    const promptKey = `${sessionRunId}:${currentExercise.id}:${sessionIndex}`;
    if (spokenPromptKey.current === promptKey) return;
    spokenPromptKey.current = promptKey;
    speakWord(promptWord);
  }, [sessionActive, awaitingNextExercise, currentExercise, currentPresentation, sessionIndex, sessionRunId, promptWord]);

  useEffect(() => {
    if (!sessionActive) return;
    const sentenceArtworkIds = new Set(sessionExercises.flatMap((exercise) => exerciseKind(exercise) === "sentence-matching" ? [exercise.promptId, ...exercise.optionIds] : []).filter((id): id is string => Boolean(id)));
    if (!sentenceArtworkIds.size) return;
    preloadArtwork(sessionLibrary.filter((item) => sentenceArtworkIds.has(item.id)));
  }, [sessionActive, sessionExercises, sessionLibrary]);

  useEffect(() => {
    if (sessionActive) window.scrollTo({ top: 0, behavior: "auto" });
  }, [sessionActive, sessionIndex]);

  useEffect(() => {
    const lockSessionViewport = view === "session" && (sessionActive || sessionComplete);
    document.documentElement.classList.toggle("lg-session-active", lockSessionViewport);
    document.body.classList.toggle("lg-session-active", lockSessionViewport);
    return () => {
      document.documentElement.classList.remove("lg-session-active");
      document.body.classList.remove("lg-session-active");
    };
  }, [sessionActive, sessionComplete, view]);

  useEffect(() => {
    if (!sessionComplete || sessionFromSharedLink || sessionIsTrial || !sessionRunId || !sessionChildId || !therapist) return;
    setSessionHistory((current) => {
      const historyPlan = sessionPlan.map((exercise) => ({ ...exercise, kind: exerciseKind(exercise) }));
      const historyLibrary = library.map((item) => ({ ...item, itemId: item.id }));
      const items = buildSessionHistoryItems(sessionRunId, historyPlan, attempts, helps, historyLibrary);
      const recognitionPresentations = new Set(historyPlan.filter((exercise) => exercise.kind === "recognition").map((exercise) => exercise.presentation ?? sessionPresentation));
      const historyPresentation: SessionHistoryRecord["presentation"] = recognitionPresentations.size > 1 ? "mixed" : recognitionPresentations.values().next().value ?? sessionPresentation;
      const existing = current.find((record) => record.id === sessionRunId);
      if (existing) {
        const existingResponseCount = existing.items.reduce((total, item) => total + item.responses.length, 0);
        const nextResponseCount = items.reduce((total, item) => total + item.responses.length, 0);
        if (existingResponseCount === nextResponseCount && existing.items.length === items.length) return current;
        return current.map((record) => record.id === sessionRunId ? { ...record, items } : record);
      }
      const record: SessionHistoryRecord = {
        id: sessionRunId,
        childId: sessionChildId,
        therapistId: therapist.id,
        title: sessionDescriptor.title,
        source: sessionDescriptor.source,
        mode: sessionMode,
        presentation: historyPresentation,
        startedAt: sessionStartedAt || new Date().toISOString(),
        completedAt: new Date().toISOString(),
        comment: "",
        items,
      };
      return [...current, record];
    });
  }, [attempts, helps, library, sessionChildId, sessionComplete, sessionDescriptor, sessionFromSharedLink, sessionIsTrial, sessionMode, sessionPlan, sessionPresentation, sessionRunId, sessionStartedAt, setSessionHistory, therapist]);

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2600); };
  const persistLibraryImmediately = async (nextLibrary: LibraryItem[]) => {
    setLibrary(nextLibrary);
    if (!backendInitialized || backendStatus === "local") return "local" as const;
    try {
      await enqueueBackendSave(backendStateForStorage({ ...localBootstrapSnapshot.current, library: nextLibrary }));
      return "cloud" as const;
    } catch (error) {
      lastBackendSaveError.current = error instanceof Error ? error.message : "errore sconosciuto";
      setBackendStatus("error");
      return "pending" as const;
    }
  };
  const shareLaunch = async (launch: SharedLaunch, title: string) => {
    let url = "";
    try {
      const response = await fetch("/api/shared-launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(launch) });
      if (!response.ok) throw new Error("share_create_failed");
      const { token } = await response.json() as { token: string };
      url = buildSharedPreviewUrl(window.location.origin, token);
      if (navigator.share) {
        await navigator.share({ title: `Lettura Globale · ${title}`, text: `Prova “${title}” senza registrare risultati`, url });
        notify("Link condiviso");
      } else {
        await navigator.clipboard.writeText(url);
        notify("Link copiato negli appunti");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (!url) { notify("Non è stato possibile creare il link"); return; }
      try { await navigator.clipboard.writeText(url); notify("Link copiato negli appunti"); } catch { notify("Non è stato possibile copiare il link"); }
    }
  };
  const navigate = (next: View) => {
    if (sessionActive && next !== "session") { notify("Per uscire tieni premuto Termina per 4 secondi"); return; }
    if (next !== view) window.history.pushState({ lgView: next }, "", window.location.pathname);
    setView(next); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const discardRecoveredSession = () => {
    localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    setRecoveryCandidate(null);
  };
  const resumeRecoveredSession = () => {
    if (!recoveryCandidate) return;
    const saved = recoveryCandidate;
    sessionReturnView.current = saved.returnView;
    setActiveChildId(saved.childId);
    setSessionPlan(saved.plan);
    setSessionRunId(saved.runId);
    setSessionChildId(saved.childId);
    setSessionStartedAt(saved.startedAt);
    setSessionDescriptor(saved.descriptor);
    setSessionMode(saved.mode);
    setSessionPresentation(saved.presentation);
    setSessionIndex(saved.currentIndex);
    setSessionFurthestIndex(saved.furthestIndex);
    setSessionIsTrial(saved.isTrial);
    setSessionFromSharedLink(false);
    setSessionComplete(false);
    setSessionPaused(false);
    setAnswerState("idle");
    setWrongAnswerId(null);
    setRecoveryCandidate(null);
    window.history.replaceState({ lgView: saved.returnView }, "", window.location.pathname);
    window.history.pushState({ lgView: "session", lgActivity: true }, "", window.location.pathname);
    setSessionActive(true);
    setView("session");
  };
  const compileSession = (selectedExercises: Exercise[]) => compileExercises(selectedExercises, visibleLibrary);
  const beginSession = (selectedExercises: Exercise[], quickExercise?: Exercise, options?: { trial?: boolean; returnView?: View; title?: string; source?: "sequence" | "quick" }) => { const plan = compileSession(selectedExercises); if (!plan.length || !activeChild) return; localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY); const returnView = options?.returnView ?? "session"; sessionReturnView.current = returnView; window.history.replaceState({ lgView: returnView }, "", window.location.pathname); window.history.pushState({ lgView: "session", lgActivity: true }, "", window.location.pathname); setSessionPlan(plan); setSessionRunId(crypto.randomUUID()); setSessionChildId(activeChild.id); setSessionStartedAt(new Date().toISOString()); setSessionDescriptor({ title: options?.title ?? quickExercise?.title ?? "Sessione", source: options?.source ?? (quickExercise ? "quick" : "sequence") }); setSessionIndex(0); setSessionFurthestIndex(0); setAnswerState("idle"); setWrongAnswerId(null); setSessionFromSharedLink(false); setSessionIsTrial(Boolean(options?.trial)); setSessionComplete(false); setSessionPaused(false); setAwaitingNextExercise(false); setQuickExerciseToSave(quickExercise ?? null); setSessionActive(true); setView("session"); };
  const startSequenceById = (sequenceId: string) => {
    const sequence = visibleSequences.find((item) => item.id === sequenceId);
    if (!sequence) return;
    const selected = sequence.exerciseIds.map((id) => visibleExercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is Exercise => Boolean(exercise));
    setActiveSequenceId(sequence.id);
    setSequences((current) => current.map((item) => item.id === sequence.id ? { ...item, lastUsedAt: new Date().toISOString() } : item));
    beginSession(selected, undefined, { title: sequence.title, source: "sequence" });
  };
  const createQuickExercise = (config: QuickStartConfig) => {
    const requiresArtwork = config.activity === "articles" || config.activity === "naming" || (config.activity === "recognition" && config.presentation === "images");
    const source = visibleLibrary.filter((item) => (!requiresArtwork || hasArtwork(item)) && (config.activity !== "articles" || articleFor(item)));
    const candidates = filterQuickCandidates(source, config);
    const id = `quick:${crypto.randomUUID()}`;
    const base = { id, sourceExerciseId: id, promptId: "", optionIds: [], rounds: config.activity === "recognition" ? Math.max(1, config.rounds) : Math.min(Math.max(1, config.rounds), Math.max(1, candidates.length)), updatedAt: new Date().toISOString(), deleted: false };
    if (config.activity === "number-quantity") return { ...base, title: "Avvio rapido · Numero quantità", kind: "number-quantity" as const, rounds: Math.max(1, config.rounds), quantityMin: config.quantityMin, quantityMax: config.quantityMax, quantityObjectSet: config.quantityObjectSet, quantityAutoComplete: config.quantityAutoComplete, quantityIdleSeconds: config.quantityIdleSeconds };
    if (config.activity === "articles") return { ...base, title: "Avvio rapido · IL / LA", kind: "articles" as const, articleItemIds: candidates.filter((item) => articleFor(item)).map((item) => item.id) };
    if (config.activity === "word-categories") return { ...base, title: "Avvio rapido · Parola nella categoria", kind: "word-categories" as const, categoryNames: config.categoryNames, categoryItemIds: candidates.map((item) => item.id) };
    if (config.activity === "naming") return { ...base, title: "Avvio rapido · Mix and vary", kind: "naming" as const, namingItemIds: candidates.map((item) => item.id), namingCategories: [] };
    return { ...base, title: "Avvio rapido · Trova la parola", kind: "recognition" as const, recognitionMode: "random" as const, recognitionItemIds: candidates.map((item) => item.id), recognitionCategories: [], recognitionSyllables: config.recognitionSyllables, distractorCount: config.distractorCount, distractorSource: config.distractorSource, presentation: config.presentation, autoPronounce: config.autoPronounce };
  };
  const startQuickSession = (config: QuickStartConfig) => {
    const exercise = createQuickExercise(config);
    setSessionPresentation(config.presentation);
    beginSession([exercise], exercise, { title: exercise.title, source: "quick" });
  };
  const tryExercise = (exerciseId: string) => { const exercise = visibleExercises.find((item) => item.id === exerciseId); if (exercise) beginSession([exercise], undefined, { trial: true, returnView: "exercises" }); };
  const chooseAnswer = (answerId: string) => {
    if (!currentExercise || answerState === "correct") return;
    if (wrongFeedbackTimer.current !== null) {
      window.clearTimeout(wrongFeedbackTimer.current);
      wrongFeedbackTimer.current = null;
    }
    const correct = answerId === currentExercise.promptId;
    const sessionItemId = `${sessionRunId}:${currentExercise.id}:${sessionIndex}`;
    if (shouldRecordSessionEvents(sessionFromSharedLink || sessionIsTrial)) setAttempts((current) => appendAttempt(current, { id: crypto.randomUUID(), sessionId: sessionRunId, sessionItemId, exerciseId: currentExercise.sourceExerciseId ?? currentExercise.id, wordId: currentExercise.promptId, answerId, optionIds: currentExercise.optionIds, correct, mode: sessionMode, createdAt: new Date().toISOString(), childId: sessionChildId || activeChild?.id, therapistId: therapist?.id }).events);
    setAnswerState(correct ? "correct" : "wrong");
    setWrongAnswerId(correct ? null : answerId);
    playFeedbackTone(correct ? "correct" : "wrong", soundEffects);
    if (!correct) {
      wrongFeedbackTimer.current = window.setTimeout(() => {
        setWrongAnswerId((current) => current === answerId ? null : current);
        setAnswerState((current) => current === "wrong" ? "idle" : current);
        wrongFeedbackTimer.current = null;
      }, 900);
    }
  };
  const addHelp = (label: string, wordId?: string) => {
    if (!shouldRecordSessionEvents(sessionFromSharedLink || sessionIsTrial)) return;
    const exerciseId = currentExercise?.sourceExerciseId ?? currentExercise?.id;
    if (!exerciseId) return;
    const sessionItemId = `${sessionRunId}:${exerciseId}:${sessionIndex}`;
    setHelps((current) => appendHelp(current, { id: crypto.randomUUID(), sessionId: sessionRunId, sessionItemId, exerciseId, wordId: wordId ?? currentExercise.promptId, mode: sessionMode, label, createdAt: new Date().toISOString(), childId: sessionChildId || activeChild?.id, therapistId: therapist?.id }));
    notify(`Aiuto registrato: ${label}`);
  };
  const closeActiveSession = () => {
    const exitModalMarker = modalHistoryMarker.current;
    if (exitModalMarker) modalHistoryMarker.current = null;
    localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    setExitPinOpen(false);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (wrongFeedbackTimer.current !== null) {
      window.clearTimeout(wrongFeedbackTimer.current);
      wrongFeedbackTimer.current = null;
    }
    const shared = sessionFromSharedLink;
    const trial = sessionIsTrial;
    const returnView = sessionReturnView.current;
    setSessionActive(false);
    setAwaitingNextExercise(false);
    setSessionComplete(false);
    setSessionPaused(false);
    setSessionFromSharedLink(false);
    setSessionIsTrial(false);
    setSharedPreview(null);
    setAnswerState("idle");
    setWrongAnswerId(null);
    if (shared) { window.history.replaceState({ lgView: "home" }, "", window.location.pathname); setView("home"); return; }
    if (exitModalMarker) {
      if (!trial) setSessionWizardKey((current) => current + 1);
      setView(trial ? returnView : "session");
      window.setTimeout(() => window.history.go(-2), 0);
      return;
    }
    if (trial) {
      window.history.replaceState({ lgView: returnView }, "", window.location.pathname);
      setView(returnView);
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    setSessionWizardKey((current) => current + 1);
    window.history.replaceState({ lgView: "session" }, "", window.location.pathname);
    setView("session");
  };
  const nextExercise = () => {
    const itemKey = `${sessionRunId}:${sessionIndex}`;
    if (lastAdvancedSessionItem.current === itemKey) return;
    lastAdvancedSessionItem.current = itemKey;
    if (wrongFeedbackTimer.current !== null) {
      window.clearTimeout(wrongFeedbackTimer.current);
      wrongFeedbackTimer.current = null;
    }
    const isLast = sessionIndex >= sessionExercises.length - 1;
    const completesExercise = completesSequenceExercise(sessionExercises[sessionIndex], sessionExercises[sessionIndex + 1]);
    if (sessionDescriptor.source === "sequence" && completesExercise) playSoundCue("finish", soundEffects);
    if (isLast) {
      if (sessionDescriptor.source === "sequence" && !sessionIsTrial) setCelebratingSequence(true);
      if (sessionFromSharedLink) { notify("Anteprima completata"); closeActiveSession(); return; }
      if (sessionIsTrial) { notify("Prova completata · nessun risultato registrato"); closeActiveSession(); return; }
      localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY); setSessionActive(false); setSessionComplete(true); setAnswerState("idle"); setWrongAnswerId(null); notify("Sessione completata e salvata"); return;
    }
    const nextIndex = sessionIndex + 1;
    setSessionFurthestIndex((current) => Math.max(current, nextIndex));
    setSessionIndex(nextIndex); setAnswerState("idle"); setWrongAnswerId(null);
    if (sessionDescriptor.source === "sequence" && completesExercise) setAwaitingNextExercise(true);
  };
  const navigateReachedExercise = (direction: -1 | 1) => {
    const nextIndex = sessionIndex + direction;
    if (nextIndex < 0 || nextIndex > sessionFurthestIndex) return;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (wrongFeedbackTimer.current !== null) {
      window.clearTimeout(wrongFeedbackTimer.current);
      wrongFeedbackTimer.current = null;
    }
    setSessionIndex(nextIndex);
    setAnswerState("idle");
    setWrongAnswerId(null);
  };
  const recordClassificationAttempt = (itemId: string, answer: string, correct: boolean) => {
    if (!currentExercise || !shouldRecordSessionEvents(sessionFromSharedLink || sessionIsTrial)) return;
    const exerciseId = currentExercise.sourceExerciseId ?? currentExercise.id;
    const sessionItemId = `${sessionRunId}:${exerciseId}:${itemId}`;
    setAttempts((current) => appendAttempt(current, { id: crypto.randomUUID(), sessionId: sessionRunId, sessionItemId, exerciseId, wordId: itemId, answerId: answer, correct, mode: sessionMode, createdAt: new Date().toISOString(), childId: sessionChildId || activeChild?.id, therapistId: therapist?.id }).events);
  };

  const jumpToSessionIndex = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= sessionExercises.length) return;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSessionFurthestIndex((current) => Math.max(current, nextIndex));
    setSessionIndex(nextIndex);
    setAnswerState("idle");
    setWrongAnswerId(null);
    setAwaitingNextExercise(false);
  };
  const jumpActivity = (direction: -1 | 1) => {
    const sourceAt = (index: number) => sessionExercises[index]?.sourceExerciseId ?? sessionExercises[index]?.id;
    const currentSource = sourceAt(sessionIndex);
    if (direction === 1) {
      const next = sessionExercises.findIndex((_, index) => index > sessionIndex && sourceAt(index) !== currentSource);
      if (next >= 0) jumpToSessionIndex(next); else nextExercise();
      return;
    }
    let currentStart = sessionIndex;
    while (currentStart > 0 && sourceAt(currentStart - 1) === currentSource) currentStart -= 1;
    if (currentStart === 0) return;
    const previousSource = sourceAt(currentStart - 1);
    let previousStart = currentStart - 1;
    while (previousStart > 0 && sourceAt(previousStart - 1) === previousSource) previousStart -= 1;
    jumpToSessionIndex(previousStart);
  };
  const handleRemoteCommand = (event: RemoteControllerEvent) => {
    const command = event.command;
    if (command === "next") { nextExercise(); return; }
    if (command === "previous") { navigateReachedExercise(-1); return; }
    if (command === "next_activity") { jumpActivity(1); return; }
    if (command === "previous_activity") { jumpActivity(-1); return; }
    if (command === "pause") { setSessionPaused(true); return; }
    if (command === "resume") { setSessionPaused(false); return; }
    if (command === "toggle_audio") {
      setSoundEffects((current) => {
        if (current && "speechSynthesis" in window) window.speechSynthesis.cancel();
        return !current;
      });
      return;
    }
    if (command === "speak") {
      const kind = currentExercise ? exerciseKind(currentExercise) : "recognition";
      if (kind === "number-quantity") {
        const target = currentExercise?.quantityTarget ?? currentExercise?.quantityMin ?? 1;
        const object = currentExercise?.quantityObject ?? (currentExercise?.quantityObjectSet === "mixed" || !currentExercise?.quantityObjectSet ? "candy" : currentExercise.quantityObjectSet);
        speakWord(`Tocca ${target} ${quantityObjectLabel(object, target)}`);
      } else if (promptWord) speakWord(promptWord);
      return;
    }
    if (command === "help" && event.payload?.label && helpTypes.includes(event.payload.label)) { addHelp(event.payload.label); return; }
    if (command === "shuffle") {
      setAnswerState("idle");
      setWrongAnswerId(null);
      emitRemoteComponentCommand(event);
      return;
    }
    if (command === "mark_correct" || command === "mark_wrong" || command === "mark_helped" || command === "retry") { emitRemoteComponentCommand(event); return; }
    if (command === "end") closeActiveSession();
  };
  const currentKind = currentExercise ? exerciseKind(currentExercise) : "recognition";
  const currentContentId = currentKind === "articles" ? currentExercise?.articleItemIds?.[0]
    : currentKind === "word-categories" ? currentExercise?.categoryItemIds?.[0]
      : currentKind === "naming" ? currentExercise?.namingItemIds?.[0] : currentExercise?.promptId;
  const currentContentWord = sessionLibrary.find((item) => item.id === currentContentId)?.word ?? "";
  const remotePrompt = currentKind === "number-quantity"
    ? `Tocca ${currentExercise?.quantityTarget ?? currentExercise?.quantityMin ?? 1} ${quantityObjectLabel(currentExercise?.quantityObject ?? "candy", currentExercise?.quantityTarget ?? currentExercise?.quantityMin ?? 1)}`
    : promptWord ?? currentContentWord;
  const remoteSnapshot: RemoteSessionSnapshot | null = sessionActive && sessionRunId && activeChild && currentExercise ? {
    sessionId: sessionRunId,
    childName: activeChild.firstName,
    sessionTitle: sessionDescriptor.title,
    exerciseTitle: currentExercise.title,
    exerciseKind: currentKind,
    prompt: remotePrompt,
    currentIndex: sessionIndex,
    total: sessionExercises.length,
    answerState,
    soundEffects,
    paused: sessionPaused,
    updatedAt: 0,
  } : null;
  const remoteHost = useRemoteSessionHost({
    enabled: Boolean(sessionActive && !sessionFromSharedLink && !sessionIsTrial && therapist && activeChild),
    sessionId: sessionRunId,
    childId: sessionChildId || activeChild?.id || "",
    snapshot: remoteSnapshot,
    onCommand: handleRemoteCommand,
  });
  const remoteConnected = remoteHost.status === "connected";
  const remoteWasConnected = useRef(false);

  useEffect(() => {
    if (remoteWasConnected.current && !remoteConnected) setSessionPaused(false);
    remoteWasConnected.current = remoteConnected;
    document.body.classList.toggle("lg-remote-controller-active", remoteConnected);
    return () => document.body.classList.remove("lg-remote-controller-active");
  }, [remoteConnected]);

  const saveExercise = (exercise: Exercise) => {
    const exists = exercises.some((item) => item.id === exercise.id);
    setExercises((current) => exists ? current.map((item) => item.id === exercise.id ? exercise : item) : [exercise, ...current]);
    if (!exists && activeSequence) setSequences((current) => current.map((sequence) => sequence.id === activeSequence.id ? { ...sequence, exerciseIds: [...sequence.exerciseIds, exercise.id], updatedAt: new Date().toISOString() } : sequence));
    setShowBuilder(false);
    setEditingExercise(null);
    notify(exists ? "Esercizio aggiornato" : activeSequence ? "Esercizio creato e aggiunto alla sequenza" : "Esercizio creato");
  };
  const duplicateExercise = (exercise: Exercise) => {
    const duplicate = { ...exercise, id: crypto.randomUUID(), title: `${exercise.title} (copia)`, updatedAt: new Date().toISOString(), deleted: false };
    setExercises((current) => [duplicate, ...current]);
    if (activeSequence) setSequences((current) => current.map((sequence) => sequence.id === activeSequence.id ? { ...sequence, exerciseIds: [...sequence.exerciseIds, duplicate.id], updatedAt: new Date().toISOString() } : sequence));
    notify(activeSequence ? "Esercizio duplicato nella sequenza" : "Esercizio duplicato");
  };
  const deleteExercise = () => {
    if (!pendingExerciseDelete) return;
    const id = pendingExerciseDelete.id;
    setExercises((current) => current.map((exercise) => exercise.id === id ? { ...exercise, deleted: true, updatedAt: new Date().toISOString() } : exercise));
    setSequences((current) => current.map((sequence) => ({ ...sequence, exerciseIds: sequence.exerciseIds.filter((exerciseId) => exerciseId !== id), updatedAt: new Date().toISOString() })));
    setSessionPlan((current) => current.filter((exercise) => exercise.id !== id && exercise.sourceExerciseId !== id));
    setPendingExerciseDelete(null);
    notify("Esercizio rimosso; lo storico delle sessioni è stato conservato");
  };
  const toggleExerciseInSequence = (exerciseId: string) => {
    if (!activeSequence) return;
    setSequences((current) => current.map((sequence) => sequence.id === activeSequence.id ? { ...sequence, exerciseIds: sequence.exerciseIds.includes(exerciseId) ? sequence.exerciseIds.filter((id) => id !== exerciseId) : [...sequence.exerciseIds, exerciseId], updatedAt: new Date().toISOString() } : sequence));
  };
  const moveSequenceExercise = (exerciseId: string, direction: -1 | 1) => {
    if (!activeSequence) return;
    setSequences((current) => current.map((sequence) => {
      if (sequence.id !== activeSequence.id) return sequence;
      const from = sequence.exerciseIds.indexOf(exerciseId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= sequence.exerciseIds.length) return sequence;
      const exerciseIds = [...sequence.exerciseIds];
      [exerciseIds[from], exerciseIds[to]] = [exerciseIds[to], exerciseIds[from]];
      return { ...sequence, exerciseIds, updatedAt: new Date().toISOString() };
    }));
  };
  const saveSequence = (sequence: Sequence) => {
    const exists = sequences.some((item) => item.id === sequence.id);
    const ownedSequence = { ...sequence, therapistId: sequence.therapistId || therapist?.id || initialAdministrator.id };
    setSequences((current) => exists ? current.map((item) => item.id === ownedSequence.id ? ownedSequence : item) : [...current, ownedSequence]);
    appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "sequence_changed", revision: backendRevision.current, changedSequences: 1, sequenceCount: exists ? sequences.length : sequences.length + 1 });
    setActiveSequenceId(ownedSequence.id);
    setEditingSequence(null);
    notify(exists ? "Sequenza rinominata" : "Nuova sequenza creata");
  };
  const saveQuickAsSequence = () => {
    if (!quickExerciseToSave) return;
    const exercise = { ...quickExerciseToSave, sourceExerciseId: undefined, title: quickExerciseToSave.title.replace("Avvio rapido · ", ""), updatedAt: new Date().toISOString() };
    const sequence: Sequence = { id: crypto.randomUUID(), title: `${exercise.title} · ${new Date().toLocaleDateString("it-IT")}`, exerciseIds: [exercise.id], therapistId: therapist?.id || initialAdministrator.id, updatedAt: new Date().toISOString(), deleted: false };
    setExercises((current) => [exercise, ...current]);
    setSequences((current) => [...current, sequence]);
    setActiveSequenceId(sequence.id);
    setQuickExerciseToSave(null);
    notify("Avvio rapido salvato come sequenza");
  };
  const deleteSequence = () => {
    if (!pendingSequenceDelete) return;
    const id = pendingSequenceDelete.id;
    const next = visibleSequences.find((sequence) => sequence.id !== id);
    setSequences((current) => current.map((sequence) => sequence.id === id ? { ...sequence, deleted: true, updatedAt: new Date().toISOString() } : sequence));
    if (next) setActiveSequenceId(next.id);
    setPendingSequenceDelete(null);
    notify("Sequenza eliminata; esercizi e storico restano disponibili");
  };

  const login = (therapistId: string) => {
    localStorage.setItem(THERAPIST_SESSION_STORAGE_KEY, createPersistentTherapistSession(therapistId));
    setLoggedInTherapistId(therapistId);
    const nextTherapist = therapists.find((item) => item.id === therapistId);
    if (nextTherapist && !nextTherapist.childIds.includes(activeChildId)) setActiveChildId(nextTherapist.childIds[0] ?? "");
  };
  const logout = () => { localStorage.removeItem(THERAPIST_SESSION_STORAGE_KEY); sessionStorage.removeItem(THERAPIST_SESSION_STORAGE_KEY); setLoggedInTherapistId(null); setShowTherapistLogin(false); setView("home"); };
  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "therapist") {
      if (therapists.length <= 1) { setPendingDelete(null); notify("Deve restare almeno un profilo adulto"); return; }
      setTherapists((current) => current.filter((item) => item.id !== pendingDelete.id));
      const deletingCurrentProfile = pendingDelete.id === therapist?.id;
      setPendingDelete(null);
      if (deletingCurrentProfile) logout(); else notify("Profilo adulto eliminato");
      return;
    }
    if (associatedChildren.length <= 1) { setPendingDelete(null); notify("Deve restare almeno un bambino associato"); return; }
    const nextChild = associatedChildren.find((child) => child.id !== pendingDelete.id);
    setChildren((current) => current.filter((child) => child.id !== pendingDelete.id));
    setTherapists((current) => current.map((item) => ({ ...item, childIds: item.childIds.filter((id) => id !== pendingDelete.id) })));
    setAttempts((current) => current.filter((attempt) => attempt.childId !== pendingDelete.id));
    setHelps((current) => current.filter((help) => help.childId !== pendingDelete.id));
    setSessionHistory((current) => current.map((record) => record.childId === pendingDelete.id ? { ...record, deletedAt: new Date().toISOString() } : record));
    if (activeChildId === pendingDelete.id && nextChild) setActiveChildId(nextChild.id);
    setPendingDelete(null);
    notify("Profilo bambino e dati locali collegati eliminati");
  };

  if (!sessionChecked || (pendingSharedPreviewToken && (sharedPreviewStatus === "idle" || sharedPreviewStatus === "loading"))) return <LoadingScreen label={pendingSharedPreviewToken ? "Caricamento anteprima…" : "Caricamento dati…"} stalled={localLoadSlow} />;
  if (pendingSharedPreviewToken && sharedPreviewStatus === "error") return <PublicPreviewError />;
  if (sessionFromSharedLink && sharedPreview && sessionActive) {
    const previewChild: ChildProfile = { id: "preview", firstName: "Anteprima", lastName: "", birthYear: "", notes: "", avatarColor: "#7568d9" };
    return <main className="public-preview-shell">{awaitingNextExercise ? <SequenceTransition title={sessionExercises[sessionIndex]?.title ?? "Esercizio"} onContinue={() => setAwaitingNextExercise(false)} /> : <SessionView active complete={false} fromSharedLink isTrial={false} mode={sessionMode} setMode={setSessionMode} presentation={currentPresentation} setPresentation={setSessionPresentation} sequences={[]} therapists={[]} showSequenceOwners={false} activeChild={previewChild} childProfiles={[]} onSelectChild={() => undefined} onStartSequence={() => undefined} onStartQuick={() => undefined} quickCanBeSaved={false} onSaveQuick={() => undefined} completionComment="" onSaveCompletionComment={() => undefined} onCloseComplete={() => undefined} onExit={closeActiveSession} currentIndex={sessionIndex} total={sessionExercises.length} canPrevious={sessionIndex > 0} canForward={sessionIndex < sessionFurthestIndex} onPrevious={() => navigateReachedExercise(-1)} onForward={() => navigateReachedExercise(1)} exercise={currentExercise} prompt={promptItem} library={sessionLibrary} answerState={answerState} wrongAnswerId={wrongAnswerId} onChoose={chooseAnswer} onClassificationAttempt={recordClassificationAttempt} onClassificationComplete={nextExercise} onHelp={addHelp} onNext={nextExercise} soundEffects={soundEffects} onToggleSound={() => setSoundEffects((current) => !current)} />}{toast && <div className="toast" role="status"><Check size={18} />{toast}</div>}</main>;
  }
  if (!allLocalDataLoaded) return <LoadingScreen label="Caricamento dati…" stalled={localLoadSlow} />;
  if (!backendInitialized && (backendStatus === "loading" || backendStatus === "migrating")) return <LoadingScreen label={backendStatus === "migrating" ? "Trasferimento dei dati nel cloud…" : "Sincronizzazione dei dati…"} stalled onRetry={() => setBackendRetryKey((current) => current + 1)} onContinueLocal={() => { localFallbackBaseline.current = backendStateForStorage(localBootstrapSnapshot.current); backendHydrating.current = false; setBackendStatus("local"); }} />;
  if (!therapist) return <>{showTherapistLogin ? <TherapistLogin therapists={therapists} backendStatus={backendStatus} onLogin={login} onBack={() => setShowTherapistLogin(false)} /> : <PublicLanding onLogin={() => setShowTherapistLogin(true)} />}{celebratingSequence && <SequenceCelebration />}</>;
  if (controllerToken) return <RemoteControllerConsole token={controllerToken} therapist={therapist} onLogout={logout} />;
  if (!activeChild) return <ChildChooser therapist={therapist} childProfiles={children} onChoose={setActiveChildId} onLogout={logout} />;

  return (
    <div className="app-shell">
      <Sidebar view={view} onNavigate={navigate} open={menuOpen} onClose={() => setMenuOpen(false)} therapist={therapist} onLogout={logout} backendStatus={backendStatus} />
      <main className="main-content">
        <Topbar onMenu={() => setMenuOpen(true)} therapist={therapist} child={activeChild} childProfiles={sessionActive ? [activeChild] : associatedChildren} onSelectChild={setActiveChildId} onOpenProfiles={() => navigate("profiles")} backendStatus={backendStatus} onOpenSaveJournal={() => setSaveJournalOpen(true)} />
        {view === "home" && <Dashboard therapist={therapist} child={activeChild} libraryCount={visibleLibrary.length} exerciseCount={visibleExercises.length} sequenceCount={sequenceExercises.length} accuracy={accuracy} attemptCount={firstAttempts.length} onStart={() => navigate("session")} onNavigate={navigate} />}
        {view === "library" && <LibraryView items={visibleLibrary} search={search} setSearch={setSearch} onUpload={setShowUpload} onEdit={setEditingItem} onDelete={setPendingLibraryDelete} sounds={soundPreferences} onSoundsChange={setSoundPreferences} />}
        {view === "exercises" && <ExercisesView exercises={visibleExercises} sequences={visibleSequences} activeSequence={activeSequence} therapists={therapists} showSequenceOwners={canSeeAllSequences} library={visibleLibrary} onSelectSequence={setActiveSequenceId} onCreateSequence={() => setEditingSequence("new")} onRenameSequence={() => activeSequence && setEditingSequence(activeSequence)} onDeleteSequence={() => activeSequence && setPendingSequenceDelete(activeSequence)} onBuild={(kind) => { setEditingExercise(null); setNewExerciseKind(kind); setShowBuilder(true); }} onEdit={(exercise) => { setEditingExercise(exercise); setNewExerciseKind(exerciseKind(exercise)); setShowBuilder(true); }} onDuplicate={duplicateExercise} onDelete={setPendingExerciseDelete} onToggleInSequence={toggleExerciseInSequence} onMove={moveSequenceExercise} onTry={tryExercise} onShareSequence={() => activeSequence && shareLaunch({ kind: "sequence", id: activeSequence.id }, activeSequence.title)} onShareExercise={(exercise) => shareLaunch({ kind: "exercise", id: exercise.id }, exercise.title)} />}
        {view === "session" && (awaitingNextExercise ? <SequenceTransition title={sessionExercises[sessionIndex]?.title ?? "Esercizio"} onContinue={() => setAwaitingNextExercise(false)} /> : <SessionView key={sessionWizardKey} active={sessionActive} complete={sessionComplete} fromSharedLink={sessionFromSharedLink} isTrial={sessionIsTrial} remoteConnected={remoteConnected} mode={sessionMode} setMode={setSessionMode} presentation={currentPresentation} setPresentation={setSessionPresentation} sequences={visibleSequences} therapists={therapists} showSequenceOwners={canSeeAllSequences} activeChild={activeChild} childProfiles={associatedChildren} onSelectChild={setActiveChildId} onStartSequence={startSequenceById} onStartQuick={startQuickSession} quickCanBeSaved={Boolean(quickExerciseToSave)} onSaveQuick={saveQuickAsSequence} completionComment={completedSessionRecord?.comment ?? ""} onSaveCompletionComment={(comment) => { setSessionHistory((current) => current.map((record) => record.id === sessionRunId ? { ...record, comment } : record)); notify("Valutazione della sessione salvata"); }} onCloseComplete={() => { setSessionComplete(false); setQuickExerciseToSave(null); navigate("stats"); }} onExit={sessionIsTrial ? closeActiveSession : () => setExitPinOpen(true)} currentIndex={sessionIndex} total={sessionExercises.length} canPrevious={sessionIndex > 0} canForward={sessionIndex < sessionFurthestIndex} onPrevious={() => navigateReachedExercise(-1)} onForward={() => navigateReachedExercise(1)} exercise={currentExercise} prompt={promptItem} library={sessionLibrary} answerState={answerState} wrongAnswerId={wrongAnswerId} onChoose={chooseAnswer} onClassificationAttempt={recordClassificationAttempt} onClassificationComplete={nextExercise} onHelp={addHelp} onNext={nextExercise} soundEffects={soundEffects} onToggleSound={() => setSoundEffects((current) => !current)} />)}
        {view === "session" && sessionActive && !sessionFromSharedLink && !sessionIsTrial && <RemoteHostBadge host={remoteHost} />}
        {view === "session" && sessionActive && sessionPaused && <div className="remote-pause-overlay" role="status"><Pause /><strong>Sessione in pausa</strong><span>Riprendi dal telefono collegato.</span></div>}
        {view === "appearance" && <AppearanceView settings={appearance} onChange={setAppearance} />}
        {view === "stats" && <StatsView child={activeChild} therapist={therapist} therapists={therapists} attempts={childAttempts} helps={childHelps} histories={childSessionHistory} exercises={exercises} library={library} onSaveHistoryComment={(id, comment) => { setSessionHistory((current) => current.map((record) => record.id === id ? { ...record, comment } : record)); notify("Valutazione aggiornata"); }} onDeleteHistory={(id, label) => setPendingHistoryDelete({ id, label })} onDeleteAllHistory={() => setPendingHistoryDelete({ label: `tutto lo storico di ${activeChild.firstName}` })} onReset={() => setPendingStatsReset(true)} />}
        {view === "profiles" && <ProfilesView key={`${therapist.id}:${associatedChildren.map((child) => child.id).join(":")}`} therapist={therapist} therapists={therapists} childProfiles={associatedChildren} allChildren={children} activeChildId={activeChild.id} canDeleteTherapist={therapists.length > 1 && therapist.role !== "Amministratore"} onSelectChild={setActiveChildId} onSaveTherapist={(updated) => { setTherapists((current) => current.map((item) => item.id === updated.id ? updated : item)); notify("Profilo adulto aggiornato"); }} onSaveTherapists={(updated) => { setTherapists(updated); notify("Profili adulti e associazioni aggiornati"); }} onSaveChild={(updated) => { setChildren((current) => current.map((item) => item.id === updated.id ? updated : item)); notify("Profilo bambino aggiornato"); }} onRequestDelete={setPendingDelete} />}
      </main>
      {showUpload && <UploadDialog kind={showUpload} onClose={() => setShowUpload(null)} onSave={async (item) => { try { let next = item; if (item.image) { const remote = backendStatus === "local" ? null : await uploadRemoteImage(crypto.randomUUID(), item.image); const imageKey = `library-image-${item.id}`; await storeLibraryImage(imageKey, item.image); next = { ...item, imageKey, remoteImageId: remote?.id }; } const outcome = await persistLibraryImmediately([next, ...localBootstrapSnapshot.current.library.filter((current) => current.id !== next.id)]); setShowUpload(null); notify(outcome === "cloud" ? "Elemento salvato nel cloud" : outcome === "local" ? "Elemento salvato solo su questo dispositivo" : `Elemento locale · errore cloud: ${lastBackendSaveError.current}`); } catch { notify("Impossibile salvare l’elemento"); } }} />}
      {editingItem && <EditLibraryDialog item={editingItem} onClose={() => setEditingItem(null)} onSave={async (updated) => { try { if (!libraryItemWasEdited({ ...hydrateSyllables(editingItem), article: articleFor(editingItem) ?? null }, updated)) { setEditingItem(null); notify("Nessuna modifica da salvare"); return; } let next = updated; if (updated.image && updated.image !== editingItem.image) { const remote = backendStatus === "local" ? null : await uploadRemoteImage(crypto.randomUUID(), updated.image); const imageKey = `library-image-${updated.id}-${crypto.randomUUID()}`; await storeLibraryImage(imageKey, updated.image); next = { ...updated, imageKey, remoteImageId: remote?.id }; } const currentLibrary = localBootstrapSnapshot.current.library; const outcome = await persistLibraryImmediately(currentLibrary.map((item) => item.id === next.id ? next : item)); setEditingItem(null); notify(outcome === "cloud" ? "Elemento salvato nel cloud" : outcome === "local" ? "Elemento salvato solo su questo dispositivo" : `Modifica locale · errore cloud: ${lastBackendSaveError.current}`); } catch { notify("Impossibile salvare le modifiche"); } }} />}
      {pendingLibraryDelete && <LibraryDeleteDialog item={pendingLibraryDelete} onCancel={() => setPendingLibraryDelete(null)} onConfirm={() => { setLibrary((current) => current.map((item) => item.id === pendingLibraryDelete.id ? { ...item, deleted: true } : item)); setPendingLibraryDelete(null); notify("Elemento archiviato e rimosso dai nuovi esercizi"); }} />}
      {showBuilder && <ExerciseBuilder kind={editingExercise ? exerciseKind(editingExercise) : newExerciseKind} library={visibleLibrary} exercise={editingExercise ?? undefined} onClose={() => { setShowBuilder(false); setEditingExercise(null); }} onSave={saveExercise} />}
      {editingSequence && <SequenceDialog sequence={editingSequence === "new" ? undefined : editingSequence} therapistId={therapist.id} onClose={() => setEditingSequence(null)} onSave={saveSequence} />}
      {saveJournalOpen && <SaveJournalDialog onClose={() => setSaveJournalOpen(false)} />}
      {pendingExerciseDelete && <ContentDeleteDialog title={`Eliminare “${pendingExerciseDelete.title}”?`} detail="L’esercizio sarà rimosso dalle sequenze. I risultati già registrati resteranno nello storico." onCancel={() => setPendingExerciseDelete(null)} onConfirm={deleteExercise} />}
      {pendingSequenceDelete && <ContentDeleteDialog title={`Eliminare la sequenza “${pendingSequenceDelete.title}”?`} detail="Gli esercizi e i risultati già registrati resteranno disponibili." onCancel={() => setPendingSequenceDelete(null)} onConfirm={deleteSequence} />}
      {pendingDelete && <DeleteDialog item={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />}
      {pendingHistoryDelete && <ContentDeleteDialog title={`Eliminare ${pendingHistoryDelete.label}?`} detail="Lo storico verrà nascosto agli utenti. Le immagini archiviate resteranno nello storage per non alterare altre sessioni." onCancel={() => setPendingHistoryDelete(null)} onConfirm={() => { const deletedAt = new Date().toISOString(); setSessionHistory((current) => current.map((record) => (!pendingHistoryDelete.id || record.id === pendingHistoryDelete.id) && record.childId === activeChild.id ? { ...record, deletedAt } : record)); setPendingHistoryDelete(null); notify("Storico eliminato"); }} />}
      {pendingStatsReset && <ContentDeleteDialog title={`Azzerare le statistiche di ${activeChild.firstName}?`} detail="Saranno eliminati tutti i tentativi e gli aiuti registrati per questo bambino. Profili, immagini, esercizi e sequenze restano invariati." onCancel={() => setPendingStatsReset(false)} onConfirm={() => { setAttempts((current) => current.filter((attempt) => attempt.childId && attempt.childId !== activeChild.id)); setHelps((current) => current.filter((help) => help.childId && help.childId !== activeChild.id)); setPendingStatsReset(false); notify("Statistiche del bambino azzerate"); }} />}
      {exitPinOpen && <SessionExitDialog therapist={therapist} onCancel={() => setExitPinOpen(false)} onConfirm={closeActiveSession} />}
      {recoveryCandidate && <SessionRecoveryDialog saved={recoveryCandidate} childName={children.find((child) => child.id === recoveryCandidate.childId)?.firstName ?? "il bambino"} onResume={resumeRecoveredSession} onDiscard={discardRecoveredSession} />}
      {toast && <div className="toast" role="status"><Check size={18} />{toast}</div>}
      {celebratingSequence && <SequenceCelebration />}
    </div>
  );
}

function LoadingScreen({ label, stalled = false, onRetry, onContinueLocal }: { label: string; stalled?: boolean; onRetry?: () => void; onContinueLocal?: () => void }) {
  return <main className="auth-loading"><Sparkles /><span>{label}</span>{stalled && <div className="loading-recovery"><p>Il caricamento sta richiedendo più tempo del previsto.</p><div>{onContinueLocal && <button className="ghost-button" type="button" onClick={onContinueLocal}>Usa i dati locali</button>}<button className="primary-button" type="button" onClick={onRetry ?? (() => window.location.reload())}><RefreshCw />Riprova</button></div></div>}</main>;
}

function SessionExitDialog({ therapist, onCancel, onConfirm }: { therapist: Therapist; onCancel: () => void; onConfirm: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const valid = therapist.pinHash ? therapist.pinHash === await hashPin(pin) : therapist.pin === pin;
    if (!valid) { setError("PIN non corretto."); return; }
    onConfirm();
  };
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="session-exit-title"><form className="modal protected-exit-modal" onSubmit={submit}><span className="auth-icon"><LockKeyhole /></span><span className="eyebrow">USCITA PROTETTA</span><h2 id="session-exit-title">Termina la sessione?</h2><p>Inserisci il PIN di {therapist.firstName} per tornare al pannello.</p><label>PIN<input autoFocus type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "")); setError(""); }} autoComplete="current-password" /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="ghost-button" type="button" onClick={onCancel}>Continua l’esercizio</button><button className="primary-button" type="submit" disabled={!pin}><LockKeyhole />Termina</button></div></form></div>;
}

function SessionRecoveryDialog({ saved, childName, onResume, onDiscard }: { saved: RecoverableSession; childName: string; onResume: () => void; onDiscard: () => void }) {
  const position = Math.min(saved.currentIndex + 1, saved.plan.length);
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="session-recovery-title"><div className="modal recovery-modal"><span className="auth-icon"><RefreshCw /></span><span className="eyebrow">SESSIONE INTERROTTA</span><h2 id="session-recovery-title">Riprendere da dove eri rimasto?</h2><p><strong>{saved.descriptor.title}</strong> con {childName}, passaggio {position} di {saved.plan.length}.</p><div className="modal-actions"><button className="ghost-button" type="button" onClick={onDiscard}>Scarta</button><button className="primary-button" type="button" onClick={onResume}><Play />Riprendi</button></div></div></div>;
}

function PublicPreviewError() {
  return <main className="auth-page public-preview-error"><section className="login-card"><div className="auth-icon"><AlertTriangle /></div><span className="eyebrow">ANTEPRIMA</span><h1>Link non disponibile</h1><p>Questa anteprima non esiste più oppure il collegamento non è valido.</p><button className="primary-button large" onClick={() => { window.history.replaceState({}, "", "/"); window.location.reload(); }}>Torna alla home</button></section></main>;
}

/* QRCode generates an in-memory data URL; Next Image cannot optimize this transient asset. */
/* eslint-disable @next/next/no-img-element */
function RemoteHostBadge({ host }: { host: RemoteHostState }) {
  const [panel, setPanel] = useState<{ open: boolean; status: RemoteHostState["status"] }>({ open: false, status: host.status });
  const panelOpen = (panel.open && panel.status === host.status) || host.status === "pending" || host.status === "error";
  const statusLabel = host.status === "connected" ? "Telefono collegato"
    : host.status === "lost" ? "Connessione persa · controlli sul PC"
      : host.status === "pending" ? "Telefono in attesa di approvazione"
        : host.status === "creating" ? "Creazione QR…"
          : host.status === "error" ? "Controller non disponibile"
            : "Scansiona per collegare il telefono";
  return <aside className={`remote-host-badge remote-${host.status}`} aria-label={statusLabel}>
    <button type="button" className="remote-host-summary" onClick={() => setPanel((current) => ({ open: current.status === host.status ? !current.open : true, status: host.status }))} aria-expanded={panelOpen}>
      {host.qrDataUrl && host.status !== "connected" ? <img src={host.qrDataUrl} alt="QR per collegare il telefono" /> : <QrCode />}
      <span className="remote-status-dot" aria-hidden="true" />
      <strong>{statusLabel}</strong>
    </button>
    {panelOpen && <div className="remote-host-panel">
      {host.qrDataUrl && <img src={host.qrDataUrl} alt="QR per aprire la console adulta sul telefono" />}
      <div><strong>{statusLabel}</strong><p>{host.status === "connected" ? "L’avanzamento è controllato dal telefono." : host.status === "lost" ? "La sessione continua con i controlli locali finché il telefono non torna online." : "Apri il QR da un telefono e accedi con il profilo adulto."}</p></div>
      {host.status === "error" && <><small>{host.error}</small><button className="ghost-button" type="button" onClick={() => void host.refreshPairing()}><RefreshCw />Riprova</button></>}
      {(host.status === "waiting" || host.status === "lost" || host.status === "connected") && <button className="ghost-button" type="button" onClick={() => {
        if (host.status !== "connected" || window.confirm("Generare un nuovo QR? Il telefono collegato verrà disconnesso.")) void host.refreshPairing();
      }}><RefreshCw />{host.status === "connected" ? "Sostituisci telefono" : "Genera nuovo QR"}</button>}
    </div>}
  </aside>;
}
/* eslint-enable @next/next/no-img-element */

type ControllerConsoleState = { status: "joining" | "pending" | "connected" | "lost" | "error"; sessionId: string; controllerKey: string; snapshot: RemoteSessionSnapshot | null; error: string };
type ControllerCommandFeedback = { id: string; key: string; phase: "sending" | "sent" | "error"; label: string };

function browserRandomHex(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function RemoteControllerConsole({ token, therapist, onLogout }: { token: string; therapist: Therapist; onLogout: () => void }) {
  const [state, setState] = useState<ControllerConsoleState>({ status: "joining", sessionId: "", controllerKey: "", snapshot: null, error: "" });
  const [commandFeedback, setCommandFeedback] = useState<ControllerCommandFeedback | null>(null);
  const sendQueue = useRef<Promise<void>>(Promise.resolve());
  const feedbackTimer = useRef<number | null>(null);
  const storageKey = `lg-controller:${token}`;

  useEffect(() => () => {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const connect = async () => {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as { sessionId?: unknown; controllerKey?: unknown };
          if (typeof parsed.sessionId === "string" && typeof parsed.controllerKey === "string") {
            if (!cancelled) setState((current) => ({ ...current, sessionId: parsed.sessionId as string, controllerKey: parsed.controllerKey as string }));
            return;
          }
        }
        const controllerKey = browserRandomHex();
        const response = await fetch("/api/controller/pairing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "join", token, controllerKey }) });
        if (!response.ok) throw new Error(response.status === 404 ? "Il QR è scaduto. Generane uno nuovo dal PC." : response.status === 403 ? "Questo profilo non può controllare la sessione." : "Collegamento non riuscito.");
        const result = await response.json() as { sessionId: string };
        sessionStorage.setItem(storageKey, JSON.stringify({ sessionId: result.sessionId, controllerKey }));
        if (!cancelled) setState((current) => ({ ...current, status: "connected", sessionId: result.sessionId, controllerKey }));
      } catch (error) {
        if (!cancelled) setState((current) => ({ ...current, status: "error", error: error instanceof Error ? error.message : "Collegamento non riuscito." }));
      }
    };
    void connect();
    return () => { cancelled = true; };
  }, [storageKey, token]);

  useEffect(() => {
    if (!state.sessionId || !state.controllerKey) return;
    let cancelled = false;
    let polling = false;
    const poll = async () => {
      if (polling || cancelled) return;
      polling = true;
      try {
        const response = await fetch(`/api/controller/session/${encodeURIComponent(state.sessionId)}`, { headers: { "x-controller-key": state.controllerKey }, cache: "no-store" });
        if (response.status === 403) throw new Error("Un altro telefono ha preso il controllo della sessione.");
        if (!response.ok) throw new Error("Connessione al PC non disponibile.");
        const result = await response.json() as { status: string; connected: boolean; snapshot?: RemoteSessionSnapshot };
        if (!cancelled) setState((current) => ({ ...current, status: result.connected ? "connected" : result.status === "pending" ? "pending" : "lost", snapshot: result.snapshot ?? current.snapshot, error: "" }));
      } catch (error) {
        if (!cancelled) setState((current) => ({ ...current, status: "error", error: error instanceof Error ? error.message : "Connessione persa." }));
      } finally { polling = false; }
    };
    void poll();
    const timer = window.setInterval(poll, REMOTE_CONTROLLER_POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [state.controllerKey, state.sessionId]);

  const send = (command: RemoteCommandName, payload?: { label?: string }) => {
    if (state.status !== "connected") return;
    const id = crypto.randomUUID();
    const key = `${command}:${payload?.label ?? ""}`;
    const label = remoteCommandFeedback(command, payload);
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    setCommandFeedback({ id, key, phase: "sending", label });
    if ("vibrate" in navigator) navigator.vibrate(12);
    sendQueue.current = sendQueue.current.catch(() => undefined).then(async () => {
      const response = await fetch(`/api/controller/session/${encodeURIComponent(state.sessionId)}`, { method: "POST", headers: { "content-type": "application/json", "x-controller-key": state.controllerKey }, body: JSON.stringify({ action: "command", command: { clientEventId: id, command, payload } }) });
      if (!response.ok) throw new Error("command_failed");
      setCommandFeedback((current) => current?.id === id ? { ...current, phase: "sent" } : current);
      if ("vibrate" in navigator) navigator.vibrate([10, 30, 10]);
      feedbackTimer.current = window.setTimeout(() => setCommandFeedback((current) => current?.id === id ? null : current), 1_100);
    }).catch(() => {
      setCommandFeedback((current) => current?.id === id ? { ...current, phase: "error" } : current);
      if ("vibrate" in navigator) navigator.vibrate([35, 30, 35]);
      setState((current) => ({ ...current, status: "lost", error: "Comando non inviato. Il PC userà i controlli locali." }));
    });
  };
  const feedbackFor = (command: RemoteCommandName, payload?: { label?: string }) => commandFeedback?.key === `${command}:${payload?.label ?? ""}` ? commandFeedback.phase : undefined;
  const snapshot = state.snapshot;
  const connected = state.status === "connected";
  const supportsShuffle = snapshot?.exerciseKind === "recognition" || snapshot?.exerciseKind === "sentence-matching" || snapshot?.exerciseKind === "word-categories";
  const supportsJudgement = snapshot?.exerciseKind === "naming" || snapshot?.exerciseKind === "number-quantity";

  return <main className="remote-controller-page">
    <header><div><span className="brand-mark brand-logo" aria-hidden="true" /><span><small>CONSOLE ADULTA</small><strong>{therapist.firstName} {therapist.lastName}</strong></span></div><button type="button" onClick={onLogout}><LogOut />Esci</button></header>
    <section className="remote-controller-status"><span className={`remote-status-dot ${connected ? "connected" : ""}`} />
      <div><strong>{connected ? "Collegato al PC" : state.status === "joining" ? "Collegamento…" : "Non collegato"}</strong><small>{state.error || (connected ? "I comandi vengono registrati nella sessione." : "I controlli restano disponibili sul PC.")}</small></div>
      {state.error.startsWith("Un altro telefono") && <button type="button" onClick={() => { sessionStorage.removeItem(storageKey); window.location.reload(); }}><RefreshCw />Riprendi il controllo</button>}
    </section>
    {commandFeedback && <div className={`remote-command-feedback ${commandFeedback.phase}`} role="status" aria-live="polite">
      {commandFeedback.phase === "sending" ? <RefreshCw /> : commandFeedback.phase === "sent" ? <Check /> : <X />}
      <span><strong>{commandFeedback.label}</strong><small>{commandFeedback.phase === "sending" ? "Invio al PC…" : commandFeedback.phase === "sent" ? "Comando inviato" : "Invio non riuscito"}</small></span>
    </div>}
    {snapshot ? <>
      <section className="remote-now-card"><span>{snapshot.childName} · {snapshot.currentIndex + 1} di {snapshot.total}</span><h1>{snapshot.exerciseTitle}</h1><p>{snapshot.prompt || snapshot.sessionTitle}</p><div><small>{snapshot.answerState === "correct" ? "Risposta corretta" : snapshot.answerState === "wrong" ? "Risposta errata" : "In attesa della risposta"}</small>{snapshot.paused && <strong>IN PAUSA</strong>}</div></section>
      <section className="remote-command-grid">
        <button type="button" data-feedback={feedbackFor("previous")} disabled={!connected || snapshot.currentIndex === 0} onClick={() => send("previous")}><ChevronLeft />Passo precedente</button>
        <button type="button" className="primary" data-feedback={feedbackFor("next")} disabled={!connected} onClick={() => send("next")}>Passo successivo<ChevronRight /></button>
        <button type="button" data-feedback={feedbackFor("previous_activity")} disabled={!connected} onClick={() => send("previous_activity")}><ChevronLeft />Tipo precedente</button>
        <button type="button" data-feedback={feedbackFor("next_activity")} disabled={!connected} onClick={() => send("next_activity")}>Tipo successivo<ChevronRight /></button>
      </section>
      <section className="remote-command-row">
        <button type="button" data-feedback={feedbackFor("speak")} disabled={!connected} onClick={() => send("speak")}><Volume2 />Riascolta</button>
        <button type="button" data-feedback={feedbackFor("toggle_audio")} disabled={!connected} onClick={() => send("toggle_audio")}>{snapshot.soundEffects ? <VolumeX /> : <Volume2 />}{snapshot.soundEffects ? "Togli audio" : "Attiva audio"}</button>
        {supportsShuffle && <button type="button" data-feedback={feedbackFor("shuffle")} disabled={!connected} onClick={() => send("shuffle")}><Shuffle />Mischia</button>}
        <button type="button" data-feedback={feedbackFor(snapshot.paused ? "resume" : "pause")} disabled={!connected} onClick={() => send(snapshot.paused ? "resume" : "pause")}>{snapshot.paused ? <Play /> : <Pause />}{snapshot.paused ? "Riprendi" : "Pausa"}</button>
      </section>
      {supportsJudgement && <section className="remote-judgement"><button data-feedback={feedbackFor("mark_wrong")} disabled={!connected} onClick={() => send("mark_wrong")}><X />Errata</button>{snapshot.exerciseKind === "naming" && <button data-feedback={feedbackFor("mark_helped")} disabled={!connected} onClick={() => send("mark_helped")}><CircleHelp />Corretta con aiuto</button>}<button data-feedback={feedbackFor("mark_correct")} disabled={!connected} onClick={() => send("mark_correct")}><Check />Corretta</button>{snapshot.exerciseKind === "number-quantity" && <button data-feedback={feedbackFor("retry")} disabled={!connected} onClick={() => send("retry")}><RefreshCw />Riprova</button>}</section>}
      <section className="remote-help-panel"><span>Aiuti forniti</span><div>{helpTypes.map((label) => <button type="button" data-feedback={feedbackFor("help", { label })} disabled={!connected} key={label} onClick={() => send("help", { label })}>{label}</button>)}</div></section>
      <button className="remote-end-button" data-feedback={feedbackFor("end")} type="button" disabled={!connected} onClick={() => { if (window.confirm("Interrompere la sessione sul PC?")) send("end"); }}><Square />Interrompi sessione</button>
    </> : <section className="remote-waiting"><Wifi /><h1>{state.status === "error" ? "Collegamento non disponibile" : "Connessione alla sessione"}</h1><p>{state.error || "Il collegamento si completa automaticamente."}</p></section>}
  </main>;
}

function PublicLanding({ onLogin }: { onLogin: () => void }) {
  return <main className="auth-page public-landing"><section className="auth-brand"><span className="brand-mark brand-logo large" aria-hidden="true" /><span>Lettura <strong>Globale</strong></span><h1>Imparare a leggere, una parola alla volta.</h1><p>Attività visive semplici e personalizzabili per accompagnare bambini, terapisti e famiglie.</p></section><section className="login-card welcome-card"><div className="auth-icon"><BookOpenCheck /></div><span className="eyebrow">AREA RISERVATA</span><h2>Pronto per iniziare?</h2><p>Accedi con il tuo profilo adulto per aprire il pannello, scegliere il bambino e avviare gli esercizi.</p><button className="primary-button large" onClick={onLogin}><KeyRound />Accedi al pannello</button><div className="welcome-points"><span><Check />Lettura globale con immagini e parole</span><span><Check />Esercizi IL / LA</span><span><Check />Progressi e aiuti registrati</span></div></section></main>;
}

function TherapistLogin({ therapists, backendStatus, onLogin, onBack }: { therapists: Therapist[]; backendStatus: BackendStatus; onLogin: (therapistId: string) => void; onBack: () => void }) {
  const [email, setEmail] = useState(therapists[0]?.email ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (backendStatus === "local") {
        const response = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim(), pin }) });
        if (response.status === 401) { setError("Email o PIN non corretti."); return; }
        if (!response.ok) { setError("Il cloud non è raggiungibile. Riprova tra poco."); return; }
        const result = await response.json() as { therapistId: string };
        localStorage.setItem(THERAPIST_SESSION_STORAGE_KEY, createPersistentTherapistSession(result.therapistId));
        window.location.reload();
        return;
      }
      const pinHash = await hashPin(pin);
      const match = therapists.find((item) => item.email.toLowerCase() === email.trim().toLowerCase() && (item.pinHash === pinHash || item.pin === pin));
      if (!match) { setError("Email o PIN non corretti."); return; }
      onLogin(match.id);
    } catch {
      setError("Il cloud non è raggiungibile. Riprova tra poco.");
    } finally {
      setSubmitting(false);
    }
  };
  return <main className="auth-page"><section className="auth-brand"><span className="brand-mark brand-logo large" aria-hidden="true" /><span>Lettura <strong>Globale</strong></span><p>Uno spazio semplice per preparare e guidare le attività di lettura.</p></section><section className="login-card"><button className="text-button login-back" type="button" onClick={onBack}>← Torna alla pagina iniziale</button><div className="auth-icon"><ShieldCheck /></div><span className="eyebrow">ACCESSO ADULTO</span><h1>Accedi al pannello</h1><p>Scegli il bambino associato dopo l’accesso.</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} autoComplete="username" required /></label><label>PIN<input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "")); setError(""); }} autoComplete="current-password" placeholder="••••" required /></label>{error && <div className="login-error" role="alert">{error}</div>}<button className="primary-button large" type="submit" disabled={submitting}><KeyRound />{submitting ? "Accesso…" : "Accedi"}</button></form><small className="auth-disclaimer">L’accesso collega questo dispositivo ai dati salvati nel cloud.</small></section></main>;
}

function ChildChooser({ therapist, childProfiles, onChoose, onLogout }: { therapist: Therapist; childProfiles: ChildProfile[]; onChoose: (id: string) => void; onLogout: () => void }) {
  const available = childProfiles.filter((child) => therapist.childIds.includes(child.id));
  return <main className="auth-page child-choice-page"><section className="login-card wide-choice"><span className="eyebrow">PROFILO ATTIVO</span><h1>Con chi lavori oggi?</h1><p>Sono mostrati soltanto i bambini associati a {therapist.firstName}.</p><div className="child-choice-grid">{available.map((child) => <button key={child.id} onClick={() => onChoose(child.id)}><span className="profile-avatar" style={{ background: child.avatarColor }}>{child.firstName.slice(0, 1)}</span><strong>{child.firstName} {child.lastName}</strong><small>Anno {child.birthYear}</small><ChevronRight /></button>)}</div>{!available.length && <div className="empty-mini"><Users /><p>Nessun bambino associato.</p><small>Il profilo dovrà essere collegato dall’amministratore.</small></div>}<button className="text-button" onClick={onLogout}><LogOut />Esci</button></section></main>;
}

const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Oggi", icon: Home }, { id: "library", label: "Libreria", icon: Library }, { id: "exercises", label: "Configurazione", icon: BookOpenCheck }, { id: "session", label: "Sessione", icon: Play }, { id: "stats", label: "Progressi", icon: BarChart3 }, { id: "appearance", label: "Aspetto", icon: Palette }, { id: "profiles", label: "Profili", icon: UserCog },
];

function Sidebar({ view, onNavigate, open, onClose, therapist, onLogout, backendStatus }: { view: View; onNavigate: (view: View) => void; open: boolean; onClose: () => void; therapist: Therapist; onLogout: () => void; backendStatus: BackendStatus }) {
  const initials = `${therapist.firstName[0] ?? ""}${therapist.lastName[0] ?? ""}`;
  const status = backendStatusInfo(backendStatus);
  return <>{open && <button className="sidebar-backdrop" onClick={onClose} aria-label="Chiudi menu" />}<aside className={`sidebar ${open ? "open" : ""}`}><div className="brand"><span className="brand-mark brand-logo" aria-hidden="true" /><span>Lettura<br /><strong>Globale</strong></span></div><nav aria-label="Navigazione principale">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => onNavigate(id)}><Icon size={20} strokeWidth={2} /><span>{label}</span></button>)}</nav><div className={`sidebar-note cloud-status-${status.tone}`}><span className="status-dot" /><div><strong>{status.label}</strong><small>{status.detail}</small></div></div><div className="profile-card"><button onClick={() => onNavigate("profiles")}><span className="avatar">{initials}</span><span><strong>{therapist.firstName}</strong><small>{therapist.role}</small></span><Settings size={17} /></button><button className="logout-button" onClick={onLogout} aria-label="Esci"><LogOut size={16} /></button></div></aside></>;
}

function Topbar({ onMenu, therapist, child, childProfiles, onSelectChild, onOpenProfiles, backendStatus, onOpenSaveJournal }: { onMenu: () => void; therapist: Therapist; child: ChildProfile; childProfiles: ChildProfile[]; onSelectChild: (id: string) => void; onOpenProfiles: () => void; backendStatus: BackendStatus; onOpenSaveJournal: () => void }) {
  const status = backendStatusInfo(backendStatus);
  return <header className="topbar"><button className="icon-button menu-button" onClick={onMenu} aria-label="Apri menu"><Menu /></button><label className="child-pill"><span className="child-avatar" style={{ background: child.avatarColor }}>{child.firstName[0]}</span><span><small>Profilo attivo</small><strong>{child.firstName}</strong></span><select value={child.id} onChange={(event) => onSelectChild(event.target.value)} aria-label="Cambia bambino">{childProfiles.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}</select><ChevronRight size={16} /></label><div className="topbar-right"><button type="button" className={`cloud-indicator cloud-status-${status.tone}`} onClick={onOpenSaveJournal} aria-label={`${status.label}. Apri diagnosi salvataggi`} title={`${status.label} — Apri diagnosi salvataggi`}><i className="status-dot" aria-hidden="true" /><span>{status.label}</span></button><button className="icon-button" onClick={onOpenProfiles} aria-label={`Profilo di ${therapist.firstName}`}><UserRound /></button></div></header>;
}

function SaveJournalDialog({ onClose }: { onClose: () => void }) {
  const entries = readSaveJournal(localStorage);
  const copy = async () => { await navigator.clipboard.writeText(JSON.stringify(entries, null, 2)); };
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="save-journal-title"><div className="modal"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">DIAGNOSTICA</span><h2 id="save-journal-title">Journal salvataggi</h2><p>Le ultime operazioni tecniche di questo dispositivo. Non contiene nomi, parole o immagini.</p><div className="save-journal-list">{entries.length ? entries.slice().reverse().map((entry, index) => <div key={`${entry.at}-${index}`}><time>{entry.at}</time><strong>{entry.event}</strong><small>{[entry.errorCode, entry.httpStatus, entry.revision === undefined ? undefined : `rev ${entry.revision}`, entry.changedSequences === undefined ? undefined : `sequenze ${entry.changedSequences}`, entry.diagnosticId ? `diagnosi ${entry.diagnosticId}` : undefined].filter(Boolean).join(" · ")}</small></div>) : <p>Nessuna operazione registrata.</p>}</div><div className="modal-actions"><button className="ghost-button" type="button" onClick={onClose}>Chiudi</button><button className="primary-button" type="button" onClick={() => void copy()}>Copia journal</button></div></div></div>;
}

function AppearanceView({ settings, onChange }: { settings: AppearanceSettings; onChange: (settings: AppearanceSettings) => void }) {
  const presetId = appearancePresetId(settings);
  const palettes: Array<{ id: ThemePalette; label: string }> = [{ id: "violet", label: "Viola" }, { id: "brand", label: "Icona" }, { id: "ocean", label: "Mare" }, { id: "forest", label: "Natura" }, { id: "sunset", label: "Arancio" }, { id: "berry", label: "Bacca" }, { id: "slate", label: "Ardesia" }];
  const shapes: Array<{ id: ControlShape; label: string; detail: string }> = [{ id: "square", label: "Geometrico", detail: "Angoli quasi netti" }, { id: "compact", label: "Compatto", detail: "Angoli definiti" }, { id: "soft", label: "Morbido", detail: "Equilibrato" }, { id: "round", label: "Rotondo", detail: "Controlli più curvi" }];
  return <div className="page appearance-page"><section className="page-title-row"><div><span className="eyebrow">PERSONALIZZAZIONE</span><h1>Aspetto</h1><p>Personalizza colori e forme dell’applicazione.</p></div></section><section className="appearance-layout"><div className="appearance-controls"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">TEMI PREDEFINITI</span><h2>Scegli una combinazione</h2></div></div><div className="theme-preset-grid">{appearancePresets.map((preset) => <button type="button" key={preset.id} className={presetId === preset.id ? "selected" : ""} onClick={() => onChange(preset.settings)} aria-pressed={presetId === preset.id}><span className={`theme-swatch palette-${preset.settings.palette}`}><i /><i /><i /></span><strong>{preset.name}</strong><small>{preset.description}</small>{presetId === preset.id && <Check />}</button>)}</div></section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">PERSONALIZZA</span><h2>Colori e forme</h2></div></div><span className="choice-label">Palette</span><div className="palette-picker">{palettes.map((palette) => <button type="button" key={palette.id} className={`${palette.id} ${settings.palette === palette.id ? "selected" : ""}`} onClick={() => onChange({ ...settings, palette: palette.id })} aria-pressed={settings.palette === palette.id}><i />{palette.label}</button>)}</div><span className="choice-label shape-label">Forma dei controlli</span><div className="shape-picker">{shapes.map((shape) => <button type="button" key={shape.id} className={`${shape.id} ${settings.shape === shape.id ? "selected" : ""}`} onClick={() => onChange({ ...settings, shape: shape.id })} aria-pressed={settings.shape === shape.id}><span /><strong>{shape.label}</strong><small>{shape.detail}</small></button>)}</div></section></div><aside className="panel appearance-preview"><span className="eyebrow">ANTEPRIMA DAL VIVO</span><h2>Trova la parola</h2><p>Quale parola corrisponde all’immagine?</p><div className="preview-word-card"><span aria-hidden="true">🍎</span><strong>MELA</strong></div><div className="preview-actions"><button className="primary-button" type="button"><Volume2 />Ascolta</button><button className="ghost-button" type="button">Continua</button></div><small>Aspetto sincronizzato con l’account.</small></aside></section></div>;
}

function SoundSettingsPanel({ sounds, onChange }: { sounds: SoundPreferences; onChange: (sounds: SoundPreferences) => void }) {
  const cues: Array<{ id: SoundCue; label: string; detail: string }> = [
    { id: "wrong", label: "Risposta errata", detail: "Quando una risposta non è corretta" },
    { id: "correct", label: "Risposta corretta", detail: "Quando una risposta è corretta" },
    { id: "finish", label: "Fine esercizio nella sequenza", detail: "Alla fine dell’ultimo turno di ciascun esercizio" },
    { id: "select", label: "Selezione in Numero quantità", detail: "Quando un oggetto viene selezionato o deselezionato" },
  ];
  return <section className="panel sound-settings"><div className="panel-heading"><div><span className="eyebrow">AUDIO</span><h2>Suoni degli esercizi</h2></div></div><p>Scegli un suono per ogni momento. Le scelte vengono salvate nel cloud e restano disponibili sugli altri dispositivi.</p><div className="sound-settings-list">{cues.map((cue) => <div className="sound-setting" key={cue.id}><div><strong>{cue.label}</strong><small>{cue.detail}</small></div><div className="sound-setting-actions"><select aria-label={`Suono per ${cue.label}`} value={sounds[cue.id]} onChange={(event) => onChange({ ...sounds, [cue.id]: event.target.value })}>{soundOptions[cue.id].map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select><button type="button" className="ghost-button" onClick={() => playSoundCue(cue.id, true, true, sounds[cue.id])} aria-label={`Ascolta ${cue.label}`}><Volume2 size={18} />Ascolta</button></div></div>)}</div></section>;
}

function SequenceCelebration() {
  const balloonColors = ["#f77c8b", "#f3b854", "#73c9c2", "#9583e5", "#79a9ed", "#ed95d5", "#9ccc71", "#efaa77"];
  const confettiColors = ["#ee6f8b", "#ffc65f", "#80cbb1", "#9c8de6", "#76b8ed"];
  return <div className="sequence-celebration" aria-hidden="true"><div className="celebration-glow" />{balloonColors.map((color, index) => <span key={`balloon-${index}`} className="celebration-balloon" style={{ left: `${5 + index * 12}%`, backgroundColor: color, animationDelay: `${index * 0.24}s` }} />)}{Array.from({ length: 36 }, (_, index) => <span key={`confetti-${index}`} className="celebration-confetti" style={{ left: `${(index * 37) % 97}%`, backgroundColor: confettiColors[index % confettiColors.length], animationDelay: `${(index * 13) % 23 / 10}s`, animationDuration: `${3.1 + (index % 5) * 0.48}s` }} />)}</div>;
}

function SequenceTransition({ title, onContinue }: { title: string; onContinue: () => void }) {
  return <div className="page sequence-transition"><section className="panel sequence-transition-card"><span className="sequence-transition-icon"><Check size={40} /></span><span className="eyebrow">ESERCIZIO COMPLETATO</span><h1>Ottimo lavoro!</h1><p>Pronto per il prossimo esercizio?</p><strong>{title}</strong><button className="primary-button large" type="button" onClick={onContinue}>Prossimo esercizio <ChevronRight size={20} /></button></section></div>;
}

function Dashboard({ therapist, child, libraryCount, exerciseCount, sequenceCount, accuracy, attemptCount, onStart, onNavigate }: { therapist: Therapist; child: ChildProfile; libraryCount: number; exerciseCount: number; sequenceCount: number; accuracy: number; attemptCount: number; onStart: () => void; onNavigate: (view: View) => void }) {
  const minutes = Math.max(5, Math.round(sequenceCount * 1.5));
  return <div className="page dashboard-page"><section className="welcome-row"><div><span className="eyebrow">AREA TERAPISTA</span><h1>Buongiorno, {therapist.firstName}</h1><p>Tutto è pronto per la prossima attività con {child.firstName}.</p></div><button className="primary-button" onClick={onStart}><Play size={19} fill="currentColor" />Avvia sessione</button></section><section className="hero-card"><div className="hero-copy"><span className="soft-label">ATTIVITÀ CONSIGLIATA</span><h2>Scegli la prossima attività</h2><p>Apri il pannello Sessione per avviare una singola attività o una sequenza configurata.</p><div className="hero-meta"><span>{sequenceCount} esercizi</span><i /><span>~ {minutes} minuti</span><i /><span>Verifica</span></div><button onClick={onStart}>Apri sessione <ChevronRight size={18} /></button></div><div className="hero-art" aria-hidden="true"><div className="orbit one">A</div><div className="orbit two">🍎</div><div className="orbit three">Aa</div><div className="hero-sun"><Sparkles /></div></div></section><section className="metric-grid"><Metric icon={<MousePointer2 />} label="Primi tentativi" value={String(attemptCount)} detail={`registrati per ${child.firstName}`} tone="lilac" /><Metric icon={<BarChart3 />} label="Accuratezza" value={`${accuracy}%`} detail="sui primi tentativi" tone="mint" /><Metric icon={<BookOpenCheck />} label="Esercizi pronti" value={String(exerciseCount)} detail="in 1 sequenza" tone="peach" /><Metric icon={<FolderHeart />} label="Parole in libreria" value={String(libraryCount)} detail="con immagini e licenze" tone="sky" /></section><section className="two-columns"><div className="panel"><div className="panel-heading"><div><span className="eyebrow">ACCESSO RAPIDO</span><h3>Prepara la prossima attività</h3></div></div><div className="quick-list"><Quick icon={<ImagePlus />} title="Aggiungi una parola" detail="Carica un’immagine privata" onClick={() => onNavigate("library")} /><Quick icon={<BookOpenCheck />} title="Crea un esercizio" detail="Scegli parola e alternative" onClick={() => onNavigate("exercises")} /><Quick icon={<BarChart3 />} title="Guarda i progressi" detail="Primi tentativi e aiuti" onClick={() => onNavigate("stats")} /></div></div><div className="panel calm-panel"><div className="calm-icon"><CircleHelp /></div><h3>L’adulto resta al comando</h3><p>In Lettura Globale nessun aiuto parte in automatico. Durante ogni prova sei tu a decidere se e come intervenire.</p><button onClick={() => onNavigate("session")}>Scopri la sessione <ChevronRight size={17} /></button></div></section></div>;
}

function Metric({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: string }) { return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>; }
function Quick({ icon, title, detail, onClick }: { icon: React.ReactNode; title: string; detail: string; onClick: () => void }) { return <button className="quick-item" onClick={onClick}><span>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight size={18} /></button>; }

function LibraryView({ items, search, setSearch, onUpload, onEdit, onDelete, sounds, onSoundsChange }: { items: LibraryItem[]; search: string; setSearch: (value: string) => void; onUpload: (kind: "word" | "sentence") => void; onEdit: (item: LibraryItem) => void; onDelete: (item: LibraryItem) => void; sounds: SoundPreferences; onSoundsChange: (sounds: SoundPreferences) => void }) {
  const [reviewOnly, setReviewOnly] = useState(false);
  const [wordsExpanded, setWordsExpanded] = useState(false);
  const [sentencesExpanded, setSentencesExpanded] = useState(false);
  const words = items.filter((item) => item.contentKind !== "sentence");
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
  return <div className="page library-sections"><section className="page-title-row"><div><span className="eyebrow">CONTENUTI</span><h1>Libreria</h1><p>Gestisci immagini singole, frasi d’azione e suoni in aree separate.</p></div></section><div className="toolbar"><label className="search-box"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca nei contenuti…" /></label><div className="provider-note"><Sparkles size={16} />Catalogo demo autorizzato</div></div><section className="library-area"><div className="section-heading"><div><span className="eyebrow">IMMAGINI SINGOLE</span><h2>Parole e immagini</h2><p>Contenuti per riconoscimento, categorie, articoli e denominazione.</p></div><button className="primary-button" onClick={() => onUpload("word")}><Plus size={18} />Aggiungi immagine</button></div><button type="button" className={`filter-chip ${reviewOnly ? "selected" : ""}`} onClick={() => setReviewOnly((value) => !value)} aria-pressed={reviewOnly}>Sillabazione da verificare <span>{reviewCount}</span></button>{cards(visibleWords)}{!filteredWords.length && <div className="empty-state compact"><Search /><h3>Nessuna immagine singola</h3></div>}{expansion("immagini", filteredWords, visibleWords, wordsExpanded, setWordsExpanded)}</section><section className="library-area sentence-library-area"><div className="section-heading"><div><span className="eyebrow">FRASI</span><h2>Scene soggetto + verbo</h2><p>Immagini d’azione usate da Abbina la frase.</p></div><button className="primary-button" onClick={() => onUpload("sentence")}><Plus size={18} />Aggiungi frase</button></div>{cards(visibleSentences, true)}{!filteredSentences.length && <div className="empty-state compact"><Search /><h3>Nessuna frase</h3></div>}{expansion("frasi", filteredSentences, visibleSentences, sentencesExpanded, setSentencesExpanded)}</section><section className="library-area sound-library-area"><SoundSettingsPanel sounds={sounds} onChange={onSoundsChange} /></section></div>;
}

function ExercisesView({ exercises, sequences, activeSequence, therapists, showSequenceOwners, library, onSelectSequence, onCreateSequence, onRenameSequence, onDeleteSequence, onBuild, onEdit, onDuplicate, onDelete, onToggleInSequence, onMove, onTry, onShareSequence, onShareExercise }: { exercises: Exercise[]; sequences: Sequence[]; activeSequence?: Sequence; therapists: Therapist[]; showSequenceOwners: boolean; library: LibraryItem[]; onSelectSequence: (id: string) => void; onCreateSequence: () => void; onRenameSequence: () => void; onDeleteSequence: () => void; onBuild: (kind: SessionActivity) => void; onEdit: (exercise: Exercise) => void; onDuplicate: (exercise: Exercise) => void; onDelete: (exercise: Exercise) => void; onToggleInSequence: (exerciseId: string) => void; onMove: (exerciseId: string, direction: -1 | 1) => void; onTry: (exerciseId: string) => void; onShareSequence: () => void; onShareExercise: (exercise: Exercise) => void }) {
  const sequenceExercises = activeSequence?.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is Exercise => Boolean(exercise)) ?? [];
  const includedIds = new Set(sequenceExercises.map((exercise) => exercise.id));
  const therapistName = (therapistId: string) => { const owner = therapists.find((item) => item.id === therapistId); return owner ? `${owner.firstName} ${owner.lastName}` : "Terapista non disponibile"; };
  return <div className="page exercises-page">
    <section className="page-title-row"><div><span className="eyebrow">PROGRAMMAZIONE</span><h1>Configurazione</h1><p>Crea, modifica ed elimina esercizi e sequenze. L’avvio delle attività si trova nella sezione Sessione.</p></div></section>
    {activeSequence ? <section className="sequence-banner sequence-manager"><div className="sequence-symbol"><span>1</span><span>2</span><span>3</span></div><div className="sequence-copy"><span className="soft-label">SEQUENZA</span><select value={activeSequence.id} onChange={(event) => onSelectSequence(event.target.value)} aria-label="Seleziona sequenza">{sequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.title}{showSequenceOwners ? ` · ${therapistName(sequence.therapistId)}` : ""}</option>)}</select><p>{sequenceExercises.length} esercizi · {showSequenceOwners ? `terapista: ${therapistName(activeSequence.therapistId)} · ` : ""}salvata nel cloud</p><div className="sequence-actions"><button type="button" onClick={onCreateSequence}><Plus />Nuova</button><button type="button" onClick={onRenameSequence}><Pencil />Rinomina</button><button type="button" onClick={onShareSequence}><Share2 />Condividi</button><button type="button" onClick={onDeleteSequence}><Trash2 />Elimina</button></div></div></section> : <section className="sequence-banner sequence-manager empty-sequence-manager"><div className="sequence-symbol"><span>1</span><span>2</span><span>3</span></div><div className="sequence-copy"><span className="soft-label">SEQUENZE</span><h2>Nessuna sequenza disponibile</h2><p>Crea la prima sequenza per organizzare i tuoi esercizi.</p><div className="sequence-actions"><button type="button" onClick={onCreateSequence}><Plus />Nuova sequenza</button></div></div></section>}
    {activeSequence && <section className="sequence-editor"><div className="section-heading"><div><h2>Ordine della sequenza</h2><p>Usa le frecce per cambiare l’ordine di presentazione.</p></div><span>{sequenceExercises.length} elementi</span></div>{sequenceExercises.length ? <div className="sequence-order-list">{sequenceExercises.map((exercise, index) => <article key={exercise.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{exercise.title}</strong><div><button type="button" disabled={index === 0} onClick={() => onMove(exercise.id, -1)} aria-label={`Sposta ${exercise.title} su`}><ArrowUp /></button><button type="button" disabled={index === sequenceExercises.length - 1} onClick={() => onMove(exercise.id, 1)} aria-label={`Sposta ${exercise.title} giù`}><ArrowDown /></button><button type="button" onClick={() => onToggleInSequence(exercise.id)} aria-label={`Rimuovi ${exercise.title} dalla sequenza`}><X /></button></div></article>)}</div> : <div className="empty-state compact"><BookOpenCheck /><h3>Sequenza vuota</h3><p>Aggiungi almeno un esercizio dal catalogo qui sotto.</p></div>}</section>}
    <div className="catalog-actions"><span className="soft-label">NUOVO ESERCIZIO</span><div className="new-exercise-actions"><button className="primary-button" onClick={() => onBuild("recognition")}><Plus size={19} />Trova la parola</button><button className="ghost-button" onClick={() => onBuild("sentence-matching")}><Plus size={19} />Abbina la frase</button><button className="ghost-button" onClick={() => onBuild("articles")}><Plus size={19} />IL / LA</button><button className="ghost-button" onClick={() => onBuild("word-categories")}><Plus size={19} />Parola → categoria</button><button className="ghost-button" onClick={() => onBuild("naming")}><Plus size={19} />Mix and vary</button><button className="ghost-button" onClick={() => onBuild("number-quantity")}><Plus size={19} />Numero quantità</button></div></div>
    <div className="section-heading exercise-catalog-heading"><div><h2>Catalogo esercizi</h2><p>Modifica, duplica o aggiungi gli esercizi alla sequenza attiva.</p></div><span>{exercises.length} totali</span></div>
    <div className="exercise-list">{exercises.map((exercise, index) => { const prompt = library.find((item) => item.id === exercise.promptId); const included = includedIds.has(exercise.id); const kind = exerciseKind(exercise); const isArticles = kind === "articles"; const isWordCategories = kind === "word-categories"; const isNaming = kind === "naming"; const isQuantity = kind === "number-quantity"; const isSentence = kind === "sentence-matching"; const description = isSentence ? `Frase → immagine · ${exercise.rounds ?? 6} turni · ${exercise.sentenceOptionCount ?? 2} immagini · ${exercise.sentenceDifficulty ?? 1} ${exercise.sentenceDifficulty === 2 ? "gradi" : "grado"} di libertà` : isArticles ? `IL / LA · ${Math.min(exercise.rounds ?? 6, exercise.articleItemIds?.length ?? 0)} turni · ${exercise.articleItemIds?.length ?? 0} immagini scelte` : isWordCategories ? `Parola → categoria · ${exercise.rounds ?? 6} turni · ${exercise.categoryNames?.length ?? 0} categorie` : isNaming ? `Nomina l’immagine · ${exercise.rounds ?? 6} turni` : isQuantity ? `${exercise.rounds ?? 6} turni · quantità ${exercise.quantityMin ?? 1}–${exercise.quantityMax ?? 10} · ${exercise.quantityObjectSet === "mixed" || !exercise.quantityObjectSet ? "oggetti casuali" : quantityObjectLabel(exercise.quantityObjectSet, 2)} · ${exercise.quantityAutoComplete ? `auto dopo ${exercise.quantityIdleSeconds ?? 3}s in insegnamento` : "conferma adulta"}` : exercise.recognitionMode === "random" ? `Casuale · ${exercise.rounds ?? 6} turni · ${exercise.distractorCount ?? 3} distrattori · ${exercise.distractorSource === "same-category" ? "stessa categoria" : "tutte le parole"} · ${exercise.presentation === "words" ? "solo parole" : "foto + parole"} · ${syllableFilterLabel(exercise.recognitionSyllables)}` : `Parola → scelta · ${exercise.optionIds.length} opzioni · ${exercise.presentation === "words" ? "solo parole" : "foto + parole"}`; return <article className="exercise-row" key={exercise.id}><span className="exercise-number">{String(index + 1).padStart(2, "0")}</span><div className={`tiny-art ${isArticles || isWordCategories || isNaming || isQuantity || isSentence ? "article-icon" : ""}`}>{isSentence ? <strong>S<br />V</strong> : isArticles ? <strong>IL<br />LA</strong> : isWordCategories ? <strong>A<br />B</strong> : isNaming ? <MousePointer2 /> : isQuantity ? <strong>1<br />2</strong> : exercise.recognitionMode === "random" ? <Sparkles /> : prompt && <Artwork item={prompt} compact />}</div><div className="exercise-copy"><h3>{exercise.title}</h3><p>{description}</p>{(kind === "recognition" || isSentence) && <small>Pronuncia {isSentence || (exercise.autoPronounce ?? exercise.presentation === "words") ? "automatica" : "manuale"}</small>}</div><button disabled={!activeSequence} title={activeSequence ? undefined : "Crea prima una sequenza"} className={`sequence-toggle ${included ? "included" : ""}`} onClick={() => onToggleInSequence(exercise.id)}>{included ? <><Check />Nella sequenza</> : <><Plus />Aggiungi</>}</button><div className="exercise-actions"><button onClick={() => onTry(exercise.id)}>Prova</button><button onClick={() => onShareExercise(exercise)} aria-label={`Condividi ${exercise.title}`} title="Condividi"><Share2 /></button><button onClick={() => onEdit(exercise)} aria-label={`Modifica ${exercise.title}`} title="Modifica"><Pencil /></button><button onClick={() => onDuplicate(exercise)} aria-label={`Duplica ${exercise.title}`} title="Duplica"><Copy /></button><button className="delete" onClick={() => onDelete(exercise)} aria-label={`Elimina ${exercise.title}`} title="Elimina"><Trash2 /></button></div></article>; })}</div>
  </div>;
}

type SessionNavigationProps = { canPrevious: boolean; canForward: boolean; onPrevious: () => void; onForward: () => void };
type SessionViewProps = { active: boolean; complete: boolean; fromSharedLink: boolean; isTrial: boolean; remoteConnected?: boolean; mode: Mode; setMode: (mode: Mode) => void; presentation: Presentation; setPresentation: (presentation: Presentation) => void; sequences: Sequence[]; therapists: Therapist[]; showSequenceOwners: boolean; activeChild: ChildProfile; childProfiles: ChildProfile[]; onSelectChild: (id: string) => void; onStartSequence: (id: string) => void; onStartQuick: (config: QuickStartConfig) => void; quickCanBeSaved: boolean; onSaveQuick: () => void; completionComment: string; onSaveCompletionComment: (comment: string) => void; onCloseComplete: () => void; onExit: () => void; currentIndex: number; total: number; exercise?: Exercise; prompt?: LibraryItem; library: LibraryItem[]; answerState: "idle" | "wrong" | "correct"; wrongAnswerId: string | null; onChoose: (id: string) => void; onClassificationAttempt: (itemId: string, answer: string, correct: boolean) => void; onClassificationComplete: () => void; onHelp: (label: string, wordId?: string) => void; onNext: () => void; soundEffects: boolean; onToggleSound: () => void } & SessionNavigationProps;

function SessionView({ active, complete, fromSharedLink, isTrial, remoteConnected = false, mode, setMode, presentation, setPresentation, sequences, therapists, showSequenceOwners, activeChild, childProfiles, onSelectChild, onStartSequence, onStartQuick, quickCanBeSaved, onSaveQuick, completionComment, onSaveCompletionComment, onCloseComplete, onExit, currentIndex, total, canPrevious, canForward, onPrevious, onForward, exercise, prompt, library, answerState, wrongAnswerId, onChoose, onClassificationAttempt, onClassificationComplete, onHelp, onNext, soundEffects, onToggleSound }: SessionViewProps) {
  const [step, setStep] = useState<"choose" | "quick" | "review" | "ready">("choose");
  const [source, setSource] = useState<"sequence" | "quick">("sequence");
  const [reviewSequenceId, setReviewSequenceId] = useState(sequences[0]?.id ?? "");
  const categoryNames = useMemo(() => Array.from(new Set(library.map((item) => item.category))).sort((a, b) => a.localeCompare(b, "it")), [library]);
  const [quick, setQuick] = useState<QuickStartConfig>(() => ({ activity: "recognition", selection: "all", categoryNames: Array.from(new Set(library.map((item) => item.category))).sort((a, b) => a.localeCompare(b, "it")).slice(0, 2), itemIds: [], rounds: 6, distractorCount: 3, distractorSource: "mixed", presentation, recognitionSyllables: "all", autoPronounce: presentation === "words", quantityMin: 1, quantityMax: 10, quantityObjectSet: "mixed", quantityAutoComplete: true, quantityIdleSeconds: 5 }));
  const [quickSearch, setQuickSearch] = useState("");
  const [completionDraft, setCompletionDraft] = useState(completionComment);
  const sortedSequences = useMemo(() => [...sequences].sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "") || a.title.localeCompare(b.title, "it")), [sequences]);
  const reviewSequence = sequences.find((item) => item.id === reviewSequenceId);
  const therapistName = (therapistId: string) => { const owner = therapists.find((item) => item.id === therapistId); return owner ? `${owner.firstName} ${owner.lastName}` : "Terapista non disponibile"; };
  const articleLibrary = library.filter((item) => hasArtwork(item) && articleFor(item));
  const quickRequiresArtwork = quick.activity === "naming" || (quick.activity === "recognition" && quick.presentation === "images");
  const quickBase = quick.activity === "articles" ? articleLibrary : quickRequiresArtwork ? library.filter(hasArtwork) : library;
  const quickSelectable = quick.activity === "word-categories" ? quickBase.filter((item) => quick.categoryNames.includes(item.category)) : quickBase;
  const normalizedQuickSearch = quickSearch.trim().toLocaleLowerCase("it-IT");
  const filteredQuickSelectable = quickSelectable.filter((item) => !normalizedQuickSearch || `${item.word} ${item.category}`.toLocaleLowerCase("it-IT").includes(normalizedQuickSearch));
  const quickSearchField = <label className="search-box builder-search"><Search /><input type="search" value={quickSearch} onChange={(event) => setQuickSearch(event.target.value)} placeholder="Cerca per parola o categoria…" /></label>;
  const quickCandidates = filterQuickCandidates(quickBase, quick);
  const quickValid = quickStartIsValid(quick, quickCandidates.length) && (quick.activity !== "recognition" || quick.distractorSource === "mixed" || hasSameCategoryDistractors(quickCandidates, quick.distractorCount));
  const reviewCount = source === "quick" ? quick.activity === "recognition" ? quick.rounds : Math.min(quick.rounds, quickCandidates.length) : reviewSequence?.exerciseIds.length ?? 0;
  const reviewTitle = source === "quick" ? quick.activity === "recognition" ? "Trova la parola" : quick.activity === "articles" ? "Articolo IL / LA" : quick.activity === "naming" ? "Mix and vary" : "Parola nella categoria" : reviewSequence?.title ?? "Sequenza";
  const toggleQuickCategory = (category: string) => setQuick((current) => current.categoryNames.includes(category) ? { ...current, categoryNames: current.categoryNames.filter((item) => item !== category), itemIds: current.itemIds.filter((id) => library.find((item) => item.id === id)?.category !== category) } : current.categoryNames.length < 4 ? { ...current, categoryNames: [...current.categoryNames, category] } : current);
  const chooseSequence = (id: string) => { setSource("sequence"); setReviewSequenceId(id); setStep("review"); };
  const beginReviewed = () => { if (source === "quick") onStartQuick(quick); else if (reviewSequenceId) onStartSequence(reviewSequenceId); };
  const previewLabel = fromSharedLink ? "Anteprima" : isTrial ? "Prova" : undefined;
  const navigationProps = { canPrevious, canForward, onPrevious, onForward };

  if (!active && complete) return <div className="page session-setup session-complete-screen"><span className="complete-check"><Check /></span><span className="eyebrow">SESSIONE COMPLETATA</span><h1>Attività salvata</h1><p>Risposte, errori e aiuti sono disponibili nello storico di {activeChild.firstName}.</p><label className="completion-comment">Valutazione della sessione<textarea rows={4} value={completionDraft} onChange={(event) => setCompletionDraft(event.target.value)} placeholder="Annota partecipazione, attenzione, difficoltà o progressi osservati…" /></label><button className="ghost-button" type="button" onClick={() => onSaveCompletionComment(completionDraft)}><Save />Salva valutazione</button>{quickCanBeSaved && <button className="ghost-button" type="button" onClick={onSaveQuick}><Save />Salva l’avvio rapido come sequenza</button>}<button className="primary-button large" type="button" onClick={onCloseComplete}><BarChart3 />Apri storico e progressi</button></div>;
  if (!active && step === "choose") return <div className="page session-wizard"><div className="wizard-heading"><span className="session-big-icon"><Play /></span><div><span className="eyebrow">NUOVA SESSIONE</span><h1>Cosa facciamo oggi?</h1><p>Scegli una sequenza già configurata oppure avvia un’attività veloce.</p></div><button className="sound-toggle setup" type="button" onClick={onToggleSound} aria-pressed={soundEffects}>{soundEffects ? <Volume2 /> : <VolumeX />}{soundEffects ? "Suoni attivi" : "Suoni disattivati"}</button></div><section className="wizard-panel"><span className="choice-label">1 · Bambino</span><div className="wizard-child-list">{childProfiles.map((child) => <button type="button" key={child.id} className={activeChild.id === child.id ? "selected" : ""} onClick={() => onSelectChild(child.id)}><span className="child-avatar" style={{ background: child.avatarColor }}>{child.firstName[0]}</span><strong>{child.firstName} {child.lastName}</strong>{activeChild.id === child.id && <Check />}</button>)}</div></section><section className="wizard-panel"><div className="section-heading"><div><span className="choice-label">2 · Sequenze preparate</span><h2>Scegli una nuvoletta</h2></div><span>{sequences.length} disponibili</span></div>{sortedSequences.length ? <div className="sequence-cloud-grid">{sortedSequences.map((sequence) => <button type="button" className="sequence-cloud" key={sequence.id} disabled={!sequence.exerciseIds.length} onClick={() => chooseSequence(sequence.id)}><Cloud /><strong>{sequence.title}</strong><small>{sequence.exerciseIds.length} esercizi{showSequenceOwners ? ` · ${therapistName(sequence.therapistId)}` : ""}</small><ChevronRight /></button>)}</div> : <div className="empty-mini"><Cloud /><p>Nessuna sequenza disponibile.</p><small>Puoi crearne una nella sezione Configurazione oppure usare l’avvio rapido.</small></div>}</section><section className="wizard-paths single-path"><button type="button" onClick={() => setStep("quick")}><span><Sparkles /></span><strong>Avvio rapido</strong><small>Scegli attività e parole senza salvarle</small><ChevronRight /></button></section></div>;
  if (!active && step === "quick") return <div className="page session-wizard"><WizardBack onClick={() => setStep("choose")} /><div className="wizard-heading compact"><div><span className="eyebrow">AVVIO RAPIDO</span><h1>Configura l’attività</h1><p>Questa configurazione non verrà salvata automaticamente.</p></div></div><section className="wizard-panel"><span className="choice-label">Tipologia</span><div className="mode-picker activity-picker wizard-activity-picker"><button className={quick.activity === "recognition" ? "selected" : ""} onClick={() => setQuick((current) => ({ ...current, activity: "recognition", itemIds: [] }))}><BookOpenCheck /><strong>Trova la parola</strong><small>Parola e distrattori casuali</small></button><button className={quick.activity === "articles" ? "selected" : ""} onClick={() => setQuick((current) => ({ ...current, activity: "articles", itemIds: [] }))}><Library /><strong>Articolo IL / LA</strong><small>Classifica una foto alla volta</small></button><button className={quick.activity === "word-categories" ? "selected" : ""} onClick={() => setQuick((current) => ({ ...current, activity: "word-categories", selection: "categories", itemIds: [] }))}><FolderHeart /><strong>Parola nella categoria</strong><small>Scegli la categoria corretta</small></button><button className={quick.activity === "naming" ? "selected" : ""} onClick={() => setQuick((current) => ({ ...current, activity: "naming", itemIds: [] }))}><MousePointer2 /><strong>Mix and vary</strong><small>Nomina una foto alla volta</small></button></div></section><section className="wizard-panel"><span className="choice-label">Parole e immagini</span><div className="selection-tabs">{(["all", "categories", "items"] as QuickSelection[]).map((selection) => <button key={selection} type="button" className={quick.selection === selection ? "selected" : ""} onClick={() => setQuick((current) => ({ ...current, selection, itemIds: selection === "items" ? current.itemIds : [] }))}>{selection === "all" ? "Tutta la libreria" : selection === "categories" ? "Per categoria" : "Scelta manuale"}</button>)}</div>{(quick.selection === "categories" || quick.activity === "word-categories") && <><div className="builder-label">Categorie <span>{quick.categoryNames.length} scelte{quick.activity === "word-categories" ? " · minimo 2, massimo 4" : ""}</span></div><div className="filter-chips">{categoryNames.map((category) => <button type="button" key={category} className={quick.categoryNames.includes(category) ? "selected" : ""} onClick={() => toggleQuickCategory(category)}>{category}</button>)}</div></>}{quick.selection === "items" && <><div className="builder-label">Elementi <span>{quick.itemIds.length} scelti</span></div>{quickSearchField}<div className="builder-grid compact-words quick-item-grid">{filteredQuickSelectable.map((item) => <button type="button" key={item.id} className={quick.itemIds.includes(item.id) ? "selected" : ""} onClick={() => setQuick((current) => ({ ...current, itemIds: current.itemIds.includes(item.id) ? current.itemIds.filter((id) => id !== item.id) : [...current.itemIds, item.id] }))}><strong className="builder-word">{item.word.toLocaleUpperCase("it-IT")}</strong><span>{item.category}{quick.activity === "articles" ? ` · ${articleFor(item)}` : ""}</span>{quick.itemIds.includes(item.id) && <i><Check /></i>}</button>)}</div></>}</section><section className="wizard-panel wizard-settings"><label>Numero di turni<input type="number" min={1} max={50} value={quick.rounds} onChange={(event) => setQuick((current) => ({ ...current, rounds: Math.max(1, Number(event.target.value)) }))} /></label>{quick.activity === "recognition" && <><RecognitionRandomParameterFields distractorCount={quick.distractorCount} distractorSource={quick.distractorSource} syllables={quick.recognitionSyllables} onDistractorCountChange={(distractorCount) => setQuick((current) => ({ ...current, distractorCount }))} onDistractorSourceChange={(distractorSource) => setQuick((current) => ({ ...current, distractorSource }))} onSyllablesChange={(recognitionSyllables) => setQuick((current) => ({ ...current, recognitionSyllables }))} /><RecognitionPresentationFields presentation={quick.presentation} autoPronounce={quick.autoPronounce} onPresentationChange={(next) => { setQuick((current) => ({ ...current, presentation: next })); setPresentation(next); }} onAutoPronounceChange={(autoPronounce) => setQuick((current) => ({ ...current, autoPronounce }))} /></>}</section>{!quickValid && <p className="wizard-error">Scegli abbastanza elementi e categorie per avviare questa attività.</p>}<div className="wizard-footer"><button className="ghost-button" onClick={() => setStep("choose")}>Annulla</button><button className="primary-button" disabled={!quickValid} onClick={() => { setSource("quick"); setStep("review"); }}><ChevronRight />Continua</button></div></div>;
  if (!active && step === "review") return <div className="page session-wizard review-step"><WizardBack onClick={() => setStep(source === "quick" ? "quick" : "choose")} /><span className="eyebrow">RIEPILOGO</span><h1>{reviewTitle}</h1><div className="review-card"><div><span>Bambino</span><strong>{activeChild.firstName} {activeChild.lastName}</strong></div><div><span>Contenuto</span><strong>{source === "quick" ? `${reviewCount} turni` : `${reviewCount} esercizi`}</strong></div><div><span>Origine</span><strong>{source === "quick" ? "Avvio rapido" : "Sequenza salvata"}</strong></div></div><section className="wizard-panel"><span className="choice-label">Modalità della sessione</span><div className="mode-picker"><button className={mode === "teaching" ? "selected" : ""} onClick={() => setMode("teaching")}><Sparkles /><strong>Insegnamento</strong><small>Guida, mostra e ripeti</small></button><button className={mode === "test" ? "selected" : ""} onClick={() => setMode("test")}><BookOpenCheck /><strong>Valutazione</strong><small>Misura il primo tentativo</small></button></div></section><div className="wizard-footer"><button className="ghost-button" onClick={() => setStep(source === "quick" ? "quick" : "choose")}>Indietro</button><button className="primary-button large" disabled={!reviewCount} onClick={() => setStep("ready")}><ChevronRight />Continua</button></div></div>;
  if (!active && step === "ready") return <div className="page ready-screen"><span className="ready-cloud"><Cloud /></span><span className="eyebrow">{activeChild.firstName.toLocaleUpperCase("it-IT")}</span><h1>PRONTI?</h1><p>{reviewTitle} · {mode === "test" ? "Valutazione" : "Insegnamento"}</p><div><button className="ghost-button" onClick={() => setStep("review")}>Indietro</button><button className="primary-button large" onClick={beginReviewed}><Play fill="currentColor" />Inizia</button></div></div>;
  if (exercise && exerciseKind(exercise) === "articles") return <ArticleSortSession key={`${exercise.id}:${currentIndex}`} previewLabel={previewLabel} exercise={exercise} library={library} mode={mode} manualAdvance={remoteConnected} currentIndex={currentIndex} total={total} onAttempt={onClassificationAttempt} onComplete={onClassificationComplete} onHelp={onHelp} onExit={onExit} soundEffects={soundEffects} onToggleSound={onToggleSound} {...navigationProps} />;
  if (exercise && exerciseKind(exercise) === "word-categories") return <WordCategorySession key={`${exercise.id}:${currentIndex}`} previewLabel={previewLabel} exercise={exercise} library={library} mode={mode} manualAdvance={remoteConnected} currentIndex={currentIndex} total={total} onAttempt={onClassificationAttempt} onComplete={onClassificationComplete} onHelp={onHelp} onExit={onExit} soundEffects={soundEffects} onToggleSound={onToggleSound} {...navigationProps} />;
  if (exercise && exerciseKind(exercise) === "naming") return <NamingSession key={`${exercise.id}:${currentIndex}`} previewLabel={previewLabel} exercise={exercise} library={library} mode={mode} manualAdvance={remoteConnected} currentIndex={currentIndex} total={total} onAttempt={onClassificationAttempt} onComplete={onClassificationComplete} onHelp={onHelp} onExit={onExit} soundEffects={soundEffects} onToggleSound={onToggleSound} {...navigationProps} />;
  if (exercise && exerciseKind(exercise) === "number-quantity") return <NumberQuantitySession key={`${exercise.id}:${currentIndex}`} previewLabel={previewLabel} exercise={exercise} mode={mode} manualAdvance={remoteConnected} currentIndex={currentIndex} total={total} onAttempt={onClassificationAttempt} onComplete={onClassificationComplete} onHelp={onHelp} onExit={onExit} soundEffects={soundEffects} onToggleSound={onToggleSound} {...navigationProps} />;
  if (exercise && exerciseKind(exercise) === "sentence-matching" && prompt) return <SentenceMatchingSession key={`${exercise.id}:${currentIndex}`} previewLabel={previewLabel} exercise={exercise} prompt={prompt} library={library} mode={mode} manualAdvance={remoteConnected} currentIndex={currentIndex} total={total} answerState={answerState} wrongAnswerId={wrongAnswerId} onChoose={onChoose} onHelp={onHelp} onNext={onNext} onExit={onExit} soundEffects={soundEffects} onToggleSound={onToggleSound} {...navigationProps} />;
  if (!exercise || !prompt) return null;
  return <RecognitionSession key={`${exercise.id}:${currentIndex}`} previewLabel={previewLabel} mode={mode} manualAdvance={remoteConnected} presentation={presentation} currentIndex={currentIndex} total={total} exercise={exercise} prompt={prompt} library={library} answerState={answerState} wrongAnswerId={wrongAnswerId} onChoose={onChoose} onHelp={onHelp} onNext={onNext} onExit={onExit} soundEffects={soundEffects} onToggleSound={onToggleSound} {...navigationProps} />;
}

function WizardBack({ onClick }: { onClick: () => void }) {
  return <button className="wizard-back" type="button" onClick={onClick}>← Indietro</button>;
}

function RecognitionPresentationFields({ presentation, autoPronounce, onPresentationChange, onAutoPronounceChange }: { presentation: Presentation; autoPronounce: boolean; onPresentationChange: (value: Presentation) => void; onAutoPronounceChange: (value: boolean) => void }) {
  return <><label>Presentazione<select value={presentation} onChange={(event) => onPresentationChange(event.target.value as Presentation)}><option value="images">Foto + parole</option><option value="words">Solo parole</option></select></label><label className="check-line pronunciation-option"><input type="checkbox" checked={autoPronounce} onChange={(event) => onAutoPronounceChange(event.target.checked)} /><span><strong>Pronuncia automatica</strong><small>Legge la parola quando compare, con immagini o con sole parole.</small></span></label></>;
}

function RecognitionRandomParameterFields({ distractorCount, distractorSource, syllables, onDistractorCountChange, onDistractorSourceChange, onSyllablesChange }: { distractorCount: 1 | 2 | 3 | 4; distractorSource: DistractorSource; syllables: SyllableFilter; onDistractorCountChange: (value: 1 | 2 | 3 | 4) => void; onDistractorSourceChange: (value: DistractorSource) => void; onSyllablesChange: (value: SyllableFilter) => void }) {
  return <><label>Distrattori<select value={distractorCount} onChange={(event) => onDistractorCountChange(Number(event.target.value) as 1 | 2 | 3 | 4)}><option value={1}>1 distrattore</option><option value={2}>2 distrattori</option><option value={3}>3 distrattori</option><option value={4}>4 distrattori</option></select></label><label>Origine distrattori<select value={distractorSource} onChange={(event) => onDistractorSourceChange(event.target.value as DistractorSource)}><option value="mixed">Tutte le parole selezionate</option><option value="same-category">Solo stessa categoria</option></select></label><label>Numero di sillabe<select value={syllables} onChange={(event) => onSyllablesChange(event.target.value as SyllableFilter)}><option value="all">Tutte</option><option value="2">2 sillabe</option><option value="3">3 sillabe</option><option value="2-3">2 o 3 sillabe</option><option value="4+">4 o più sillabe</option></select></label></>;
}

function SessionTools({ soundEffects, onToggleSound, onExit, protectedExit = true, canPrevious, canForward, onPrevious, onForward }: { soundEffects: boolean; onToggleSound: () => void; onExit: () => void; protectedExit?: boolean } & SessionNavigationProps) {
  return <div className="session-tools"><div className="session-step-navigation" aria-label="Navigazione tra i passaggi"><button type="button" onClick={onPrevious} disabled={!canPrevious} aria-label="Passaggio precedente"><ChevronLeft /></button><button type="button" onClick={onForward} disabled={!canForward} aria-label="Passaggio successivo già raggiunto"><ChevronRight /></button></div><button className="sound-toggle" type="button" onClick={onToggleSound} aria-label={soundEffects ? "Disattiva effetti sonori" : "Attiva effetti sonori"} aria-pressed={soundEffects}>{soundEffects ? <Volume2 /> : <VolumeX />}</button>{protectedExit ? <ProtectedExitButton onComplete={onExit} /> : <button className="ghost-button" type="button" onClick={onExit}>Chiudi</button>}</div>;
}

function ProtectedExitButton({ onComplete }: { onComplete: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const start = () => {
    if (timer.current !== null) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onComplete();
    }, 4_000);
  };
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  return <button className={`ghost-button protected-exit-button ${holding ? "holding" : ""}`} type="button" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); start(); }} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onKeyDown={(event) => { if (!event.repeat && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); start(); } }} onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") cancel(); }} onClick={(event) => event.preventDefault()} aria-label="Tieni premuto per 4 secondi per terminare"><span>{holding ? "Continua a premere…" : "Termina"}</span><i aria-hidden="true" /></button>;
}

function NamingSession({ previewLabel, exercise, library, mode, manualAdvance = false, currentIndex, total, onAttempt, onComplete, onHelp, onExit, soundEffects, onToggleSound, canPrevious, canForward, onPrevious, onForward }: { previewLabel?: "Anteprima" | "Prova"; exercise: Exercise; library: LibraryItem[]; mode: Mode; manualAdvance?: boolean; currentIndex: number; total: number; onAttempt: (itemId: string, answer: string, correct: boolean) => void; onComplete: () => void; onHelp: (label: string, wordId?: string) => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void } & SessionNavigationProps) {
  const candidates = useMemo(() => {
    const allowedIds = exercise.namingItemIds?.length ? new Set(exercise.namingItemIds) : null;
    const categories = exercise.namingCategories?.length ? new Set(exercise.namingCategories) : null;
    return library.filter((item) => hasArtwork(item) && (!allowedIds || allowedIds.has(item.id)) && (!categories || categories.has(item.category)));
  }, [exercise.namingCategories, exercise.namingItemIds, library]);
  const [initialIds] = useState(() => shuffled(candidates.map((item) => item.id)).slice(0, Math.max(1, exercise.rounds ?? 6)));
  const [remainingIds, setRemainingIds] = useState(initialIds);
  const [judgement, setJudgement] = useState<"correct" | "wrong" | null>(null);
  const advanceTimer = useRef<number | null>(null);
  const preloadedImages = useRef(new Map<string, HTMLImageElement>());
  useEffect(() => () => { if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current); }, []);
  useEffect(() => {
    remainingIds.slice(0, 5).forEach((id) => {
      const source = library.find((item) => item.id === id)?.image;
      if (!source || preloadedImages.current.has(source)) return;
      const preload = new window.Image();
      preload.decoding = "async";
      preload.src = source;
      preloadedImages.current.set(source, preload);
      preload.decode?.().catch(() => undefined);
    });
  }, [remainingIds, library]);
  const currentId = remainingIds[0];
  const currentItem = library.find((item) => item.id === currentId);
  const completed = remainingIds.length === 0;
  useLocalFallbackAdvance(manualAdvance, Boolean(judgement), () => {
    if (remainingIds.length <= 1) onComplete();
    else {
      setRemainingIds((current) => current.filter((id) => id !== currentId));
      setJudgement(null);
    }
  }, 650);
  const judge = (correct: boolean, withHelp = false) => {
    if (!currentId || judgement) return;
    onAttempt(currentId, withHelp ? "CORRETTO_CON_AIUTO" : correct ? "CORRETTO" : "ERRATO", correct);
    if (withHelp) onHelp("Risposta aiutata", currentId);
    playFeedbackTone(correct ? "correct" : "wrong", soundEffects);
    setJudgement(correct ? "correct" : "wrong");
    if (manualAdvance) return;
    advanceTimer.current = window.setTimeout(() => {
      if (remainingIds.length <= 1) onComplete();
      else {
        setRemainingIds((current) => current.filter((id) => id !== currentId));
        setJudgement(null);
      }
    }, 650);
  };
  useRemoteComponentCommand((event) => {
    if (event.command === "mark_correct") judge(true);
    if (event.command === "mark_wrong") judge(false);
    if (event.command === "mark_helped") judge(true, true);
  });
  return <div className="session-screen naming-session">
    <div className="session-header">
      <div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">Mix and vary</span><strong>{exercise.title}</strong></div>
      <div className="session-progress"><span>{currentIndex + 1} di {total}</span><div><i style={{ width: `${((currentIndex + 1) / total) * 100}%` }} /></div></div>
      <SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} protectedExit={!previewLabel} canPrevious={canPrevious} canForward={canForward} onPrevious={onPrevious} onForward={onForward} />
    </div>
    <div className="article-body naming-body">
      <p className="instruction">Chiedi al bambino di nominare ciò che vede, poi registra l’esito.</p>
      {completed ? <div className="article-complete"><span className="complete-check"><Check /></span><h2>Attività completata</h2><p>Tutte le immagini sono state valutate.</p><button className="primary-button large" onClick={onComplete}>{currentIndex === total - 1 ? (previewLabel ? "Chiudi" : "Concludi") : "Prossimo esercizio"}</button></div> : currentItem ? <>
        <div className={`naming-card ${judgement ?? ""}`} aria-label={`Immagine di ${currentItem.word}`}><Artwork item={currentItem} eager />{judgement && <i className={`choice-mark ${judgement === "correct" ? "correct-mark" : "wrong-mark"}`}>{judgement === "correct" ? <Check /> : <X />}</i>}</div>
        <div className="naming-controls"><div>
          <button className="naming-wrong" type="button" onClick={() => judge(false)} disabled={Boolean(judgement)}><X />Risposta errata</button>
          <button className="naming-helped" type="button" onClick={() => judge(true, true)} disabled={Boolean(judgement)}><CircleHelp />Corretto con aiuti</button>
          <button className="naming-correct" type="button" onClick={() => judge(true)} disabled={Boolean(judgement)}><Check />Risposta corretta</button>
        </div></div>
      </> : <div className="feedback wrong" role="alert">Nessuna immagine disponibile per questo esercizio.</div>}
    </div>
  </div>;
}

function QuantityObjectIcon({ object }: { object: QuantityObject }) {
  if (object === "candy") return <Candy />;
  if (object === "ladybug") return <Bug />;
  return <Circle fill="currentColor" />;
}

function NumberQuantitySession({ previewLabel, exercise, mode, manualAdvance = false, currentIndex, total, onAttempt, onComplete, onHelp, onExit, soundEffects, onToggleSound, canPrevious, canForward, onPrevious, onForward }: { previewLabel?: "Anteprima" | "Prova"; exercise: Exercise; mode: Mode; manualAdvance?: boolean; currentIndex: number; total: number; onAttempt: (itemId: string, answer: string, correct: boolean) => void; onComplete: () => void; onHelp: (label: string, wordId?: string) => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void } & SessionNavigationProps) {
  const target = exercise.quantityTarget ?? exercise.quantityMin ?? 1;
  const object = exercise.quantityObject ?? (exercise.quantityObjectSet === "mixed" || !exercise.quantityObjectSet ? "candy" : exercise.quantityObjectSet);
  const itemId = `quantity:${exercise.id}:${target}`;
  const prompt = `Tocca ${target} ${quantityObjectLabel(object, target)}`;
  const teachingFlow = mode === "teaching" || previewLabel === "Anteprima";
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [judgement, setJudgement] = useState<"correct" | "wrong" | null>(null);
  const idleTimer = useRef<number | null>(null);
  const progressFill = useRef<HTMLSpanElement>(null);
  const progressAnimation = useRef<Animation | null>(null);
  const resolving = useRef(false);
  const speakPrompt = useCallback(() => speakWord(prompt), [prompt]);
  const completeRound = useCallback((correct: boolean, method: QuantityAnswerMethod) => {
    if (judgement || resolving.current) return;
    resolving.current = true;
    onAttempt(itemId, quantityAnswerId(target, selected.size, method, crypto.randomUUID()), correct);
    playFeedbackTone(correct ? "correct" : "wrong", soundEffects);
    if (!teachingFlow && !manualAdvance) { onComplete(); return; }
    setJudgement(correct ? "correct" : "wrong");
  }, [itemId, judgement, manualAdvance, onAttempt, onComplete, selected.size, soundEffects, target, teachingFlow]);
  const completeRoundRef = useRef(completeRound);
  useEffect(() => { completeRoundRef.current = completeRound; }, [completeRound]);
  useLocalFallbackAdvance(manualAdvance, Boolean(judgement) && !teachingFlow, onComplete, 250);
  useEffect(() => speakPrompt(), [speakPrompt]);
  useEffect(() => {
    const decision = judgement ? null : quantityIdleDecision(mode, selected.size, target, exercise.quantityAutoComplete ?? true, previewLabel === "Anteprima", exercise.quantityIdleSeconds ?? 3);
    if (!decision) return;
    const restartTimer = () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      progressAnimation.current?.cancel();
      progressAnimation.current = progressFill.current?.animate?.([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: decision.delayMs, fill: "forwards", easing: "linear" }) ?? null;
      idleTimer.current = window.setTimeout(() => {
        idleTimer.current = null;
        if (decision.autoResolve) completeRoundRef.current(decision.correct, decision.method);
      }, decision.delayMs);
    };
    window.addEventListener("pointerdown", restartTimer);
    window.addEventListener("keydown", restartTimer);
    restartTimer();
    return () => {
      window.removeEventListener("pointerdown", restartTimer);
      window.removeEventListener("keydown", restartTimer);
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      idleTimer.current = null;
      progressAnimation.current?.cancel();
      progressAnimation.current = null;
    };
  }, [exercise.quantityAutoComplete, exercise.quantityIdleSeconds, judgement, mode, previewLabel, selected.size, target]);
  useEffect(() => () => {
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    progressAnimation.current?.cancel();
  }, []);
  const retry = () => {
    setSelected(new Set());
    setJudgement(null);
    resolving.current = false;
  };
  useRemoteComponentCommand((event) => {
    if (event.command === "mark_correct") completeRound(true, "adult");
    if (event.command === "mark_wrong") completeRound(false, "adult");
    if (event.command === "retry") retry();
  });
  const toggle = (index: number) => {
    if (judgement) return;
    const willSelect = !selected.has(index);
    const next = new Set(selected);
    if (willSelect) next.add(index); else next.delete(index);
    playQuantityTick(willSelect, soundEffects);
    setSelected(next);
  };
  return <div className="session-screen quantity-session">
    <div className="session-header"><div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">Numero quantità</span><strong>{exercise.title}</strong></div><div className="session-progress"><span>{currentIndex + 1} di {total}</span><div><i style={{ width: `${((currentIndex + 1) / total) * 100}%` }} /></div></div><SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} protectedExit={!previewLabel} canPrevious={canPrevious} canForward={canForward} onPrevious={onPrevious} onForward={onForward} /></div>
    <div className="quantity-body"><div className="quantity-prompt"><button type="button" className="listen-button" onClick={speakPrompt}><Volume2 /><span><strong>{prompt}</strong><small>Tocca per riascoltare</small></span></button><div className="quantity-count" aria-live="polite"><span>Obiettivo</span><strong>{target}</strong><small>{selected.size} selezionati</small></div></div><div className={`quantity-field ${judgement ?? ""}`}>{Array.from({ length: 10 }, (_, index) => <button type="button" key={index} className={selected.has(index) ? "selected" : ""} onClick={() => toggle(index)} disabled={Boolean(judgement)} aria-pressed={selected.has(index)} aria-label={`${quantityObjectLabel(object, 1)} ${index + 1}${selected.has(index) ? ", selezionata" : ""}`} style={{ "--quantity-offset": `${((index * 17) % 11) - 5}px`, "--quantity-rotate": `${((index * 29) % 18) - 9}deg` } as React.CSSProperties}><QuantityObjectIcon object={object} />{selected.has(index) && <i><Check /></i>}</button>)}{judgement && <i className={`quantity-result-mark ${judgement === "correct" ? "correct-mark" : "wrong-mark"}`} role="status" aria-label={judgement === "correct" ? "Numero corretto" : "Numero errato"}>{judgement === "correct" ? <Check /> : <X />}</i>}</div>{quantityIdleDecision(mode, selected.size, target, exercise.quantityAutoComplete ?? true, previewLabel === "Anteprima", exercise.quantityIdleSeconds ?? 3) && !judgement && <div className="quantity-time" aria-label={`Tempo di inattività: ${exercise.quantityIdleSeconds ?? 3} secondi`}><div className="quantity-time-track" aria-hidden="true"><span ref={progressFill} /></div></div>}<div className="quantity-controls">{judgement && teachingFlow ? <>{judgement === "wrong" && <button type="button" className="ghost-button" onClick={retry}>Riprova</button>}<button type="button" className="primary-button quantity-continue" onClick={onComplete}><ChevronRight />Continua</button></> : <><button type="button" className="ghost-button" onClick={() => onHelp("Indicazione verbale", itemId)} disabled={Boolean(judgement)}><CircleHelp />Aiuto</button><button type="button" className="naming-wrong" onClick={() => completeRound(false, "adult")} disabled={Boolean(judgement)}><X />Numero errato</button><button type="button" className="naming-correct" onClick={() => completeRound(selected.size === target, "adult")} disabled={Boolean(judgement)}><Check />Numero corretto</button></>}</div>
  </div></div>;
}

function AnswerLabel({ word, wordOnly }: { word: string; wordOnly: boolean }) {
  const labelRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const label = labelRef.current;
    const card = label?.parentElement;
    if (!label || !card) return;
    const context = document.createElement("canvas").getContext("2d");
    let active = true;
    const fit = () => {
      label.style.removeProperty("font-size");
      const style = window.getComputedStyle(label);
      const preferred = parseFloat(style.fontSize);
      const available = label.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      if (!context || available <= 0 || !Number.isFinite(preferred)) return;
      context.font = `${style.fontStyle} ${style.fontWeight} ${preferred}px ${style.fontFamily}`;
      const text = label.textContent ?? "";
      const width = context.measureText(text).width + Math.max(0, text.length - 1) * (parseFloat(style.letterSpacing) || 0);
      if (width > 0) label.style.fontSize = `${Math.max(wordOnly ? 20 : 16, Math.min(preferred, preferred * available * 0.97 / width))}px`;
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(card);
    window.addEventListener("resize", fit);
    fit();
    document.fonts?.ready.then(() => { if (active) fit(); });
    return () => { active = false; observer?.disconnect(); window.removeEventListener("resize", fit); };
  }, [word, wordOnly]);
  return <span ref={labelRef}>{word.toLocaleUpperCase("it-IT")}</span>;
}

function SentenceMatchingSession({ previewLabel, mode, manualAdvance = false, currentIndex, total, exercise, prompt, library, answerState, wrongAnswerId, onChoose, onHelp, onNext, onExit, soundEffects, onToggleSound, canPrevious, canForward, onPrevious, onForward }: { previewLabel?: "Anteprima" | "Prova"; mode: Mode; manualAdvance?: boolean; currentIndex: number; total: number; exercise: Exercise; prompt: LibraryItem; library: LibraryItem[]; answerState: "idle" | "wrong" | "correct"; wrongAnswerId: string | null; onChoose: (id: string) => void; onHelp: (label: string, wordId?: string) => void; onNext: () => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void } & SessionNavigationProps) {
  const [optionIds, setOptionIds] = useState(() => exercise.sourceExerciseId ? exercise.optionIds : shuffled(exercise.optionIds));
  const [sentenceDragOffset, setSentenceDragOffset] = useState({ x: 0, y: 0, active: false });
  const sentenceDragStart = useRef<{ x: number; y: number } | null>(null);
  const sentenceDragMoved = useRef(false);
  const onNextRef = useRef(onNext);
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);
  useRemoteComponentCommand((event) => { if (event.command === "shuffle") setOptionIds((current) => shuffled(current)); });
  const resetSentenceDrag = () => {
    sentenceDragStart.current = null;
    setSentenceDragOffset({ x: 0, y: 0, active: false });
  };
  const startSentenceDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (answerState === "correct") return;
    sentenceDragMoved.current = false;
    sentenceDragStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveSentenceDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!sentenceDragStart.current) return;
    const x = event.clientX - sentenceDragStart.current.x;
    const y = event.clientY - sentenceDragStart.current.y;
    if (!sentenceDragMoved.current && Math.hypot(x, y) < 7) return;
    sentenceDragMoved.current = true;
    event.preventDefault();
    setSentenceDragOffset({ x, y, active: true });
  };
  const finishSentenceDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const moved = sentenceDragMoved.current;
    const target = moved ? document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-answer-id]") : null;
    const answerId = target?.dataset.answerId;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resetSentenceDrag();
    if (moved && answerId) onChoose(answerId);
  };
  useEffect(() => {
    if (answerState !== "correct" || manualAdvance) return;
    const timer = window.setTimeout(() => onNextRef.current(), 750);
    return () => window.clearTimeout(timer);
  }, [answerState, manualAdvance]);
  return <div className="session-screen sentence-matching-session">
    <div className="session-header">
      <div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">Frase → immagine</span><strong>{exercise.title}</strong></div>
      <div className="session-progress"><span>{currentIndex + 1} di {total}</span><div><i style={{ width: `${((currentIndex + 1) / total) * 100}%` }} /></div></div>
      <SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} protectedExit={!previewLabel} canPrevious={canPrevious} canForward={canForward} onPrevious={onPrevious} onForward={onForward} />
    </div>
    <div className="session-body">
      <p className="instruction">Tocca l’immagine corretta oppure trascina la frase sopra l’immagine.</p>
      <button
        type="button"
        className={`sentence-prompt ${sentenceDragOffset.active ? "pointer-dragging" : ""}`}
        style={sentenceDragOffset.active ? { transform: `translate3d(${sentenceDragOffset.x}px, ${sentenceDragOffset.y}px, 0)` } : undefined}
        disabled={answerState === "correct"}
        onClick={(event) => {
          if (sentenceDragMoved.current) { sentenceDragMoved.current = false; event.preventDefault(); return; }
          speakWord(prompt.word);
        }}
        onPointerDown={startSentenceDrag}
        onPointerMove={moveSentenceDrag}
        onPointerUp={finishSentenceDrag}
        onPointerCancel={() => { sentenceDragMoved.current = false; resetSentenceDrag(); }}
        aria-label={`${prompt.word}. Trascina la frase sull’immagine corretta oppure tocca per ascoltarla`}
      ><strong>{prompt.word}</strong><Volume2 /><small>Trascina sulle immagini · tocca per riascoltare</small></button>
      <div className={`answer-grid sentence-answer-grid options-${optionIds.length}`}>{optionIds.map((id) => {
        const item = library.find((candidate) => candidate.id === id);
        if (!item) return null;
        const status = answerState === "correct" && id === prompt.id ? "correct" : wrongAnswerId === id ? "wrong" : "";
        return <button type="button" data-answer-id={id} aria-label={`Immagine: ${item.word}`} className={`answer-card sentence-answer-card ${status}`} disabled={answerState === "correct"} key={id} onClick={() => onChoose(id)}><span className="answer-art"><Artwork item={item} eager /></span>{status === "correct" && <i><Check /></i>}</button>;
      })}</div>
      {answerState === "wrong" && <div className="feedback wrong"><strong>Riprova</strong><small>Guarda bene chi compie l’azione e che cosa sta facendo.</small></div>}
      {answerState === "correct" && <div className="feedback correct"><span>Ben fatto!</span>{manualAdvance && <small>Il terapista passa al prossimo turno dal telefono.</small>}</div>}
    </div>
    {!previewLabel && <HelpDock onHelp={(label) => onHelp(label, prompt.id)} />}
  </div>;
}

function RecognitionSession({ previewLabel, mode, manualAdvance = false, presentation, currentIndex, total, exercise, prompt, library, answerState, wrongAnswerId, onChoose, onHelp, onNext, onExit, soundEffects, onToggleSound, canPrevious, canForward, onPrevious, onForward }: { previewLabel?: "Anteprima" | "Prova"; mode: Mode; manualAdvance?: boolean; presentation: Presentation; currentIndex: number; total: number; exercise: Exercise; prompt: LibraryItem; library: LibraryItem[]; answerState: "idle" | "wrong" | "correct"; wrongAnswerId: string | null; onChoose: (id: string) => void; onHelp: (label: string, wordId?: string) => void; onNext: () => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void } & SessionNavigationProps) {
  const [optionIds, setOptionIds] = useState(() => exercise.sourceExerciseId ? exercise.optionIds : shuffled(exercise.optionIds));
  const [wordDragOffset, setWordDragOffset] = useState({ x: 0, y: 0, active: false });
  const wordDragStart = useRef<{ x: number; y: number } | null>(null);
  const wordDragMoved = useRef(false);
  const onNextRef = useRef(onNext);
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);
  useRemoteComponentCommand((event) => {
    if (event.command === "shuffle") setOptionIds((current) => shuffled(current));
  });
  const resetWordDrag = () => {
    wordDragStart.current = null;
    setWordDragOffset({ x: 0, y: 0, active: false });
  };
  const startWordDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (answerState === "correct") return;
    wordDragMoved.current = false;
    wordDragStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveWordDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!wordDragStart.current) return;
    const x = event.clientX - wordDragStart.current.x;
    const y = event.clientY - wordDragStart.current.y;
    if (!wordDragMoved.current && Math.hypot(x, y) < 7) return;
    wordDragMoved.current = true;
    event.preventDefault();
    setWordDragOffset({ x, y, active: true });
  };
  const finishWordDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const moved = wordDragMoved.current;
    const target = moved ? document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-answer-id]") : null;
    const answerId = target?.dataset.answerId;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resetWordDrag();
    if (moved && answerId) onChoose(answerId);
  };
  useEffect(() => {
    if (answerState !== "correct") return;
    if (manualAdvance) return;
    let cancelled = false;
    let completionTimer: number | null = null;
    const timer = window.setTimeout(() => {
      if (presentation === "words") {
        speakWord(prompt.word, () => {
          if (cancelled) return;
          completionTimer = window.setTimeout(() => onNextRef.current(), 180);
        });
      } else {
        onNextRef.current();
      }
    }, presentation === "words" ? (soundEffects ? 360 : 120) : 750);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (completionTimer) window.clearTimeout(completionTimer);
    };
  }, [answerState, manualAdvance, presentation, prompt.word, soundEffects]);
  return <div className="session-screen recognition-session">
    <div className="session-header">
      <div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">{presentation === "images" ? "Foto + parole" : "Solo parole"}</span><strong>{exercise.title}</strong></div>
      <div className="session-progress"><span>{currentIndex + 1} di {total}</span><div><i style={{ width: `${((currentIndex + 1) / total) * 100}%` }} /></div></div>
      <SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} protectedExit={!previewLabel} canPrevious={canPrevious} canForward={canForward} onPrevious={onPrevious} onForward={onForward} />
    </div>
    <div className={`session-body ${presentation === "words" ? "words-session" : ""}`}>
      <p className="instruction">{presentation === "images" ? "Tocca l’immagine corretta oppure trascina la parola sopra l’immagine." : "Tocca la parola corretta oppure trascina la parola nel box."}</p>
      <button
        type="button"
        className={`draggable-word-prompt ${wordDragOffset.active ? "pointer-dragging" : ""}`}
        style={wordDragOffset.active ? { transform: `translate3d(${wordDragOffset.x}px, ${wordDragOffset.y}px, 0)` } : undefined}
        aria-label={`${prompt.word}. Trascina la parola sul box corretto oppure tocca per ascoltarla`}
        disabled={answerState === "correct"}
        onClick={(event) => {
          if (wordDragMoved.current) { wordDragMoved.current = false; event.preventDefault(); return; }
          speakWord(prompt.word);
        }}
        onPointerDown={startWordDrag}
        onPointerMove={moveWordDrag}
        onPointerUp={finishWordDrag}
        onPointerCancel={() => { wordDragMoved.current = false; resetWordDrag(); }}
      ><strong>{prompt.word.toLocaleUpperCase("it-IT")}</strong><small>{presentation === "images" ? "Trascina sulle immagini" : "Trascina sulle parole · tocca per ascoltare"}</small></button>
      <div className={`answer-grid options-${optionIds.length}`}>{optionIds.map((id) => {
        const item = library.find((entry) => entry.id === id);
        if (!item) return null;
        const isCorrect = id === exercise.promptId;
        const isWrong = wrongAnswerId === id;
        return <button key={id} data-answer-id={id} aria-label={`${item.word}${isWrong ? ", risposta errata" : ""}`} className={`${answerState === "correct" && isCorrect ? "answer-card correct" : "answer-card"} ${isWrong ? "wrong" : ""} ${presentation === "words" ? "word-only" : ""}`} onClick={() => onChoose(id)}>{presentation === "images" && <div className="answer-art"><Artwork item={item} /></div>}<AnswerLabel word={item.word} wordOnly={presentation === "words"} />{answerState === "correct" && isCorrect && <i className="choice-mark correct-mark"><Check /></i>}{isWrong && <i className="choice-mark wrong-mark"><X /></i>}</button>;
      })}</div>
      {answerState === "wrong" && <div className="feedback wrong" role="status"><span>Riproviamo insieme.</span><small>{previewLabel ? "Questa prova non viene registrata." : "Il primo tentativo è stato registrato separatamente."}</small></div>}
      {answerState === "correct" && <div className="feedback correct auto-feedback" role="status"><span>{manualAdvance ? "Risposta registrata. Attendi l’adulto." : currentIndex === total - 1 ? (previewLabel ? "Attività completata" : "Sessione completata") : "Ottimo! Passiamo alla prossima parola…"}</span></div>}
    </div>
    {!previewLabel && <HelpDock onHelp={(label) => onHelp(label, prompt.id)} />}
  </div>;
}

function ArticleSortSession({ previewLabel, exercise, library, mode, manualAdvance = false, currentIndex, total, onAttempt, onComplete, onHelp, onExit, soundEffects, onToggleSound, canPrevious, canForward, onPrevious, onForward }: { previewLabel?: "Anteprima" | "Prova"; exercise: Exercise; library: LibraryItem[]; mode: Mode; manualAdvance?: boolean; currentIndex: number; total: number; onAttempt: (itemId: string, answer: string, correct: boolean) => void; onComplete: () => void; onHelp: (label: string, wordId?: string) => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void } & SessionNavigationProps) {
  const [initialIds] = useState(() => shuffled((exercise.articleItemIds ?? []).filter((id) => library.some((item) => item.id === id && articleFor(item)))).slice(0, Math.max(1, exercise.rounds ?? 6)));
  const [remainingIds, setRemainingIds] = useState(initialIds);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wrongId, setWrongId] = useState<string | null>(null);
  const [wrongArticle, setWrongArticle] = useState<Article | null>(null);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [correctArticle, setCorrectArticle] = useState<Article | null>(null);
  const [feedback, setFeedback] = useState("Tocca IL o LA, oppure trascina l’immagine nel box.");
  const [pointerOffset, setPointerOffset] = useState({ x: 0, y: 0, active: false });
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const pointerMoved = useRef(false);
  const advanceTimer = useRef<number | null>(null);
  useEffect(() => () => { if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current); }, []);
  useEffect(() => {
    remainingIds.slice(0, 3).forEach((id) => {
      const source = library.find((item) => item.id === id)?.image;
      if (!source) return;
      const preload = new window.Image();
      preload.decoding = "async";
      preload.src = source;
    });
  }, [remainingIds, library]);
  const place = (article: Article, explicitId?: string) => {
    if (correctId) return;
    const itemId = explicitId ?? draggedId ?? selectedId ?? currentId;
    if (!itemId) return;
    const item = library.find((entry) => entry.id === itemId);
    const correct = Boolean(item && articleFor(item) === article);
    onAttempt(itemId, article, correct);
    playFeedbackTone(correct ? "correct" : "wrong", soundEffects);
    if (correct) {
      setSelectedId(null);
      setDraggedId(null);
      setWrongId(null);
      setWrongArticle(null);
      setCorrectId(itemId);
      setCorrectArticle(article);
      setFeedback("Giusto! L’immagine è stata abbinata.");
      if (manualAdvance) return;
      advanceTimer.current = window.setTimeout(() => {
        if (remainingIds.length <= 1) onComplete();
        else setRemainingIds((current) => current.filter((id) => id !== itemId));
      }, 750);
    } else {
      setWrongId(itemId);
      setWrongArticle(article);
      setSelectedId(null);
      setDraggedId(null);
      setFeedback("Non è il box giusto: l’immagine torna al suo posto.");
      window.setTimeout(() => { setWrongId((current) => current === itemId ? null : current); setWrongArticle((current) => current === article ? null : current); }, 900);
    }
  };
  const completed = remainingIds.length === 0;
  const currentId = remainingIds[0];
  const currentItem = library.find((entry) => entry.id === currentId);
  useLocalFallbackAdvance(manualAdvance, Boolean(correctId), () => {
    if (remainingIds.length <= 1) onComplete();
    else {
      setRemainingIds((current) => current.filter((id) => id !== correctId));
      setCorrectId(null);
      setCorrectArticle(null);
    }
  }, 750);
  const resetPointerDrag = () => {
    pointerStart.current = null;
    setPointerOffset({ x: 0, y: 0, active: false });
    setDraggedId(null);
  };
  const startPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!currentId || correctId) return;
    pointerMoved.current = false;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggedId(currentId);
  };
  const movePointerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointerStart.current) return;
    const x = event.clientX - pointerStart.current.x;
    const y = event.clientY - pointerStart.current.y;
    if (!pointerMoved.current && Math.hypot(x, y) < 7) return;
    pointerMoved.current = true;
    event.preventDefault();
    setPointerOffset({ x, y, active: true });
  };
  const finishPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const moved = pointerMoved.current;
    const target = moved ? document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-article]") : null;
    const article = target?.dataset.article;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resetPointerDrag();
    if (moved && (article === "IL" || article === "LA")) place(article, currentId);
  };
  return <div className="session-screen article-session">
    <div className="session-header">
      <div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">Categorie</span><strong>{exercise.title}</strong></div>
      <div className="session-progress"><span>{currentIndex + 1} di {total}</span><div><i style={{ width: `${((currentIndex + 1) / total) * 100}%` }} /></div></div>
      <SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} protectedExit={!previewLabel} canPrevious={canPrevious} canForward={canForward} onPrevious={onPrevious} onForward={onForward} />
    </div>
    <div className="article-body">
      <p className="instruction">Tocca l’articolo corretto oppure trascina l’immagine nel box.</p>
      <h1>IL O LA?</h1>
      {completed ? <div className="article-complete"><span className="complete-check"><Check /></span><h2>Ottimo lavoro!</h2><p>Tutte le immagini sono state abbinate.</p><button className="primary-button large" onClick={onComplete}>{currentIndex === total - 1 ? (previewLabel ? "Chiudi" : "Concludi") : "Prossimo esercizio"}</button></div> : currentItem ? <>
        <div className="article-tray single">
          <button
            type="button"
            draggable={false}
            aria-pressed={selectedId === currentId}
            aria-label={`Immagine ${currentItem.word}. Scegli IL o LA, oppure trascinala nel box${wrongId === currentId ? ". Scelta errata" : ""}`}
            className={`article-card ${selectedId === currentId ? "selected" : ""} ${wrongId === currentId ? "wrong-return" : ""} ${correctId === currentId ? "correct" : ""} ${pointerOffset.active ? "pointer-dragging" : ""}`}
            style={pointerOffset.active ? { transform: `translate3d(${pointerOffset.x}px, ${pointerOffset.y}px, 0)` } : undefined}
            onClick={(event) => {
              if (pointerMoved.current) { pointerMoved.current = false; event.preventDefault(); return; }
              setSelectedId((current) => current === currentId ? null : currentId);
            }}
            onPointerDown={startPointerDrag}
            onPointerMove={movePointerDrag}
            onPointerUp={finishPointerDrag}
            onPointerCancel={() => { pointerMoved.current = false; resetPointerDrag(); }}
          >
            <div className="article-art"><Artwork key={currentItem.id} item={currentItem} eager /></div>
            <strong>{currentItem.word.toLocaleUpperCase("it-IT")}</strong>
            {correctId === currentId && <i className="choice-mark correct-mark"><Check /></i>}
          </button>
        </div>
        <div className="article-boxes">{(["IL", "LA"] as Article[]).map((article) => <button type="button" data-article={article} className={`article-dropbox ${wrongArticle === article ? "wrong" : ""} ${correctArticle === article ? "correct" : ""}`} key={article} aria-label={`Assegna ${currentItem.word} a ${article}${wrongArticle === article ? ". Scelta errata" : ""}`} onClick={() => place(article)}><span>{article}</span><small>{correctArticle === article ? "Corretto" : "Tocca qui"}</small></button>)}</div>
        <p className={wrongId ? "article-feedback wrong" : correctId ? "article-feedback correct" : "article-feedback"} role="status">{feedback}</p>
      </> : null}
    </div>
    {!previewLabel && currentId && <HelpDock onHelp={(label) => onHelp(label, currentId)} />}
  </div>;
}

function WordCategorySession({ previewLabel, exercise, library, mode, manualAdvance = false, currentIndex, total, onAttempt, onComplete, onHelp, onExit, soundEffects, onToggleSound, canPrevious, canForward, onPrevious, onForward }: { previewLabel?: "Anteprima" | "Prova"; exercise: Exercise; library: LibraryItem[]; mode: Mode; manualAdvance?: boolean; currentIndex: number; total: number; onAttempt: (itemId: string, answer: string, correct: boolean) => void; onComplete: () => void; onHelp: (label: string, wordId?: string) => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void } & SessionNavigationProps) {
  const categories = useMemo(() => exercise.categoryNames ?? [], [exercise.categoryNames]);
  const [categoryOrder, setCategoryOrder] = useState(() => shuffled(categories));
  const candidates = useMemo(() => library.filter((item) => categories.includes(item.category)), [library, categories]);
  const [initialIds] = useState(() => pickCategoryRoundIds(candidates, exercise.categoryItemIds, exercise.rounds ?? 6));
  const [remainingIds, setRemainingIds] = useState(initialIds);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [wrongId, setWrongId] = useState<string | null>(null);
  const [wrongCategory, setWrongCategory] = useState<string | null>(null);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [correctCategory, setCorrectCategory] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("Tocca la categoria corretta oppure trascina la parola nel box.");
  const [pointerOffset, setPointerOffset] = useState({ x: 0, y: 0, active: false });
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const pointerMoved = useRef(false);
  const advanceTimer = useRef<number | null>(null);
  useEffect(() => () => { if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current); }, []);
  const currentId = remainingIds[0];
  const currentItem = candidates.find((item) => item.id === currentId);
  const completed = remainingIds.length === 0;
  useLocalFallbackAdvance(manualAdvance, Boolean(correctId), () => {
    if (remainingIds.length <= 1) onComplete();
    else {
      setRemainingIds((current) => current.filter((id) => id !== correctId));
      setCorrectId(null);
      setCorrectCategory(null);
    }
  }, 750);
  useRemoteComponentCommand((event) => {
    if (event.command !== "shuffle") return;
    setCategoryOrder((current) => shuffled(current));
    setSelectedId(null); setDraggedId(null); setWrongId(null); setWrongCategory(null); setCorrectId(null); setCorrectCategory(null);
    setFeedback("Le categorie sono state rimescolate. Prova ancora.");
  });
  const place = (category: string, explicitId?: string) => {
    if (correctId) return;
    const itemId = explicitId ?? draggedId ?? selectedId ?? currentId;
    if (!itemId) return;
    const item = candidates.find((candidate) => candidate.id === itemId);
    const correct = item?.category === category;
    onAttempt(itemId, category, correct);
    playFeedbackTone(correct ? "correct" : "wrong", soundEffects);
    if (correct) {
      setSelectedId(null); setDraggedId(null); setWrongId(null); setWrongCategory(null);
      setCorrectId(itemId); setCorrectCategory(category);
      setFeedback("Giusto! La parola è nella categoria corretta.");
      if (manualAdvance) return;
      advanceTimer.current = window.setTimeout(() => {
        if (remainingIds.length <= 1) onComplete();
        else setRemainingIds((current) => current.filter((id) => id !== itemId));
      }, 750);
    } else {
      setSelectedId(null); setDraggedId(null); setWrongId(itemId); setWrongCategory(category);
      setFeedback("Questa non è la categoria giusta. Riprova.");
      window.setTimeout(() => { setWrongId((current) => current === itemId ? null : current); setWrongCategory((current) => current === category ? null : current); }, 900);
    }
  };
  const resetPointerDrag = () => {
    pointerStart.current = null;
    setPointerOffset({ x: 0, y: 0, active: false });
    setDraggedId(null);
  };
  const startPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!currentId || correctId) return;
    pointerMoved.current = false;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggedId(currentId);
  };
  const movePointerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointerStart.current) return;
    const x = event.clientX - pointerStart.current.x;
    const y = event.clientY - pointerStart.current.y;
    if (!pointerMoved.current && Math.hypot(x, y) < 7) return;
    pointerMoved.current = true;
    event.preventDefault();
    setPointerOffset({ x, y, active: true });
  };
  const finishPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const moved = pointerMoved.current;
    const target = moved ? document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-category]") : null;
    const category = target?.dataset.category;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    resetPointerDrag();
    if (moved && category) place(category, currentId);
  };
  return <div className="session-screen article-session word-category-session"><div className="session-header"><div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">Parola → categoria</span><strong>{exercise.title}</strong></div><div className="session-progress"><span>{currentIndex + 1} di {total}</span><div><i style={{ width: `${((currentIndex + 1) / total) * 100}%` }} /></div></div><SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} protectedExit={!previewLabel} canPrevious={canPrevious} canForward={canForward} onPrevious={onPrevious} onForward={onForward} /></div><div className="article-body"><p className="instruction">Metti la parola nella categoria giusta.</p>{completed ? <div className="article-complete"><span className="complete-check"><Check /></span><h2>Ottimo lavoro!</h2><p>Tutte le parole sono state classificate.</p><button className="primary-button large" onClick={onComplete}>{currentIndex === total - 1 ? (previewLabel ? "Chiudi" : "Concludi") : "Prossimo esercizio"}</button></div> : currentItem ? <><div className="word-category-tray"><button type="button" draggable={false} aria-pressed={selectedId === currentId} aria-label={`${currentItem.word}. Trascina la parola nella categoria corretta oppure tocca per selezionarla${wrongId === currentId ? ". Scelta errata" : ""}`} className={`word-category-card ${selectedId === currentId ? "selected" : ""} ${wrongId === currentId ? "wrong-return" : ""} ${correctId === currentId ? "correct" : ""} ${pointerOffset.active ? "pointer-dragging" : ""}`} style={pointerOffset.active ? { transform: `translate3d(${pointerOffset.x}px, ${pointerOffset.y}px, 0)` } : undefined} onClick={(event) => { if (pointerMoved.current) { pointerMoved.current = false; event.preventDefault(); return; } setSelectedId((current) => current === currentId ? null : currentId); }} onPointerDown={startPointerDrag} onPointerMove={movePointerDrag} onPointerUp={finishPointerDrag} onPointerCancel={() => { pointerMoved.current = false; resetPointerDrag(); }}>{currentItem.word.toLocaleUpperCase("it-IT")}{correctId === currentId && <i className="choice-mark correct-mark"><Check /></i>}</button></div><div className={`article-boxes category-count-${categoryOrder.length}`}>{categoryOrder.map((category) => <button type="button" data-category={category} className={`article-dropbox word-category-box ${wrongCategory === category ? "wrong" : ""} ${correctCategory === category ? "correct" : ""}`} key={category} aria-label={`${category}${wrongCategory === category ? ". Scelta errata" : ""}`} onClick={() => place(category)}><span>{category.toLocaleUpperCase("it-IT")}</span><small>{correctCategory === category ? "Corretto" : "Tocca qui"}</small></button>)}</div><p className={wrongId ? "article-feedback wrong" : correctId ? "article-feedback correct" : "article-feedback"} role="status">{feedback}</p></> : <div className="feedback wrong" role="alert">Nessuna parola disponibile per queste categorie.</div>}</div>{!previewLabel && currentId && <HelpDock onHelp={(label) => onHelp(label, currentId)} />}</div>;
}

function HelpDock({ onHelp }: { onHelp: (label: string) => void }) {
  return <aside className="help-dock"><div><CircleHelp /><span><strong>Aiuti dell’adulto</strong><small>Scegli solo quando serve</small></span></div><div className="help-actions">{helpTypes.map((help) => <button key={help} onClick={() => onHelp(help)}>{help}</button>)}</div></aside>;
}

type ProgressKind = "recognition" | "articles" | "word-categories" | "naming" | "number-quantity" | "sentence-matching";
type ProgressCell = { total: number; correct: number; percent: number | null };
type MonthlyProgress = { month: string; label: string; recognition?: number; articles?: number; "word-categories"?: number; naming?: number; "number-quantity"?: number; "sentence-matching"?: number };

function ProgressScore({ cell }: { cell: ProgressCell }) {
  if (cell.percent === null) return <span className="score-cell empty">—<small>Nessuna prova</small></span>;
  const tone = cell.percent >= 80 ? "strong" : cell.percent >= 50 ? "developing" : "attention";
  return <span className={`score-cell ${tone}`}><strong>{cell.percent}%</strong><small>{cell.correct}/{cell.total} corrette</small></span>;
}

function LearningProgressChart({ points, word }: { points: MonthlyProgress[]; word: string }) {
  const width = 760;
  const height = 300;
  const left = 52;
  const right = 20;
  const top = 22;
  const bottom = 48;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const x = (index: number) => left + (points.length === 1 ? innerWidth / 2 : (index / Math.max(1, points.length - 1)) * innerWidth);
  const y = (value: number) => top + ((100 - value) / 100) * innerHeight;
  const series = [
    { key: "recognition" as const, label: "Trova la parola", color: "#7468df" },
    { key: "articles" as const, label: "Articolo IL / LA", color: "#33a37a" },
    { key: "word-categories" as const, label: "Parola → categoria", color: "#e19445" },
    { key: "naming" as const, label: "Mix and vary", color: "#d15b8f" },
    { key: "sentence-matching" as const, label: "Abbina la frase", color: "#2f82a5" },
  ];
  const coordinates = (key: ProgressKind) => points.flatMap((point, index) => point[key] === undefined ? [] : [`${x(index)},${y(point[key]!)}`]).join(" ");
  return <div className="learning-chart"><div className="chart-legend">{series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>{points.length ? <><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Evoluzione mensile di ${word}: mesi sull’asse orizzontale e percentuale sull’asse verticale`}><title>Evoluzione mensile di {word}</title>{[0, 25, 50, 75, 100].map((value) => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="chart-grid" /><text x={left - 10} y={y(value) + 4} textAnchor="end" className="chart-axis-label">{value}%</text></g>)}{points.map((point, index) => <text key={point.month} x={x(index)} y={height - 18} textAnchor="middle" className="chart-axis-label">{point.label}</text>)}{series.map((item) => <g key={item.key}>{coordinates(item.key) && <polyline points={coordinates(item.key)} fill="none" stroke={item.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}{points.map((point, index) => point[item.key] === undefined ? null : <circle key={point.month} cx={x(index)} cy={y(point[item.key]!)} r="6" fill={item.color}><title>{item.label}, {point.label}: {point[item.key]}%</title></circle>)}</g>)}</svg>{points.length < 2 && <p className="chart-guidance">Servono rilevazioni in almeno due mesi per mostrare una tendenza.</p>}</> : <div className="empty-mini"><BarChart3 /><p>Nessuna rilevazione per questa parola.</p><small>Il grafico apparirà dopo la prima prova.</small></div>}</div>;
}

function StatsView({ child, therapist, therapists, attempts, helps, histories, exercises, library, onSaveHistoryComment, onDeleteHistory, onDeleteAllHistory, onReset }: { child: ChildProfile; therapist: Therapist; therapists: Therapist[]; attempts: Attempt[]; helps: HelpEvent[]; histories: SessionHistoryRecord[]; exercises: Exercise[]; library: LibraryItem[]; onSaveHistoryComment: (id: string, comment: string) => void; onDeleteHistory: (id: string, label: string) => void; onDeleteAllHistory: () => void; onReset: () => void }) {
  const [selectedMode, setSelectedMode] = useState<Mode>("test");
  const [selectedWordId, setSelectedWordId] = useState("");
  const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const itemMap = new Map(library.map((item) => [item.id, item]));
  const attemptWordId = (attempt: Attempt) => attempt.wordId?.startsWith("quantity:") ? undefined : attempt.wordId ?? (attempt.exerciseId.startsWith("article-") ? attempt.exerciseId.slice(8) : exerciseMap.get(attempt.exerciseId)?.promptId);
  const attemptKind = (attempt: Attempt): ProgressKind => exerciseKind(exerciseMap.get(attempt.exerciseId) ?? { id: attempt.exerciseId, title: "", kind: attempt.exerciseId.startsWith("article-") ? "articles" : "recognition", optionIds: [], updatedAt: "" });
  const helpWordId = (help: HelpEvent) => help.wordId?.startsWith("quantity:") ? undefined : help.wordId ?? exerciseMap.get(help.exerciseId)?.promptId;
  const allWordIds = new Set<string>();
  attempts.forEach((attempt) => { const wordId = attemptWordId(attempt); if (wordId) allWordIds.add(wordId); });
  helps.forEach((help) => { const wordId = helpWordId(help); if (wordId) allWordIds.add(wordId); });
  const modeAttempts = attempts.filter((attempt) => attempt.firstAttempt && attempt.mode === selectedMode);
  const modeHelps = helps.filter((help) => !help.mode || help.mode === selectedMode);
  const scoreFor = (wordId: string, kind: ProgressKind): ProgressCell => {
    const matching = modeAttempts.filter((attempt) => attemptWordId(attempt) === wordId && attemptKind(attempt) === kind);
    const correct = matching.filter((attempt) => attempt.correct).length;
    return { total: matching.length, correct, percent: matching.length ? Math.round((correct / matching.length) * 100) : null };
  };
  const rows = [...allWordIds].map((wordId) => ({
    wordId,
    label: itemMap.get(wordId)?.word ?? wordId,
    recognition: scoreFor(wordId, "recognition"),
    articles: scoreFor(wordId, "articles"),
    wordCategories: scoreFor(wordId, "word-categories"),
    naming: scoreFor(wordId, "naming"),
    sentenceMatching: scoreFor(wordId, "sentence-matching"),
    helpCount: modeHelps.filter((help) => helpWordId(help) === wordId).length,
  })).sort((a, b) => a.label.localeCompare(b.label, "it"));
  const activeWordId = rows.some((row) => row.wordId === selectedWordId) ? selectedWordId : rows[0]?.wordId ?? "";
  const activeRow = rows.find((row) => row.wordId === activeWordId);
  const monthMap = new Map<string, Record<ProgressKind, { total: number; correct: number }>>();
  modeAttempts.filter((attempt) => attemptWordId(attempt) === activeWordId).forEach((attempt) => {
    const month = attempt.createdAt.slice(0, 7);
    const kind = attemptKind(attempt);
    const record = monthMap.get(month) ?? { recognition: { total: 0, correct: 0 }, articles: { total: 0, correct: 0 }, "word-categories": { total: 0, correct: 0 }, naming: { total: 0, correct: 0 }, "number-quantity": { total: 0, correct: 0 }, "sentence-matching": { total: 0, correct: 0 } };
    record[kind].total += 1;
    if (attempt.correct) record[kind].correct += 1;
    monthMap.set(month, record);
  });
  const monthly: MonthlyProgress[] = [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, values]) => {
    const [year, monthNumber] = month.split("-").map(Number);
    const label = new Intl.DateTimeFormat("it-IT", { month: "short", year: "2-digit" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
    return { month, label, recognition: values.recognition.total ? Math.round(values.recognition.correct / values.recognition.total * 100) : undefined, articles: values.articles.total ? Math.round(values.articles.correct / values.articles.total * 100) : undefined, "word-categories": values["word-categories"].total ? Math.round(values["word-categories"].correct / values["word-categories"].total * 100) : undefined, naming: values.naming.total ? Math.round(values.naming.correct / values.naming.total * 100) : undefined, "number-quantity": values["number-quantity"].total ? Math.round(values["number-quantity"].correct / values["number-quantity"].total * 100) : undefined, "sentence-matching": values["sentence-matching"].total ? Math.round(values["sentence-matching"].correct / values["sentence-matching"].total * 100) : undefined };
  });
  const firstCorrect = modeAttempts.filter((attempt) => attempt.correct).length;
  const accuracy = modeAttempts.length ? Math.round(firstCorrect / modeAttempts.length * 100) : 0;
  const activeHelps = modeHelps.filter((help) => helpWordId(help) === activeWordId);
  const sortedHistories = [...histories].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const modeCopy = selectedMode === "test" ? "Mostra il primo tentativo prima delle correzioni: è la vista principale per osservare acquisizione e mantenimento." : "Mostra la pratica guidata. Risultati e aiuti descrivono il supporto necessario durante l’insegnamento e restano separati dalla valutazione.";
  const downloadCsv = (exportAttempts: Attempt[]) => downloadProgressCsv(exportAttempts, exercises, library);
  return <div className="page stats-page"><section className="page-title-row"><div><span className="eyebrow">RISULTATI</span><h1>Progressi di {child.firstName}</h1><p>Consulta le sessioni svolte, poi confronta ogni parola e l’andamento mensile.</p></div><div className="stats-actions"><button className="ghost-button" onClick={() => downloadCsv(attempts)}>Esporta CSV</button><button className="danger-button subtle" disabled={!attempts.length && !helps.length} onClick={onReset}><Trash2 />Azzera statistiche</button></div></section><section className="panel session-history-panel"><div className="panel-heading"><div><span className="eyebrow">STORICO SESSIONI</span><h3>Risultati a colpo d’occhio</h3><p>Verde indica una risposta corretta al primo tentativo; rosso evidenzia gli errori iniziali.</p></div><div className="history-heading-actions"><span>{sortedHistories.length} sessioni</span>{therapist.role === "Amministratore" && <button className="danger-button subtle" disabled={!sortedHistories.length} onClick={onDeleteAllHistory}><Trash2 />Cancella storico</button>}</div></div>{sortedHistories.length ? <div className="session-history-list">{sortedHistories.map((record) => <SessionHistoryCard key={record.id} record={record} therapistName={therapists.find((item) => item.id === record.therapistId)} canEditComment={therapist.role === "Amministratore" || therapist.id === record.therapistId} canDelete={therapist.role === "Amministratore"} onSaveComment={onSaveHistoryComment} onDelete={onDeleteHistory} />)}</div> : <div className="empty-mini"><FolderHeart /><p>Nessuna sessione archiviata.</p><small>Le nuove sessioni completate compariranno qui con risposte, immagini e valutazione.</small></div>}</section><section className="stats-mode-card"><div className="stats-mode-picker"><button className={selectedMode === "test" ? "selected" : ""} onClick={() => setSelectedMode("test")}><BookOpenCheck /><span><strong>Valutazione</strong><small>Padronanza al primo tentativo</small></span></button><button className={selectedMode === "teaching" ? "selected" : ""} onClick={() => setSelectedMode("teaching")}><Sparkles /><span><strong>Insegnamento</strong><small>Pratica guidata e supporti</small></span></button></div><p>{modeCopy}</p></section><section className="stats-strip"><div><small>Accuratezza</small><strong>{accuracy}%</strong><span>primi tentativi</span></div><div><small>Prove osservate</small><strong>{modeAttempts.length}</strong><span>nella modalità scelta</span></div><div><small>Parole osservate</small><strong>{rows.length}</strong><span>con dati registrati</span></div><div><small>Aiuti registrati</small><strong>{modeHelps.length}</strong><span>nella modalità scelta</span></div></section><section className="panel progress-matrix-panel"><div className="panel-heading"><div><span className="eyebrow">COLPO D’OCCHIO</span><h3>Parole × tipologia di attività</h3><p>Seleziona una riga per vedere l’evoluzione nel tempo.</p></div><div className="score-key"><span className="strong">≥ 80%</span><span className="developing">50–79%</span><span className="attention">&lt; 50%</span></div></div>{rows.length ? <div className="progress-matrix" role="table" aria-label="Risultati per parola e tipologia di attività"><div className="matrix-row matrix-header" role="row"><span role="columnheader">Parola</span><span role="columnheader">Trova la parola</span><span role="columnheader">Articolo IL / LA</span><span role="columnheader">Parola → categoria</span><span role="columnheader">Mix and vary</span><span role="columnheader">Aiuti</span></div>{rows.map((row) => <button type="button" className={`matrix-row ${row.wordId === activeWordId ? "selected" : ""}`} key={row.wordId} onClick={() => setSelectedWordId(row.wordId)} role="row"><strong role="cell">{row.label.toLocaleUpperCase("it-IT")}</strong><span role="cell"><ProgressScore cell={row.recognition} /></span><span role="cell"><ProgressScore cell={row.articles} /></span><span role="cell"><ProgressScore cell={row.wordCategories} /></span><span role="cell"><ProgressScore cell={row.naming} /></span><span role="cell" className="help-total"><CircleHelp />{row.helpCount}</span></button>)}</div> : <div className="empty-mini"><BarChart3 /><p>Nessun dato registrato.</p><small>I risultati compariranno dopo la prima attività.</small></div>}</section>{activeRow && <section className="stats-detail-grid"><div className="panel temporal-panel"><div className="panel-heading"><div><span className="eyebrow">EVOLUZIONE TEMPORALE</span><h3>{activeRow.label}</h3><p>Mesi sull’asse X, accuratezza sul primo tentativo sull’asse Y.</p></div></div><LearningProgressChart points={monthly} word={activeRow.label} /></div><div className="panel word-help-panel"><span className="eyebrow">AIUTI PER PAROLA</span><h3>{activeRow.label}</h3>{activeHelps.length ? <div className="help-counts">{[...helpTypes, "Risposta aiutata"].map((label) => { const count = activeHelps.filter((help) => help.label === label).length; return count ? <div key={label}><span>{label}</span><strong>{count}</strong></div> : null; })}</div> : <div className="empty-mini"><CircleHelp /><p>Nessun aiuto registrato.</p><small>Per questa parola e modalità.</small></div>}</div></section>}<div className="data-note"><CircleHelp /><p><strong>Come leggere i dati</strong><br />La valutazione misura la risposta iniziale e va usata per la tendenza di apprendimento. L’insegnamento mostra invece quanto supporto serve durante la pratica. Una sola rilevazione non definisce una tendenza.</p></div></div>;
}

function historyArtworkItem(snapshot: HistoryImageSnapshot): LibraryItem {
  return { id: snapshot.itemId, word: snapshot.word, category: snapshot.category, emoji: snapshot.emoji, image: snapshot.remoteImageId ? `/api/media/${encodeURIComponent(snapshot.remoteImageId)}` : snapshot.image, imageKey: snapshot.imageKey, remoteImageId: snapshot.remoteImageId, source: "Storico sessione", license: "Archiviata", author: "—" };
}

function SessionHistoryCard({ record, therapistName, canEditComment, canDelete, onSaveComment, onDelete }: { record: SessionHistoryRecord; therapistName?: Therapist; canEditComment: boolean; canDelete: boolean; onSaveComment: (id: string, comment: string) => void; onDelete: (id: string, label: string) => void }) {
  const [comment, setComment] = useState(record.comment);
  const correct = record.items.filter((item) => item.firstCorrect).length;
  const accuracy = record.items.length ? Math.round(correct / record.items.length * 100) : 0;
  const date = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(record.completedAt));
  return <details className="session-history-card"><summary><div className={`history-score ${accuracy >= 80 ? "good" : accuracy >= 50 ? "mixed" : "low"}`}><strong>{accuracy}%</strong><small>{correct}/{record.items.length}</small></div><div className="history-summary-copy"><strong>{record.title}</strong><span>{date} · {record.mode === "test" ? "Valutazione" : "Insegnamento"} · {therapistName ? `${therapistName.firstName} ${therapistName.lastName}` : "Profilo archiviato"}</span><div className="history-result-strip" aria-label={`${correct} risposte corrette su ${record.items.length}`}>{record.items.map((item) => <span key={item.id} className={item.firstCorrect ? "correct" : "wrong"} title={`${item.target?.word ?? item.exerciseTitle}: ${item.firstCorrect ? "corretta" : "errore al primo tentativo"}`}>{item.target && historyItemUsesArtwork(item) ? <Artwork item={historyArtworkItem(item.target)} compact /> : <BookOpenCheck />}{item.firstCorrect ? <Check /> : <X />}</span>)}</div></div><ChevronRight className="history-chevron" /></summary><div className="history-details"><div className="history-turn-grid">{record.items.map((item, index) => <article className={item.firstCorrect ? "history-turn correct" : "history-turn wrong"} key={item.id}><div className="history-turn-heading"><span className="history-thumb">{item.target && historyItemUsesArtwork(item) ? <Artwork item={historyArtworkItem(item.target)} compact eager /> : <BookOpenCheck />}</span><div><small>{index + 1} · {item.exerciseTitle}</small><strong>{item.target?.word ?? "Risposta"}</strong></div><span className="history-outcome">{item.firstCorrect ? <><Check />Corretta</> : <><X />Errore iniziale</>}</span></div><div className="history-response-list">{item.responses.map((response, responseIndex) => <span className={response.correct ? "correct" : "wrong"} key={`${response.answerId}:${responseIndex}`}>{response.firstAttempt ? "1°: " : `${responseIndex + 1}°: `}{response.label} {response.correct ? "✓" : "✕"}</span>)}</div>{item.options.length > 1 && <p className="history-options"><strong>Opzioni mostrate:</strong> {item.options.map((option) => option.word).join(", ")}</p>}{item.helpLabels.length > 0 && <p className="history-helps"><CircleHelp />{item.helpLabels.join(" · ")}</p>}</article>)}</div><label className="history-comment">Valutazione della sessione<textarea rows={3} value={comment} readOnly={!canEditComment} onChange={(event) => setComment(event.target.value)} placeholder="Nessuna valutazione inserita." /></label><div className="history-card-actions">{canDelete && <button className="danger-button subtle" onClick={() => onDelete(record.id, `la sessione “${record.title}”`)}><Trash2 />Elimina storico</button>}{canEditComment && <button className="ghost-button" onClick={() => onSaveComment(record.id, comment)}><Save />Salva valutazione</button>}</div></div></details>;
}

function AdminPanel({ therapists, childProfiles, onSave, onRequestDelete }: { therapists: Therapist[]; childProfiles: ChildProfile[]; onSave: (therapists: Therapist[]) => void; onRequestDelete: (item: { kind: "therapist"; id: string; name: string }) => void }) {
  const [drafts, setDrafts] = useState(therapists);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [newRole, setNewRole] = useState<Exclude<ProfileRole, "Amministratore">>("Terapista");
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>(childProfiles[0] ? [childProfiles[0].id] : []);
  const [pinDrafts, setPinDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const toggleAssignment = (therapistId: string, childId: string) => setDrafts((current) => current.map((item) => item.id === therapistId ? { ...item, childIds: item.childIds.includes(childId) ? item.childIds.filter((id) => id !== childId) : [...item.childIds, childId] } : item));
  const changeRole = (therapistId: string, role: Exclude<ProfileRole, "Amministratore">) => setDrafts((current) => current.map((item) => item.id === therapistId ? { ...item, role } : item));
  const updateAdult = (therapistId: string, field: "firstName" | "lastName" | "email", value: string) => setDrafts((current) => current.map((item) => item.id === therapistId ? { ...item, [field]: value } : item));
  const persistAssignments = async () => {
    const editable = drafts.filter((item) => item.role !== "Amministratore");
    if (editable.some((item) => !item.firstName.trim() || !item.lastName.trim() || !item.email.trim())) { setError("Nome, cognome ed email sono obbligatori per ogni profilo."); return; }
    if (editable.some((item) => !item.childIds.length)) { setError("Ogni profilo deve restare associato ad almeno un bambino."); return; }
    const emails = drafts.map((item) => item.email.trim().toLowerCase());
    if (new Set(emails).size !== emails.length) { setError("Ogni profilo deve avere un’email diversa."); return; }
    if (Object.values(pinDrafts).some((value) => value && value.length < 4)) { setError("Il nuovo PIN deve contenere almeno 4 cifre."); return; }
    const updated = await Promise.all(drafts.map(async (item) => ({ ...item, firstName: item.firstName.trim(), lastName: item.lastName.trim(), email: item.email.trim().toLowerCase(), pinHash: pinDrafts[item.id] ? await hashPin(pinDrafts[item.id]) : item.pinHash, pin: undefined })));
    setError("");
    setDrafts(updated);
    setPinDrafts({});
    onSave(updated);
  };
  const addTherapist = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (drafts.some((item) => item.email.toLowerCase() === normalizedEmail)) { setError("Esiste già un profilo con questa email."); return; }
    if (pin.length < 4 || !selectedChildIds.length) { setError("Inserisci un PIN di almeno 4 cifre e associa almeno un bambino."); return; }
    const created: Therapist = { id: crypto.randomUUID(), firstName: firstName.trim(), lastName: lastName.trim(), email: normalizedEmail, role: newRole, pinHash: await hashPin(pin), childIds: selectedChildIds };
    const next = [...drafts, created];
    setDrafts(next);
    onSave(next);
    setFirstName(""); setLastName(""); setEmail(""); setPin(""); setNewRole("Terapista"); setSelectedChildIds(childProfiles[0] ? [childProfiles[0].id] : []); setError("");
  };
  return <section className="profile-section admin-panel"><div className="section-heading"><div><span className="eyebrow">AMMINISTRAZIONE</span><h2>Profili adulti e associazioni</h2><p>L’amministratore può aggiornare dati, credenziali, ruolo e bambini associati agli altri profili.</p></div><span>{drafts.length} profili</span></div><div className="therapist-assignment-list">{drafts.map((item) => <article key={item.id}><div className="admin-adult-heading"><span className="avatar">{`${item.firstName[0] ?? ""}${item.lastName[0] ?? ""}`}</span><span><strong>{item.firstName} {item.lastName}</strong><small>{item.email}</small></span></div>{item.role === "Amministratore" ? <p className="field-note">Profilo amministratore · modificabile nella sezione personale qui sotto.</p> : <><div className="admin-adult-fields"><label>Nome<input value={item.firstName} onChange={(event) => updateAdult(item.id, "firstName", event.target.value)} /></label><label>Cognome<input value={item.lastName} onChange={(event) => updateAdult(item.id, "lastName", event.target.value)} /></label><label>Email<input type="email" value={item.email} onChange={(event) => updateAdult(item.id, "email", event.target.value)} /></label><label>Ruolo<select value={item.role} onChange={(event) => changeRole(item.id, event.target.value as Exclude<ProfileRole, "Amministratore">)}><option value="Terapista">Terapista</option><option value="Genitore">Genitore</option><option value="Supervisore">Supervisore</option></select></label><label className="admin-pin-field">Nuovo PIN (opzionale)<input type="password" inputMode="numeric" minLength={4} maxLength={8} value={pinDrafts[item.id] ?? ""} onChange={(event) => setPinDrafts((current) => ({ ...current, [item.id]: event.target.value.replace(/\D/g, "") }))} placeholder="Lascia vuoto per non cambiarlo" /></label></div><fieldset><legend>Bambini associati</legend>{childProfiles.map((child) => <label key={child.id}><input type="checkbox" checked={item.childIds.includes(child.id)} onChange={() => toggleAssignment(item.id, child.id)} />{child.firstName} {child.lastName}</label>)}</fieldset><button className="danger-button subtle admin-delete-therapist" type="button" onClick={() => onRequestDelete({ kind: "therapist", id: item.id, name: `${item.firstName} ${item.lastName}` })}><Trash2 />Elimina</button></>}</article>)}</div>{error && <p className="form-error" role="alert">{error}</p>}<div className="admin-save-row"><p>Le modifiche diventano attive al prossimo accesso del profilo.</p><button className="ghost-button" type="button" onClick={persistAssignments}><Save />Salva modifiche ai profili</button></div><form className="admin-create-form" onSubmit={addTherapist}><div className="section-heading"><div><h3>Aggiungi profilo adulto</h3><p>Crea le credenziali, assegna il ruolo e scegli subito i bambini associati.</p></div></div><div className="profile-form"><label>Nome<input value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></label><label>Cognome<input value={lastName} onChange={(event) => setLastName(event.target.value)} required /></label><label>Email<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} required /></label><label>Ruolo<select value={newRole} onChange={(event) => setNewRole(event.target.value as Exclude<ProfileRole, "Amministratore">)}><option value="Terapista">Terapista</option><option value="Genitore">Genitore</option><option value="Supervisore">Supervisore</option></select></label><label>PIN iniziale<input type="password" inputMode="numeric" minLength={4} maxLength={8} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} required /></label></div><fieldset className="new-therapist-children"><legend>Associa almeno un bambino</legend>{childProfiles.map((child) => <label key={child.id}><input type="checkbox" checked={selectedChildIds.includes(child.id)} onChange={() => setSelectedChildIds((current) => current.includes(child.id) ? current.filter((id) => id !== child.id) : [...current, child.id])} />{child.firstName} {child.lastName}</label>)}</fieldset><button className="primary-button" type="submit"><Plus />Aggiungi profilo</button></form></section>;
}

function ProfilesView({ therapist, therapists, childProfiles, allChildren, activeChildId, canDeleteTherapist, onSelectChild, onSaveTherapist, onSaveTherapists, onSaveChild, onRequestDelete }: { therapist: Therapist; therapists: Therapist[]; childProfiles: ChildProfile[]; allChildren: ChildProfile[]; activeChildId: string; canDeleteTherapist: boolean; onSelectChild: (id: string) => void; onSaveTherapist: (therapist: Therapist) => void; onSaveTherapists: (therapists: Therapist[]) => void; onSaveChild: (child: ChildProfile) => void; onRequestDelete: (item: { kind: "therapist" | "child"; id: string; name: string }) => void }) {
  const [therapistDraft, setTherapistDraft] = useState(therapist);
  const [newPin, setNewPin] = useState("");
  const [childDrafts, setChildDrafts] = useState(childProfiles);
  const updateChild = (id: string, field: keyof ChildProfile, value: string) => setChildDrafts((current) => current.map((child) => child.id === id ? { ...child, [field]: value } : child));
  return <div className="page profiles-page"><section className="page-title-row"><div><span className="eyebrow">GESTIONE PROFILI</span><h1>Adulti e bambini</h1><p>Aggiorna i dati e scegli il bambino attivo per le prossime attività.</p></div></section><div className="prototype-alert"><ShieldCheck /><div><strong>Accesso protetto e sincronizzato</strong><p>L’accesso ChatGPT protegge i dati nel cloud; il PIN seleziona il profilo adulto all’interno dell’app.</p></div></div>{therapist.role === "Amministratore" && <AdminPanel key={therapists.map((item) => item.id).join(":")} therapists={therapists} childProfiles={allChildren} onSave={onSaveTherapists} onRequestDelete={onRequestDelete} />}<section className="profile-section"><div className="section-heading"><div><h2>Profilo adulto</h2><p>Questi dati identificano l’adulto che conduce la sessione.</p></div></div><form className="profile-form" onSubmit={async (event) => { event.preventDefault(); const updated = { ...therapistDraft, pinHash: newPin ? await hashPin(newPin) : therapistDraft.pinHash ?? await hashPin(therapistDraft.pin ?? "1234"), pin: undefined }; onSaveTherapist(updated); setTherapistDraft(updated); setNewPin(""); }}><label>Nome<input value={therapistDraft.firstName} onChange={(event) => setTherapistDraft({ ...therapistDraft, firstName: event.target.value })} required /></label><label>Cognome<input value={therapistDraft.lastName} onChange={(event) => setTherapistDraft({ ...therapistDraft, lastName: event.target.value })} required /></label><label>Email di accesso<input type="email" value={therapistDraft.email} onChange={(event) => setTherapistDraft({ ...therapistDraft, email: event.target.value })} required /></label><label>Ruolo<input value={therapistDraft.role} readOnly aria-readonly="true" /></label><label>Nuovo PIN (opzionale)<input type="password" inputMode="numeric" minLength={4} maxLength={8} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ""))} placeholder="Lascia vuoto per non cambiarlo" /></label><div className="form-submit"><button className="primary-button" type="submit"><Save />Salva profilo</button></div></form><div className="danger-row"><div><strong>Elimina profilo adulto</strong><small>Verrai disconnesso. Deve restare almeno un profilo adulto.</small></div><button className="danger-button" disabled={!canDeleteTherapist} onClick={() => onRequestDelete({ kind: "therapist", id: therapist.id, name: `${therapist.firstName} ${therapist.lastName}` })}><Trash2 />Elimina</button></div></section><section className="profile-section"><div className="section-heading"><div><h2>Bambini associati</h2><p>Le statistiche e i nuovi tentativi seguono il profilo selezionato.</p></div><span>{childProfiles.length} profili</span></div><div className="children-editor-grid">{childDrafts.map((child) => <article className={child.id === activeChildId ? "child-editor active" : "child-editor"} key={child.id}><button className="child-editor-heading" type="button" onClick={() => onSelectChild(child.id)}><span className="profile-avatar" style={{ background: child.avatarColor }}>{child.firstName[0]}</span><span><strong>{child.firstName} {child.lastName}</strong><small>{child.id === activeChildId ? "Profilo attivo" : "Seleziona profilo"}</small></span>{child.id === activeChildId && <Check />}</button><div className="child-fields"><label>Nome<input value={child.firstName} onChange={(event) => updateChild(child.id, "firstName", event.target.value)} /></label><label>Cognome<input value={child.lastName} onChange={(event) => updateChild(child.id, "lastName", event.target.value)} /></label><label>Anno di nascita<input inputMode="numeric" maxLength={4} value={child.birthYear} onChange={(event) => updateChild(child.id, "birthYear", event.target.value.replace(/\D/g, ""))} /></label><label className="full-field">Note<textarea rows={3} value={child.notes} onChange={(event) => updateChild(child.id, "notes", event.target.value)} /></label></div><div className="child-actions"><button className="danger-button subtle" disabled={childProfiles.length <= 1} onClick={() => onRequestDelete({ kind: "child", id: child.id, name: `${child.firstName} ${child.lastName}` })}><Trash2 />Elimina</button><button className="ghost-button save-child" onClick={() => onSaveChild(child)}><Save />Salva profilo</button></div></article>)}</div></section></div>;
}

function DeleteDialog({ item, onCancel, onConfirm }: { item: { kind: "therapist" | "child"; name: string }; onCancel: () => void; onConfirm: () => void }) {
  const isChild = item.kind === "child";
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="modal delete-modal"><span className="delete-icon"><AlertTriangle /></span><span className="eyebrow">CONFERMA ELIMINAZIONE</span><h2 id="delete-title">Eliminare {item.name}?</h2><p>{isChild ? "Saranno eliminati da questo browser anche i tentativi e gli aiuti collegati al bambino." : "Il profilo adulto verrà eliminato da questo browser e la sessione verrà chiusa."}</p><p className="irreversible-note">Questa operazione non può essere annullata.</p><div className="modal-actions"><button className="ghost-button" onClick={onCancel}>Annulla</button><button className="danger-button solid" onClick={onConfirm}><Trash2 />Elimina definitivamente</button></div></div></div>;
}

function UploadDialog({ kind, onClose, onSave }: { kind: "word" | "sentence"; onClose: () => void; onSave: (item: LibraryItem) => Promise<void> }) {
  const [word, setWord] = useState(""); const [category, setCategory] = useState("Altro"); const [article, setArticle] = useState<Article | "">(""); const [image, setImage] = useState<string | null>(null); const [rights, setRights] = useState(false); const [processing, setProcessing] = useState(false); const [fileError, setFileError] = useState(""); const [syllabification, setSyllabification] = useState(""); const [syllableStatus, setSyllableStatus] = useState<SyllableStatus>("automatic"); const inputRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState(""); const [verb, setVerb] = useState("");
  const sentence = `${subject.trim()} ${verb.trim()}`.trim();
  const updateWord = (value: string) => { setWord(value); const analysis = analyzeItalianSyllables(value); setSyllabification(value.trim() ? analysis.syllabification : ""); setSyllableStatus(analysis.syllableStatus); };
  const updateSyllabification = (value: string) => { setSyllabification(value); setSyllableStatus("verified"); };
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !file.type.startsWith("image/")) return; setProcessing(true); setFileError(""); try { setImage(await prepareUploadedImage(file)); } catch { setFileError("Non è stato possibile elaborare questa immagine."); } finally { setProcessing(false); } };
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
  return <div className="modal-layer" role="dialog" aria-modal="true"><div className="modal"><button className="modal-close" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">{kind === "sentence" ? "NUOVA FRASE" : "NUOVO ELEMENTO"}</span><h2>{kind === "sentence" ? "Aggiungi una scena d’azione" : "Aggiungi alla libreria"}</h2><p>{kind === "sentence" ? "Inserisci una frase semplice soggetto + verbo e la relativa immagine. Il complemento è predisposto ma non ancora attivo." : "La parola è obbligatoria. Puoi aggiungere una fotografia ora oppure in seguito."}</p><button className={`drop-zone ${image ? "has-image" : ""}`} onClick={() => inputRef.current?.click()}>{image ? <img src={image} alt="Anteprima caricamento" /> : <><Upload /><strong>{processing ? "Ottimizzazione…" : kind === "sentence" ? "Aggiungi l’immagine della scena" : "Aggiungi un’immagine (opzionale)"}</strong><small>JPG, PNG o WebP</small></>}<input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} /></button>{fileError && <p className="form-error" role="alert">{fileError}</p>}{kind === "sentence" ? <><div className="builder-inline-fields"><label>Soggetto<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Es. Il gatto" /></label><label>Verbo<input value={verb} onChange={(event) => setVerb(event.target.value)} placeholder="Es. mangia" /></label></div><label>Frase<input value={sentence} readOnly aria-readonly="true" placeholder="La frase viene composta automaticamente" /></label><label>Complemento <small>Prossimamente</small><input disabled placeholder="Non disponibile in questa versione" /></label></> : <><label>Parola<input value={word} onChange={(event) => updateWord(event.target.value)} placeholder="Es. Bicchiere" /></label><label>Sillabazione<input value={syllabification} onChange={(event) => updateSyllabification(event.target.value)} placeholder="Es. bic-chie-re" /></label>{syllableStatus === "needs-review" && <div className="syllable-review"><AlertTriangle /><span>Controlla la divisione proposta.</span><button type="button" onClick={() => setSyllableStatus("verified")}>Conferma proposta</button></div>}<label>Categoria<select value={category} onChange={(event) => setCategory(event.target.value)}>{libraryCategories.filter((value) => value !== "Azioni").map((value) => <option key={value}>{value}</option>)}</select></label><label>Articolo nell’esercizio IL / LA<select value={article} disabled={!image} onChange={(event) => setArticle(event.target.value as Article | "")}><option value="">Non usare nell’esercizio</option><option value="IL">IL</option><option value="LA">LA</option></select></label><p className="field-note">Questa opzione si attiva quando aggiungi un’immagine.</p></>}{image && <label className="check-line"><input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} />Confermo di avere il diritto di usare questa immagine.</label>}<div className="modal-actions"><button className="ghost-button" onClick={onClose}>Annulla</button><button className="primary-button" disabled={!valid || processing} onClick={save}>{processing ? "Salvataggio…" : kind === "sentence" ? "Aggiungi frase" : "Aggiungi elemento"}</button></div></div></div>;
}

function EditLibraryDialog({ item, onClose, onSave }: { item: LibraryItem; onClose: () => void; onSave: (item: LibraryItem) => Promise<void> }) {
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
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !file.type.startsWith("image/")) return; setProcessing(true); setFileError(""); try { setImage(await prepareUploadedImage(file)); setImageChanged(true); } catch { setFileError("Non è stato possibile elaborare questa immagine."); } finally { setProcessing(false); } };
  const updateWord = (value: string) => { setWord(value); const analysis = analyzeItalianSyllables(value); setSyllabification(value.trim() ? analysis.syllabification : ""); setSyllableStatus(analysis.syllableStatus); };
  const updateSyllabification = (value: string) => { setSyllabification(value); setSyllableStatus("verified"); };
  const save = async () => {
    if (processing || (imageChanged && !rights) || (isSentence ? !subject.trim() || !verb.trim() || !image : !word.trim() || !syllabification.trim())) return;
    setProcessing(true);
    await onSave({ ...item, word: isSentence ? `${subject.trim()} ${verb.trim()}` : word.trim(), category: isSentence ? "Azioni" : category, article: isSentence ? null : article || null, subject: isSentence ? subject.trim() : item.subject, verb: isSentence ? verb.trim() : item.verb, phraseStructure: isSentence ? "subject-verb" : item.phraseStructure, syllabification: isSentence ? undefined : syllabification.trim().toLocaleLowerCase("it-IT"), syllableCount: isSentence ? undefined : countSyllables(syllabification), syllableStatus: isSentence ? undefined : syllableStatus, ...(imageChanged ? { image, emoji: undefined, source: "Upload privato", sourceUrl: undefined, license: "Diritto d’uso dichiarato", licenseUrl: undefined, author: "Utente", privateUpload: true } : {}) });
    setProcessing(false);
  };
  const valid = isSentence ? Boolean(subject.trim() && verb.trim() && image) : Boolean(word.trim() && syllabification.trim());
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="edit-library-title"><div className="modal"><button className="modal-close" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">MODIFICA ELEMENTO</span><h2 id="edit-library-title">{isSentence ? "Modifica la frase" : "Modifica la scheda"}</h2><p>{isSentence ? "Aggiorna soggetto, verbo o immagine della scena." : "Cambia la parola, aggiungi una foto o aggiorna la sillabazione."}</p><button className={`drop-zone ${image ? "has-image" : ""}`} onClick={() => inputRef.current?.click()}>{image ? <img src={image} alt={`Anteprima ${word}`} /> : <><span className="edit-emoji">{item.emoji || <BookOpenCheck />}</span><strong>{processing ? "Ottimizzazione…" : hasArtwork(item) ? "Sostituisci immagine" : "Aggiungi immagine"}</strong></>}<input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} /></button>{fileError && <p className="form-error" role="alert">{fileError}</p>}{isSentence ? <><div className="builder-inline-fields"><label>Soggetto<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label>Verbo<input value={verb} onChange={(event) => setVerb(event.target.value)} /></label></div><label>Frase<input value={`${subject.trim()} ${verb.trim()}`.trim()} readOnly /></label><label>Complemento <small>Prossimamente</small><input disabled placeholder="Non disponibile in questa versione" /></label></> : <><label>Parola<input value={word} onChange={(event) => updateWord(event.target.value)} /></label><label>Sillabazione<input value={syllabification} onChange={(event) => updateSyllabification(event.target.value)} /></label>{syllableStatus === "needs-review" && <div className="syllable-review"><AlertTriangle /><span>Controlla la divisione proposta.</span><button type="button" onClick={() => setSyllableStatus("verified")}>Conferma proposta</button></div>}<label>Categoria<select value={category} onChange={(event) => setCategory(event.target.value)}>{libraryCategories.filter((value) => value !== "Azioni").map((value) => <option key={value}>{value}</option>)}</select></label><label>Articolo nell’esercizio IL / LA<select value={article} disabled={!image && !item.emoji} onChange={(event) => setArticle(event.target.value as Article | "")}><option value="">Non usare nell’esercizio</option><option value="IL">IL</option><option value="LA">LA</option></select></label><p className="field-note">L’immagine comparirà nel gioco soltanto se scegli IL o LA.</p></>}{imageChanged && <label className="check-line"><input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} />Confermo di avere il diritto di usare questa immagine.</label>}<div className="modal-actions"><button className="ghost-button" onClick={onClose}>Annulla</button><button className="primary-button" disabled={!valid || processing || (imageChanged && !rights)} onClick={save}><Save />{processing ? "Salvataggio…" : "Salva modifiche"}</button></div></div></div>;
}

function LibraryDeleteDialog({ item, onCancel, onConfirm }: { item: LibraryItem; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="library-delete-title"><div className="modal delete-modal"><span className="delete-icon"><AlertTriangle /></span><span className="eyebrow">ARCHIVIA ELEMENTO</span><h2 id="library-delete-title">Rimuovere {item.word} dalla libreria?</h2><p>La scheda non sarà più proposta nei nuovi esercizi. Il contenuto resterà archiviato per conservare intatti gli storici che lo utilizzano.</p><div className="modal-actions"><button className="ghost-button" onClick={onCancel}>Annulla</button><button className="danger-button solid" onClick={onConfirm}><Trash2 />Archivia elemento</button></div></div></div>;
}

function FullTextItemPicker({ items, selectedIds, onChange, multiple, presentation, placeholder, max }: { items: LibraryItem[]; selectedIds: string[]; onChange: (ids: string[]) => void; multiple: boolean; presentation: Presentation; placeholder: string; max?: number }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("it-IT");
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const selected = selectedIds.map((id) => items.find((item) => item.id === id)).filter((item): item is LibraryItem => Boolean(item));
  const results = tokens.length ? items.filter((item) => {
    const text = `${item.word} ${item.category} ${item.syllabification ?? ""}`.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("it-IT");
    return tokens.every((token) => text.includes(token));
  }).slice(0, 8) : [];
  const choose = (id: string) => {
    if (!multiple) { onChange([id]); setQuery(""); return; }
    if (selectedIds.includes(id)) onChange(selectedIds.filter((itemId) => itemId !== id));
    else if (!max || selectedIds.length < max) onChange([...selectedIds, id]);
  };
  return <div className="fulltext-picker">
    {selected.length > 0 && <div className="fulltext-selection" aria-label="Elementi selezionati">{selected.map((item) => <button type="button" key={item.id} onClick={() => multiple && choose(item.id)} className={!multiple ? "single" : ""} title={multiple ? `Rimuovi ${item.word}` : item.word}>{presentation === "images" && <span><Artwork item={item} compact /></span>}<strong>{item.word}</strong>{multiple && <X />}</button>)}</div>}
    <label className="search-box fulltext-search"><Search /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} autoComplete="off" /></label>
    {tokens.length > 0 && <div className="fulltext-results" role="listbox">{results.length ? results.map((item) => { const chosen = selectedIds.includes(item.id); return <button type="button" role="option" aria-selected={chosen} key={item.id} onClick={() => choose(item.id)} disabled={!chosen && Boolean(max && selectedIds.length >= max)}>{presentation === "images" && <span><Artwork item={item} compact /></span>}<span><strong>{item.word}</strong><small>{item.category}{item.syllabification ? ` · ${item.syllabification}` : ""}</small></span>{chosen ? <Check /> : <Plus />}</button>; }) : <p>Nessun risultato per “{query.trim()}”.</p>}</div>}
  </div>;
}

function ExerciseBuilder({ kind, exercise, library, onClose, onSave }: { kind: SessionActivity; exercise?: Exercise; library: LibraryItem[]; onClose: () => void; onSave: (exercise: Exercise) => void }) {
  const initialPresentation = exercise?.presentation ?? "images";
  const initialRecognitionLibrary = availableForRecognition(library, initialPresentation);
  const initialPromptId = exercise?.promptId ?? initialRecognitionLibrary[0]?.id ?? "";
  const [title, setTitle] = useState(exercise?.title ?? "");
  const [promptId, setPromptId] = useState(initialPromptId);
  const [options, setOptions] = useState<string[]>(exercise?.optionIds ?? initialRecognitionLibrary.slice(0, 3).map((item) => item.id));
  const [recognitionMode, setRecognitionMode] = useState<"fixed" | "random">(exercise?.recognitionMode ?? (exercise ? "fixed" : "random"));
  const [randomPromptMode, setRandomPromptMode] = useState<"random" | "fixed">(exercise?.recognitionMode === "random" && exercise.promptId ? "fixed" : "random");
  const [recognitionItemIds, setRecognitionItemIds] = useState<string[]>(exercise?.recognitionItemIds ?? []);
  const [recognitionCategories, setRecognitionCategories] = useState<string[]>(exercise?.recognitionCategories ?? []);
  const [recognitionSyllables, setRecognitionSyllables] = useState<SyllableFilter>(exercise?.recognitionSyllables ?? "all");
  const [namingItemIds, setNamingItemIds] = useState<string[]>(exercise?.namingItemIds ?? []);
  const [namingCategories, setNamingCategories] = useState<string[]>(exercise?.namingCategories ?? []);
  const [distractorCount, setDistractorCount] = useState<1 | 2 | 3 | 4>(exercise?.distractorCount ?? 3);
  const [distractorSource, setDistractorSource] = useState<DistractorSource>(exercise?.distractorSource ?? "mixed");
  const [exercisePresentation, setExercisePresentation] = useState<Presentation>(initialPresentation);
  const [autoPronounce, setAutoPronounce] = useState(exercise?.autoPronounce ?? exercise?.presentation === "words");
  const [itemSearch, setItemSearch] = useState("");
  const articleCandidates = useMemo(() => library.filter((item) => hasArtwork(item) && articleFor(item)), [library]);
  const [articleItemIds, setArticleItemIds] = useState<string[]>(exercise?.articleItemIds ?? articleCandidates.slice(0, 6).map((item) => item.id));
  const availableCategories = useMemo(() => Array.from(new Set(library.map((item) => item.category))).sort((a, b) => a.localeCompare(b, "it")), [library]);
  const defaultCategoryNames = ["Cibi", "Animali", "Trasporti"].filter((category) => availableCategories.includes(category));
  const [categoryNames, setCategoryNames] = useState<string[]>(exercise?.categoryNames ?? defaultCategoryNames);
  const [categoryItemIds, setCategoryItemIds] = useState<string[]>(exercise?.categoryItemIds ?? defaultCategoryNames.flatMap((category) => library.filter((item) => item.category === category).slice(0, 3).map((item) => item.id)));
  const [rounds, setRounds] = useState(exercise?.rounds ?? 6);
  const [quantityMin, setQuantityMin] = useState(exercise?.quantityMin ?? 1);
  const [quantityMax, setQuantityMax] = useState(exercise?.quantityMax ?? 10);
  const [quantityObjectSet, setQuantityObjectSet] = useState<QuantityObjectSet>(exercise?.quantityObjectSet ?? "mixed");
  const [quantityAutoComplete, setQuantityAutoComplete] = useState(exercise?.quantityAutoComplete ?? true);
  const [quantityIdleSeconds, setQuantityIdleSeconds] = useState(exercise?.quantityIdleSeconds ?? 5);
  const sentenceCandidates = useMemo(() => library.filter(isSimpleSentenceScene), [library]);
  const [sentenceItemIds, setSentenceItemIds] = useState<string[]>(exercise?.sentenceItemIds ?? sentenceCandidates.map((item) => item.id));
  const [sentenceOptionCount, setSentenceOptionCount] = useState<SentenceOptionCount>(exercise?.sentenceOptionCount ?? 2);
  const [sentenceDifficulty, setSentenceDifficulty] = useState<SentenceDifficulty>(exercise?.sentenceDifficulty ?? 1);
  const recognitionCandidates = availableForRecognition(library, exercisePresentation);
  const effectivePromptId = recognitionCandidates.some((item) => item.id === promptId) ? promptId : recognitionCandidates[0]?.id ?? "";
  const compatibleRandomCandidates = recognitionCandidates.filter((item) => (!recognitionCategories.length || recognitionCategories.includes(item.category)) && matchesSyllableFilter(item, recognitionSyllables));
  const randomCandidates = randomPromptMode === "fixed" ? compatibleRandomCandidates : compatibleRandomCandidates.filter((item) => !recognitionItemIds.length || recognitionItemIds.includes(item.id));
  const prompt = recognitionCandidates.find((item) => item.id === effectivePromptId);
  const randomDistractors = randomCandidates.filter((item) => item.id !== effectivePromptId && (distractorSource !== "same-category" || item.category === prompt?.category));
  const randomConfigValid = randomPromptMode === "fixed"
    ? Boolean(prompt) && randomDistractors.length >= distractorCount
    : randomCandidates.length >= distractorCount + 1 && (distractorSource === "mixed" || hasSameCategoryDistractors(randomCandidates, distractorCount));
  const randomConfigError = randomConfigValid ? "" : randomPromptMode === "fixed" && !prompt
    ? "Scegli la parola da trovare."
    : randomPromptMode === "fixed"
      ? `Servono almeno ${distractorCount} distrattori compatibili; con i filtri attuali ce ne sono ${randomDistractors.length}.`
      : distractorSource === "same-category"
        ? `Serve almeno una categoria con ${distractorCount + 1} parole compatibili con i filtri.`
        : `Servono almeno ${distractorCount + 1} parole compatibili con i filtri; al momento ce ne sono ${randomCandidates.length}.`;
  const normalizedItemSearch = itemSearch.trim().toLocaleLowerCase("it-IT");
  const matchesItemSearch = (item: LibraryItem) => !normalizedItemSearch || `${item.word} ${item.category}`.toLocaleLowerCase("it-IT").includes(normalizedItemSearch);
  const itemSearchField = <label className="search-box builder-search"><Search /><input type="search" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Cerca per parola o categoria…" /></label>;
  const finalOptions = Array.from(new Set([effectivePromptId, ...options])).filter((id) => recognitionCandidates.some((item) => item.id === id)).slice(0, 4);
  const saveFixed = () => onSave({
    id: exercise?.id ?? crypto.randomUUID(),
    title: title.trim() || `Trova ${prompt?.word.toLowerCase() ?? "la parola"}`,
    kind: "recognition",
    recognitionMode: "fixed",
    presentation: exercisePresentation,
    autoPronounce,
    promptId: effectivePromptId,
    optionIds: finalOptions,
    updatedAt: new Date().toISOString(),
    deleted: false,
  });
  const saveRandom = () => onSave({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || (randomPromptMode === "fixed" ? `Trova ${prompt?.word.toLowerCase() ?? "la parola"}` : "Trova la parola · casuale"), kind: "recognition", recognitionMode: "random", presentation: exercisePresentation, autoPronounce, promptId: randomPromptMode === "fixed" ? effectivePromptId : "", optionIds: [], recognitionItemIds, recognitionCategories, recognitionSyllables, distractorCount, distractorSource, rounds: Math.max(1, rounds), updatedAt: new Date().toISOString(), deleted: false });
  if (kind === "sentence-matching") {
    const selectedIds = sentenceItemIds.filter((id) => sentenceCandidates.some((item) => item.id === id));
    const availability = sentenceMatchingAvailability(sentenceCandidates, { rounds: Math.max(1, rounds), optionCount: sentenceOptionCount, difficulty: sentenceDifficulty, allowedIds: selectedIds });
    const toggleSentenceItem = (id: string) => setSentenceItemIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]);
    const saveSentenceExercise = () => onSave({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Abbina la frase", kind: "sentence-matching", promptId: "", optionIds: [], sentenceItemIds: selectedIds, sentenceOptionCount, sentenceDifficulty, rounds: Math.min(50, Math.max(1, Math.trunc(rounds))), presentation: "images", autoPronounce: true, updatedAt: new Date().toISOString(), deleted: false });
    return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="exercise-builder-title"><div className="modal wide"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">{exercise ? "MODIFICA ESERCIZIO" : "NUOVO ESERCIZIO"}</span><h2 id="exercise-builder-title">Abbina la frase</h2><p>La frase soggetto + verbo viene letta ad alta voce. Il bambino sceglie l’immagine corrispondente.</p><label>Titolo<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Abbina la frase" /></label><div className="builder-inline-fields"><label>Numero di turni<input type="number" min={1} max={50} value={rounds} onChange={(event) => setRounds(Number(event.target.value))} /></label><label>Immagini per turno<select value={sentenceOptionCount} onChange={(event) => { const count = Number(event.target.value) as SentenceOptionCount; setSentenceOptionCount(count); if (count === 2) setSentenceDifficulty(1); }}><option value={2}>2 immagini</option><option value={4}>4 immagini</option></select></label><label>Gradi di libertà<select value={sentenceDifficulty} onChange={(event) => setSentenceDifficulty(Number(event.target.value) as SentenceDifficulty)}><option value={1}>1 · cambia l’azione</option><option value={2} disabled={sentenceOptionCount !== 4}>2 · cambiano soggetto e azione</option></select></label></div><p className="field-note">Con 1 grado il soggetto resta uguale e cambia l’azione. Con 2 gradi vengono mostrate quattro combinazioni soggetto × azione.</p><div className="builder-label">Scene disponibili <span>{selectedIds.length} scelte</span></div>{itemSearchField}<div className="builder-grid">{sentenceCandidates.filter(matchesItemSearch).map((item) => <button type="button" key={item.id} className={selectedIds.includes(item.id) ? "selected" : ""} onClick={() => toggleSentenceItem(item.id)} aria-pressed={selectedIds.includes(item.id)}><Artwork item={item} compact /><span>{item.word}</span>{selectedIds.includes(item.id) && <i><Check /></i>}</button>)}</div>{!availability.valid && <p className="wizard-error" role="alert">La selezione non contiene abbastanza combinazioni compatibili. {sentenceDifficulty === 2 ? "Servono almeno due soggetti e due azioni presenti in tutte e quattro le combinazioni." : `Per ogni frase servono almeno ${sentenceOptionCount - 1} azioni alternative dello stesso soggetto.`}</p>}<div className="modal-actions"><button className="ghost-button" type="button" onClick={onClose}>Annulla</button><button className="primary-button" type="button" disabled={!availability.valid} onClick={saveSentenceExercise}><Save />Salva esercizio</button></div></div></div>;
  }
  if (kind === "number-quantity") {
    const safeMin = Math.min(10, Math.max(1, Math.trunc(quantityMin)));
    const safeMax = Math.min(10, Math.max(safeMin, Math.trunc(quantityMax)));
    const saveQuantityExercise = () => onSave({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Numero quantità", kind: "number-quantity", promptId: "", optionIds: [], rounds: Math.min(50, Math.max(1, Math.trunc(rounds))), quantityMin: safeMin, quantityMax: safeMax, quantityObjectSet, quantityAutoComplete, quantityIdleSeconds: Math.min(10, Math.max(1, Math.trunc(quantityIdleSeconds))), updatedAt: new Date().toISOString(), deleted: false });
    return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="exercise-builder-title"><div className="modal wide"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">{exercise ? "MODIFICA ESERCIZIO" : "NUOVO ESERCIZIO"}</span><h2 id="exercise-builder-title">Numero quantità</h2><p>Il bambino tocca il numero richiesto di oggetti. In valutazione l’adulto conferma sempre l’esito, senza timer.</p><label>Titolo<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Numero quantità" /></label><div className="builder-inline-fields"><label>Numero di turni<input type="number" min={1} max={50} value={rounds} onChange={(event) => setRounds(Number(event.target.value))} /></label><label>Quantità minima<input type="number" min={1} max={10} value={quantityMin} onChange={(event) => setQuantityMin(Number(event.target.value))} /></label><label>Quantità massima<input type="number" min={safeMin} max={10} value={quantityMax} onChange={(event) => setQuantityMax(Number(event.target.value))} /></label><label>Oggetti<select value={quantityObjectSet} onChange={(event) => setQuantityObjectSet(event.target.value as QuantityObjectSet)}><option value="mixed">Casuali a ogni turno</option><option value="candy">Caramelle</option><option value="ladybug">Coccinelle</option><option value="stone">Sassolini</option></select></label><label>Secondi di inattività<input type="number" min={1} max={10} value={quantityIdleSeconds} onChange={(event) => setQuantityIdleSeconds(Number(event.target.value))} /></label></div><label className="check-line pronunciation-option"><input type="checkbox" checked={quantityAutoComplete} onChange={(event) => setQuantityAutoComplete(event.target.checked)} /><span><strong>Rileva automaticamente il numero corretto in insegnamento</strong><small>La barra mostra lo stesso tempo per risposte giuste ed errate. Dopo l’esito il terapista può proseguire; dopo un errore può anche far riprovare. Se disattivato, la risposta corretta richiede conferma adulta. Il link condiviso usa sempre il timer.</small></span></label><div className="modal-actions"><button className="ghost-button" type="button" onClick={onClose}>Annulla</button><button className="primary-button" type="button" onClick={saveQuantityExercise}><Save />Salva esercizio</button></div></div></div>;
  }
  if (kind === "naming") {
    const categoryCandidates = library.filter((item) => hasArtwork(item) && (!namingCategories.length || namingCategories.includes(item.category)));
    const selectedCandidates = namingItemIds.length ? categoryCandidates.filter((item) => namingItemIds.includes(item.id)) : categoryCandidates;
    const toggleNamingCategory = (category: string) => setNamingCategories((current) => current.includes(category) ? current.filter((value) => value !== category) : [...current, category]);
    const toggleNamingItem = (id: string) => setNamingItemIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    const saveNamingExercise = () => onSave({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Mix and vary", kind: "naming", promptId: "", optionIds: [], namingItemIds, namingCategories, rounds: Math.min(Math.max(1, rounds), selectedCandidates.length), updatedAt: new Date().toISOString(), deleted: false });
    return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="exercise-builder-title"><div className="modal wide"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">{exercise ? "MODIFICA ESERCIZIO" : "NUOVO ESERCIZIO"}</span><h2 id="exercise-builder-title">Mix and vary</h2><p>Mostra una foto senza testo. L’adulto indica se la risposta è corretta o errata e se il bambino è stato aiutato.</p><label>Titolo<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Mix and vary" /></label><label>Numero di turni<input type="number" min={1} max={Math.max(1, selectedCandidates.length)} value={Math.min(Math.max(1, rounds), selectedCandidates.length || 1)} onChange={(event) => setRounds(Number(event.target.value))} /></label><div className="builder-label">Filtra per categorie <span>{namingCategories.length ? `${namingCategories.length} scelte` : "Tutte"}</span></div><div className="filter-chips">{availableCategories.map((category) => <button type="button" key={category} className={namingCategories.includes(category) ? "selected" : ""} onClick={() => toggleNamingCategory(category)} aria-pressed={namingCategories.includes(category)}>{category}</button>)}</div><div className="builder-label">Immagini specifiche <span>{namingItemIds.length ? `${namingItemIds.length} scelte` : "Casuali dal filtro"}</span></div>{itemSearchField}<div className="builder-grid">{categoryCandidates.filter(matchesItemSearch).map((item) => <button type="button" key={item.id} className={namingItemIds.includes(item.id) ? "selected" : ""} onClick={() => toggleNamingItem(item.id)} aria-pressed={namingItemIds.includes(item.id)}><Artwork item={item} compact /><span>{item.word.toLocaleUpperCase("it-IT")}</span>{namingItemIds.includes(item.id) && <i><Check /></i>}</button>)}</div><div className="modal-actions"><button className="ghost-button" type="button" onClick={onClose}>Annulla</button><button className="primary-button" type="button" disabled={!selectedCandidates.length} onClick={saveNamingExercise}><Save />Salva esercizio</button></div></div></div>;
  }
  if (kind === "articles") {
    const selectedIds = articleItemIds.filter((id) => articleCandidates.some((item) => item.id === id));
    const finalRounds = Math.min(Math.max(1, rounds), selectedIds.length || 1);
    const toggleArticleItem = (id: string) => setArticleItemIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]);
    const saveArticleExercise = () => onSave({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Classifica IL o LA", kind: "articles", promptId: "", optionIds: [], articleItemIds: selectedIds, rounds: finalRounds, updatedAt: new Date().toISOString(), deleted: false });
    return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="exercise-builder-title"><div className="modal wide"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">{exercise ? "MODIFICA ESERCIZIO" : "NUOVO ESERCIZIO"}</span><h2 id="exercise-builder-title">Categorie IL / LA</h2><p>Scegli le immagini disponibili e quante mostrarne, una alla volta, durante ogni esecuzione.</p><label>Titolo<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Classifica IL o LA" /></label><label>Numero di turni<input type="number" min={1} max={Math.max(1, selectedIds.length)} value={finalRounds} onChange={(event) => setRounds(Number(event.target.value))} /></label><div className="builder-label">Immagini da classificare <span>{selectedIds.length} scelte</span></div>{itemSearchField}<div className="builder-grid">{articleCandidates.filter(matchesItemSearch).map((item) => <button type="button" key={item.id} className={selectedIds.includes(item.id) ? "selected" : ""} onClick={() => toggleArticleItem(item.id)} aria-pressed={selectedIds.includes(item.id)}><Artwork item={item} compact /><span>{item.word.toLocaleUpperCase("it-IT")} · {articleFor(item)}</span>{selectedIds.includes(item.id) && <i><Check /></i>}</button>)}</div><div className="modal-actions"><button className="ghost-button" type="button" onClick={onClose}>Annulla</button><button className="primary-button" type="button" disabled={!selectedIds.length} onClick={saveArticleExercise}><Save />Salva esercizio</button></div></div></div>;
  }
  if (kind === "word-categories") {
    const eligibleItems = library.filter((item) => categoryNames.includes(item.category));
    const selectedIds = categoryItemIds.filter((id) => eligibleItems.some((item) => item.id === id));
    const toggleCategory = (category: string) => setCategoryNames((current) => current.includes(category) ? current.filter((value) => value !== category) : current.length < 4 ? [...current, category] : current);
    const toggleCategoryItem = (id: string) => setCategoryItemIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    const saveCategoryExercise = () => onSave({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Metti la parola nella categoria", kind: "word-categories", promptId: "", optionIds: [], categoryNames, categoryItemIds: selectedIds, rounds: Math.min(Math.max(1, rounds), selectedIds.length), updatedAt: new Date().toISOString(), deleted: false });
    return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="exercise-builder-title"><div className="modal wide"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">{exercise ? "MODIFICA ESERCIZIO" : "NUOVO ESERCIZIO"}</span><h2 id="exercise-builder-title">Parola nella categoria</h2><p>Mostra una parola alla volta e scegli in quale categoria inserirla.</p><label>Titolo<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Metti la parola nella categoria" /></label><label>Numero di turni<input type="number" min={1} max={Math.max(1, selectedIds.length)} value={Math.min(Math.max(1, rounds), selectedIds.length || 1)} onChange={(event) => setRounds(Number(event.target.value))} /></label><div className="builder-label">Categorie <span>{categoryNames.length} scelte · massimo 4</span></div><div className="filter-chips">{availableCategories.map((category) => <button type="button" key={category} className={categoryNames.includes(category) ? "selected" : ""} onClick={() => toggleCategory(category)} aria-pressed={categoryNames.includes(category)}>{category}</button>)}</div><div className="builder-label">Parole da classificare <span>{selectedIds.length} scelte</span></div>{itemSearchField}<div className="builder-grid">{eligibleItems.filter(matchesItemSearch).map((item) => <button type="button" key={item.id} className={selectedIds.includes(item.id) ? "selected" : ""} onClick={() => toggleCategoryItem(item.id)} aria-pressed={selectedIds.includes(item.id)}><strong className="builder-word">{item.word.toLocaleUpperCase("it-IT")}</strong><span>{item.category}</span>{selectedIds.includes(item.id) && <i><Check /></i>}</button>)}</div><div className="modal-actions"><button className="ghost-button" type="button" onClick={onClose}>Annulla</button><button className="primary-button" type="button" disabled={categoryNames.length < 2 || categoryNames.length > 4 || !selectedIds.length} onClick={saveCategoryExercise}><Save />Salva esercizio</button></div></div></div>;
  }
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="exercise-builder-title">
      <div className="modal wide">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button>
        <span className="eyebrow">{exercise ? "MODIFICA ESERCIZIO" : "NUOVO ESERCIZIO"}</span>
        <h2 id="exercise-builder-title">Trova la parola</h2>
        <p>Puoi scegliere una parola precisa con distrattori casuali, rendere casuale anche il bersaglio oppure configurare tutte le opzioni a mano.</p>
        <label>Titolo<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={recognitionMode === "random" ? randomPromptMode === "fixed" && prompt ? `Trova ${prompt.word.toLowerCase()}` : "Trova la parola · casuale" : prompt ? `Trova ${prompt.word.toLowerCase()}` : "Titolo esercizio"} /></label>
        <RecognitionPresentationFields presentation={exercisePresentation} autoPronounce={autoPronounce} onPresentationChange={setExercisePresentation} onAutoPronounceChange={setAutoPronounce} />
        <div className="builder-mode">
          <button type="button" className={recognitionMode === "random" ? "selected" : ""} onClick={() => setRecognitionMode("random")}><Sparkles /><strong>Distrattori casuali</strong><small>Scegli se mantenere fisso o variare il bersaglio</small></button>
          <button type="button" className={recognitionMode === "fixed" ? "selected" : ""} onClick={() => setRecognitionMode("fixed")}><Settings /><strong>Tutto fisso</strong><small>Configura manualmente ogni opzione</small></button>
        </div>
        {recognitionMode === "random" ? <>
          <div className="builder-label">Parola da trovare</div>
          <div className="selection-tabs">
            <button type="button" className={randomPromptMode === "fixed" ? "selected" : ""} onClick={() => setRandomPromptMode("fixed")}>Una parola precisa</button>
            <button type="button" className={randomPromptMode === "random" ? "selected" : ""} onClick={() => setRandomPromptMode("random")}>Casuale a ogni turno</button>
          </div>
          {randomPromptMode === "fixed" && <>
            <div className="builder-label">{exercisePresentation === "words" ? "Parola da riconoscere" : "Immagine da riconoscere"} <span>{prompt?.word}</span></div>
            <FullTextItemPicker items={recognitionCandidates} selectedIds={effectivePromptId ? [effectivePromptId] : []} onChange={(ids) => setPromptId(ids[0] ?? "")} multiple={false} presentation={exercisePresentation} placeholder="Cerca la parola da riconoscere…" />
          </>}
          <div className="builder-inline-fields">
            <label>Numero di turni<input type="number" min={1} max={50} value={Math.max(1, rounds)} onChange={(event) => setRounds(Number(event.target.value))} /></label>
            <RecognitionRandomParameterFields distractorCount={distractorCount} distractorSource={distractorSource} syllables={recognitionSyllables} onDistractorCountChange={setDistractorCount} onDistractorSourceChange={setDistractorSource} onSyllablesChange={setRecognitionSyllables} />
          </div>
          <div className="builder-label">Filtra i {randomPromptMode === "fixed" ? "distrattori" : "bersagli e distrattori"} per categorie <span>{recognitionCategories.length ? `${recognitionCategories.length} scelte` : "Tutte"}</span></div>
          <div className="filter-chips">{availableCategories.map((category) => <button type="button" key={category} className={recognitionCategories.includes(category) ? "selected" : ""} onClick={() => setRecognitionCategories((current) => current.includes(category) ? current.filter((value) => value !== category) : [...current, category])} aria-pressed={recognitionCategories.includes(category)}>{category}</button>)}</div>
          <div className="builder-label">{randomPromptMode === "fixed" ? "Distrattori preferiti (facoltativo)" : "Limita a parole specifiche"} <span>{recognitionItemIds.length ? `${recognitionItemIds.length} scelte` : randomPromptMode === "fixed" ? "Scelta automatica" : "Tutte"}</span></div>
          {randomPromptMode === "fixed" && <p className="field-note">Se non ne scegli abbastanza, l’app completa automaticamente le opzioni con elementi compatibili della libreria.</p>}
          <FullTextItemPicker items={compatibleRandomCandidates.filter((item) => randomPromptMode !== "fixed" || item.id !== effectivePromptId)} selectedIds={recognitionItemIds} onChange={setRecognitionItemIds} multiple presentation={exercisePresentation} placeholder={randomPromptMode === "fixed" ? "Cerca uno o più distrattori preferiti…" : "Cerca e aggiungi più parole…"} />
          {randomConfigError && <p className="wizard-error" role="alert">{randomConfigError}</p>}
        </> : <>
          <div className="builder-label">{exercisePresentation === "words" ? "Parola da riconoscere" : "Immagine da riconoscere"} <span>{prompt?.word}</span></div>
          <FullTextItemPicker items={recognitionCandidates} selectedIds={effectivePromptId ? [effectivePromptId] : []} onChange={(ids) => { const nextId = ids[0] ?? ""; setPromptId(nextId); setOptions((current) => current.filter((id) => id !== nextId)); }} multiple={false} presentation={exercisePresentation} placeholder="Cerca la parola da riconoscere…" />
          <div className="builder-label">{exercisePresentation === "words" ? "Parole da mostrare" : "Immagini da mostrare"} <span>{finalOptions.length}/4</span></div>
          <FullTextItemPicker items={recognitionCandidates.filter((item) => item.id !== effectivePromptId)} selectedIds={options.filter((id) => id !== effectivePromptId)} onChange={(ids) => setOptions(ids.slice(0, 3))} multiple presentation={exercisePresentation} placeholder="Cerca e aggiungi fino a 3 alternative…" max={3} />
        </>}
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>Annulla</button>
          <button className="primary-button" type="button" disabled={recognitionMode === "fixed" ? !effectivePromptId || finalOptions.length < 2 : !randomConfigValid} onClick={recognitionMode === "random" ? saveRandom : saveFixed}><Save />Salva esercizio</button>
        </div>
      </div>
    </div>
  );
}

function SequenceDialog({ sequence, therapistId, onClose, onSave }: { sequence?: Sequence; therapistId: string; onClose: () => void; onSave: (sequence: Sequence) => void }) {
  const [title, setTitle] = useState(sequence?.title ?? "");
  const save = () => onSave({ ...sequence, id: sequence?.id ?? crypto.randomUUID(), title: title.trim(), exerciseIds: sequence?.exerciseIds ?? [], therapistId: sequence?.therapistId ?? therapistId, updatedAt: new Date().toISOString(), deleted: false });
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="sequence-dialog-title"><div className="modal"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">{sequence ? "MODIFICA SEQUENZA" : "NUOVA SEQUENZA"}</span><h2 id="sequence-dialog-title">{sequence ? "Rinomina la sequenza" : "Crea una sequenza"}</h2><p>Gli esercizi si aggiungono e si riordinano dalla pagina successiva.</p><label>Nome della sequenza<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Es. Parole della settimana" /></label><div className="modal-actions"><button className="ghost-button" type="button" onClick={onClose}>Annulla</button><button className="primary-button" type="button" disabled={!title.trim()} onClick={save}><Save />Salva sequenza</button></div></div></div>;
}

function ContentDeleteDialog({ title, detail, onCancel, onConfirm }: { title: string; detail: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="content-delete-title"><div className="modal delete-modal"><span className="delete-icon"><AlertTriangle /></span><span className="eyebrow">CONFERMA ELIMINAZIONE</span><h2 id="content-delete-title">{title}</h2><p>{detail}</p><div className="modal-actions"><button className="ghost-button" type="button" onClick={onCancel}>Annulla</button><button className="danger-button solid" type="button" onClick={onConfirm}><Trash2 />Elimina</button></div></div></div>;
}

function downloadProgressCsv(attempts: Attempt[], exercises: Exercise[], library: LibraryItem[]) {
  const blob = new Blob([buildExcelProgressCsv(attempts, { exercises, library })], { type: "text/csv;charset=utf-16le" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "lettura-globale-progressi.csv"; link.click(); URL.revokeObjectURL(url);
}
