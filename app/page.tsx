"use client";

import { AlertTriangle, ArrowDown, ArrowUp, BarChart3, BookOpenCheck, Check, ChevronRight, CircleHelp, Cloud, Copy, FolderHeart, Home, ImagePlus, KeyRound, Library, LogOut, Menu, MousePointer2, Pencil, Play, Plus, Save, Search, Settings, Share2, ShieldCheck, Sparkles, Trash2, Upload, UserCog, UserRound, Users, Volume2, VolumeX, X } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRandomRecognitionRounds, hasSameCategoryDistractors, normalizeLearningCategory, pickCategoryRoundIds, recognitionModeFor } from "./domain/activity-generation";
import { filterQuickCandidates, quickStartIsValid } from "./domain/session-planning";
import { appendAttempt, appendHelp, shouldRecordSessionEvents, type AttemptEvent, type HelpEventRecord, type SessionMode } from "./domain/session-events";
import { deduplicateLibraryPlaceholders, remapLibraryId, remapLibraryIds } from "./domain/library-deduplication";
import { buildSessionHistoryItems, type HistoryImageSnapshot, type SessionHistoryRecord } from "./domain/session-history";
import { buildSharedPreviewUrl, parseSharedLaunch, parseSharedPreview, type SharedLaunch } from "./domain/shared-launch";
import { canAccessSequence, canViewAllSequences } from "./domain/sequence-access";

type View = "home" | "library" | "exercises" | "session" | "stats" | "profiles";
type Mode = SessionMode;
type Presentation = "images" | "words";
type SessionActivity = "recognition" | "articles" | "word-categories" | "naming";
type Article = "IL" | "LA";
type QuickSelection = "all" | "categories" | "items";
type DistractorSource = "mixed" | "same-category";
type QuickStartConfig = { activity: SessionActivity; selection: QuickSelection; categoryNames: string[]; itemIds: string[]; rounds: number; distractorCount: 1 | 2 | 3 | 4; distractorSource: DistractorSource; presentation: Presentation };
type LibraryItem = { id: string; word: string; emoji?: string; image?: string; imageKey?: string; remoteImageId?: string; category: string; source: string; sourceUrl?: string; license: string; licenseUrl?: string; author: string; article?: Article | null; privateUpload?: boolean; deleted?: boolean };
type Exercise = { id: string; title: string; kind?: SessionActivity; promptId?: string; optionIds: string[]; articleItemIds?: string[]; categoryItemIds?: string[]; categoryNames?: string[]; recognitionMode?: "fixed" | "random"; recognitionItemIds?: string[]; recognitionCategories?: string[]; namingItemIds?: string[]; namingCategories?: string[]; distractorCount?: 1 | 2 | 3 | 4; distractorSource?: DistractorSource; presentation?: Presentation; rounds?: number; sourceExerciseId?: string; updatedAt: string; deleted?: boolean };
type Sequence = { id: string; title: string; exerciseIds: string[]; therapistId: string; updatedAt?: string; lastUsedAt?: string; deleted?: boolean };
type Attempt = AttemptEvent;
type HelpEvent = HelpEventRecord;
type ProfileRole = "Amministratore" | "Genitore" | "Supervisore" | "Terapista";
type Therapist = { id: string; firstName: string; lastName: string; email: string; role: ProfileRole; pinHash?: string; pin?: string; childIds: string[] };
type ChildProfile = { id: string; firstName: string; lastName: string; birthYear: string; notes: string; avatarColor: string };
type BackendState = { schemaVersion: 1; therapists: Therapist[]; children: ChildProfile[]; activeChildId: string; activeSequenceId?: string; library: LibraryItem[]; exercises: Exercise[]; sequences: Sequence[]; attempts: Attempt[]; helps: HelpEvent[]; sessionHistory: SessionHistoryRecord[] };
type BackendStatus = "loading" | "migrating" | "ready" | "syncing" | "local" | "error";
type SharedPreviewPayload = { schemaVersion: 1; kind: "exercise" | "sequence"; title: string; exercises: Exercise[]; library: LibraryItem[] };

const stockItems: LibraryItem[] = [
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
const libraryCategories = ["Animali", "Parti del corpo", "Vestiti", "Oggetti della natura", "Cibi", "Casa", "Trasporti", "Oggetti", "Scuola", "Luoghi", "Giochi", "Altro"];
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
    return { ...hydratedItem, category: normalizeLearningCategory(hydratedItem.category) };
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
  return <span className={compact ? "artwork-emoji compact" : "artwork-emoji"} aria-hidden="true">{item.emoji}</span>;
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

function speakWord(word: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(`${word}.`);
  utterance.lang = "it-IT";
  const italianVoices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("it"));
  const preferredVoice = italianVoices.find((voice) => /elsa|isabella|google.*ital/i.test(voice.name)) ?? italianVoices.find((voice) => voice.localService) ?? italianVoices[0];
  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.rate = 0.7;
  utterance.pitch = 0.96;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

function playFeedbackTone(kind: "correct" | "wrong", enabled: boolean) {
  if (!enabled) return;
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const now = context.currentTime;
  const notes = kind === "correct" ? [659.25, 880] : [118, 126];
  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = kind === "correct" ? now + index * 0.11 : now;
    const duration = kind === "correct" ? 0.16 : 0.27;
    const volume = kind === "correct" ? 0.12 : 0.1;
    oscillator.type = kind === "correct" ? "sine" : "sawtooth";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  });
  window.setTimeout(() => context.close().catch(() => undefined), 650);
}

