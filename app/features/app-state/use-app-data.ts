import { useCallback, useEffect, useRef, useState } from "react";
import { type CategorySymbols } from "../../domain/category-images";
import { seedDefaultCategorySymbols } from "../../domain/category-symbol-catalog";
import { OFFICIAL_CATALOG_URL, type OfficialCatalogEntry } from "../../domain/scheduled-catalog";
import { fetchWithTimeout } from "../../shared/cloud-client";
import { deduplicateLibraryPlaceholders } from "../../domain/library-deduplication";
import { type SessionHistoryRecord } from "../../domain/session-history";
import { type AppearanceSettings, defaultAppearance, hydrateAppearance } from "../../domain/appearance";
import { defaultSoundPreferences, hydrateSoundPreferences, type SoundPreferences } from "../../domain/sound-preferences";
import { useStoredState } from "../../shared/hooks";
import { readLibraryImage, storeLibraryImage } from "../../shared/media-storage";
import { initialAdministrator, initialChildren, initialExercises, initialSequences, initialTherapists, stockItems } from "../../shared/seed-data";
import { hydrateExercises, hydrateLibrary, hydrateSequences, libraryForStorage, mergeById, mergeOfficialLibrary, remapExerciseLibraryIds } from "../../shared/state-hydration";
import { type Attempt, type BackendState, type ChildProfile, type Exercise, type HelpEvent, type LibraryItem, type Sequence, type Therapist } from "../../shared/types";

type ApplyBackendStateOptions = {
  /** Library to use instead of `state.library` (e.g. after recovering pending uploads). */
  library?: LibraryItem[];
  /** Explicit sound preferences; `null` keeps the current ones, `undefined` hydrates `state.soundPreferences`. */
  soundPreferences?: SoundPreferences | null;
};

/**
 * Account data persisted locally (as a reactive copy) and mirrored to the cloud:
 * profiles, library, exercises, sequences, results and preferences. Also keeps the
 * local copy healthy (image restore, placeholder de-duplication) and exposes a
 * single `applyBackendState` used whenever a cloud revision replaces local state.
 */
