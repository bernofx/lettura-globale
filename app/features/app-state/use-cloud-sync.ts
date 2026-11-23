import { useCallback, useEffect, useRef, useState } from "react";
import { recoverPendingRemoteUploads } from "../../domain/library-deduplication";
import { retryOperation } from "../../domain/retry";
import { buildStateChange, rebaseStateChange } from "../../domain/state-changes";
import { THERAPIST_SESSION_STORAGE_KEY } from "../../domain/therapist-session";
import { appendSaveJournal } from "../../domain/save-journal";
import { hydrateSoundPreferences } from "../../domain/sound-preferences";
import { seedDefaultCategorySymbols } from "../../domain/category-symbol-catalog";
import { cloudSaveCanSettle } from "../../domain/share-preparation";
import { backendResponseError, clearPendingCloudSave, fetchWithTimeout, readPendingCloudSave, saveErrorDetails, storePendingCloudSave } from "../../shared/cloud-client";
import { readLibraryImage, uploadRemoteImage } from "../../shared/media-storage";
import { backendStateForStorage, discardUnauthorizedNewSequences, normalizeBackendState } from "../../shared/state-hydration";
import { type BackendState, type BackendStatus, type LibraryItem } from "../../shared/types";
import { type AppData } from "./use-app-data";

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
    sessionHistory, appearance, soundPreferences, categorySymbols, tracingOrderRequired, setCategorySymbols, allLocalDataLoaded, localBootstrapSnapshot, applyBackendState,
  } = data;
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
  const localFallbackBaseline = useRef<BackendState | null>(null);
  const backendSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const backendPendingWrites = useRef(0);
  const granularWritesUnavailable = useRef(false);
  const localMediaRepairing = useRef(false);
  const lastBackendSaveError = useRef("");
  const lastResumeCheck = useRef(0);

  const fallBackToLocal = useCallback(() => {
    localFallbackBaseline.current = backendStateForStorage(localBootstrapSnapshot.current);
    backendHydrating.current = false;
    setBackendStatus("local");
  }, [localBootstrapSnapshot]);

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
    const local = backendStateForStorage(localBootstrapSnapshot.current);
    if (buildStateChange(baseline, local, crypto.randomUUID(), backendRevision.current)) return;
    let cancelled = false;
    const refresh = async () => {
      await backendSaveQueue.current.catch(() => undefined);
      const scopeChanged = lastStateReadAdultId.current !== loggedInTherapistId;
      const tag = scopeChanged ? "" : lastStateReadTag.current;
      const response = await fetchWithTimeout("/api/state", { cache: "no-store", headers: tag ? { "if-none-match": tag } : {} }, 6500);
      if (response.status === 304) return;
      if (!response.ok) throw await backendResponseError(response, "backend_refresh_failed");
      const result = await response.json() as { state: BackendState | null; revision: number };
      if (cancelled || !result.state || result.revision < backendRevision.current) return;
      const confirmed = lastSyncedBackendState.current;
      if (confirmed && buildStateChange(confirmed, backendStateForStorage(localBootstrapSnapshot.current), crypto.randomUUID(), backendRevision.current)) return;
      lastStateReadTag.current = response.headers.get("etag") ?? "";
      lastStateReadAdultId.current = loggedInTherapistId;
      if (result.revision === backendRevision.current && !scopeChanged) return;
      const saved = result.state;
      const savedBaseline = normalizeBackendState(saved);
      backendHydrating.current = true;
      backendRevision.current = result.revision;
      lastSyncedBackendState.current = backendStateForStorage(savedBaseline);
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
  }, [backendRefreshKey, backendInitialized, backendStatus, loggedInTherapistId, logoutState, notify, sessionActive, sessionReady, applyBackendState, localBootstrapSnapshot]);

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
      const result = await response.json() as { state: BackendState | null; revision: number };
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
            restoredState = rebaseStateChange(savedBaseline, pendingSave.change, crypto.randomUUID(), result.revision).state as BackendState;
            restoredState = discardUnauthorizedNewSequences(savedBaseline, restoredState, loggedInTherapistId);
            recoveredPendingSave = Boolean(buildStateChange(savedBaseline, restoredState, crypto.randomUUID(), result.revision));
            if (!recoveredPendingSave) clearPendingCloudSave();
          } catch {
            clearPendingCloudSave();
          }
        }
        const recoveredLibrary = recoverPendingRemoteUploads(restoredState.library, localBootstrapSnapshot.current.library);
        backendRevision.current = result.revision;
        lastSyncedBackendState.current = backendStateForStorage(savedBaseline);
        appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "cloud_loaded", revision: result.revision, sequenceCount: restoredState.sequences.length });
        localFallbackBaseline.current = null;
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
  }, [allLocalDataLoaded, backendInitialized, backendRetryKey, loggedInTherapistId, setLibrary, setCategorySymbols, applyBackendState, fallBackToLocal, localBootstrapSnapshot, setLoggedInTherapistId]);

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
    const current = backendStateForStorage(localBootstrapSnapshot.current);
    const dirty = Boolean(buildStateChange(baseline, current, crypto.randomUUID(), backendRevision.current));
    if (!cloudSaveCanSettle(backendPendingWrites.current, backendSaveTimer.current !== null, dirty)) return;
    clearPendingCloudSave();
    setBackendStatus((status) => status === "syncing" ? "ready" : status);
  }, [loggedInTherapistId, logoutState, localBootstrapSnapshot]);

  const enqueueBackendSave = useCallback((snapshot: BackendState) => {
    backendPendingWrites.current += 1;
    const requestedSnapshot = snapshot;
    let attemptedOperationId = "";
    const task = backendSaveQueue.current.catch(() => undefined).then(async () => {
        const previous = lastSyncedBackendState.current;
        if (!previous) throw new Error("missing_sync_baseline");
        snapshot = discardUnauthorizedNewSequences(previous, snapshot, loggedInTherapistId);
        const operationId = crypto.randomUUID();
        attemptedOperationId = operationId;
        const change = buildStateChange(previous, snapshot, operationId, backendRevision.current);
        if (!change) return;
        appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "save_started", operationId, revision: backendRevision.current, changedSequences: change.collections.sequences?.upserts.length ?? 0, sequenceCount: snapshot.sequences.length });
        setBackendStatus("syncing");
        let response: Response;
        if (granularWritesUnavailable.current) {
          response = await fetchWithTimeout("/api/state", { method: "PUT", headers: { "content-type": "application/json", "x-base-revision": String(backendRevision.current) }, body: JSON.stringify(snapshot) }, 6500);
        } else {
          const body = JSON.stringify(change);
          response = await retryOperation(async () => {
            const result = await fetchWithTimeout("/api/state/changes", { method: "PATCH", headers: { "content-type": "application/json" }, body }, 6500);
            if (result.status >= 500) throw await backendResponseError(result, "backend_save_failed");
            return result;
          }, { attempts: 2, delayMs: 400 });
          if ([404, 405, 501].includes(response.status)) {
            granularWritesUnavailable.current = true;
            response = await fetchWithTimeout("/api/state", { method: "PUT", headers: { "content-type": "application/json", "x-base-revision": String(backendRevision.current) }, body: JSON.stringify(snapshot) }, 6500);
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
        if (syncedSnapshot !== requestedSnapshot) {
          backendHydrating.current = true;
          applyBackendState(syncedSnapshot);
          backendHydrating.current = false;
        }
        const currentSnapshot = syncedSnapshot !== requestedSnapshot
          ? syncedSnapshot
          : backendStateForStorage(localBootstrapSnapshot.current);
        const stillDirty = Boolean(buildStateChange(syncedSnapshot, currentSnapshot, crypto.randomUUID(), result.revision));
        if (stillDirty || backendPendingWrites.current > 1 || backendSaveTimer.current !== null) setBackendStatus("syncing");
        else {
          clearPendingCloudSave();
          setBackendStatus("ready");
        }
      }).catch((error) => {
        appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "save_failed", operationId: attemptedOperationId, ...saveErrorDetails(error) });
        throw error;
      }).finally(() => {
        backendPendingWrites.current -= 1;
        settleBackendSaveStatus();
      });
    backendSaveQueue.current = task;
    return task;
  }, [loggedInTherapistId, settleBackendSaveStatus, applyBackendState, localBootstrapSnapshot]);

  useEffect(() => {
    if (!loggedInTherapistId || logoutState !== "idle" || backendHydrating.current) return;
    const snapshot = backendStateForStorage({ schemaVersion: 1, therapists, children, activeChildId, activeSequenceId, library, exercises, sequences, attempts, helps, sessionHistory, appearance, soundPreferences, categorySymbols, tracingOrderRequired });
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
      const idleTimer = window.setTimeout(settleBackendSaveStatus, 0);
      return () => window.clearTimeout(idleTimer);
    }
    storePendingCloudSave(pendingChange);
    const statusTimer = window.setTimeout(() => setBackendStatus("syncing"), 0);
    if (backendSaveTimer.current) window.clearTimeout(backendSaveTimer.current);
    backendSaveTimer.current = window.setTimeout(() => {
      backendSaveTimer.current = null;
      void enqueueBackendSave(snapshot).catch(() => setBackendStatus("error"));
    }, 500);
    return () => { window.clearTimeout(statusTimer); if (backendSaveTimer.current) window.clearTimeout(backendSaveTimer.current); backendSaveTimer.current = null; };
  }, [backendInitialized, backendSaveRetryKey, loggedInTherapistId, logoutState, therapists, children, activeChildId, activeSequenceId, library, exercises, sequences, attempts, helps, sessionHistory, appearance, soundPreferences, categorySymbols, tracingOrderRequired, enqueueBackendSave, settleBackendSaveStatus]);

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
  const currentSnapshot = useCallback(() => backendStateForStorage(localBootstrapSnapshot.current), [localBootstrapSnapshot]);
  /** Change between the last confirmed cloud revision and `snapshot` (current local state by default). */
  const pendingChange = useCallback((snapshot: BackendState = currentSnapshot()) => {
    const baseline = lastSyncedBackendState.current;
    return baseline ? buildStateChange(baseline, snapshot, crypto.randomUUID(), backendRevision.current) : null;
  }, [currentSnapshot]);
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
  /** Saves a library change right away (uploads/edits) and reports where it landed. */
  const persistLibraryNow = async (nextLibrary: LibraryItem[]) => {
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

  return {
    backendStatus, setBackendStatus, backendInitialized, enqueueBackendSave,
    cancelScheduledSave, currentSnapshot, pendingChange, hasBaseline, isSynced, saveNow, saveQueue, revision,
    resetReadScope, retryLoad, fallBackToLocal, persistLibraryNow, lastSaveError,
  };
}