function compileExercises(selectedExercises: Exercise[], sourceLibrary: LibraryItem[]) {
  return selectedExercises.flatMap((exercise) => {
    if (exerciseKind(exercise) !== "recognition" || recognitionModeFor(exercise) !== "random") return [exercise];
    return createRandomRecognitionRounds(sourceLibrary, {
      rounds: exercise.rounds ?? 6,
      distractorCount: exercise.distractorCount ?? 3,
      distractorSource: exercise.distractorSource ?? "mixed",
      allowedIds: exercise.recognitionItemIds,
      categories: exercise.recognitionCategories,
    }).map((round, index) => ({ ...exercise, id: `${exercise.id}:round:${index}:${crypto.randomUUID()}`, sourceExerciseId: exercise.id, recognitionMode: "fixed" as const, promptId: round.promptId, optionIds: round.optionIds }));
  });
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
  const [library, setLibrary, libraryLoaded] = useStoredState<LibraryItem[]>("lg-library", stockItems, hydrateLibrary, libraryForStorage);
  const [exercises, setExercises, exercisesLoaded] = useStoredState<Exercise[]>("lg-exercises", initialExercises, hydrateExercises);
  const [sequences, setSequences, sequencesLoaded] = useStoredState<Sequence[]>("lg-sequences", initialSequences, hydrateSequences);
  const [activeSequenceId, setActiveSequenceId, activeSequenceLoaded] = useStoredState<string>("lg-active-sequence", initialSequences[0].id);
  const [attempts, setAttempts, attemptsLoaded] = useStoredState<Attempt[]>("lg-attempts", []);
  const [helps, setHelps, helpsLoaded] = useStoredState<HelpEvent[]>("lg-helps", []);
  const [sessionHistory, setSessionHistory, sessionHistoryLoaded] = useStoredState<SessionHistoryRecord[]>("lg-session-history", []);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("loading");
  const backendStarted = useRef(false);
  const [backendInitialized, setBackendInitialized] = useState(false);
  const backendHydrating = useRef(true);
  const backendSaveTimer = useRef<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
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
  const [sessionMode, setSessionMode] = useState<Mode>("test");
  const [soundEffects, setSoundEffects] = useStoredState<boolean>("lg-sound-effects", true);
  const [sessionPresentation, setSessionPresentation] = useState<Presentation>("images");
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionPlan, setSessionPlan] = useState<Exercise[]>([]);
  const [sessionRunId, setSessionRunId] = useState("");
  const [sessionChildId, setSessionChildId] = useState("");
  const [sessionStartedAt, setSessionStartedAt] = useState("");
  const [sessionDescriptor, setSessionDescriptor] = useState<{ title: string; source: "sequence" | "quick" }>({ title: "Sessione", source: "sequence" });
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
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
  const spokenCorrectKey = useRef("");
  const handledSharedLaunch = useRef("");
  const sessionReturnView = useRef<View>("session");

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const authTimer = window.setTimeout(() => {
      const legacyLaunch = parseSharedLaunch(window.location.search);
      const publicPreview = parseSharedPreview(window.location.search);
      setPendingSharedLaunch(legacyLaunch);
      setPendingSharedPreviewToken(publicPreview?.token ?? null);
      setLoggedInTherapistId(sessionStorage.getItem("lg-therapist-session"));
      if (!legacyLaunch && !publicPreview) window.history.replaceState({ lgView: "home" }, "", window.location.href);
      setSessionChecked(true);
    }, 0);
    return () => window.clearTimeout(authTimer);
  }, []);

  useEffect(() => {
    if (!pendingSharedPreviewToken) return;
    let cancelled = false;
    fetch(`/api/shared-launch/${encodeURIComponent(pendingSharedPreviewToken)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("preview_load_failed");
        return response.json() as Promise<SharedPreviewPayload>;
      })
      .then((payload) => {
        if (cancelled || payload.schemaVersion !== 1 || !payload.exercises?.length || !payload.library?.length) throw new Error("invalid_preview");
        const plan = compileExercises(payload.exercises, payload.library.filter((item) => !item.deleted));
        if (!plan.length) throw new Error("empty_preview");
        setSharedPreview(payload);
        setSessionPlan(plan);
        setSessionRunId(crypto.randomUUID());
        setSessionChildId("");
        setSessionIndex(0);
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
      const nextView = (["home", "library", "exercises", "session", "stats", "profiles"] as View[]).includes(event.state?.lgView) ? event.state.lgView as View : "home";
      if (sessionActive) {
        setSessionActive(false);
        setSessionComplete(false);
        setSessionFromSharedLink(false);
        setSessionIsTrial(false);
        setSharedPreview(null);
        setAnswerState("idle");
        setWrongAnswerId(null);
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

  const allLocalDataLoaded = therapistsLoaded && childrenLoaded && activeChildLoaded && libraryLoaded && exercisesLoaded && sequencesLoaded && activeSequenceLoaded && attemptsLoaded && helpsLoaded && sessionHistoryLoaded;

  useEffect(() => {
    if (!libraryLoaded || !exercisesLoaded) return;
    const deduplicated = deduplicateLibraryPlaceholders(library);
    if (!deduplicated.replacements.size) return;
    setLibrary(deduplicated.items);
    setExercises((current) => current.map((exercise) => remapExerciseLibraryIds(exercise, deduplicated.replacements)));
  }, [library, libraryLoaded, exercisesLoaded, setLibrary, setExercises]);

  useEffect(() => {
    if (!allLocalDataLoaded || backendStarted.current) return;
    backendStarted.current = true;
    let cancelled = false;
    const initializeBackend = async () => {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (response.status === 401) { if (!cancelled) setBackendStatus("local"); return; }
      if (!response.ok) throw new Error("backend_load_failed");
      const result = await response.json() as { state: BackendState | null };
      if (cancelled) return;

      if (result.state) {
        const saved = result.state;
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
        backendHydrating.current = false;
        setBackendInitialized(true);
        setBackendStatus("ready");
        return;
      }

      setBackendStatus("migrating");
      const migratedLibrary: LibraryItem[] = [];
      for (const item of library) {
        if (!item.privateUpload || item.remoteImageId) { migratedLibrary.push(item); continue; }
        const localImage = item.image?.startsWith("data:") ? item.image : item.imageKey ? await readLibraryImage(item.imageKey) : undefined;
        if (!localImage) { migratedLibrary.push(item); continue; }
        const remote = await uploadRemoteImage(crypto.randomUUID(), localImage);
        migratedLibrary.push({ ...item, image: localImage, remoteImageId: remote.id });
      }
      const migrated: BackendState = { schemaVersion: 1, therapists, children, activeChildId, activeSequenceId, library: migratedLibrary, exercises, sequences, attempts, helps, sessionHistory };
      const saveResponse = await fetch("/api/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(backendStateForStorage(migrated)) });
      if (!saveResponse.ok) throw new Error("backend_migration_failed");
      if (cancelled) return;
      setLibrary(migratedLibrary);
      backendHydrating.current = false;
      setBackendInitialized(true);
      setBackendStatus("ready");
    };
    initializeBackend().catch(() => { if (!cancelled) setBackendStatus("error"); });
    return () => { cancelled = true; };
  }, [allLocalDataLoaded, therapists, children, activeChildId, activeSequenceId, library, exercises, sequences, attempts, helps, sessionHistory, setTherapists, setChildren, setActiveChildId, setActiveSequenceId, setLibrary, setExercises, setSequences, setAttempts, setHelps, setSessionHistory]);

  useEffect(() => {
    if (backendHydrating.current || !backendInitialized) return;
    const snapshot: BackendState = { schemaVersion: 1, therapists, children, activeChildId, activeSequenceId, library, exercises, sequences, attempts, helps, sessionHistory };
    if (backendSaveTimer.current) window.clearTimeout(backendSaveTimer.current);
    backendSaveTimer.current = window.setTimeout(async () => {
      setBackendStatus("syncing");
      try {
        const response = await fetch("/api/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(backendStateForStorage(snapshot)) });
        if (!response.ok) throw new Error("backend_save_failed");
        setBackendStatus("ready");
      } catch { setBackendStatus("error"); }
    }, 500);
    return () => { if (backendSaveTimer.current) window.clearTimeout(backendSaveTimer.current); };
  }, [backendInitialized, therapists, children, activeChildId, activeSequenceId, library, exercises, sequences, attempts, helps, sessionHistory]);

  const therapist = therapists.find((item) => item.id === loggedInTherapistId);
  const canSeeAllSequences = canViewAllSequences(therapist?.role);
  const associatedChildren = therapist?.role === "Amministratore" ? children : children.filter((child) => therapist?.childIds.includes(child.id));
  const activeChild = associatedChildren.find((child) => child.id === activeChildId) ?? associatedChildren[0];
  const visibleLibrary = library.filter((item) => !item.deleted);
  const visibleIds = new Set(visibleLibrary.map((item) => item.id));
  const visibleExercises: Exercise[] = exercises.filter((exercise) => !exercise.deleted).map((exercise): Exercise => ({
    ...exercise,
    optionIds: exercise.optionIds.filter((id) => visibleIds.has(id)),
    articleItemIds: exercise.articleItemIds?.filter((id) => { const item = visibleLibrary.find((candidate) => candidate.id === id); return Boolean(item && articleFor(item)); }),
    categoryItemIds: exercise.categoryItemIds?.filter((id) => visibleIds.has(id)),
    recognitionItemIds: exercise.recognitionItemIds?.filter((id) => visibleIds.has(id)),
    namingItemIds: exercise.namingItemIds?.filter((id) => visibleIds.has(id)),
  })).filter((exercise) => {
    const kind = exerciseKind(exercise);
    if (kind === "articles") return Boolean(exercise.articleItemIds?.length);
    if (kind === "word-categories") return Boolean(exercise.categoryItemIds?.length && exercise.categoryNames?.length && exercise.categoryNames.length >= 2);
    if (kind === "naming") {
      const allowed = exercise.namingItemIds?.length ? new Set(exercise.namingItemIds) : null;
      const categories = exercise.namingCategories?.length ? new Set(exercise.namingCategories) : null;
      return visibleLibrary.some((item) => (!allowed || allowed.has(item.id)) && (!categories || categories.has(item.category)));
    }
    if (recognitionModeFor(exercise) === "random") {
      const allowed = exercise.recognitionItemIds?.length ? new Set(exercise.recognitionItemIds) : null;
      const categories = exercise.recognitionCategories?.length ? new Set(exercise.recognitionCategories) : null;
      return visibleLibrary.filter((item) => (!allowed || allowed.has(item.id)) && (!categories || categories.has(item.category))).length >= 2;
    }
    return Boolean(exercise.promptId && visibleIds.has(exercise.promptId) && exercise.optionIds.length >= 2);
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
      const plan = selectedExercises.flatMap((exercise) => {
        if (exerciseKind(exercise) !== "recognition" || recognitionModeFor(exercise) !== "random") return [exercise];
        return createRandomRecognitionRounds(visibleLibrary, {
          rounds: exercise.rounds ?? 6,
          distractorCount: exercise.distractorCount ?? 3,
          distractorSource: exercise.distractorSource ?? "mixed",
          allowedIds: exercise.recognitionItemIds,
          categories: exercise.recognitionCategories,
        }).map((round, index) => ({ ...exercise, id: `${exercise.id}:round:${index}:${crypto.randomUUID()}`, sourceExerciseId: exercise.id, recognitionMode: "fixed" as const, promptId: round.promptId, optionIds: round.optionIds }));
      });
      if (!plan.length) return;
      setSessionPlan(plan);
      setSessionRunId(crypto.randomUUID());
      setSessionChildId(activeChild.id);
      setSessionIndex(0);
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
    if (!sessionActive || !currentExercise || exerciseKind(currentExercise) !== "recognition" || currentPresentation !== "words" || !promptWord) return;
    const promptKey = `${sessionRunId}:${currentExercise.id}:${sessionIndex}`;
    if (spokenPromptKey.current === promptKey) return;
    spokenPromptKey.current = promptKey;
    speakWord(promptWord);
  }, [sessionActive, currentExercise, currentPresentation, sessionIndex, sessionRunId, promptWord]);

  useEffect(() => {
    if (sessionActive) window.scrollTo({ top: 0, behavior: "auto" });
  }, [sessionActive, sessionIndex]);

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
  const navigate = (next: View) => { if (next !== view) window.history.pushState({ lgView: next }, "", window.location.pathname); setView(next); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const compileSession = (selectedExercises: Exercise[]) => compileExercises(selectedExercises, visibleLibrary);
  const beginSession = (selectedExercises: Exercise[], quickExercise?: Exercise, options?: { trial?: boolean; returnView?: View; title?: string; source?: "sequence" | "quick" }) => { const plan = compileSession(selectedExercises); if (!plan.length || !activeChild) return; const returnView = options?.returnView ?? "session"; sessionReturnView.current = returnView; window.history.replaceState({ lgView: returnView }, "", window.location.pathname); window.history.pushState({ lgView: "session", lgActivity: true }, "", window.location.pathname); setSessionPlan(plan); setSessionRunId(crypto.randomUUID()); setSessionChildId(activeChild.id); setSessionStartedAt(new Date().toISOString()); setSessionDescriptor({ title: options?.title ?? quickExercise?.title ?? "Sessione", source: options?.source ?? (quickExercise ? "quick" : "sequence") }); setSessionIndex(0); setAnswerState("idle"); setWrongAnswerId(null); setSessionFromSharedLink(false); setSessionIsTrial(Boolean(options?.trial)); setSessionComplete(false); setQuickExerciseToSave(quickExercise ?? null); setSessionActive(true); setView("session"); };
  const startSequenceById = (sequenceId: string) => {
    const sequence = visibleSequences.find((item) => item.id === sequenceId);
    if (!sequence) return;
    const selected = sequence.exerciseIds.map((id) => visibleExercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is Exercise => Boolean(exercise));
    setActiveSequenceId(sequence.id);
    setSequences((current) => current.map((item) => item.id === sequence.id ? { ...item, lastUsedAt: new Date().toISOString() } : item));
    beginSession(selected, undefined, { title: sequence.title, source: "sequence" });
  };
  const createQuickExercise = (config: QuickStartConfig) => {
    const source = config.activity === "articles" ? visibleLibrary.filter((item) => articleFor(item)) : visibleLibrary;
    const candidates = filterQuickCandidates(source, config);
    const id = `quick:${crypto.randomUUID()}`;
    const base = { id, sourceExerciseId: id, promptId: "", optionIds: [], rounds: config.activity === "recognition" ? Math.max(1, config.rounds) : Math.min(Math.max(1, config.rounds), Math.max(1, candidates.length)), updatedAt: new Date().toISOString(), deleted: false };
    if (config.activity === "articles") return { ...base, title: "Avvio rapido · IL / LA", kind: "articles" as const, articleItemIds: candidates.filter((item) => articleFor(item)).map((item) => item.id) };
    if (config.activity === "word-categories") return { ...base, title: "Avvio rapido · Parola nella categoria", kind: "word-categories" as const, categoryNames: config.categoryNames, categoryItemIds: candidates.map((item) => item.id) };
    if (config.activity === "naming") return { ...base, title: "Avvio rapido · Mix and vary", kind: "naming" as const, namingItemIds: candidates.map((item) => item.id), namingCategories: [] };
    return { ...base, title: "Avvio rapido · Trova la parola", kind: "recognition" as const, recognitionMode: "random" as const, recognitionItemIds: candidates.map((item) => item.id), recognitionCategories: [], distractorCount: config.distractorCount, distractorSource: config.distractorSource, presentation: config.presentation };
  };
  const startQuickSession = (config: QuickStartConfig) => {
    const exercise = createQuickExercise(config);
    setSessionPresentation(config.presentation);
    beginSession([exercise], exercise, { title: exercise.title, source: "quick" });
  };
  const tryExercise = (exerciseId: string) => { const exercise = visibleExercises.find((item) => item.id === exerciseId); if (exercise) beginSession([exercise], undefined, { trial: true, returnView: "exercises" }); };
  const chooseAnswer = (answerId: string) => {
    if (!currentExercise || answerState === "correct") return;
    const correct = answerId === currentExercise.promptId;
    const sessionItemId = `${sessionRunId}:${currentExercise.id}:${sessionIndex}`;
    if (shouldRecordSessionEvents(sessionFromSharedLink || sessionIsTrial)) setAttempts((current) => appendAttempt(current, { id: crypto.randomUUID(), sessionId: sessionRunId, sessionItemId, exerciseId: currentExercise.sourceExerciseId ?? currentExercise.id, wordId: currentExercise.promptId, answerId, optionIds: currentExercise.optionIds, correct, mode: sessionMode, createdAt: new Date().toISOString(), childId: sessionChildId || activeChild?.id, therapistId: therapist?.id }).events);
    setAnswerState(correct ? "correct" : "wrong");
    setWrongAnswerId(correct ? null : answerId);
    playFeedbackTone(correct ? "correct" : "wrong", soundEffects);
    if (!correct) window.setTimeout(() => setWrongAnswerId((current) => current === answerId ? null : current), 900);
    if (correct && currentPresentation === "words" && promptWord && spokenCorrectKey.current !== sessionItemId) {
      spokenCorrectKey.current = sessionItemId;
      window.setTimeout(() => speakWord(promptWord), soundEffects ? 360 : 0);
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
    const shared = sessionFromSharedLink;
    const returnView = sessionReturnView.current;
    setSessionActive(false);
    setSessionComplete(false);
    setSessionFromSharedLink(false);
    setSessionIsTrial(false);
    setSharedPreview(null);
    setAnswerState("idle");
    setWrongAnswerId(null);
    if (shared) { window.history.replaceState({ lgView: "home" }, "", window.location.pathname); setView("home"); return; }
    if (window.history.state?.lgActivity) window.history.back();
    else setView(returnView);
  };
  const nextExercise = () => {
    if (sessionIndex >= sessionExercises.length - 1) {
      if (sessionFromSharedLink) { notify("Anteprima completata"); closeActiveSession(); return; }
      if (sessionIsTrial) { notify("Prova completata · nessun risultato registrato"); closeActiveSession(); return; }
      setSessionActive(false); setSessionComplete(true); setAnswerState("idle"); setWrongAnswerId(null); notify("Sessione completata e salvata"); return;
    }
    setSessionIndex((index) => index + 1); setAnswerState("idle"); setWrongAnswerId(null);
  };
  const recordClassificationAttempt = (itemId: string, answer: string, correct: boolean) => {
    if (!currentExercise || !shouldRecordSessionEvents(sessionFromSharedLink || sessionIsTrial)) return;
    const exerciseId = currentExercise.sourceExerciseId ?? currentExercise.id;
    const sessionItemId = `${sessionRunId}:${exerciseId}:${itemId}`;
    setAttempts((current) => appendAttempt(current, { id: crypto.randomUUID(), sessionId: sessionRunId, sessionItemId, exerciseId, wordId: itemId, answerId: answer, correct, mode: sessionMode, createdAt: new Date().toISOString(), childId: sessionChildId || activeChild?.id, therapistId: therapist?.id }).events);
  };

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
    sessionStorage.setItem("lg-therapist-session", therapistId);
    setLoggedInTherapistId(therapistId);
    const nextTherapist = therapists.find((item) => item.id === therapistId);
    if (nextTherapist && !nextTherapist.childIds.includes(activeChildId)) setActiveChildId(nextTherapist.childIds[0] ?? "");
  };
  const logout = () => { sessionStorage.removeItem("lg-therapist-session"); setLoggedInTherapistId(null); setShowTherapistLogin(false); setView("home"); };
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

  if (!sessionChecked || (pendingSharedPreviewToken && (sharedPreviewStatus === "idle" || sharedPreviewStatus === "loading"))) return <div className="auth-loading"><Sparkles /><span>{pendingSharedPreviewToken ? "Caricamento anteprima…" : "Caricamento dati…"}</span></div>;
  if (pendingSharedPreviewToken && sharedPreviewStatus === "error") return <PublicPreviewError />;
  if (sessionFromSharedLink && sharedPreview && sessionActive) {
    const previewChild: ChildProfile = { id: "preview", firstName: "Anteprima", lastName: "", birthYear: "", notes: "", avatarColor: "#7568d9" };
    return <main className="public-preview-shell"><SessionView active complete={false} fromSharedLink isTrial={false} mode={sessionMode} setMode={setSessionMode} presentation={currentPresentation} setPresentation={setSessionPresentation} sequences={[]} therapists={[]} showSequenceOwners={false} activeChild={previewChild} childProfiles={[]} onSelectChild={() => undefined} onStartSequence={() => undefined} onStartQuick={() => undefined} quickCanBeSaved={false} onSaveQuick={() => undefined} completionComment="" onSaveCompletionComment={() => undefined} onCloseComplete={() => undefined} onExit={closeActiveSession} currentIndex={sessionIndex} total={sessionExercises.length} exercise={currentExercise} prompt={promptItem} library={sessionLibrary} answerState={answerState} wrongAnswerId={wrongAnswerId} onChoose={chooseAnswer} onClassificationAttempt={recordClassificationAttempt} onClassificationComplete={nextExercise} onHelp={addHelp} onNext={nextExercise} soundEffects={soundEffects} onToggleSound={() => setSoundEffects((current) => !current)} />{toast && <div className="toast" role="status"><Check size={18} />{toast}</div>}</main>;
  }
  if (!allLocalDataLoaded || backendStatus === "loading" || backendStatus === "migrating") return <div className="auth-loading"><Sparkles /><span>{backendStatus === "migrating" ? "Trasferimento dei dati nel cloud…" : "Caricamento dati…"}</span></div>;
  if (backendStatus === "error" && !backendInitialized) return <BackendErrorScreen />;
  if (!therapist) return showTherapistLogin ? <TherapistLogin therapists={therapists} backendStatus={backendStatus} onLogin={login} onBack={() => setShowTherapistLogin(false)} /> : <PublicLanding onLogin={() => setShowTherapistLogin(true)} />;
  if (!activeChild) return <ChildChooser therapist={therapist} childProfiles={children} onChoose={setActiveChildId} onLogout={logout} />;

  return (
    <div className="app-shell">
      <Sidebar view={view} onNavigate={navigate} open={menuOpen} onClose={() => setMenuOpen(false)} therapist={therapist} onLogout={logout} backendStatus={backendStatus} />
      <main className="main-content">
        <Topbar onMenu={() => setMenuOpen(true)} therapist={therapist} child={activeChild} childProfiles={sessionActive ? [activeChild] : associatedChildren} onSelectChild={setActiveChildId} onOpenProfiles={() => navigate("profiles")} backendStatus={backendStatus} />
        {view === "home" && <Dashboard therapist={therapist} child={activeChild} libraryCount={visibleLibrary.length} exerciseCount={visibleExercises.length} sequenceCount={sequenceExercises.length} accuracy={accuracy} attemptCount={firstAttempts.length} onStart={() => navigate("session")} onNavigate={navigate} />}
        {view === "library" && <LibraryView items={visibleLibrary} search={search} setSearch={setSearch} onUpload={() => setShowUpload(true)} onEdit={setEditingItem} onDelete={setPendingLibraryDelete} />}
        {view === "exercises" && <ExercisesView exercises={visibleExercises} sequences={visibleSequences} activeSequence={activeSequence} therapists={therapists} showSequenceOwners={canSeeAllSequences} library={visibleLibrary} onSelectSequence={setActiveSequenceId} onCreateSequence={() => setEditingSequence("new")} onRenameSequence={() => activeSequence && setEditingSequence(activeSequence)} onDeleteSequence={() => activeSequence && setPendingSequenceDelete(activeSequence)} onBuild={(kind) => { setEditingExercise(null); setNewExerciseKind(kind); setShowBuilder(true); }} onEdit={(exercise) => { setEditingExercise(exercise); setNewExerciseKind(exerciseKind(exercise)); setShowBuilder(true); }} onDuplicate={duplicateExercise} onDelete={setPendingExerciseDelete} onToggleInSequence={toggleExerciseInSequence} onMove={moveSequenceExercise} onTry={tryExercise} onShareSequence={() => activeSequence && shareLaunch({ kind: "sequence", id: activeSequence.id }, activeSequence.title)} onShareExercise={(exercise) => shareLaunch({ kind: "exercise", id: exercise.id }, exercise.title)} />}
        {view === "session" && <SessionView active={sessionActive} complete={sessionComplete} fromSharedLink={sessionFromSharedLink} isTrial={sessionIsTrial} mode={sessionMode} setMode={setSessionMode} presentation={currentPresentation} setPresentation={setSessionPresentation} sequences={visibleSequences} therapists={therapists} showSequenceOwners={canSeeAllSequences} activeChild={activeChild} childProfiles={associatedChildren} onSelectChild={setActiveChildId} onStartSequence={startSequenceById} onStartQuick={startQuickSession} quickCanBeSaved={Boolean(quickExerciseToSave)} onSaveQuick={saveQuickAsSequence} completionComment={completedSessionRecord?.comment ?? ""} onSaveCompletionComment={(comment) => { setSessionHistory((current) => current.map((record) => record.id === sessionRunId ? { ...record, comment } : record)); notify("Valutazione della sessione salvata"); }} onCloseComplete={() => { setSessionComplete(false); setQuickExerciseToSave(null); navigate("stats"); }} onExit={closeActiveSession} currentIndex={sessionIndex} total={sessionExercises.length} exercise={currentExercise} prompt={promptItem} library={sessionLibrary} answerState={answerState} wrongAnswerId={wrongAnswerId} onChoose={chooseAnswer} onClassificationAttempt={recordClassificationAttempt} onClassificationComplete={nextExercise} onHelp={addHelp} onNext={nextExercise} soundEffects={soundEffects} onToggleSound={() => setSoundEffects((current) => !current)} />}
        {view === "stats" && <StatsView child={activeChild} therapist={therapist} therapists={therapists} attempts={childAttempts} helps={childHelps} histories={childSessionHistory} exercises={exercises} library={library} onSaveHistoryComment={(id, comment) => { setSessionHistory((current) => current.map((record) => record.id === id ? { ...record, comment } : record)); notify("Valutazione aggiornata"); }} onDeleteHistory={(id, label) => setPendingHistoryDelete({ id, label })} onDeleteAllHistory={() => setPendingHistoryDelete({ label: `tutto lo storico di ${activeChild.firstName}` })} onReset={() => setPendingStatsReset(true)} />}
        {view === "profiles" && <ProfilesView key={`${therapist.id}:${associatedChildren.map((child) => child.id).join(":")}`} therapist={therapist} therapists={therapists} childProfiles={associatedChildren} allChildren={children} activeChildId={activeChild.id} canDeleteTherapist={therapists.length > 1 && therapist.role !== "Amministratore"} onSelectChild={setActiveChildId} onSaveTherapist={(updated) => { setTherapists((current) => current.map((item) => item.id === updated.id ? updated : item)); notify("Profilo adulto aggiornato"); }} onSaveTherapists={(updated) => { setTherapists(updated); notify("Profili adulti e associazioni aggiornati"); }} onSaveChild={(updated) => { setChildren((current) => current.map((item) => item.id === updated.id ? updated : item)); notify("Profilo bambino aggiornato"); }} onRequestDelete={setPendingDelete} />}
      </main>
      {showUpload && <UploadDialog onClose={() => setShowUpload(false)} onSave={async (item) => { try { const remote = backendStatus === "local" ? null : await uploadRemoteImage(crypto.randomUUID(), item.image!); const imageKey = `library-image-${item.id}`; await storeLibraryImage(imageKey, item.image!); setLibrary((current) => [{ ...item, imageKey, remoteImageId: remote?.id }, ...current]); setShowUpload(false); notify(remote ? "Immagine salvata nel cloud" : "Immagine salvata su questo dispositivo"); } catch { notify("Impossibile salvare la foto"); } }} />}
      {editingItem && <EditLibraryDialog item={editingItem} onClose={() => setEditingItem(null)} onSave={async (updated) => { try { let next = updated; if (updated.image && updated.image !== editingItem.image) { const remote = backendStatus === "local" ? null : await uploadRemoteImage(crypto.randomUUID(), updated.image); const imageKey = `library-image-${updated.id}-${crypto.randomUUID()}`; await storeLibraryImage(imageKey, updated.image); next = { ...updated, imageKey, remoteImageId: remote?.id }; } setLibrary((current) => current.map((item) => item.id === next.id ? next : item)); setEditingItem(null); notify(backendStatus === "local" ? "Elemento salvato su questo dispositivo" : "Elemento salvato nel cloud"); } catch { notify("Impossibile salvare le modifiche"); } }} />}
      {pendingLibraryDelete && <LibraryDeleteDialog item={pendingLibraryDelete} onCancel={() => setPendingLibraryDelete(null)} onConfirm={() => { setLibrary((current) => current.map((item) => item.id === pendingLibraryDelete.id ? { ...item, deleted: true } : item)); setPendingLibraryDelete(null); notify("Immagine archiviata e rimossa dai nuovi esercizi"); }} />}
      {showBuilder && <ExerciseBuilder kind={editingExercise ? exerciseKind(editingExercise) : newExerciseKind} library={visibleLibrary} exercise={editingExercise ?? undefined} onClose={() => { setShowBuilder(false); setEditingExercise(null); }} onSave={saveExercise} />}
      {editingSequence && <SequenceDialog sequence={editingSequence === "new" ? undefined : editingSequence} therapistId={therapist.id} onClose={() => setEditingSequence(null)} onSave={saveSequence} />}
      {pendingExerciseDelete && <ContentDeleteDialog title={`Eliminare “${pendingExerciseDelete.title}”?`} detail="L’esercizio sarà rimosso dalle sequenze. I risultati già registrati resteranno nello storico." onCancel={() => setPendingExerciseDelete(null)} onConfirm={deleteExercise} />}
      {pendingSequenceDelete && <ContentDeleteDialog title={`Eliminare la sequenza “${pendingSequenceDelete.title}”?`} detail="Gli esercizi e i risultati già registrati resteranno disponibili." onCancel={() => setPendingSequenceDelete(null)} onConfirm={deleteSequence} />}
      {pendingDelete && <DeleteDialog item={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />}
      {pendingHistoryDelete && <ContentDeleteDialog title={`Eliminare ${pendingHistoryDelete.label}?`} detail="Lo storico verrà nascosto agli utenti. Le immagini archiviate resteranno nello storage per non alterare altre sessioni." onCancel={() => setPendingHistoryDelete(null)} onConfirm={() => { const deletedAt = new Date().toISOString(); setSessionHistory((current) => current.map((record) => (!pendingHistoryDelete.id || record.id === pendingHistoryDelete.id) && record.childId === activeChild.id ? { ...record, deletedAt } : record)); setPendingHistoryDelete(null); notify("Storico eliminato"); }} />}
      {pendingStatsReset && <ContentDeleteDialog title={`Azzerare le statistiche di ${activeChild.firstName}?`} detail="Saranno eliminati tutti i tentativi e gli aiuti registrati per questo bambino. Profili, immagini, esercizi e sequenze restano invariati." onCancel={() => setPendingStatsReset(false)} onConfirm={() => { setAttempts((current) => current.filter((attempt) => attempt.childId && attempt.childId !== activeChild.id)); setHelps((current) => current.filter((help) => help.childId && help.childId !== activeChild.id)); setPendingStatsReset(false); notify("Statistiche del bambino azzerate"); }} />}
      {toast && <div className="toast" role="status"><Check size={18} />{toast}</div>}
    </div>
  );
}

function BackendErrorScreen() {
  return <main className="auth-page"><section className="login-card"><div className="auth-icon"><Cloud /></div><span className="eyebrow">SINCRONIZZAZIONE</span><h1>Il cloud non è raggiungibile</h1><p>I dati locali non sono stati cancellati. Riprova quando la connessione è disponibile.</p><button className="primary-button large" onClick={() => window.location.reload()}>Riprova</button></section></main>;
}

function PublicPreviewError() {
  return <main className="auth-page public-preview-error"><section className="login-card"><div className="auth-icon"><AlertTriangle /></div><span className="eyebrow">ANTEPRIMA</span><h1>Link non disponibile</h1><p>Questa anteprima non esiste più oppure il collegamento non è valido.</p><button className="primary-button large" onClick={() => { window.history.replaceState({}, "", "/"); window.location.reload(); }}>Torna alla home</button></section></main>;
}

function PublicLanding({ onLogin }: { onLogin: () => void }) {
  return <main className="auth-page public-landing"><section className="auth-brand"><span className="brand-mark large"><Sparkles /></span><span>Lettura <strong>Globale</strong></span><h1>Imparare a leggere, una parola alla volta.</h1><p>Attività visive semplici e personalizzabili per accompagnare bambini, terapisti e famiglie.</p></section><section className="login-card welcome-card"><div className="auth-icon"><BookOpenCheck /></div><span className="eyebrow">AREA RISERVATA</span><h2>Pronto per iniziare?</h2><p>Accedi con il tuo profilo adulto per aprire il pannello, scegliere il bambino e avviare gli esercizi.</p><button className="primary-button large" onClick={onLogin}><KeyRound />Accedi al pannello</button><div className="welcome-points"><span><Check />Lettura globale con immagini e parole</span><span><Check />Esercizi IL / LA</span><span><Check />Progressi e aiuti registrati</span></div></section></main>;
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
        sessionStorage.setItem("lg-therapist-session", result.therapistId);
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
  return <main className="auth-page"><section className="auth-brand"><span className="brand-mark large"><Sparkles /></span><span>Lettura <strong>Globale</strong></span><p>Uno spazio semplice per preparare e guidare le attività di lettura.</p></section><section className="login-card"><button className="text-button login-back" type="button" onClick={onBack}>← Torna alla pagina iniziale</button><div className="auth-icon"><ShieldCheck /></div><span className="eyebrow">ACCESSO ADULTO</span><h1>Accedi al pannello</h1><p>Scegli il bambino associato dopo l’accesso.</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} autoComplete="username" required /></label><label>PIN<input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "")); setError(""); }} autoComplete="current-password" placeholder="••••" required /></label>{error && <div className="login-error" role="alert">{error}</div>}<button className="primary-button large" type="submit" disabled={submitting}><KeyRound />{submitting ? "Accesso…" : "Accedi"}</button></form><small className="auth-disclaimer">L’accesso collega questo dispositivo ai dati salvati nel cloud.</small></section></main>;
}

function ChildChooser({ therapist, childProfiles, onChoose, onLogout }: { therapist: Therapist; childProfiles: ChildProfile[]; onChoose: (id: string) => void; onLogout: () => void }) {
  const available = childProfiles.filter((child) => therapist.childIds.includes(child.id));
  return <main className="auth-page child-choice-page"><section className="login-card wide-choice"><span className="eyebrow">PROFILO ATTIVO</span><h1>Con chi lavori oggi?</h1><p>Sono mostrati soltanto i bambini associati a {therapist.firstName}.</p><div className="child-choice-grid">{available.map((child) => <button key={child.id} onClick={() => onChoose(child.id)}><span className="profile-avatar" style={{ background: child.avatarColor }}>{child.firstName.slice(0, 1)}</span><strong>{child.firstName} {child.lastName}</strong><small>Anno {child.birthYear}</small><ChevronRight /></button>)}</div>{!available.length && <div className="empty-mini"><Users /><p>Nessun bambino associato.</p><small>Il profilo dovrà essere collegato dall’amministratore.</small></div>}<button className="text-button" onClick={onLogout}><LogOut />Esci</button></section></main>;
}

const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Oggi", icon: Home }, { id: "library", label: "Libreria", icon: Library }, { id: "exercises", label: "Configurazione", icon: BookOpenCheck }, { id: "session", label: "Sessione", icon: Play }, { id: "stats", label: "Progressi", icon: BarChart3 }, { id: "profiles", label: "Profili", icon: UserCog },
];

function Sidebar({ view, onNavigate, open, onClose, therapist, onLogout, backendStatus }: { view: View; onNavigate: (view: View) => void; open: boolean; onClose: () => void; therapist: Therapist; onLogout: () => void; backendStatus: BackendStatus }) {
  const initials = `${therapist.firstName[0] ?? ""}${therapist.lastName[0] ?? ""}`;
  const localOnly = backendStatus === "local";
  return <>{open && <button className="sidebar-backdrop" onClick={onClose} aria-label="Chiudi menu" />}<aside className={`sidebar ${open ? "open" : ""}`}><div className="brand"><span className="brand-mark"><Sparkles size={21} /></span><span>Lettura<br /><strong>Globale</strong></span></div><nav aria-label="Navigazione principale">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "nav-item active" : "nav-item"} onClick={() => onNavigate(id)}><Icon size={20} strokeWidth={2} /><span>{label}</span></button>)}</nav><div className="sidebar-note"><span className="status-dot" /><div><strong>{localOnly ? "Dati su questo dispositivo" : "Dati nel cloud"}</strong><small>{localOnly ? "Il cloud non è disponibile" : "Sincronizzati e protetti"}</small></div></div><div className="profile-card"><button onClick={() => onNavigate("profiles")}><span className="avatar">{initials}</span><span><strong>{therapist.firstName}</strong><small>{therapist.role}</small></span><Settings size={17} /></button><button className="logout-button" onClick={onLogout} aria-label="Esci"><LogOut size={16} /></button></div></aside></>;
}

function Topbar({ onMenu, therapist, child, childProfiles, onSelectChild, onOpenProfiles, backendStatus }: { onMenu: () => void; therapist: Therapist; child: ChildProfile; childProfiles: ChildProfile[]; onSelectChild: (id: string) => void; onOpenProfiles: () => void; backendStatus: BackendStatus }) {
  const syncLabel = backendStatus === "syncing" ? "Sincronizzazione…" : backendStatus === "error" ? "Cloud non raggiungibile" : backendStatus === "local" ? "Solo su questo dispositivo" : "Salvato nel cloud";
  return <header className="topbar"><button className="icon-button menu-button" onClick={onMenu} aria-label="Apri menu"><Menu /></button><label className="child-pill"><span className="child-avatar" style={{ background: child.avatarColor }}>{child.firstName[0]}</span><span><small>Profilo attivo</small><strong>{child.firstName}</strong></span><select value={child.id} onChange={(event) => onSelectChild(event.target.value)} aria-label="Cambia bambino">{childProfiles.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}</select><ChevronRight size={16} /></label><div className="topbar-right"><span className={`private-pill ${backendStatus === "error" || backendStatus === "local" ? "sync-error" : ""}`}><Cloud size={15} />{syncLabel}</span><button className="icon-button" onClick={onOpenProfiles} aria-label={`Profilo di ${therapist.firstName}`}><UserRound /></button></div></header>;
}

function Dashboard({ therapist, child, libraryCount, exerciseCount, sequenceCount, accuracy, attemptCount, onStart, onNavigate }: { therapist: Therapist; child: ChildProfile; libraryCount: number; exerciseCount: number; sequenceCount: number; accuracy: number; attemptCount: number; onStart: () => void; onNavigate: (view: View) => void }) {
  const minutes = Math.max(5, Math.round(sequenceCount * 1.5));
  return <div className="page dashboard-page"><section className="welcome-row"><div><span className="eyebrow">AREA TERAPISTA</span><h1>Buongiorno, {therapist.firstName}</h1><p>Tutto è pronto per la prossima attività con {child.firstName}.</p></div><button className="primary-button" onClick={onStart}><Play size={19} fill="currentColor" />Avvia sessione</button></section><section className="hero-card"><div className="hero-copy"><span className="soft-label">ATTIVITÀ CONSIGLIATA</span><h2>Scegli la prossima attività</h2><p>Apri il pannello Sessione per avviare una singola attività o una sequenza configurata.</p><div className="hero-meta"><span>{sequenceCount} esercizi</span><i /><span>~ {minutes} minuti</span><i /><span>Verifica</span></div><button onClick={onStart}>Apri sessione <ChevronRight size={18} /></button></div><div className="hero-art" aria-hidden="true"><div className="orbit one">A</div><div className="orbit two">🍎</div><div className="orbit three">Aa</div><div className="hero-sun"><Sparkles /></div></div></section><section className="metric-grid"><Metric icon={<MousePointer2 />} label="Primi tentativi" value={String(attemptCount)} detail={`registrati per ${child.firstName}`} tone="lilac" /><Metric icon={<BarChart3 />} label="Accuratezza" value={`${accuracy}%`} detail="sui primi tentativi" tone="mint" /><Metric icon={<BookOpenCheck />} label="Esercizi pronti" value={String(exerciseCount)} detail="in 1 sequenza" tone="peach" /><Metric icon={<FolderHeart />} label="Parole in libreria" value={String(libraryCount)} detail="con immagini e licenze" tone="sky" /></section><section className="two-columns"><div className="panel"><div className="panel-heading"><div><span className="eyebrow">ACCESSO RAPIDO</span><h3>Prepara la prossima attività</h3></div></div><div className="quick-list"><Quick icon={<ImagePlus />} title="Aggiungi una parola" detail="Carica un’immagine privata" onClick={() => onNavigate("library")} /><Quick icon={<BookOpenCheck />} title="Crea un esercizio" detail="Scegli parola e alternative" onClick={() => onNavigate("exercises")} /><Quick icon={<BarChart3 />} title="Guarda i progressi" detail="Primi tentativi e aiuti" onClick={() => onNavigate("stats")} /></div></div><div className="panel calm-panel"><div className="calm-icon"><CircleHelp /></div><h3>L’adulto resta al comando</h3><p>In Lettura Globale nessun aiuto parte in automatico. Durante ogni prova sei tu a decidere se e come intervenire.</p><button onClick={() => onNavigate("session")}>Scopri la sessione <ChevronRight size={17} /></button></div></section></div>;
}

function Metric({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: string }) { return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></article>; }
function Quick({ icon, title, detail, onClick }: { icon: React.ReactNode; title: string; detail: string; onClick: () => void }) { return <button className="quick-item" onClick={onClick}><span>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div><ChevronRight size={18} /></button>; }

function LibraryView({ items, search, setSearch, onUpload, onEdit, onDelete }: { items: LibraryItem[]; search: string; setSearch: (value: string) => void; onUpload: () => void; onEdit: (item: LibraryItem) => void; onDelete: (item: LibraryItem) => void }) {
  const filtered = items.filter((item) => `${item.word} ${item.category}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="page"><section className="page-title-row"><div><span className="eyebrow">CONTENUTI</span><h1>Libreria parole</h1><p>Scegli le immagini da usare negli esercizi. Modifica una scheda per assegnarla a IL, LA oppure escluderla da quel gioco.</p></div><button className="primary-button" onClick={onUpload}><Upload size={18} />Carica immagine</button></section><div className="toolbar"><label className="search-box"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca parola o categoria…" /></label><div className="filter-chip">Tutte <span>{items.length}</span></div><div className="provider-note"><Sparkles size={16} />Catalogo demo autorizzato</div></div><div className="library-grid">{filtered.map((item) => <article className="library-card" key={item.id}><div className="library-art"><Artwork item={item} />{item.privateUpload && <span className="private-badge">Privata</span>}<div className="card-actions"><button onClick={() => onEdit(item)} aria-label={`Modifica ${item.word}`} title="Modifica"><Pencil /></button><button className="delete" onClick={() => onDelete(item)} aria-label={`Elimina ${item.word}`} title="Elimina"><Trash2 /></button></div></div><div className="library-copy"><span className="category">{item.category}{articleFor(item) ? ` · ${articleFor(item)}` : " · NON USATA IN IL/LA"}</span><h3>{item.word.toLocaleUpperCase("it-IT")}</h3><p>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.source}</a> : item.source} · {item.licenseUrl ? <a href={item.licenseUrl} target="_blank" rel="noreferrer">{item.license}</a> : item.license}</p><small>Autore: {item.author}</small></div></article>)}</div>{!filtered.length && <div className="empty-state"><Search /><h3>Nessun risultato</h3><p>Prova un’altra parola o aggiungi una nuova immagine.</p></div>}</div>;
}

function ExercisesView({ exercises, sequences, activeSequence, therapists, showSequenceOwners, library, onSelectSequence, onCreateSequence, onRenameSequence, onDeleteSequence, onBuild, onEdit, onDuplicate, onDelete, onToggleInSequence, onMove, onTry, onShareSequence, onShareExercise }: { exercises: Exercise[]; sequences: Sequence[]; activeSequence?: Sequence; therapists: Therapist[]; showSequenceOwners: boolean; library: LibraryItem[]; onSelectSequence: (id: string) => void; onCreateSequence: () => void; onRenameSequence: () => void; onDeleteSequence: () => void; onBuild: (kind: SessionActivity) => void; onEdit: (exercise: Exercise) => void; onDuplicate: (exercise: Exercise) => void; onDelete: (exercise: Exercise) => void; onToggleInSequence: (exerciseId: string) => void; onMove: (exerciseId: string, direction: -1 | 1) => void; onTry: (exerciseId: string) => void; onShareSequence: () => void; onShareExercise: (exercise: Exercise) => void }) {
  const sequenceExercises = activeSequence?.exerciseIds.map((id) => exercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is Exercise => Boolean(exercise)) ?? [];
  const includedIds = new Set(sequenceExercises.map((exercise) => exercise.id));
  const therapistName = (therapistId: string) => { const owner = therapists.find((item) => item.id === therapistId); return owner ? `${owner.firstName} ${owner.lastName}` : "Terapista non disponibile"; };
  return <div className="page exercises-page">
    <section className="page-title-row"><div><span className="eyebrow">PROGRAMMAZIONE</span><h1>Configurazione</h1><p>Crea, modifica ed elimina esercizi e sequenze. L’avvio delle attività si trova nella sezione Sessione.</p></div></section>
    {activeSequence ? <section className="sequence-banner sequence-manager"><div className="sequence-symbol"><span>1</span><span>2</span><span>3</span></div><div className="sequence-copy"><span className="soft-label">SEQUENZA</span><select value={activeSequence.id} onChange={(event) => onSelectSequence(event.target.value)} aria-label="Seleziona sequenza">{sequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.title}{showSequenceOwners ? ` · ${therapistName(sequence.therapistId)}` : ""}</option>)}</select><p>{sequenceExercises.length} esercizi · {showSequenceOwners ? `terapista: ${therapistName(activeSequence.therapistId)} · ` : ""}salvata nel cloud</p><div className="sequence-actions"><button type="button" onClick={onCreateSequence}><Plus />Nuova</button><button type="button" onClick={onRenameSequence}><Pencil />Rinomina</button><button type="button" onClick={onShareSequence}><Share2 />Condividi</button><button type="button" onClick={onDeleteSequence}><Trash2 />Elimina</button></div></div></section> : <section className="sequence-banner sequence-manager empty-sequence-manager"><div className="sequence-symbol"><span>1</span><span>2</span><span>3</span></div><div className="sequence-copy"><span className="soft-label">SEQUENZE</span><h2>Nessuna sequenza disponibile</h2><p>Crea la prima sequenza per organizzare i tuoi esercizi.</p><div className="sequence-actions"><button type="button" onClick={onCreateSequence}><Plus />Nuova sequenza</button></div></div></section>}
    {activeSequence && <section className="sequence-editor"><div className="section-heading"><div><h2>Ordine della sequenza</h2><p>Usa le frecce per cambiare l’ordine di presentazione.</p></div><span>{sequenceExercises.length} elementi</span></div>{sequenceExercises.length ? <div className="sequence-order-list">{sequenceExercises.map((exercise, index) => <article key={exercise.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{exercise.title}</strong><div><button type="button" disabled={index === 0} onClick={() => onMove(exercise.id, -1)} aria-label={`Sposta ${exercise.title} su`}><ArrowUp /></button><button type="button" disabled={index === sequenceExercises.length - 1} onClick={() => onMove(exercise.id, 1)} aria-label={`Sposta ${exercise.title} giù`}><ArrowDown /></button><button type="button" onClick={() => onToggleInSequence(exercise.id)} aria-label={`Rimuovi ${exercise.title} dalla sequenza`}><X /></button></div></article>)}</div> : <div className="empty-state compact"><BookOpenCheck /><h3>Sequenza vuota</h3><p>Aggiungi almeno un esercizio dal catalogo qui sotto.</p></div>}</section>}
    <div className="catalog-actions"><span className="soft-label">NUOVO ESERCIZIO</span><div className="new-exercise-actions"><button className="primary-button" onClick={() => onBuild("recognition")}><Plus size={19} />Trova la parola</button><button className="ghost-button" onClick={() => onBuild("articles")}><Plus size={19} />IL / LA</button><button className="ghost-button" onClick={() => onBuild("word-categories")}><Plus size={19} />Parola → categoria</button><button className="ghost-button" onClick={() => onBuild("naming")}><Plus size={19} />Mix and vary</button></div></div>
    <div className="section-heading exercise-catalog-heading"><div><h2>Catalogo esercizi</h2><p>Modifica, duplica o aggiungi gli esercizi alla sequenza attiva.</p></div><span>{exercises.length} totali</span></div>
    <div className="exercise-list">{exercises.map((exercise, index) => { const prompt = library.find((item) => item.id === exercise.promptId); const included = includedIds.has(exercise.id); const kind = exerciseKind(exercise); const isArticles = kind === "articles"; const isWordCategories = kind === "word-categories"; const isNaming = kind === "naming"; const description = isArticles ? `IL / LA · ${Math.min(exercise.rounds ?? 6, exercise.articleItemIds?.length ?? 0)} turni · ${exercise.articleItemIds?.length ?? 0} immagini scelte` : isWordCategories ? `Parola → categoria · ${exercise.rounds ?? 6} turni · ${exercise.categoryNames?.length ?? 0} categorie` : isNaming ? `Nomina l’immagine · ${exercise.rounds ?? 6} turni` : exercise.recognitionMode === "random" ? `Casuale · ${exercise.rounds ?? 6} turni · ${exercise.distractorCount ?? 3} distrattori · ${exercise.distractorSource === "same-category" ? "stessa categoria" : "tutte le parole"} · ${exercise.presentation === "words" ? "solo parole" : "foto + parole"}` : `Parola → scelta · ${exercise.optionIds.length} opzioni · ${exercise.presentation === "words" ? "solo parole" : "foto + parole"}`; return <article className="exercise-row" key={exercise.id}><span className="exercise-number">{String(index + 1).padStart(2, "0")}</span><div className={`tiny-art ${isArticles || isWordCategories || isNaming ? "article-icon" : ""}`}>{isArticles ? <strong>IL<br />LA</strong> : isWordCategories ? <strong>A<br />B</strong> : isNaming ? <MousePointer2 /> : exercise.recognitionMode === "random" ? <Sparkles /> : prompt && <Artwork item={prompt} compact />}</div><div className="exercise-copy"><h3>{exercise.title}</h3><p>{description}</p></div><button disabled={!activeSequence} title={activeSequence ? undefined : "Crea prima una sequenza"} className={`sequence-toggle ${included ? "included" : ""}`} onClick={() => onToggleInSequence(exercise.id)}>{included ? <><Check />Nella sequenza</> : <><Plus />Aggiungi</>}</button><div className="exercise-actions"><button onClick={() => onTry(exercise.id)}>Prova</button><button onClick={() => onShareExercise(exercise)} aria-label={`Condividi ${exercise.title}`} title="Condividi"><Share2 /></button><button onClick={() => onEdit(exercise)} aria-label={`Modifica ${exercise.title}`} title="Modifica"><Pencil /></button><button onClick={() => onDuplicate(exercise)} aria-label={`Duplica ${exercise.title}`} title="Duplica"><Copy /></button><button className="delete" onClick={() => onDelete(exercise)} aria-label={`Elimina ${exercise.title}`} title="Elimina"><Trash2 /></button></div></article>; })}</div>
  </div>;
}

type SessionViewProps = { active: boolean; complete: boolean; fromSharedLink: boolean; isTrial: boolean; mode: Mode; setMode: (mode: Mode) => void; presentation: Presentation; setPresentation: (presentation: Presentation) => void; sequences: Sequence[]; therapists: Therapist[]; showSequenceOwners: boolean; activeChild: ChildProfile; childProfiles: ChildProfile[]; onSelectChild: (id: string) => void; onStartSequence: (id: string) => void; onStartQuick: (config: QuickStartConfig) => void; quickCanBeSaved: boolean; onSaveQuick: () => void; completionComment: string; onSaveCompletionComment: (comment: string) => void; onCloseComplete: () => void; onExit: () => void; currentIndex: number; total: number; exercise?: Exercise; prompt?: LibraryItem; library: LibraryItem[]; answerState: "idle" | "wrong" | "correct"; wrongAnswerId: string | null; onChoose: (id: string) => void; onClassificationAttempt: (itemId: string, answer: string, correct: boolean) => void; onClassificationComplete: () => void; onHelp: (label: string, wordId?: string) => void; onNext: () => void; soundEffects: boolean; onToggleSound: () => void };

function SessionView({ active, complete, fromSharedLink, isTrial, mode, setMode, presentation, setPresentation, sequences, therapists, showSequenceOwners, activeChild, childProfiles, onSelectChild, onStartSequence, onStartQuick, quickCanBeSaved, onSaveQuick, completionComment, onSaveCompletionComment, onCloseComplete, onExit, currentIndex, total, exercise, prompt, library, answerState, wrongAnswerId, onChoose, onClassificationAttempt, onClassificationComplete, onHelp, onNext, soundEffects, onToggleSound }: SessionViewProps) {
  const [step, setStep] = useState<"choose" | "quick" | "review" | "ready">("choose");
  const [source, setSource] = useState<"sequence" | "quick">("sequence");
  const [reviewSequenceId, setReviewSequenceId] = useState(sequences[0]?.id ?? "");
  const categoryNames = useMemo(() => Array.from(new Set(library.map((item) => item.category))).sort((a, b) => a.localeCompare(b, "it")), [library]);
  const [quick, setQuick] = useState<QuickStartConfig>(() => ({ activity: "recognition", selection: "all", categoryNames: Array.from(new Set(library.map((item) => item.category))).sort((a, b) => a.localeCompare(b, "it")).slice(0, 2), itemIds: [], rounds: 6, distractorCount: 3, distractorSource: "mixed", presentation }));
  const [completionDraft, setCompletionDraft] = useState(completionComment);
  const sortedSequences = useMemo(() => [...sequences].sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "") || a.title.localeCompare(b.title, "it")), [sequences]);
  const reviewSequence = sequences.find((item) => item.id === reviewSequenceId);
  const therapistName = (therapistId: string) => { const owner = therapists.find((item) => item.id === therapistId); return owner ? `${owner.firstName} ${owner.lastName}` : "Terapista non disponibile"; };
  const articleLibrary = library.filter((item) => articleFor(item));
  const quickBase = quick.activity === "articles" ? articleLibrary : library;
  const quickSelectable = quick.activity === "word-categories" ? quickBase.filter((item) => quick.categoryNames.includes(item.category)) : quickBase;
  const quickCandidates = filterQuickCandidates(quickBase, quick);
  const quickValid = quickStartIsValid(quick, quickCandidates.length) && (quick.activity !== "recognition" || quick.distractorSource === "mixed" || hasSameCategoryDistractors(quickCandidates, quick.distractorCount));
  const reviewCount = source === "quick" ? quick.activity === "recognition" ? quick.rounds : Math.min(quick.rounds, quickCandidates.length) : reviewSequence?.exerciseIds.length ?? 0;
  const reviewTitle = source === "quick" ? quick.activity === "recognition" ? "Trova la parola" : quick.activity === "articles" ? "Articolo IL / LA" : quick.activity === "naming" ? "Mix and vary" : "Parola nella categoria" : reviewSequence?.title ?? "Sequenza";
  const toggleQuickCategory = (category: string) => setQuick((current) => current.categoryNames.includes(category) ? { ...current, categoryNames: current.categoryNames.filter((item) => item !== category), itemIds: current.itemIds.filter((id) => library.find((item) => item.id === id)?.category !== category) } : current.categoryNames.length < 4 ? { ...current, categoryNames: [...current.categoryNames, category] } : current);
  const chooseSequence = (id: string) => { setSource("sequence"); setReviewSequenceId(id); setStep("review"); };
  const beginReviewed = () => { if (source === "quick") onStartQuick(quick); else if (reviewSequenceId) onStartSequence(reviewSequenceId); };
  const previewLabel = fromSharedLink ? "Anteprima" : isTrial ? "Prova" : undefined;

  if (!active && complete) return <div className="page session-setup session-complete-screen"><span className="complete-check"><Check /></span><span className="eyebrow">SESSIONE COMPLETATA</span><h1>Attività salvata</h1><p>Risposte, errori e aiuti sono disponibili nello storico di {activeChild.firstName}.</p><label className="completion-comment">Valutazione della sessione<textarea rows={4} value={completionDraft} onChange={(event) => setCompletionDraft(event.target.value)} placeholder="Annota partecipazione, attenzione, difficoltà o progressi osservati…" /></label><button className="ghost-button" type="button" onClick={() => onSaveCompletionComment(completionDraft)}><Save />Salva valutazione</button>{quickCanBeSaved && <button className="ghost-button" type="button" onClick={onSaveQuick}><Save />Salva l’avvio rapido come sequenza</button>}<button className="primary-button large" type="button" onClick={onCloseComplete}><BarChart3 />Apri storico e progressi</button></div>;
  if (!active && step === "choose") return <div className="page session-wizard"><div className="wizard-heading"><span className="session-big-icon"><Play /></span><div><span className="eyebrow">NUOVA SESSIONE</span><h1>Cosa facciamo oggi?</h1><p>Scegli una sequenza già configurata oppure avvia un’attività veloce.</p></div><button className="sound-toggle setup" type="button" onClick={onToggleSound} aria-pressed={soundEffects}>{soundEffects ? <Volume2 /> : <VolumeX />}{soundEffects ? "Suoni attivi" : "Suoni disattivati"}</button></div><section className="wizard-panel"><span className="choice-label">1 · Bambino</span><div className="wizard-child-list">{childProfiles.map((child) => <button type="button" key={child.id} className={activeChild.id === child.id ? "selected" : ""} onClick={() => onSelectChild(child.id)}><span className="child-avatar" style={{ background: child.avatarColor }}>{child.firstName[0]}</span><strong>{child.firstName} {child.lastName}</strong>{activeChild.id === child.id && <Check />}</button>)}</div></section><section className="wizard-panel"><div className="section-heading"><div><span className="choice-label">2 · Sequenze preparate</span><h2>Scegli una nuvoletta</h2></div><span>{sequences.length} disponibili</span></div>{sortedSequences.length ? <div className="sequence-cloud-grid">{sortedSequences.map((sequence) => <button type="button" className="sequence-cloud" key={sequence.id} disabled={!sequence.exerciseIds.length} onClick={() => chooseSequence(sequence.id)}><Cloud /><strong>{sequence.title}</strong><small>{sequence.exerciseIds.length} esercizi{showSequenceOwners ? ` · ${therapistName(sequence.therapistId)}` : ""}</small><ChevronRight /></button>)}</div> : <div className="empty-mini"><Cloud /><p>Nessuna sequenza disponibile.</p><small>Puoi crearne una nella sezione Configurazione oppure usare l’avvio rapido.</small></div>}</section><section className="wizard-paths single-path"><button type="button" onClick={() => setStep("quick")}><span><Sparkles /></span><strong>Avvio rapido</strong><small>Scegli attività e parole senza salvarle</small><ChevronRight /></button></section></div>;
  if (!active && step === "quick") return <div className="page session-wizard"><WizardBack onClick={() => setStep("choose")} /><div className="wizard-heading compact"><div><span className="eyebrow">AVVIO RAPIDO</span><h1>Configura l’attività</h1><p>Questa configurazione non verrà salvata automaticamente.</p></div></div><section className="wizard-panel"><span className="choice-label">Tipologia</span><div className="mode-picker activity-picker wizard-activity-picker"><button className={quick.activity === "recognition" ? "selected" : ""} onClick={() => setQuick((current) => ({ ...current, activity: "recognition", itemIds: [] }))}><BookOpenCheck /><strong>Trova la parola</strong><small>Parola e distrattori casuali</small></button><button className={quick.activity === "articles" ? "selected" : ""} onClick={() => setQuick((current) => ({ ...current, activity: "articles", itemIds: [] }))}><Library /><strong>Articolo IL / LA</strong><small>Classifica una foto alla volta</small></button><button className={quick.activity === "word-categories" ? "selected" : ""} onClick={() => setQuick((current) => ({ ...current, activity: "word-categories", selection: "categories", itemIds: [] }))}><FolderHeart /><strong>Parola nella categoria</strong><small>Scegli la categoria corretta</small></button><button className={quick.activity === "naming" ? "selected" : ""} onClick={() => setQuick((current) => ({ ...current, activity: "naming", itemIds: [] }))}><MousePointer2 /><strong>Mix and vary</strong><small>Nomina una foto alla volta</small></button></div></section><section className="wizard-panel"><span className="choice-label">Parole e immagini</span><div className="selection-tabs">{(["all", "categories", "items"] as QuickSelection[]).map((selection) => <button key={selection} type="button" className={quick.selection === selection ? "selected" : ""} onClick={() => setQuick((current) => ({ ...current, selection, itemIds: selection === "items" ? current.itemIds : [] }))}>{selection === "all" ? "Tutta la libreria" : selection === "categories" ? "Per categoria" : "Scelta manuale"}</button>)}</div>{(quick.selection === "categories" || quick.activity === "word-categories") && <><div className="builder-label">Categorie <span>{quick.categoryNames.length} scelte{quick.activity === "word-categories" ? " · minimo 2, massimo 4" : ""}</span></div><div className="filter-chips">{categoryNames.map((category) => <button type="button" key={category} className={quick.categoryNames.includes(category) ? "selected" : ""} onClick={() => toggleQuickCategory(category)}>{category}</button>)}</div></>}{quick.selection === "items" && <><div className="builder-label">Elementi <span>{quick.itemIds.length} scelti</span></div><div className="builder-grid compact-words quick-item-grid">{quickSelectable.map((item) => <button type="button" key={item.id} className={quick.itemIds.includes(item.id) ? "selected" : ""} onClick={() => setQuick((current) => ({ ...current, itemIds: current.itemIds.includes(item.id) ? current.itemIds.filter((id) => id !== item.id) : [...current.itemIds, item.id] }))}><strong className="builder-word">{item.word.toLocaleUpperCase("it-IT")}</strong><span>{item.category}{quick.activity === "articles" ? ` · ${articleFor(item)}` : ""}</span>{quick.itemIds.includes(item.id) && <i><Check /></i>}</button>)}</div></>}</section><section className="wizard-panel wizard-settings"><label>Numero di turni<input type="number" min={1} max={50} value={quick.rounds} onChange={(event) => setQuick((current) => ({ ...current, rounds: Math.max(1, Number(event.target.value)) }))} /></label>{quick.activity === "recognition" && <><label>Distrattori<select value={quick.distractorCount} onChange={(event) => setQuick((current) => ({ ...current, distractorCount: Number(event.target.value) as 1 | 2 | 3 | 4 }))}><option value={1}>1 distrattore</option><option value={2}>2 distrattori</option><option value={3}>3 distrattori</option><option value={4}>4 distrattori</option></select></label><label>Origine distrattori<select value={quick.distractorSource} onChange={(event) => setQuick((current) => ({ ...current, distractorSource: event.target.value as DistractorSource }))}><option value="mixed">Tutte le parole selezionate</option><option value="same-category">Solo stessa categoria</option></select></label><label>Presentazione<select value={quick.presentation} onChange={(event) => { const next = event.target.value as Presentation; setQuick((current) => ({ ...current, presentation: next })); setPresentation(next); }}><option value="images">Foto + parole</option><option value="words">Solo parole con voce</option></select></label></>}</section>{!quickValid && <p className="wizard-error">Scegli abbastanza elementi e categorie per avviare questa attività.</p>}<div className="wizard-footer"><button className="ghost-button" onClick={() => setStep("choose")}>Annulla</button><button className="primary-button" disabled={!quickValid} onClick={() => { setSource("quick"); setStep("review"); }}><ChevronRight />Continua</button></div></div>;
  if (!active && step === "review") return <div className="page session-wizard review-step"><WizardBack onClick={() => setStep(source === "quick" ? "quick" : "choose")} /><span className="eyebrow">RIEPILOGO</span><h1>{reviewTitle}</h1><div className="review-card"><div><span>Bambino</span><strong>{activeChild.firstName} {activeChild.lastName}</strong></div><div><span>Contenuto</span><strong>{source === "quick" ? `${reviewCount} turni` : `${reviewCount} esercizi`}</strong></div><div><span>Origine</span><strong>{source === "quick" ? "Avvio rapido" : "Sequenza salvata"}</strong></div></div><section className="wizard-panel"><span className="choice-label">Modalità della sessione</span><div className="mode-picker"><button className={mode === "teaching" ? "selected" : ""} onClick={() => setMode("teaching")}><Sparkles /><strong>Insegnamento</strong><small>Guida, mostra e ripeti</small></button><button className={mode === "test" ? "selected" : ""} onClick={() => setMode("test")}><BookOpenCheck /><strong>Valutazione</strong><small>Misura il primo tentativo</small></button></div></section><div className="wizard-footer"><button className="ghost-button" onClick={() => setStep(source === "quick" ? "quick" : "choose")}>Modifica</button><button className="primary-button large" disabled={!reviewCount} onClick={() => setStep("ready")}><ChevronRight />Continua</button></div></div>;
  if (!active && step === "ready") return <div className="page ready-screen"><span className="ready-cloud"><Cloud /></span><span className="eyebrow">{activeChild.firstName.toLocaleUpperCase("it-IT")}</span><h1>PRONTI?</h1><p>{reviewTitle} · {mode === "test" ? "Valutazione" : "Insegnamento"}</p><div><button className="ghost-button" onClick={() => setStep("review")}>Indietro</button><button className="primary-button large" onClick={beginReviewed}><Play fill="currentColor" />Inizia</button></div></div>;
  if (exercise && exerciseKind(exercise) === "articles") return <ArticleSortSession key={`${exercise.id}:${currentIndex}`} previewLabel={previewLabel} exercise={exercise} library={library} mode={mode} currentIndex={currentIndex} total={total} onAttempt={onClassificationAttempt} onComplete={onClassificationComplete} onHelp={onHelp} onExit={onExit} soundEffects={soundEffects} onToggleSound={onToggleSound} />;
  if (exercise && exerciseKind(exercise) === "word-categories") return <WordCategorySession key={`${exercise.id}:${currentIndex}`} previewLabel={previewLabel} exercise={exercise} library={library} mode={mode} currentIndex={currentIndex} total={total} onAttempt={onClassificationAttempt} onComplete={onClassificationComplete} onHelp={onHelp} onExit={onExit} soundEffects={soundEffects} onToggleSound={onToggleSound} />;
  if (exercise && exerciseKind(exercise) === "naming") return <NamingSession key={`${exercise.id}:${currentIndex}`} previewLabel={previewLabel} exercise={exercise} library={library} mode={mode} currentIndex={currentIndex} total={total} onAttempt={onClassificationAttempt} onComplete={onClassificationComplete} onHelp={onHelp} onExit={onExit} soundEffects={soundEffects} onToggleSound={onToggleSound} />;
  if (!exercise || !prompt) return null;
  return <RecognitionSession key={`${exercise.id}:${currentIndex}`} previewLabel={previewLabel} mode={mode} presentation={presentation} currentIndex={currentIndex} total={total} exercise={exercise} prompt={prompt} library={library} answerState={answerState} wrongAnswerId={wrongAnswerId} onChoose={onChoose} onHelp={onHelp} onNext={onNext} onExit={onExit} soundEffects={soundEffects} onToggleSound={onToggleSound} />;
}

