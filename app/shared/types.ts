import type { InterfaceStyle } from "../domain/appearance";
import { type CategorySymbols } from "../domain/category-images";
import { type AttemptEvent, type HelpEventRecord, type SessionMode } from "../domain/session-events";
import { type SessionHistoryRecord } from "../domain/session-history";
import { type SyllableFilter, type SyllableStatus } from "../domain/syllabification";
import { type SessionActivity, type SessionExercise } from "../domain/session-compilation";
import { type AppearanceSettings } from "../domain/appearance";
import { type QuantityObjectSet } from "../domain/quantity-exercise";
import { type SoundPreferences } from "../domain/sound-preferences";
import { type PhraseStructure, type SentenceDifficulty, type SentenceOptionCount } from "../domain/sentence-matching";

export type View = "home" | "library" | "exercises" | "session" | "stats" | "profiles" | "appearance" | "caa" | "games";

export type Mode = SessionMode;

export type Presentation = "images" | "words";

export type Article = "IL" | "LA";

export type QuickSelection = "all" | "categories" | "items";

export type DistractorSource = "mixed" | "same-category";

export type QuickStartConfig = { categorySpeakWord?: boolean; categoryShowTargetImage?: boolean; categoryShowSymbols?: boolean; activity: SessionActivity; selection: QuickSelection; categoryNames: string[]; itemIds: string[]; rounds: number; distractorCount: 1 | 2 | 3 | 4; distractorSource: DistractorSource; presentation: Presentation; recognitionSyllables: SyllableFilter; autoPronounce: boolean; matchAutoPronounce: boolean; quantityMin: number; quantityMax: number; quantityObjectSet: QuantityObjectSet; quantityAutoComplete: boolean; quantitySpeakNumbers: boolean; quantityErrorless: boolean; quantityIdleSeconds: number; sentenceOptionCount: SentenceOptionCount; sentenceDifficulty: SentenceDifficulty };

export type LibraryItem = { categorySymbolOnly?: boolean; id: string; word: string; emoji?: string; image?: string; imageKey?: string; remoteImageId?: string; category: string; source: string; sourceUrl?: string; license: string; licenseUrl?: string; author: string; article?: Article | null; syllabification?: string; syllableCount?: number; syllableStatus?: SyllableStatus; contentKind?: "word" | "sentence"; phraseStructure?: PhraseStructure; subject?: string; verb?: string; complement?: string; privateUpload?: boolean; deleted?: boolean };

export type Exercise = SessionExercise & {
  ownerAdultId?: string;
  sequenceId?: string;
  templateExerciseId?: string;
};

export type Sequence = { id: string; title: string; exerciseIds: string[]; therapistId: string; updatedAt?: string; lastUsedAt?: string; deleted?: boolean };

export type Attempt = AttemptEvent;

export type HelpEvent = HelpEventRecord;

export type ProfileRole = "Amministratore" | "Genitore" | "Supervisore" | "Terapista";

export type Therapist = { id: string; firstName: string; lastName: string; email: string; role: ProfileRole; pinHash?: string; pin?: string; childIds: string[] };

export type ChildProfile = { id: string; firstName: string; lastName: string; birthYear: string; notes: string; avatarColor: string };

export type BackendState = { interfaceStyle?: InterfaceStyle; categorySymbols?: CategorySymbols; schemaVersion: 1; therapists: Therapist[]; children: ChildProfile[]; activeChildId: string; activeSequenceId?: string; library: LibraryItem[]; exercises: Exercise[]; sequences: Sequence[]; attempts: Attempt[]; helps: HelpEvent[]; sessionHistory: SessionHistoryRecord[]; appearance?: AppearanceSettings; soundPreferences?: SoundPreferences; tracingOrderRequired?: boolean };

export type BackendStatus = "loading" | "migrating" | "ready" | "syncing" | "local" | "error";

export type SharedPreviewPayload = { schemaVersion: 1; kind: "exercise" | "sequence"; title: string; exercises: Exercise[]; library: LibraryItem[] };

export type CategoryOptions = Pick<Exercise, "categorySpeakWord" | "categoryShowTargetImage" | "categoryShowSymbols">;