export function useAppData(notify: (message: string, duration?: number) => void) {
  const [therapists, setTherapists, therapistsLoaded] = useStoredState<Therapist[]>("lg-therapists", initialTherapists, (saved) => {
    if (localStorage.getItem("lg-profiles-v2-seeded")) return mergeById(saved, [initialAdministrator]);
    localStorage.setItem("lg-profiles-v2-seeded", "1");
    return mergeById(saved, initialTherapists);
  });
  const [children, setChildren, childrenLoaded] = useStoredState<ChildProfile[]>("lg-children", initialChildren);
  const [activeChildId, setActiveChildId, activeChildLoaded] = useStoredState<string>("lg-active-child", initialChildren[0].id);
  const [library, setLibrary, libraryLoaded] = useStoredState<LibraryItem[]>("lg-library", stockItems, hydrateLibrary, libraryForStorage);
  const [exercises, setExercises, exercisesLoaded] = useStoredState<Exercise[]>("lg-exercises", initialExercises, hydrateExercises);
  const [sequences, setSequences, sequencesLoaded] = useStoredState<Sequence[]>("lg-sequences", initialSequences, hydrateSequences);
  const [activeSequenceId, setActiveSequenceId, activeSequenceLoaded] = useStoredState<string>("lg-active-sequence", initialSequences[0].id);
  const [attempts, setAttempts, attemptsLoaded] = useStoredState<Attempt[]>("lg-attempts", []);
  const [helps, setHelps, helpsLoaded] = useStoredState<HelpEvent[]>("lg-helps", []);
  const [sessionHistory, setSessionHistory, sessionHistoryLoaded] = useStoredState<SessionHistoryRecord[]>("lg-session-history", []);
  const [appearance, setAppearance, appearanceLoaded] = useStoredState<AppearanceSettings>("lg-appearance", defaultAppearance, hydrateAppearance);
  const [categorySymbols, setCategorySymbols, categorySymbolsLoaded] = useStoredState<CategorySymbols>("lg-category-symbols", seedDefaultCategorySymbols({}, []));
  const [soundPreferences, setSoundPreferences, soundPreferencesLoaded] = useStoredState<SoundPreferences>("lg-sound-preferences", defaultSoundPreferences, hydrateSoundPreferences);
  const [tracingOrderRequired, setTracingOrderRequired, tracingOrderLoaded] = useStoredState<boolean>("lg-tracing-order-required", false, saved => saved === true);
  const [localLoadSlow, setLocalLoadSlow] = useState(false);

  const officialCatalog = useRef<{ entries: OfficialCatalogEntry[]; snapshot: string }>({ entries: [], snapshot: "[]" });
  const catalogRequestId = useRef(0);
  const refreshOfficialCatalog = useCallback(async () => {
    const requestId = ++catalogRequestId.current;
    try {
      const response = await fetchWithTimeout(OFFICIAL_CATALOG_URL, { cache: "no-store" });
      if (!response.ok) return;
      const { entries } = await response.json() as { entries: OfficialCatalogEntry[] };
      if (!Array.isArray(entries) || requestId !== catalogRequestId.current) return;
      const snapshot = JSON.stringify(entries);
      if (snapshot === officialCatalog.current.snapshot) return;
      officialCatalog.current = { entries, snapshot };
      setLibrary(previous => mergeOfficialLibrary(previous, entries));
    } catch {
      // The stored library remains usable until the network is back.
    }
  }, [setLibrary]);

  useEffect(() => {
    if (!libraryLoaded) return;
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void refreshOfficialCatalog();
    };
    refresh();
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [libraryLoaded, refreshOfficialCatalog]);

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
    restoreImages().catch(() => notify("Non è stato possibile recuperare una foto salvata"));
    return () => { cancelled = true; };
  }, [library, notify, setLibrary]);

  const allLocalDataLoaded = therapistsLoaded && childrenLoaded && activeChildLoaded && libraryLoaded && exercisesLoaded && sequencesLoaded && activeSequenceLoaded && attemptsLoaded && helpsLoaded && sessionHistoryLoaded && appearanceLoaded && soundPreferencesLoaded && categorySymbolsLoaded && tracingOrderLoaded;
  const localBootstrapSnapshot = useRef<BackendState>({ schemaVersion: 1, therapists, children, activeChildId, activeSequenceId, library, exercises, sequences, attempts, helps, sessionHistory, appearance, soundPreferences, categorySymbols, tracingOrderRequired });

  useEffect(() => {
    localBootstrapSnapshot.current = { schemaVersion: 1, therapists, children, activeChildId, activeSequenceId, library, exercises, sequences, attempts, helps, sessionHistory, appearance, soundPreferences, categorySymbols, tracingOrderRequired };
  }, [therapists, children, activeChildId, activeSequenceId, library, exercises, sequences, attempts, helps, sessionHistory, appearance, soundPreferences, categorySymbols, tracingOrderRequired]);

  useEffect(() => {
    if (allLocalDataLoaded) return;
    const timer = window.setTimeout(() => setLocalLoadSlow(true), 6000);
    return () => window.clearTimeout(timer);
  }, [allLocalDataLoaded]);

  useEffect(() => {
    if (!libraryLoaded || !exercisesLoaded) return;
    const deduplicated = deduplicateLibraryPlaceholders(library);
    if (!deduplicated.replacements.size) return;
    if (deduplicated.items.some((item, index) => item !== library[index])) setLibrary(deduplicated.items);
    const repaired = exercises.map((exercise) => remapExerciseLibraryIds(exercise, deduplicated.replacements));
    if (repaired.some((exercise, index) => exercise !== exercises[index])) setExercises(repaired);
  }, [library, exercises, libraryLoaded, exercisesLoaded, setLibrary, setExercises]);

  const applyBackendState = useCallback((state: BackendState, options: ApplyBackendStateOptions = {}) => {
    setTherapists(mergeById(state.therapists ?? [], [initialAdministrator]));
    setChildren(state.children?.length ? state.children : initialChildren);
    setActiveChildId(state.activeChildId || state.children?.[0]?.id || initialChildren[0].id);
    setLibrary(hydrateLibrary(options.library ?? state.library ?? stockItems, officialCatalog.current.entries).map((item) => item.remoteImageId ? { ...item, image: `/api/media/${encodeURIComponent(item.remoteImageId)}` } : item));
    setExercises(hydrateExercises(state.exercises ?? []));
    setSequences(hydrateSequences(state.sequences ?? []));
    setActiveSequenceId(state.activeSequenceId || state.sequences?.[0]?.id || initialSequences[0].id);
    setAttempts(state.attempts ?? []);
    setHelps(state.helps ?? []);
    setSessionHistory(state.sessionHistory ?? []);
    setAppearance(hydrateAppearance(state.appearance));
    setTracingOrderRequired(state.tracingOrderRequired === true);
    setCategorySymbols(seedDefaultCategorySymbols(state.categorySymbols ?? {}, state.library ?? []));
    if (options.soundPreferences !== null) setSoundPreferences(options.soundPreferences ?? hydrateSoundPreferences(state.soundPreferences));
  }, [setTherapists, setChildren, setActiveChildId, setLibrary, setExercises, setSequences, setActiveSequenceId, setAttempts, setHelps, setSessionHistory, setAppearance, setCategorySymbols, setSoundPreferences, setTracingOrderRequired]);

  return {
    therapists, setTherapists, children, setChildren, activeChildId, setActiveChildId,
    library, setLibrary, exercises, setExercises, sequences, setSequences, activeSequenceId, setActiveSequenceId,
    attempts, setAttempts, helps, setHelps, sessionHistory, setSessionHistory, appearance, setAppearance,
    categorySymbols, setCategorySymbols, soundPreferences, setSoundPreferences, tracingOrderRequired, setTracingOrderRequired,
    allLocalDataLoaded, localLoadSlow, localBootstrapSnapshot, applyBackendState, refreshOfficialCatalog,
  };
}

export type AppData = ReturnType<typeof useAppData>;