function WizardBack({ onClick }: { onClick: () => void }) {
  return <button className="wizard-back" type="button" onClick={onClick}>← Indietro</button>;
}

function SessionTools({ soundEffects, onToggleSound, onExit }: { soundEffects: boolean; onToggleSound: () => void; onExit: () => void }) {
  return <div className="session-tools"><button className="sound-toggle" type="button" onClick={onToggleSound} aria-label={soundEffects ? "Disattiva effetti sonori" : "Attiva effetti sonori"} aria-pressed={soundEffects}>{soundEffects ? <Volume2 /> : <VolumeX />}</button><button className="ghost-button" onClick={onExit}>Termina</button></div>;
}

function NamingSession({ previewLabel, exercise, library, mode, currentIndex, total, onAttempt, onComplete, onHelp, onExit, soundEffects, onToggleSound }: { previewLabel?: "Anteprima" | "Prova"; exercise: Exercise; library: LibraryItem[]; mode: Mode; currentIndex: number; total: number; onAttempt: (itemId: string, answer: string, correct: boolean) => void; onComplete: () => void; onHelp: (label: string, wordId?: string) => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void }) {
  const candidates = useMemo(() => {
    const allowedIds = exercise.namingItemIds?.length ? new Set(exercise.namingItemIds) : null;
    const categories = exercise.namingCategories?.length ? new Set(exercise.namingCategories) : null;
    return library.filter((item) => (!allowedIds || allowedIds.has(item.id)) && (!categories || categories.has(item.category)));
  }, [exercise.namingCategories, exercise.namingItemIds, library]);
  const [initialIds] = useState(() => shuffled(candidates.map((item) => item.id)).slice(0, Math.max(1, exercise.rounds ?? 6)));
  const [remainingIds, setRemainingIds] = useState(initialIds);
  const [helped, setHelped] = useState(false);
  const [judgement, setJudgement] = useState<"correct" | "wrong" | null>(null);
  const currentId = remainingIds[0];
  const currentItem = library.find((item) => item.id === currentId);
  const completed = remainingIds.length === 0;
  const judge = (correct: boolean) => {
    if (!currentId || judgement) return;
    onAttempt(currentId, helped ? (correct ? "CORRETTO_CON_AIUTO" : "ERRATO_CON_AIUTO") : correct ? "CORRETTO" : "ERRATO", correct);
    if (helped) onHelp("Risposta aiutata", currentId);
    playFeedbackTone(correct ? "correct" : "wrong", soundEffects);
    setJudgement(correct ? "correct" : "wrong");
    window.setTimeout(() => {
      setRemainingIds((current) => current.filter((id) => id !== currentId));
      setHelped(false);
      setJudgement(null);
    }, 650);
  };
  return <div className="session-screen naming-session"><div className="session-header"><div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">Mix and vary</span><strong>{exercise.title}</strong></div><div className="session-progress"><span>Esercizio {currentIndex + 1} di {total} · immagine {initialIds.length - remainingIds.length + (completed ? 0 : 1)} di {initialIds.length}</span><div><i style={{ width: `${initialIds.length ? ((initialIds.length - remainingIds.length) / initialIds.length) * 100 : 100}%` }} /></div></div><SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} /></div><div className="article-body naming-body"><p className="instruction">Chiedi al bambino di nominare ciò che vede, poi registra l’esito.</p>{completed ? <div className="article-complete"><span className="complete-check"><Check /></span><h2>Attività completata</h2><p>Tutte le immagini sono state valutate.</p><button className="primary-button large" onClick={onComplete}>{currentIndex === total - 1 ? (previewLabel ? "Chiudi" : "Concludi") : "Prossimo esercizio"}</button></div> : currentItem ? <><div className={`naming-card ${judgement ?? ""}`} aria-label={`Immagine di ${currentItem.word}`}><Artwork item={currentItem} eager />{judgement && <i className={`choice-mark ${judgement === "correct" ? "correct-mark" : "wrong-mark"}`}>{judgement === "correct" ? <Check /> : <X />}</i>}</div><div className="naming-controls"><label><input type="checkbox" checked={helped} onChange={(event) => setHelped(event.target.checked)} disabled={Boolean(judgement)} />Il bambino è stato aiutato</label><div><button className="naming-wrong" type="button" onClick={() => judge(false)} disabled={Boolean(judgement)}><X />Risposta errata</button><button className="naming-correct" type="button" onClick={() => judge(true)} disabled={Boolean(judgement)}><Check />Risposta corretta</button></div></div></> : <div className="feedback wrong" role="alert">Nessuna immagine disponibile per questo esercizio.</div>}</div></div>;
}

