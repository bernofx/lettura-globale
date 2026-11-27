import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { preserveExerciseDraft } from "../../domain/exercise-draft-storage";
import type { DraftRecovery } from "../../domain/queued-exercise-edits";
import { recoverPendingRemoteUploads } from "../../domain/library-deduplication";
import { retryOperation } from "../../domain/retry";
import { buildStateChange, parseStateChangeRequest, type StateChangeRequest } from "../../domain/state-changes";
import { buildCloudSaveChange, rebaseCloudSaveChange, replayEditsAfterSave } from "../../domain/cloud-save-change";
import { THERAPIST_SESSION_STORAGE_KEY } from "../../domain/therapist-session";
import { appendSaveJournal } from "../../domain/save-journal";
import { hydrateSoundPreferences } from "../../domain/sound-preferences";
import { seedDefaultCategorySymbols } from "../../domain/category-symbol-catalog";
import { cloudSaveCanSettle } from "../../domain/share-preparation";
import { backendResponseError, clearPendingCloudSave, fetchWithTimeout, readPendingCloudSave, saveErrorDetails, storePendingCloudSave } from "../../shared/cloud-client";
import { readLibraryImage, uploadRemoteImage } from "../../shared/media-storage";
import { backendStateForStorage, discardUnauthorizedNewSequences, normalizeBackendState } from "../../shared/state-hydration";
import { type BackendState, type BackendStatus, type LibraryItem } from "../../shared/types";
import type { ProgressReferences } from "../../domain/state-visibility";
import { useStoredState } from "../../shared/hooks";
import { type AppData } from "./use-app-data";

type CloudStateRead = { state: BackendState | null; revision: number; progressReferences?: ProgressReferences };

function writeContent(change: StateChangeRequest) {
  return JSON.stringify([change.collections, change.values, change.libraryReplacements]);
}

type CloudSyncOptions = {
  data: AppData;
  loggedInTherapistId: string | null;
  setLoggedInTherapistId: (id: string | null) => void;
  logoutState: "idle" | "pending" | "failed";
  sessionActive: boolean;
  sessionReady: boolean;
  notify: (message: string, duration?: number) => void;
};

/**
 * Cloud-first persistence of the account state: initial load or migration,
 * periodic/resume refresh, debounced granular saves with conflict rebase,
 * offline queue and media repair. The local copy is only a reactive mirror.
 */