function RecognitionSession({ previewLabel, mode, presentation, currentIndex, total, exercise, prompt, library, answerState, wrongAnswerId, onChoose, onHelp, onNext, onExit, soundEffects, onToggleSound }: { previewLabel?: "Anteprima" | "Prova"; mode: Mode; presentation: Presentation; currentIndex: number; total: number; exercise: Exercise; prompt: LibraryItem; library: LibraryItem[]; answerState: "idle" | "wrong" | "correct"; wrongAnswerId: string | null; onChoose: (id: string) => void; onHelp: (label: string, wordId?: string) => void; onNext: () => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void }) {
  const [optionIds] = useState(() => exercise.sourceExerciseId ? exercise.optionIds : shuffled(exercise.optionIds));
  const onNextRef = useRef(onNext);
  useEffect(() => { onNextRef.current = onNext; }, [onNext]);
  useEffect(() => {
    if (answerState !== "correct") return;
    const timer = window.setTimeout(() => onNextRef.current(), presentation === "words" ? 1100 : 750);
    return () => window.clearTimeout(timer);
  }, [answerState, presentation]);
  return <div className="session-screen"><div className="session-header"><div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">{presentation === "images" ? "Foto + parole" : "Solo parole"}</span><strong>{exercise.title}</strong></div><div className="session-progress"><span>{currentIndex + 1} di {total}</span><div><i style={{ width: `${((currentIndex + 1) / total) * 100}%` }} /></div></div><SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} /></div><div className={`session-body ${presentation === "words" ? "words-session" : ""}`}><p className="instruction">{presentation === "images" ? "Scegli l’immagine corretta" : "Leggi, ascolta e scegli la parola corretta"}</p>{presentation === "images" ? <h1>{prompt.word.toLocaleUpperCase("it-IT")}</h1> : <div className="word-prompt"><h1>{prompt.word.toLocaleUpperCase("it-IT")}</h1><button className="listen-button" type="button" onClick={() => speakWord(prompt.word)}><Volume2 /><span><strong>Riascolta la parola</strong><small>Premi per sentirla di nuovo</small></span></button></div>}<div className={`answer-grid options-${optionIds.length}`}>{optionIds.map((id) => { const item = library.find((entry) => entry.id === id); if (!item) return null; const isCorrect = id === exercise.promptId; const isWrong = wrongAnswerId === id; return <button key={id} aria-label={`${item.word}${isWrong ? ", risposta errata" : ""}`} className={`${answerState === "correct" && isCorrect ? "answer-card correct" : "answer-card"} ${isWrong ? "wrong" : ""} ${presentation === "words" ? "word-only" : ""}`} onClick={() => onChoose(id)}>{presentation === "images" && <div className="answer-art"><Artwork item={item} /></div>}<span>{item.word.toLocaleUpperCase("it-IT")}</span>{answerState === "correct" && isCorrect && <i className="choice-mark correct-mark"><Check /></i>}{isWrong && <i className="choice-mark wrong-mark"><X /></i>}</button>; })}</div>{answerState === "wrong" && <div className="feedback wrong" role="status"><span>Riproviamo insieme.</span><small>{previewLabel ? "Questa prova non viene registrata." : "Il primo tentativo è stato registrato separatamente."}</small></div>}{answerState === "correct" && <div className="feedback correct auto-feedback" role="status"><span>{currentIndex === total - 1 ? (previewLabel ? "Attività completata" : "Sessione completata") : "Ottimo! Passiamo alla prossima parola…"}</span></div>}</div>{!previewLabel && <HelpDock onHelp={(label) => onHelp(label, prompt.id)} />}</div>;
}

function ArticleSortSession({ previewLabel, exercise, library, mode, currentIndex, total, onAttempt, onComplete, onHelp, onExit, soundEffects, onToggleSound }: { previewLabel?: "Anteprima" | "Prova"; exercise: Exercise; library: LibraryItem[]; mode: Mode; currentIndex: number; total: number; onAttempt: (itemId: string, answer: string, correct: boolean) => void; onComplete: () => void; onHelp: (label: string, wordId?: string) => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void }) {
  const [initialIds] = useState(() => shuffled((exercise.articleItemIds ?? []).filter((id) => library.some((item) => item.id === id && articleFor(item)))).slice(0, Math.max(1, exercise.rounds ?? 6)));
  const [remainingIds, setRemainingIds] = useState(initialIds);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wrongId, setWrongId] = useState<string | null>(null);
  const [wrongArticle, setWrongArticle] = useState<Article | null>(null);
  const [feedback, setFeedback] = useState("Tocca IL o LA. Da computer puoi anche trascinare l’immagine.");
  useEffect(() => {
    remainingIds.slice(0, 3).forEach((id) => {
      const source = library.find((item) => item.id === id)?.image;
      if (!source) return;
      const preload = new window.Image();
      preload.decoding = "async";
      preload.src = source;
    });
  }, [remainingIds, library]);
  const initialTotal = initialIds.length;
  const place = (article: Article, explicitId?: string) => {
    const itemId = explicitId ?? draggedId ?? selectedId ?? currentId;
    if (!itemId) return;
    const item = library.find((entry) => entry.id === itemId);
    const correct = Boolean(item && articleFor(item) === article);
    onAttempt(itemId, article, correct);
    playFeedbackTone(correct ? "correct" : "wrong", soundEffects);
    if (correct) {
      setRemainingIds((current) => current.filter((id) => id !== itemId));
      setSelectedId(null);
      setDraggedId(null);
      setWrongId(null);
      setWrongArticle(null);
      setFeedback("Giusto! L’immagine è stata abbinata.");
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
  return <div className="session-screen article-session"><div className="session-header"><div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">Categorie</span><strong>{exercise.title}</strong></div><div className="session-progress"><span>Esercizio {currentIndex + 1} di {total} · immagine {initialTotal - remainingIds.length + (completed ? 0 : 1)} di {initialTotal}</span><div><i style={{ width: `${initialTotal ? ((initialTotal - remainingIds.length) / initialTotal) * 100 : 100}%` }} /></div></div><SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} /></div><div className="article-body"><p className="instruction">Tocca l’articolo corretto. Da computer puoi anche trascinare.</p><h1>IL O LA?</h1>{completed ? <div className="article-complete"><span className="complete-check"><Check /></span><h2>Ottimo lavoro!</h2><p>Tutte le immagini sono state abbinate.</p><button className="primary-button large" onClick={onComplete}>{currentIndex === total - 1 ? (previewLabel ? "Chiudi" : "Concludi") : "Prossimo esercizio"}</button></div> : currentItem ? <><div className="article-tray single"><button type="button" draggable aria-pressed={selectedId === currentId} aria-label={`Immagine ${currentItem.word}. Scegli IL o LA, oppure trascinala da computer${wrongId === currentId ? ". Scelta errata" : ""}`} className={`article-card ${selectedId === currentId ? "selected" : ""} ${wrongId === currentId ? "wrong-return" : ""}`} onClick={() => setSelectedId((current) => current === currentId ? null : currentId)} onDragStart={(event) => { event.dataTransfer.setData("text/plain", currentId); event.dataTransfer.effectAllowed = "move"; setDraggedId(currentId); }} onDragEnd={() => setDraggedId(null)}><div className="article-art"><Artwork key={currentItem.id} item={currentItem} eager /></div><strong>{currentItem.word.toLocaleUpperCase("it-IT")}</strong></button></div><div className="article-boxes">{(["IL", "LA"] as Article[]).map((article) => <button type="button" className={`article-dropbox ${wrongArticle === article ? "wrong" : ""}`} key={article} aria-label={`Assegna ${currentItem.word} a ${article}${wrongArticle === article ? ". Scelta errata" : ""}`} onClick={() => place(article)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); place(article, event.dataTransfer.getData("text/plain")); }}><span>{article}</span><small>Tocca qui</small></button>)}</div><p className={wrongId ? "article-feedback wrong" : "article-feedback"} role="status">{feedback}</p></> : null}</div>{!previewLabel && currentId && <HelpDock onHelp={(label) => onHelp(label, currentId)} />}</div>;
}

function WordCategorySession({ previewLabel, exercise, library, mode, currentIndex, total, onAttempt, onComplete, onHelp, onExit, soundEffects, onToggleSound }: { previewLabel?: "Anteprima" | "Prova"; exercise: Exercise; library: LibraryItem[]; mode: Mode; currentIndex: number; total: number; onAttempt: (itemId: string, answer: string, correct: boolean) => void; onComplete: () => void; onHelp: (label: string, wordId?: string) => void; onExit: () => void; soundEffects: boolean; onToggleSound: () => void }) {
  const categories = useMemo(() => exercise.categoryNames ?? [], [exercise.categoryNames]);
  const candidates = useMemo(() => library.filter((item) => categories.includes(item.category)), [library, categories]);
  const [initialIds] = useState(() => pickCategoryRoundIds(candidates, exercise.categoryItemIds, exercise.rounds ?? 6));
  const [remainingIds, setRemainingIds] = useState(initialIds);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [wrongId, setWrongId] = useState<string | null>(null);
  const [wrongCategory, setWrongCategory] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("Tocca la categoria corretta. Da computer puoi anche trascinare la parola.");
  const currentId = remainingIds[0];
  const currentItem = candidates.find((item) => item.id === currentId);
  const completed = remainingIds.length === 0;
  const place = (category: string, explicitId?: string) => {
    const itemId = explicitId ?? draggedId ?? selectedId ?? currentId;
    if (!itemId) return;
    const item = candidates.find((candidate) => candidate.id === itemId);
    const correct = item?.category === category;
    onAttempt(itemId, category, correct);
    playFeedbackTone(correct ? "correct" : "wrong", soundEffects);
    if (correct) {
      setRemainingIds((current) => current.filter((id) => id !== itemId));
      setSelectedId(null); setDraggedId(null); setWrongId(null); setWrongCategory(null);
      setFeedback("Giusto! La parola è nella categoria corretta.");
    } else {
      setSelectedId(null); setDraggedId(null); setWrongId(itemId); setWrongCategory(category);
      setFeedback("Questa non è la categoria giusta. Riprova.");
      window.setTimeout(() => { setWrongId((current) => current === itemId ? null : current); setWrongCategory((current) => current === category ? null : current); }, 900);
    }
  };
  return <div className="session-screen article-session word-category-session"><div className="session-header"><div><span className="mode-tag">{previewLabel ?? (mode === "test" ? "Valutazione" : "Insegnamento")}</span><span className="mode-tag presentation-tag">Parola → categoria</span><strong>{exercise.title}</strong></div><div className="session-progress"><span>Esercizio {currentIndex + 1} di {total} · parola {initialIds.length - remainingIds.length + (completed ? 0 : 1)} di {initialIds.length}</span><div><i style={{ width: `${initialIds.length ? ((initialIds.length - remainingIds.length) / initialIds.length) * 100 : 100}%` }} /></div></div><SessionTools soundEffects={soundEffects} onToggleSound={onToggleSound} onExit={onExit} /></div><div className="article-body"><p className="instruction">Metti la parola nella categoria giusta.</p>{completed ? <div className="article-complete"><span className="complete-check"><Check /></span><h2>Ottimo lavoro!</h2><p>Tutte le parole sono state classificate.</p><button className="primary-button large" onClick={onComplete}>{currentIndex === total - 1 ? (previewLabel ? "Chiudi" : "Concludi") : "Prossimo esercizio"}</button></div> : currentItem ? <><div className="word-category-tray"><button type="button" draggable aria-pressed={selectedId === currentId} aria-label={`${currentItem.word}${wrongId === currentId ? ". Scelta errata" : ""}`} className={`word-category-card ${selectedId === currentId ? "selected" : ""} ${wrongId === currentId ? "wrong-return" : ""}`} onClick={() => setSelectedId((current) => current === currentId ? null : currentId)} onDragStart={(event) => { event.dataTransfer.setData("text/plain", currentId); event.dataTransfer.effectAllowed = "move"; setDraggedId(currentId); }} onDragEnd={() => setDraggedId(null)}>{currentItem.word.toLocaleUpperCase("it-IT")}</button></div><div className={`article-boxes category-count-${categories.length}`}>{categories.map((category) => <button type="button" className={`article-dropbox word-category-box ${wrongCategory === category ? "wrong" : ""}`} key={category} aria-label={`${category}${wrongCategory === category ? ". Scelta errata" : ""}`} onClick={() => place(category)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); place(category, event.dataTransfer.getData("text/plain")); }}><span>{category.toLocaleUpperCase("it-IT")}</span><small>Tocca qui</small></button>)}</div><p className={wrongId ? "article-feedback wrong" : "article-feedback"} role="status">{feedback}</p></> : <div className="feedback wrong" role="alert">Nessuna parola disponibile per queste categorie.</div>}</div>{!previewLabel && currentId && <HelpDock onHelp={(label) => onHelp(label, currentId)} />}</div>;
}