export function useCloudSync({ data, loggedInTherapistId, setLoggedInTherapistId, logoutState, sessionActive, sessionReady, notify }: CloudSyncOptions) {
  const {
    therapists, children, activeChildId, activeSequenceId, library, setLibrary, exercises, sequences, attempts, helps,
    sessionHistory, appearance, soundPreferences, categorySymbols, tracingOrderRequired, interfaceStyle, setCategorySymbols, allLocalDataLoaded, localBootstrapSnapshot, currentSnapshot, applyBackendState,
  } = data;
  const [progressReferences, setProgressReferences] = useStoredState<ProgressReferences | null>("lg-progress-references", null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("loading");
  const [backendRetryKey, setBackendRetryKey] = useState(0);
  const [backendRefreshKey, setBackendRefreshKey] = useState(0);
  const [backendSaveRetryKey, setBackendSaveRetryKey] = useState(0);
  const [backendInitialized, setBackendInitialized] = useState(false);
  const backendHydrating = useRef(true);
  const backendSaveTimer = useRef<number | null>(null);
  const backendRevision = useRef(0);
  const lastStateReadTag = useRef("");
  const lastStateReadAdultId = useRef<string | null>(null);
  const lastSyncedBackendState = useRef<BackendState | null>(null);
  const reconciledSave = useRef<{ requested: BackendState; confirmed: BackendState } | null>(null);
  const localFallbackBaseline = useRef<BackendState | null>(null);
  const backendSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const backendPendingWrites = useRef(0);
  const granularWritesUnavailable = useRef(false);
  const localMediaRepairing = useRef(false);
  const lastBackendSaveError = useRef("");
  const rejectedWrite = useRef<{ profileId: string | null; content: string; error: unknown } | null>(null);
  const lastResumeCheck = useRef(0);
  const [exerciseDraftRevision, setExerciseDraftRevision] = useState(0);
  const draftRecovery: DraftRecovery = useMemo(() => ({
    adultId: loggedInTherapistId,
    preserve(adultId, draft) {
      preserveExerciseDraft(localStorage, adultId, draft);
      setExerciseDraftRevision(revision => revision + 1);
      if (adultId === loggedInTherapistId) notify("Un esercizio è cambiato nel cloud. Trovi la tua bozza in Esercizi.", 7000);
    },
  }), [loggedInTherapistId, notify]);

  const fallBackToLocal = useCallback(() => {
    localFallbackBaseline.current = currentSnapshot();
    backendHydrating.current = false;
    setBackendStatus("local");
  }, [currentSnapshot]);

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
    if (!loggedInTherapistId || logoutState !== "idle" || !backendInitialized || sessionActive || sessionReady || !navigator.onLine || backendStatus === "syncing" || backendSaveTimer.current !== null) return;
    const baseline = lastSyncedBackendState.current;
    if (!baseline) return;
    const local = currentSnapshot();
    if (buildStateChange(baseline, local, crypto.randomUUID(), backendRevision.current)) return;
    let cancelled = false;
    const refresh = async () => {
      await backendSaveQueue.current.catch(() => undefined);
      const scopeChanged = lastStateReadAdultId.current !== loggedInTherapistId;
      const tag = scopeChanged ? "" : lastStateReadTag.current;
      const response = await fetchWithTimeout("/api/state", { cache: "no-store", headers: tag ? { "if-none-match": tag } : {} }, 6500);
      if (response.status === 304) return;
      if (!response.ok) throw await backendResponseError(response, "backend_refresh_failed");
      const result = await response.json() as CloudStateRead;
      if (cancelled || !result.state || result.revision < backendRevision.current) return;
      const confirmed = lastSyncedBackendState.current;
      if (confirmed && buildStateChange(confirmed, currentSnapshot(), crypto.randomUUID(), backendRevision.current)) return;
      lastStateReadTag.current = response.headers.get("etag") ?? "";
      lastStateReadAdultId.current = loggedInTherapistId;
      if (result.revision === backendRevision.current && !scopeChanged) return;
      const saved = result.state;
      const savedBaseline = normalizeBackendState(saved);
      backendHydrating.current = true;
      backendRevision.current = result.revision;
      lastSyncedBackendState.current = backendStateForStorage(savedBaseline);
      setProgressReferences(result.progressReferences ?? null);
      applyBackendState(saved, { soundPreferences: saved.soundPreferences ? undefined : null });
      backendHydrating.current = false;
      setBackendStatus("ready");
      notify("Dati aggiornati dal cloud");
    };
    void refresh().catch((error) => {
      if (cancelled) return;
      appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "refresh_failed", revision: backendRevision.current, ...saveErrorDetails(error) });
      // This effect only runs when the local snapshot matches the last confirmed
      // cloud revision. A failed read therefore does not mean that data is unsaved.
      setBackendStatus("ready");
    });
    return () => { cancelled = true; };
  }, [backendRefreshKey, backendInitialized, backendStatus, loggedInTherapistId, logoutState, notify, sessionActive, sessionReady, applyBackendState, setProgressReferences, currentSnapshot]);

  useEffect(() => {
    if (!loggedInTherapistId || logoutState !== "idle" || !backendInitialized || sessionActive || sessionReady) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        if (backendStatus === "error") setBackendSaveRetryKey((current) => current + 1);
        else setBackendRefreshKey((current) => current + 1);
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [backendInitialized, backendStatus, loggedInTherapistId, logoutState, sessionActive, sessionReady]);

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
      const result = await response.json() as CloudStateRead;
      if (cancelled) return;
      lastStateReadTag.current = response.headers.get("etag") ?? "";
      lastStateReadAdultId.current = loggedInTherapistId;

      if (result.state) {
        const saved = result.state;
        const savedBaseline = normalizeBackendState(saved);
        let restoredState = savedBaseline;
        const pendingSave = readPendingCloudSave();
        let recoveredPendingSave = false;
        if (pendingSave) {
          try {
            const restored = rebaseCloudSaveChange(savedBaseline, pendingSave.change, crypto.randomUUID(), result.revision, draftRecovery);
            restoredState = restored.state as BackendState;
            if (restored.replacementConflict) notify("La Libreria è cambiata. Controlla la foto prima di sostituire il segnaposto.", 7000);
            restoredState = discardUnauthorizedNewSequences(savedBaseline, restoredState, loggedInTherapistId);
            recoveredPendingSave = Boolean(buildStateChange(savedBaseline, restoredState, crypto.randomUUID(), result.revision));
            if (!recoveredPendingSave) clearPendingCloudSave();
          } catch (error) {
            // If the draft could not be preserved, keep the original queued change.
            if (error instanceof Error && error.message === "exercise_draft_storage_unavailable") throw error;
            clearPendingCloudSave();
          }
        }
        const recoveredLibrary = recoverPendingRemoteUploads(restoredState.library, localBootstrapSnapshot.current.library);
        backendRevision.current = result.revision;
        lastSyncedBackendState.current = backendStateForStorage(savedBaseline);
        appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "cloud_loaded", revision: result.revision, sequenceCount: restoredState.sequences.length });
        localFallbackBaseline.current = null;
        setProgressReferences(result.progressReferences ?? null);
        applyBackendState(restoredState, { library: recoveredLibrary, soundPreferences: hydrateSoundPreferences(restoredState.soundPreferences ?? localBootstrapSnapshot.current.soundPreferences) });
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
      const migrated: BackendState = { ...local, library: migratedLibrary, categorySymbols: seedDefaultCategorySymbols(local.categorySymbols ?? {}, []) };
      const saveResponse = await retryOperation(() => fetchWithTimeout("/api/state", { method: "PUT", headers: { "content-type": "application/json", "x-base-revision": String(result.revision) }, body: JSON.stringify(backendStateForStorage(migrated)) }, 6500), { attempts: 2, delayMs: 500 });
      if (!saveResponse.ok) throw new Error("backend_migration_failed");
      const saveResult = await saveResponse.json() as { revision: number };
      if (cancelled) return;
      backendRevision.current = saveResult.revision;
      lastSyncedBackendState.current = backendStateForStorage(migrated);
      setLibrary(migratedLibrary);
      setCategorySymbols(migrated.categorySymbols ?? {});
      backendHydrating.current = false;
      setBackendInitialized(true);
      setBackendStatus("ready");
    };
    initializeBackend().catch((error) => {
      if (cancelled) return;
      appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "cloud_load_failed", ...saveErrorDetails(error) });
      fallBackToLocal();
    });
    return () => { cancelled = true; };
  }, [allLocalDataLoaded, backendInitialized, backendRetryKey, draftRecovery, loggedInTherapistId, setLibrary, setCategorySymbols, applyBackendState, setProgressReferences, fallBackToLocal, localBootstrapSnapshot, setLoggedInTherapistId, notify]);

  useEffect(() => {
    if (backendInitialized || (backendStatus !== "loading" && backendStatus !== "migrating")) return;
    const watchdog = window.setTimeout(() => {
      fallBackToLocal();
    }, 16_000);
    return () => window.clearTimeout(watchdog);
  }, [backendInitialized, backendStatus, backendRetryKey, fallBackToLocal]);

  const settleBackendSaveStatus = useCallback(() => {
    const baseline = lastSyncedBackendState.current;
    if (!baseline || !loggedInTherapistId || logoutState !== "idle") return;
    const current = currentSnapshot();
    const dirty = Boolean(buildStateChange(baseline, current, crypto.randomUUID(), backendRevision.current));
    if (!cloudSaveCanSettle(backendPendingWrites.current, backendSaveTimer.current !== null, dirty)) return;
    clearPendingCloudSave();
    rejectedWrite.current = null;
    lastBackendSaveError.current = "";
    setBackendStatus((status) => status === "syncing" || status === "error" ? "ready" : status);
  }, [loggedInTherapistId, logoutState, currentSnapshot]);

  const enqueueBackendSave = useCallback((snapshot: BackendState) => {
    backendPendingWrites.current += 1;
    const requestedSnapshot = snapshot;
    const baselineAtEnqueue = lastSyncedBackendState.current;
    const localAtEnqueue = currentSnapshot();
    let attemptedOperationId = "";
    let attemptedRevision = backendRevision.current;
    let skippedRejectedWrite = false;
    const task = backendSaveQueue.current.catch(() => undefined).then(async () => {
        const previous = lastSyncedBackendState.current;
        if (!previous) throw new Error("missing_sync_baseline");
        const prior = reconciledSave.current;
        if (previous !== baselineAtEnqueue && prior?.confirmed === previous) {
          snapshot = replayEditsAfterSave(prior.requested, snapshot, previous, backendRevision.current, draftRecovery);
        }
        snapshot = discardUnauthorizedNewSequences(previous, snapshot, loggedInTherapistId);
        const operationId = crypto.randomUUID();
        attemptedRevision = backendRevision.current;
        const change = buildCloudSaveChange(previous, snapshot, operationId, backendRevision.current, loggedInTherapistId);
        if (!change) return;
        const content = writeContent(change);
        const rejected = rejectedWrite.current;
        if (rejected?.profileId === loggedInTherapistId && rejected.content === content) {
          skippedRejectedWrite = true;
          throw rejected.error;
        }
        attemptedOperationId = operationId;
        appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "save_started", operationId, revision: backendRevision.current, changedSequences: change.collections.sequences?.upserts.length ?? 0, sequenceCount: snapshot.sequences.length });
        setBackendStatus("syncing");
        let response: Response;
        if (granularWritesUnavailable.current && !change.libraryReplacements) {
          response = await fetchWithTimeout("/api/state", { method: "PUT", headers: { "content-type": "application/json", "x-base-revision": String(backendRevision.current) }, body: JSON.stringify(snapshot) }, 6500);
        } else {
          const body = JSON.stringify(parseStateChangeRequest(change));
          response = await retryOperation(async () => {
            const result = await fetchWithTimeout("/api/state/changes", { method: "PATCH", headers: { "content-type": "application/json" }, body }, 6500);
            if (result.status >= 500) throw await backendResponseError(result, "backend_save_failed");
            return result;
          }, { attempts: 2, delayMs: 400 });
          if (!change.libraryReplacements && [404, 405, 501].includes(response.status)) {
            granularWritesUnavailable.current = true;
            response = await fetchWithTimeout("/api/state", { method: "PUT", headers: { "content-type": "application/json", "x-base-revision": String(backendRevision.current) }, body: JSON.stringify(snapshot) }, 6500);
          }
        }
        let syncedSnapshot = snapshot;
        let confirmedRevision: number | undefined;
        if (response.status === 409) {
          const latestResponse = await fetchWithTimeout("/api/state", { cache: "no-store" }, 6500);
          if (!latestResponse.ok) throw new Error("backend_conflict_reload_failed");
          const latest = await latestResponse.json() as CloudStateRead;
          if (!latest.state || latest.revision < 1) throw new Error("backend_conflict_state_missing");
          setProgressReferences(latest.progressReferences ?? null);
          const rebased = rebaseCloudSaveChange(latest.state, change, crypto.randomUUID(), latest.revision, draftRecovery);
          if (rebased.replacementConflict) notify("La Libreria è cambiata. Controlla la foto prima di sostituire il segnaposto.", 7000);
          attemptedRevision = latest.revision;
          appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "save_rebased", operationId, revision: latest.revision, changedSequences: change.collections.sequences?.upserts.length ?? 0 });
          syncedSnapshot = rebased.state as BackendState;
          if (!rebased.change) confirmedRevision = latest.revision;
          else response = await retryOperation(async () => {
            const result = await fetchWithTimeout("/api/state/changes", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(rebased.change) }, 6500);
            if (result.status >= 500) throw await backendResponseError(result, "backend_conflict_failed");
            return result;
          }, { attempts: 2, delayMs: 400 });
        }
        if (confirmedRevision === undefined && !response.ok) {
          const error = await backendResponseError(response, "backend_save_failed");
          const needsUpdate = error.status === 412 && error.code === "exercise_editor_update_required";
          if (needsUpdate) notify("Per salvare queste modifiche agli esercizi, aggiorna l’app. La bozza resta su questo dispositivo.", 7000);
          if (needsUpdate || (error.status === 403 && error.code === "state_change_forbidden")) {
            rejectedWrite.current = { profileId: loggedInTherapistId, content, error };
          }
          throw error;
        }
        rejectedWrite.current = null;
        const revision = confirmedRevision ?? ((await response.json()) as { revision: number }).revision;
        lastBackendSaveError.current = "";
        backendRevision.current = revision;
        lastSyncedBackendState.current = syncedSnapshot;
        appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "save_succeeded", operationId, revision, httpStatus: response.status, changedSequences: change.collections.sequences?.upserts.length ?? 0, sequenceCount: syncedSnapshot.sequences.length });
        let visibleSnapshot = currentSnapshot();
        reconciledSave.current = null;
        if (syncedSnapshot !== requestedSnapshot) {
          reconciledSave.current = { requested: requestedSnapshot, confirmed: syncedSnapshot };
          visibleSnapshot = lastStateReadAdultId.current === loggedInTherapistId
            ? discardUnauthorizedNewSequences(syncedSnapshot, replayEditsAfterSave(localAtEnqueue, visibleSnapshot, syncedSnapshot, revision, draftRecovery), loggedInTherapistId)
            : syncedSnapshot;
          backendHydrating.current = true;
          applyBackendState(visibleSnapshot);
          backendHydrating.current = false;
        }

        const stillDirty = Boolean(buildStateChange(syncedSnapshot, visibleSnapshot, crypto.randomUUID(), revision));
        if (stillDirty || backendPendingWrites.current > 1 || backendSaveTimer.current !== null) setBackendStatus("syncing");
        else {
          clearPendingCloudSave();
          setBackendStatus("ready");
        }
      }).catch((error) => {
        lastBackendSaveError.current = error instanceof Error ? error.message : "errore sconosciuto";
        if (!skippedRejectedWrite) appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "save_failed", operationId: attemptedOperationId, revision: attemptedRevision, ...saveErrorDetails(error) });
        throw error;
      }).finally(() => {
        backendPendingWrites.current -= 1;
        settleBackendSaveStatus();
      });
    backendSaveQueue.current = task;
    return task;
  }, [loggedInTherapistId, draftRecovery, settleBackendSaveStatus, applyBackendState, setProgressReferences, currentSnapshot, notify]);

  useEffect(() => {
    if (!loggedInTherapistId || logoutState !== "idle" || backendHydrating.current) return;
    const snapshot = backendStateForStorage({ schemaVersion: 1, therapists, children, activeChildId, activeSequenceId, library, exercises, sequences, attempts, helps, sessionHistory, appearance, soundPreferences, categorySymbols, tracingOrderRequired, interfaceStyle });
    if (!backendInitialized) {
      if (!localFallbackBaseline.current) return;
      const localChange = buildCloudSaveChange(localFallbackBaseline.current, snapshot, crypto.randomUUID(), 1, loggedInTherapistId);
      if (localChange) storePendingCloudSave(localChange);
      return;
    }
    const baseline = lastSyncedBackendState.current;
    if (!baseline) return;
    const pendingChange = buildCloudSaveChange(baseline, snapshot, crypto.randomUUID(), backendRevision.current, loggedInTherapistId);
    if (!pendingChange) {
      const idleTimer = window.setTimeout(settleBackendSaveStatus, 0);
      return () => window.clearTimeout(idleTimer);
    }
    storePendingCloudSave(pendingChange);
    const rejected = rejectedWrite.current;
    if (rejected?.profileId === loggedInTherapistId && rejected.content === writeContent(pendingChange)) return;
    const statusTimer = window.setTimeout(() => setBackendStatus("syncing"), 0);
    if (backendSaveTimer.current) window.clearTimeout(backendSaveTimer.current);
    backendSaveTimer.current = window.setTimeout(() => {
      backendSaveTimer.current = null;
      void enqueueBackendSave(snapshot).catch(() => setBackendStatus("error"));
    }, 500);
    return () => { window.clearTimeout(statusTimer); if (backendSaveTimer.current) window.clearTimeout(backendSaveTimer.current); backendSaveTimer.current = null; };
  }, [backendInitialized, backendSaveRetryKey, loggedInTherapistId, logoutState, therapists, children, activeChildId, activeSequenceId, library, exercises, sequences, attempts, helps, sessionHistory, appearance, soundPreferences, categorySymbols, tracingOrderRequired, interfaceStyle, enqueueBackendSave, settleBackendSaveStatus]);

  useEffect(() => {
    if (!loggedInTherapistId || logoutState !== "idle" || !backendInitialized || backendStatus !== "ready" || localMediaRepairing.current) return;
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
      notify(`${labels}: immagini recuperate nel cloud`, 3200);
    };
    void repair().catch(() => {
      if (!cancelled) {
        notify("Le immagini locali non sono ancora state sincronizzate", 3200);
      }
    }).finally(() => { localMediaRepairing.current = false; });
    return () => { cancelled = true; };
  }, [backendInitialized, backendRefreshKey, backendStatus, loggedInTherapistId, logoutState, library, notify, enqueueBackendSave, setLibrary, localBootstrapSnapshot]);

  const cancelScheduledSave = useCallback(() => {
    if (backendSaveTimer.current !== null) window.clearTimeout(backendSaveTimer.current);
    backendSaveTimer.current = null;
  }, []);
  /** Change between the last confirmed cloud revision and `snapshot` (current local state by default). */
  const pendingChange = useCallback((snapshot: BackendState = currentSnapshot()) => {
    const baseline = lastSyncedBackendState.current;
    return baseline ? buildCloudSaveChange(baseline, snapshot, crypto.randomUUID(), backendRevision.current, loggedInTherapistId) : null;
  }, [currentSnapshot, loggedInTherapistId]);
  const hasBaseline = useCallback(() => Boolean(lastSyncedBackendState.current), []);
  /** True when a confirmed cloud baseline exists and the local state matches it. */
  const isSynced = useCallback(() => hasBaseline() && !pendingChange(), [hasBaseline, pendingChange]);
  const saveNow = useCallback(() => enqueueBackendSave(currentSnapshot()), [currentSnapshot, enqueueBackendSave]);
  const saveQueue = useCallback(() => backendSaveQueue.current, []);
  const revision = useCallback(() => backendRevision.current, []);
  const resetReadScope = useCallback(() => {
    lastStateReadTag.current = "";
    lastStateReadAdultId.current = null;
  }, []);
  const lastSaveError = useCallback(() => lastBackendSaveError.current, []);
  const retryLoad = useCallback(() => setBackendRetryKey((current) => current + 1), []);
  const retrySave = useCallback(() => {
    rejectedWrite.current = null;
    setBackendSaveRetryKey((current) => current + 1);
  }, []);
  /** Saves a library change right away (uploads/edits) and reports where it landed. */
  const persistLibraryNow = async (nextLibrary: LibraryItem[]) => {
    setLibrary(nextLibrary);
    const snapshot = backendStateForStorage({ ...localBootstrapSnapshot.current, library: nextLibrary });
    if (!backendInitialized || backendStatus === "local" || !navigator.onLine) {
      const baseline = lastSyncedBackendState.current ?? localFallbackBaseline.current;
      if (baseline) {
        const change = buildCloudSaveChange(baseline, snapshot, crypto.randomUUID(), backendRevision.current || 1, loggedInTherapistId);
        if (change) storePendingCloudSave(change);
      }
      return "local" as const;
    }
    try {
      await enqueueBackendSave(snapshot);
      return "cloud" as const;
    } catch (error) {
      lastBackendSaveError.current = error instanceof Error ? error.message : "errore sconosciuto";
      setBackendStatus("error");
      return "pending" as const;
    }
  };

  return {
    exerciseDraftRevision,
    progressReferences: progressReferences?.adultProfileId === loggedInTherapistId ? progressReferences.exercises : undefined,
    backendStatus, setBackendStatus, backendInitialized, enqueueBackendSave,
    cancelScheduledSave, currentSnapshot, pendingChange, hasBaseline, isSynced, saveNow, saveQueue, revision,
    resetReadScope, retryLoad, retrySave, fallBackToLocal, persistLibraryNow, lastSaveError,
  };
}