function HelpDock({ onHelp }: { onHelp: (label: string) => void }) {
  return <aside className="help-dock"><div><CircleHelp /><span><strong>Aiuti dell’adulto</strong><small>Scegli solo quando serve</small></span></div><div className="help-actions">{helpTypes.map((help) => <button key={help} onClick={() => onHelp(help)}>{help}</button>)}</div></aside>;
}

type ProgressKind = "recognition" | "articles" | "word-categories" | "naming";
type ProgressCell = { total: number; correct: number; percent: number | null };
type MonthlyProgress = { month: string; label: string; recognition?: number; articles?: number; "word-categories"?: number; naming?: number };

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
  ];
  const coordinates = (key: ProgressKind) => points.flatMap((point, index) => point[key] === undefined ? [] : [`${x(index)},${y(point[key]!)}`]).join(" ");
  return <div className="learning-chart"><div className="chart-legend">{series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>{points.length ? <><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Evoluzione mensile di ${word}: mesi sull’asse orizzontale e percentuale sull’asse verticale`}><title>Evoluzione mensile di {word}</title>{[0, 25, 50, 75, 100].map((value) => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="chart-grid" /><text x={left - 10} y={y(value) + 4} textAnchor="end" className="chart-axis-label">{value}%</text></g>)}{points.map((point, index) => <text key={point.month} x={x(index)} y={height - 18} textAnchor="middle" className="chart-axis-label">{point.label}</text>)}{series.map((item) => <g key={item.key}>{coordinates(item.key) && <polyline points={coordinates(item.key)} fill="none" stroke={item.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}{points.map((point, index) => point[item.key] === undefined ? null : <circle key={point.month} cx={x(index)} cy={y(point[item.key]!)} r="6" fill={item.color}><title>{item.label}, {point.label}: {point[item.key]}%</title></circle>)}</g>)}</svg>{points.length < 2 && <p className="chart-guidance">Servono rilevazioni in almeno due mesi per mostrare una tendenza.</p>}</> : <div className="empty-mini"><BarChart3 /><p>Nessuna rilevazione per questa parola.</p><small>Il grafico apparirà dopo la prima prova.</small></div>}</div>;
}

function StatsView({ child, therapist, therapists, attempts, helps, histories, exercises, library, onSaveHistoryComment, onDeleteHistory, onDeleteAllHistory, onReset }: { child: ChildProfile; therapist: Therapist; therapists: Therapist[]; attempts: Attempt[]; helps: HelpEvent[]; histories: SessionHistoryRecord[]; exercises: Exercise[]; library: LibraryItem[]; onSaveHistoryComment: (id: string, comment: string) => void; onDeleteHistory: (id: string, label: string) => void; onDeleteAllHistory: () => void; onReset: () => void }) {
  const [selectedMode, setSelectedMode] = useState<Mode>("test");
  const [selectedWordId, setSelectedWordId] = useState("");
  const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const itemMap = new Map(library.map((item) => [item.id, item]));
  const attemptWordId = (attempt: Attempt) => attempt.wordId ?? (attempt.exerciseId.startsWith("article-") ? attempt.exerciseId.slice(8) : exerciseMap.get(attempt.exerciseId)?.promptId);
  const attemptKind = (attempt: Attempt): ProgressKind => exerciseKind(exerciseMap.get(attempt.exerciseId) ?? { id: attempt.exerciseId, title: "", kind: attempt.exerciseId.startsWith("article-") ? "articles" : "recognition", optionIds: [], updatedAt: "" });
  const helpWordId = (help: HelpEvent) => help.wordId ?? exerciseMap.get(help.exerciseId)?.promptId;
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
    helpCount: modeHelps.filter((help) => helpWordId(help) === wordId).length,
  })).sort((a, b) => a.label.localeCompare(b.label, "it"));
  const activeWordId = rows.some((row) => row.wordId === selectedWordId) ? selectedWordId : rows[0]?.wordId ?? "";
  const activeRow = rows.find((row) => row.wordId === activeWordId);
  const monthMap = new Map<string, Record<ProgressKind, { total: number; correct: number }>>();
  modeAttempts.filter((attempt) => attemptWordId(attempt) === activeWordId).forEach((attempt) => {
    const month = attempt.createdAt.slice(0, 7);
    const kind = attemptKind(attempt);
    const record = monthMap.get(month) ?? { recognition: { total: 0, correct: 0 }, articles: { total: 0, correct: 0 }, "word-categories": { total: 0, correct: 0 }, naming: { total: 0, correct: 0 } };
    record[kind].total += 1;
    if (attempt.correct) record[kind].correct += 1;
    monthMap.set(month, record);
  });
  const monthly: MonthlyProgress[] = [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, values]) => {
    const [year, monthNumber] = month.split("-").map(Number);
    const label = new Intl.DateTimeFormat("it-IT", { month: "short", year: "2-digit" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
    return { month, label, recognition: values.recognition.total ? Math.round(values.recognition.correct / values.recognition.total * 100) : undefined, articles: values.articles.total ? Math.round(values.articles.correct / values.articles.total * 100) : undefined, "word-categories": values["word-categories"].total ? Math.round(values["word-categories"].correct / values["word-categories"].total * 100) : undefined, naming: values.naming.total ? Math.round(values.naming.correct / values.naming.total * 100) : undefined };
  });
  const firstCorrect = modeAttempts.filter((attempt) => attempt.correct).length;
  const accuracy = modeAttempts.length ? Math.round(firstCorrect / modeAttempts.length * 100) : 0;
  const activeHelps = modeHelps.filter((help) => helpWordId(help) === activeWordId);
  const sortedHistories = [...histories].sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const modeCopy = selectedMode === "test" ? "Mostra il primo tentativo prima delle correzioni: è la vista principale per osservare acquisizione e mantenimento." : "Mostra la pratica guidata. Risultati e aiuti descrivono il supporto necessario durante l’insegnamento e restano separati dalla valutazione.";
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
  return <details className="session-history-card"><summary><div className={`history-score ${accuracy >= 80 ? "good" : accuracy >= 50 ? "mixed" : "low"}`}><strong>{accuracy}%</strong><small>{correct}/{record.items.length}</small></div><div className="history-summary-copy"><strong>{record.title}</strong><span>{date} · {record.mode === "test" ? "Valutazione" : "Insegnamento"} · {therapistName ? `${therapistName.firstName} ${therapistName.lastName}` : "Profilo archiviato"}</span><div className="history-result-strip" aria-label={`${correct} risposte corrette su ${record.items.length}`}>{record.items.map((item) => <span key={item.id} className={item.firstCorrect ? "correct" : "wrong"} title={`${item.target?.word ?? item.exerciseTitle}: ${item.firstCorrect ? "corretta" : "errore al primo tentativo"}`}>{item.target ? <Artwork item={historyArtworkItem(item.target)} compact /> : <BookOpenCheck />}{item.firstCorrect ? <Check /> : <X />}</span>)}</div></div><ChevronRight className="history-chevron" /></summary><div className="history-details"><div className="history-turn-grid">{record.items.map((item, index) => <article className={item.firstCorrect ? "history-turn correct" : "history-turn wrong"} key={item.id}><div className="history-turn-heading"><span className="history-thumb">{item.target ? <Artwork item={historyArtworkItem(item.target)} compact eager /> : <BookOpenCheck />}</span><div><small>{index + 1} · {item.exerciseTitle}</small><strong>{item.target?.word ?? "Risposta"}</strong></div><span className="history-outcome">{item.firstCorrect ? <><Check />Corretta</> : <><X />Errore iniziale</>}</span></div><div className="history-response-list">{item.responses.map((response, responseIndex) => <span className={response.correct ? "correct" : "wrong"} key={`${response.answerId}:${responseIndex}`}>{response.firstAttempt ? "1°: " : `${responseIndex + 1}°: `}{response.label} {response.correct ? "✓" : "✕"}</span>)}</div>{item.options.length > 1 && <p className="history-options"><strong>Opzioni mostrate:</strong> {item.options.map((option) => option.word).join(", ")}</p>}{item.helpLabels.length > 0 && <p className="history-helps"><CircleHelp />{item.helpLabels.join(" · ")}</p>}</article>)}</div><label className="history-comment">Valutazione della sessione<textarea rows={3} value={comment} readOnly={!canEditComment} onChange={(event) => setComment(event.target.value)} placeholder="Nessuna valutazione inserita." /></label><div className="history-card-actions">{canDelete && <button className="danger-button subtle" onClick={() => onDelete(record.id, `la sessione “${record.title}”`)}><Trash2 />Elimina storico</button>}{canEditComment && <button className="ghost-button" onClick={() => onSaveComment(record.id, comment)}><Save />Salva valutazione</button>}</div></div></details>;
}

function AdminPanel({ therapists, childProfiles, onSave, onRequestDelete }: { therapists: Therapist[]; childProfiles: ChildProfile[]; onSave: (therapists: Therapist[]) => void; onRequestDelete: (item: { kind: "therapist"; id: string; name: string }) => void }) {
  const [drafts, setDrafts] = useState(therapists);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [newRole, setNewRole] = useState<Exclude<ProfileRole, "Amministratore">>("Terapista");
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>(childProfiles[0] ? [childProfiles[0].id] : []);
  const [error, setError] = useState("");
  const toggleAssignment = (therapistId: string, childId: string) => setDrafts((current) => current.map((item) => item.id === therapistId ? { ...item, childIds: item.childIds.includes(childId) ? item.childIds.filter((id) => id !== childId) : [...item.childIds, childId] } : item));
  const changeRole = (therapistId: string, role: Exclude<ProfileRole, "Amministratore">) => setDrafts((current) => current.map((item) => item.id === therapistId ? { ...item, role } : item));
  const persistAssignments = () => {
    if (drafts.some((item) => !item.childIds.length)) { setError("Ogni profilo deve restare associato ad almeno un bambino."); return; }
    setError("");
    onSave(drafts);
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
  return <section className="profile-section admin-panel"><div className="section-heading"><div><span className="eyebrow">AMMINISTRAZIONE</span><h2>Profili adulti e associazioni</h2><p>I profili disponibili sono Amministratore, Genitore, Supervisore e Terapista. Lo stesso bambino può essere seguito da più adulti.</p></div><span>{drafts.length} profili</span></div><div className="therapist-assignment-list">{drafts.map((item) => <article key={item.id}><div><span className="avatar">{`${item.firstName[0] ?? ""}${item.lastName[0] ?? ""}`}</span><span><strong>{item.firstName} {item.lastName}</strong><small>{item.email}</small>{item.role === "Amministratore" ? <small>Amministratore</small> : <label className="admin-role">Ruolo<select value={item.role} onChange={(event) => changeRole(item.id, event.target.value as Exclude<ProfileRole, "Amministratore">)}><option value="Terapista">Terapista</option><option value="Genitore">Genitore</option><option value="Supervisore">Supervisore</option></select></label>}</span></div><fieldset disabled={item.role === "Amministratore"}><legend>Bambini associati</legend>{childProfiles.map((child) => <label key={child.id}><input type="checkbox" checked={item.childIds.includes(child.id)} onChange={() => toggleAssignment(item.id, child.id)} />{child.firstName} {child.lastName}</label>)}</fieldset>{item.role !== "Amministratore" && <button className="danger-button subtle admin-delete-therapist" type="button" onClick={() => onRequestDelete({ kind: "therapist", id: item.id, name: `${item.firstName} ${item.lastName}` })}><Trash2 />Elimina</button>}</article>)}</div><div className="admin-save-row"><p>Le modifiche a ruoli e associazioni diventano attive al prossimo accesso del profilo.</p><button className="ghost-button" type="button" onClick={persistAssignments}><Save />Salva ruoli e associazioni</button></div><form className="admin-create-form" onSubmit={addTherapist}><div className="section-heading"><div><h3>Aggiungi profilo adulto</h3><p>Crea le credenziali, assegna il ruolo e scegli subito i bambini associati.</p></div></div><div className="profile-form"><label>Nome<input value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></label><label>Cognome<input value={lastName} onChange={(event) => setLastName(event.target.value)} required /></label><label>Email<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} required /></label><label>Ruolo<select value={newRole} onChange={(event) => setNewRole(event.target.value as Exclude<ProfileRole, "Amministratore">)}><option value="Terapista">Terapista</option><option value="Genitore">Genitore</option><option value="Supervisore">Supervisore</option></select></label><label>PIN iniziale<input type="password" inputMode="numeric" minLength={4} maxLength={8} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} required /></label></div><fieldset className="new-therapist-children"><legend>Associa almeno un bambino</legend>{childProfiles.map((child) => <label key={child.id}><input type="checkbox" checked={selectedChildIds.includes(child.id)} onChange={() => setSelectedChildIds((current) => current.includes(child.id) ? current.filter((id) => id !== child.id) : [...current, child.id])} />{child.firstName} {child.lastName}</label>)}</fieldset>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" type="submit"><Plus />Aggiungi profilo</button></form></section>;
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

function UploadDialog({ onClose, onSave }: { onClose: () => void; onSave: (item: LibraryItem) => Promise<void> }) {
  const [word, setWord] = useState(""); const [category, setCategory] = useState("Altro"); const [article, setArticle] = useState<Article | "">(""); const [image, setImage] = useState<string | null>(null); const [rights, setRights] = useState(false); const [processing, setProcessing] = useState(false); const [fileError, setFileError] = useState(""); const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !file.type.startsWith("image/")) return; setProcessing(true); setFileError(""); try { setImage(await prepareUploadedImage(file)); } catch { setFileError("Non è stato possibile elaborare questa immagine."); } finally { setProcessing(false); } };
  const save = async () => { if (!word.trim() || !image || !rights || processing) return; setProcessing(true); await onSave({ id: crypto.randomUUID(), word: word.trim(), image, category, article: article || null, source: "Upload privato", license: "Diritto d’uso dichiarato", author: "Utente", privateUpload: true }); setProcessing(false); };
  return <div className="modal-layer" role="dialog" aria-modal="true"><div className="modal"><button className="modal-close" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">NUOVA IMMAGINE</span><h2>Aggiungi alla libreria</h2><p>La foto viene ottimizzata e salvata nel cloud, così resta disponibile anche sugli altri dispositivi.</p><button className={`drop-zone ${image ? "has-image" : ""}`} onClick={() => inputRef.current?.click()}>{image ? <img src={image} alt="Anteprima caricamento" /> : <><Upload /><strong>{processing ? "Ottimizzazione…" : "Scegli un’immagine"}</strong><small>JPG, PNG o WebP</small></>}<input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} /></button>{fileError && <p className="form-error" role="alert">{fileError}</p>}<label>Parola<input value={word} onChange={(event) => setWord(event.target.value)} placeholder="Es. Bicchiere" /></label><label>Categoria<select value={category} onChange={(event) => setCategory(event.target.value)}>{libraryCategories.map((value) => <option key={value}>{value}</option>)}</select></label><label>Articolo nell’esercizio IL / LA<select value={article} onChange={(event) => setArticle(event.target.value as Article | "")}><option value="">Non usare nell’esercizio</option><option value="IL">IL</option><option value="LA">LA</option></select></label><p className="field-note">Scegli IL o LA per inserire automaticamente questa immagine nel gioco degli articoli.</p><label className="check-line"><input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} />Confermo di avere il diritto di usare questa immagine.</label><div className="modal-actions"><button className="ghost-button" onClick={onClose}>Annulla</button><button className="primary-button" disabled={!word.trim() || !image || !rights || processing} onClick={save}>{processing ? "Salvataggio…" : "Aggiungi immagine"}</button></div></div></div>;
}

function EditLibraryDialog({ item, onClose, onSave }: { item: LibraryItem; onClose: () => void; onSave: (item: LibraryItem) => Promise<void> }) {
  const [word, setWord] = useState(item.word);
  const [category, setCategory] = useState(item.category);
  const [article, setArticle] = useState<Article | "">(articleFor(item) ?? "");
  const [image, setImage] = useState(item.image);
  const [imageChanged, setImageChanged] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [fileError, setFileError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !file.type.startsWith("image/")) return; setProcessing(true); setFileError(""); try { setImage(await prepareUploadedImage(file)); setImageChanged(true); } catch { setFileError("Non è stato possibile elaborare questa immagine."); } finally { setProcessing(false); } };
  const save = async () => {
    if (!word.trim() || processing) return;
    setProcessing(true);
    await onSave({ ...item, word: word.trim(), category, article: article || null, ...(imageChanged ? { image, emoji: undefined, source: "Upload privato", sourceUrl: undefined, license: "Diritto d’uso dichiarato", licenseUrl: undefined, author: "Utente", privateUpload: true } : {}) });
    setProcessing(false);
  };
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="edit-library-title"><div className="modal"><button className="modal-close" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">MODIFICA IMMAGINE</span><h2 id="edit-library-title">Modifica la scheda</h2><p>Cambia la parola, la foto o l’assegnazione al gioco IL / LA.</p><button className={`drop-zone ${image ? "has-image" : ""}`} onClick={() => inputRef.current?.click()}>{image ? <img src={image} alt={`Anteprima ${word}`} /> : <><span className="edit-emoji">{item.emoji}</span><strong>{processing ? "Ottimizzazione…" : "Sostituisci immagine"}</strong></>}<input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} /></button>{fileError && <p className="form-error" role="alert">{fileError}</p>}<label>Parola<input value={word} onChange={(event) => setWord(event.target.value)} /></label><label>Categoria<select value={category} onChange={(event) => setCategory(event.target.value)}>{libraryCategories.map((value) => <option key={value}>{value}</option>)}</select></label><label>Articolo nell’esercizio IL / LA<select value={article} onChange={(event) => setArticle(event.target.value as Article | "")}><option value="">Non usare nell’esercizio</option><option value="IL">IL</option><option value="LA">LA</option></select></label><p className="field-note">L’immagine comparirà nel gioco soltanto se scegli IL o LA.</p><div className="modal-actions"><button className="ghost-button" onClick={onClose}>Annulla</button><button className="primary-button" disabled={!word.trim() || processing} onClick={save}><Save />{processing ? "Salvataggio…" : "Salva modifiche"}</button></div></div></div>;
}

function LibraryDeleteDialog({ item, onCancel, onConfirm }: { item: LibraryItem; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="library-delete-title"><div className="modal delete-modal"><span className="delete-icon"><AlertTriangle /></span><span className="eyebrow">ARCHIVIA IMMAGINE</span><h2 id="library-delete-title">Rimuovere {item.word} dalla libreria?</h2><p>La scheda non sarà più proposta nei nuovi esercizi. Il file resterà archiviato per conservare intatti gli storici che lo utilizzano.</p><div className="modal-actions"><button className="ghost-button" onClick={onCancel}>Annulla</button><button className="danger-button solid" onClick={onConfirm}><Trash2 />Archivia immagine</button></div></div></div>;
}

function ExerciseBuilder({ kind, exercise, library, onClose, onSave }: { kind: SessionActivity; exercise?: Exercise; library: LibraryItem[]; onClose: () => void; onSave: (exercise: Exercise) => void }) {
  const initialPromptId = exercise?.promptId ?? library[0]?.id ?? "";
  const [title, setTitle] = useState(exercise?.title ?? "");
  const [promptId, setPromptId] = useState(initialPromptId);
  const [options, setOptions] = useState<string[]>(exercise?.optionIds ?? library.slice(0, 3).map((item) => item.id));
  const [recognitionMode, setRecognitionMode] = useState<"fixed" | "random">(exercise?.recognitionMode ?? (exercise ? "fixed" : "random"));
  const [recognitionItemIds, setRecognitionItemIds] = useState<string[]>(exercise?.recognitionItemIds ?? []);
  const [recognitionCategories, setRecognitionCategories] = useState<string[]>(exercise?.recognitionCategories ?? []);
  const [namingItemIds, setNamingItemIds] = useState<string[]>(exercise?.namingItemIds ?? []);
  const [namingCategories, setNamingCategories] = useState<string[]>(exercise?.namingCategories ?? []);
  const [distractorCount, setDistractorCount] = useState<1 | 2 | 3 | 4>(exercise?.distractorCount ?? 3);
  const [distractorSource, setDistractorSource] = useState<DistractorSource>(exercise?.distractorSource ?? "mixed");
  const [exercisePresentation, setExercisePresentation] = useState<Presentation>(exercise?.presentation ?? "images");
  const articleCandidates = useMemo(() => library.filter((item) => articleFor(item)), [library]);
  const [articleItemIds, setArticleItemIds] = useState<string[]>(exercise?.articleItemIds ?? articleCandidates.slice(0, 6).map((item) => item.id));
  const availableCategories = useMemo(() => Array.from(new Set(library.map((item) => item.category))).sort((a, b) => a.localeCompare(b, "it")), [library]);
  const defaultCategoryNames = ["Cibi", "Animali", "Trasporti"].filter((category) => availableCategories.includes(category));
  const [categoryNames, setCategoryNames] = useState<string[]>(exercise?.categoryNames ?? defaultCategoryNames);
  const [categoryItemIds, setCategoryItemIds] = useState<string[]>(exercise?.categoryItemIds ?? defaultCategoryNames.flatMap((category) => library.filter((item) => item.category === category).slice(0, 3).map((item) => item.id)));
  const [rounds, setRounds] = useState(exercise?.rounds ?? 6);
  const randomCandidates = library.filter((item) => (!recognitionCategories.length || recognitionCategories.includes(item.category)) && (!recognitionItemIds.length || recognitionItemIds.includes(item.id)));
  const randomConfigValid = randomCandidates.length >= distractorCount + 1 && (distractorSource === "mixed" || hasSameCategoryDistractors(randomCandidates, distractorCount));
  const prompt = library.find((item) => item.id === promptId);
  const finalOptions = useMemo(() => Array.from(new Set([promptId, ...options])).filter(Boolean).slice(0, 4), [promptId, options]);
  const toggle = (id: string) => {
    if (id === promptId) return;
    setOptions((current) => current.includes(id) ? current.filter((item) => item !== id) : finalOptions.length < 4 ? [...current, id] : current);
  };
  const saveFixed = () => onSave({
    id: exercise?.id ?? crypto.randomUUID(),
    title: title.trim() || `Trova ${prompt?.word.toLowerCase() ?? "la parola"}`,
    kind: "recognition",
    recognitionMode: "fixed",
    presentation: exercisePresentation,
    promptId,
    optionIds: finalOptions,
    updatedAt: new Date().toISOString(),
    deleted: false,
  });
  const saveRandom = () => onSave({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Trova la parola · casuale", kind: "recognition", recognitionMode: "random", presentation: exercisePresentation, promptId: "", optionIds: [], recognitionItemIds, recognitionCategories, distractorCount, distractorSource, rounds: Math.max(1, rounds), updatedAt: new Date().toISOString(), deleted: false });
  if (kind === "naming") {
    const categoryCandidates = library.filter((item) => !namingCategories.length || namingCategories.includes(item.category));
    const selectedCandidates = namingItemIds.length ? categoryCandidates.filter((item) => namingItemIds.includes(item.id)) : categoryCandidates;
    const toggleNamingCategory = (category: string) => setNamingCategories((current) => current.includes(category) ? current.filter((value) => value !== category) : [...current, category]);
    const toggleNamingItem = (id: string) => setNamingItemIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    const saveNamingExercise = () => onSave({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Mix and vary", kind: "naming", promptId: "", optionIds: [], namingItemIds, namingCategories, rounds: Math.min(Math.max(1, rounds), selectedCandidates.length), updatedAt: new Date().toISOString(), deleted: false });
    return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="exercise-builder-title"><div className="modal wide"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">{exercise ? "MODIFICA ESERCIZIO" : "NUOVO ESERCIZIO"}</span><h2 id="exercise-builder-title">Mix and vary</h2><p>Mostra una foto senza testo. L’adulto indica se la risposta è corretta o errata e se il bambino è stato aiutato.</p><label>Titolo<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Mix and vary" /></label><label>Numero di turni<input type="number" min={1} max={Math.max(1, selectedCandidates.length)} value={Math.min(Math.max(1, rounds), selectedCandidates.length || 1)} onChange={(event) => setRounds(Number(event.target.value))} /></label><div className="builder-label">Filtra per categorie <span>{namingCategories.length ? `${namingCategories.length} scelte` : "Tutte"}</span></div><div className="filter-chips">{availableCategories.map((category) => <button type="button" key={category} className={namingCategories.includes(category) ? "selected" : ""} onClick={() => toggleNamingCategory(category)} aria-pressed={namingCategories.includes(category)}>{category}</button>)}</div><div className="builder-label">Immagini specifiche <span>{namingItemIds.length ? `${namingItemIds.length} scelte` : "Casuali dal filtro"}</span></div><div className="builder-grid">{categoryCandidates.map((item) => <button type="button" key={item.id} className={namingItemIds.includes(item.id) ? "selected" : ""} onClick={() => toggleNamingItem(item.id)} aria-pressed={namingItemIds.includes(item.id)}><Artwork item={item} compact /><span>{item.word.toLocaleUpperCase("it-IT")}</span>{namingItemIds.includes(item.id) && <i><Check /></i>}</button>)}</div><div className="modal-actions"><button className="ghost-button" type="button" onClick={onClose}>Annulla</button><button className="primary-button" type="button" disabled={!selectedCandidates.length} onClick={saveNamingExercise}><Save />Salva esercizio</button></div></div></div>;
  }
  if (kind === "articles") {
    const selectedIds = articleItemIds.filter((id) => articleCandidates.some((item) => item.id === id));
    const finalRounds = Math.min(Math.max(1, rounds), selectedIds.length || 1);
    const toggleArticleItem = (id: string) => setArticleItemIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]);
    const saveArticleExercise = () => onSave({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Classifica IL o LA", kind: "articles", promptId: "", optionIds: [], articleItemIds: selectedIds, rounds: finalRounds, updatedAt: new Date().toISOString(), deleted: false });
    return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="exercise-builder-title"><div className="modal wide"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">{exercise ? "MODIFICA ESERCIZIO" : "NUOVO ESERCIZIO"}</span><h2 id="exercise-builder-title">Categorie IL / LA</h2><p>Scegli le immagini disponibili e quante mostrarne, una alla volta, durante ogni esecuzione.</p><label>Titolo<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Classifica IL o LA" /></label><label>Numero di turni<input type="number" min={1} max={Math.max(1, selectedIds.length)} value={finalRounds} onChange={(event) => setRounds(Number(event.target.value))} /></label><div className="builder-label">Immagini da classificare <span>{selectedIds.length} scelte</span></div><div className="builder-grid">{articleCandidates.map((item) => <button type="button" key={item.id} className={selectedIds.includes(item.id) ? "selected" : ""} onClick={() => toggleArticleItem(item.id)} aria-pressed={selectedIds.includes(item.id)}><Artwork item={item} compact /><span>{item.word.toLocaleUpperCase("it-IT")} · {articleFor(item)}</span>{selectedIds.includes(item.id) && <i><Check /></i>}</button>)}</div><div className="modal-actions"><button className="ghost-button" type="button" onClick={onClose}>Annulla</button><button className="primary-button" type="button" disabled={!selectedIds.length} onClick={saveArticleExercise}><Save />Salva esercizio</button></div></div></div>;
  }
  if (kind === "word-categories") {
    const eligibleItems = library.filter((item) => categoryNames.includes(item.category));
    const selectedIds = categoryItemIds.filter((id) => eligibleItems.some((item) => item.id === id));
    const toggleCategory = (category: string) => setCategoryNames((current) => current.includes(category) ? current.filter((value) => value !== category) : [...current, category]);
    const toggleCategoryItem = (id: string) => setCategoryItemIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    const saveCategoryExercise = () => onSave({ id: exercise?.id ?? crypto.randomUUID(), title: title.trim() || "Metti la parola nella categoria", kind: "word-categories", promptId: "", optionIds: [], categoryNames, categoryItemIds: selectedIds, rounds: Math.min(Math.max(1, rounds), selectedIds.length), updatedAt: new Date().toISOString(), deleted: false });
    return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="exercise-builder-title"><div className="modal wide"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">{exercise ? "MODIFICA ESERCIZIO" : "NUOVO ESERCIZIO"}</span><h2 id="exercise-builder-title">Parola nella categoria</h2><p>Mostra una parola alla volta e scegli in quale categoria inserirla.</p><label>Titolo<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Metti la parola nella categoria" /></label><label>Numero di turni<input type="number" min={1} max={Math.max(1, selectedIds.length)} value={Math.min(Math.max(1, rounds), selectedIds.length || 1)} onChange={(event) => setRounds(Number(event.target.value))} /></label><div className="builder-label">Categorie <span>{categoryNames.length} scelte</span></div><div className="filter-chips">{availableCategories.map((category) => <button type="button" key={category} className={categoryNames.includes(category) ? "selected" : ""} onClick={() => toggleCategory(category)} aria-pressed={categoryNames.includes(category)}>{category}</button>)}</div><div className="builder-label">Parole da classificare <span>{selectedIds.length} scelte</span></div><div className="builder-grid">{eligibleItems.map((item) => <button type="button" key={item.id} className={selectedIds.includes(item.id) ? "selected" : ""} onClick={() => toggleCategoryItem(item.id)} aria-pressed={selectedIds.includes(item.id)}><strong className="builder-word">{item.word.toLocaleUpperCase("it-IT")}</strong><span>{item.category}</span>{selectedIds.includes(item.id) && <i><Check /></i>}</button>)}</div><div className="modal-actions"><button className="ghost-button" type="button" onClick={onClose}>Annulla</button><button className="primary-button" type="button" disabled={categoryNames.length < 2 || !selectedIds.length} onClick={saveCategoryExercise}><Save />Salva esercizio</button></div></div></div>;
  }
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="exercise-builder-title"><div className="modal wide"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">{exercise ? "MODIFICA ESERCIZIO" : "NUOVO ESERCIZIO"}</span><h2 id="exercise-builder-title">Trova la parola</h2><p>La modalità casuale è quella standard. La modalità fissa permette di scegliere manualmente parola e distrattori.</p><label>Titolo<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={recognitionMode === "random" ? "Trova la parola · casuale" : prompt ? `Trova ${prompt.word.toLowerCase()}` : "Titolo esercizio"} /></label><label>Presentazione<select value={exercisePresentation} onChange={(event) => setExercisePresentation(event.target.value as Presentation)}><option value="images">Foto + parole</option><option value="words">Solo parole con voce</option></select></label><div className="builder-mode"><button type="button" className={recognitionMode === "random" ? "selected" : ""} onClick={() => setRecognitionMode("random")}><Sparkles /><strong>Casuale</strong><small>Parola e distrattori cambiano a ogni sessione</small></button><button type="button" className={recognitionMode === "fixed" ? "selected" : ""} onClick={() => setRecognitionMode("fixed")}><Settings /><strong>Fissa</strong><small>Configura manualmente ogni opzione</small></button></div>{recognitionMode === "random" ? <><div className="builder-inline-fields"><label>Numero di turni<input type="number" min={1} max={50} value={Math.max(1, rounds)} onChange={(event) => setRounds(Number(event.target.value))} /></label><label>Distrattori<select value={distractorCount} onChange={(event) => setDistractorCount(Number(event.target.value) as 1 | 2 | 3 | 4)}><option value={1}>1 distrattore</option><option value={2}>2 distrattori</option><option value={3}>3 distrattori</option><option value={4}>4 distrattori</option></select></label><label>Origine distrattori<select value={distractorSource} onChange={(event) => setDistractorSource(event.target.value as DistractorSource)}><option value="mixed">Tutte le parole selezionate</option><option value="same-category">Solo stessa categoria</option></select></label></div><div className="builder-label">Filtra per categorie <span>{recognitionCategories.length ? `${recognitionCategories.length} scelte` : "Tutte"}</span></div><div className="filter-chips">{availableCategories.map((category) => <button type="button" key={category} className={recognitionCategories.includes(category) ? "selected" : ""} onClick={() => setRecognitionCategories((current) => current.includes(category) ? current.filter((value) => value !== category) : [...current, category])} aria-pressed={recognitionCategories.includes(category)}>{category}</button>)}</div><div className="builder-label">Limita a parole specifiche <span>{recognitionItemIds.length ? `${recognitionItemIds.length} scelte` : "Tutte"}</span></div><div className="builder-grid compact-words">{library.filter((item) => !recognitionCategories.length || recognitionCategories.includes(item.category)).map((item) => <button type="button" key={item.id} className={recognitionItemIds.includes(item.id) ? "selected" : ""} onClick={() => setRecognitionItemIds((current) => current.includes(item.id) ? current.filter((value) => value !== item.id) : [...current, item.id])} aria-pressed={recognitionItemIds.includes(item.id)}><strong className="builder-word">{item.word.toLocaleUpperCase("it-IT")}</strong><span>{item.category}</span>{recognitionItemIds.includes(item.id) && <i><Check /></i>}</button>)}</div></> : <><label>Parola da riconoscere<select value={promptId} onChange={(event) => { const nextId = event.target.value; setPromptId(nextId); setOptions((current) => current.filter((id) => id !== nextId)); }}>{library.map((item) => <option key={item.id} value={item.id}>{item.word}</option>)}</select></label><div className="builder-label">Immagini da mostrare <span>{finalOptions.length}/4</span></div><div className="builder-grid">{library.map((item) => <button type="button" key={item.id} className={finalOptions.includes(item.id) ? "selected" : ""} onClick={() => toggle(item.id)} aria-pressed={finalOptions.includes(item.id)}><Artwork item={item} compact /><span>{item.word.toLocaleUpperCase("it-IT")}</span>{finalOptions.includes(item.id) && <i><Check /></i>}</button>)}</div></>}<div className="modal-actions"><button className="ghost-button" type="button" onClick={onClose}>Annulla</button><button className="primary-button" type="button" disabled={recognitionMode === "fixed" ? !promptId || finalOptions.length < 2 : !randomConfigValid} onClick={recognitionMode === "random" ? saveRandom : saveFixed}><Save />Salva esercizio</button></div></div></div>;
}

function SequenceDialog({ sequence, therapistId, onClose, onSave }: { sequence?: Sequence; therapistId: string; onClose: () => void; onSave: (sequence: Sequence) => void }) {
  const [title, setTitle] = useState(sequence?.title ?? "");
  const save = () => onSave({ id: sequence?.id ?? crypto.randomUUID(), title: title.trim(), exerciseIds: sequence?.exerciseIds ?? [], therapistId: sequence?.therapistId ?? therapistId, updatedAt: new Date().toISOString(), deleted: false });
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="sequence-dialog-title"><div className="modal"><button className="modal-close" type="button" onClick={onClose} aria-label="Chiudi"><X /></button><span className="eyebrow">{sequence ? "MODIFICA SEQUENZA" : "NUOVA SEQUENZA"}</span><h2 id="sequence-dialog-title">{sequence ? "Rinomina la sequenza" : "Crea una sequenza"}</h2><p>Gli esercizi si aggiungono e si riordinano dalla pagina successiva.</p><label>Nome della sequenza<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Es. Parole della settimana" /></label><div className="modal-actions"><button className="ghost-button" type="button" onClick={onClose}>Annulla</button><button className="primary-button" type="button" disabled={!title.trim()} onClick={save}><Save />Salva sequenza</button></div></div></div>;
}

function ContentDeleteDialog({ title, detail, onCancel, onConfirm }: { title: string; detail: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="content-delete-title"><div className="modal delete-modal"><span className="delete-icon"><AlertTriangle /></span><span className="eyebrow">CONFERMA ELIMINAZIONE</span><h2 id="content-delete-title">{title}</h2><p>{detail}</p><div className="modal-actions"><button className="ghost-button" type="button" onClick={onCancel}>Annulla</button><button className="danger-button solid" type="button" onClick={onConfirm}><Trash2 />Elimina</button></div></div></div>;
}

function downloadCsv(attempts: Attempt[]) {
  const header = "data,esercizio,risposta,corretto,primo_tentativo,modalita"; const rows = attempts.map((item) => [item.createdAt, item.exerciseId, item.answerId, item.correct, item.firstAttempt, item.mode].join(",")); const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "lettura-globale-progressi.csv"; link.click(); URL.revokeObjectURL(url);
}
