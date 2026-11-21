"use client";

import { Check, Menu, Pause } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { recognitionModeFor } from "./domain/activity-generation";
import { categoryImageError } from "./domain/category-images";
import { isWordCategoryContent, wordCategoryNames } from "./domain/word-category-content";
import { filterQuickCandidates } from "./domain/session-planning";
import { SessionAdvanceGuard } from "./domain/session-advance";
import { activityNavigation } from "./domain/session-navigation";
import { PENDING_CONTROLLER_LAUNCH_KEY, resolveControllerLaunch } from "./domain/controller-launch";
import { CELEBRATION_DURATION_MS } from "./domain/celebration";
import { AppUpdateProvider, AppVersionBadge, useAppUpdating, useBeforeAppUpdate, useUpdateState } from "./components/app-update";
import { articleFor } from "./domain/article-classification";
import { validateSharedExercises } from "./domain/shared-preview-validation";
import { prepareCloudShare } from "./domain/share-preparation";
import { playBalloonPop } from "./domain/balloon-audio";
import { SequenceCelebration } from "./components/sequence-celebration";
import { listenForAudioGestures } from "./domain/audio-activation";
import { CaaStoriesView } from "./components/caa-stories-view";
import { GamesView } from "./features/games/games-view";
import { useGameBackGuard } from "./features/games/use-game-back-guard";
import { useCaaStories } from "./use-caa-stories";
import { appendAttempt, appendHelp, shouldRecordSessionEvents } from "./domain/session-events";
import { buildSessionHistoryItems, type SessionHistoryRecord } from "./domain/session-history";
import { buildSharedPreviewUrl, parseSharedLaunch, parseSharedPreview, type SharedLaunch } from "./domain/shared-launch";
import { canAccessSequence, canViewAllSequences } from "./domain/sequence-access";
import { hydrateSyllables, matchesSyllableFilter } from "./domain/syllabification";
import { hasArtwork } from "./domain/library-availability";
import { completesSequenceExercise, type SessionActivity } from "./domain/session-compilation";
import { ACTIVE_SESSION_STORAGE_KEY, parseRecoverableSession, type RecoverableSession, serializeRecoverableSession } from "./domain/session-recovery";
import { createPersistentTherapistSession, parsePersistentTherapistSession, THERAPIST_SESSION_STORAGE_KEY } from "./domain/therapist-session";
import { libraryItemWasEdited } from "./domain/library-edit";
import { appendSaveJournal } from "./domain/save-journal";
import { quantityObjectLabel } from "./domain/quantity-exercise";
import { remoteCommandDisposition, type RemoteControllerEvent, type RemoteSessionSnapshot } from "./domain/remote-controller";
import { useRemoteSessionHost } from "./use-remote-session-host";
import { isSimpleSentenceScene, sentenceMatchingAvailability } from "./domain/sentence-matching";
import { logoutFromCloud } from "./domain/cloud-auth-client";
import { useAppData } from "./features/app-state/use-app-data";
import { useCloudSync } from "./features/app-state/use-cloud-sync";
import { ExerciseBuilder } from "./features/exercises/exercise-builder";
import { ContentDeleteDialog, SequenceDialog } from "./features/exercises/exercise-dialogs";
import { ExercisesView } from "./features/exercises/exercises-view";
import { Dashboard } from "./features/home/dashboard";
import { EditLibraryDialog, LibraryDeleteDialog, UploadDialog } from "./features/library/library-dialogs";
import { LibraryView } from "./features/library/library-view";
import { DeleteDialog, ProfilesView } from "./features/profiles/profiles-view";
import { RemoteControllerConsole } from "./features/remote/controller-console";
import { SessionExitDialog, SessionRecoveryDialog } from "./features/session/session-dialogs";
import { SequenceTransition, SessionView } from "./features/session/session-view";
import { AppearanceView } from "./features/settings/appearance-view";
import { SaveJournalDialog } from "./features/settings/save-journal-dialog";
import { ChildChooser, LoadingScreen, PublicLanding, PublicPreviewError, TherapistLogin } from "./features/shell/auth-screens";
import { navItems, Sidebar, Topbar } from "./features/shell/navigation";
import { StatsView } from "./features/stats/stats-view";
import { preloadArtwork } from "./shared/artwork";
import { applyAudioVolume, applySoundPreferences, cancelSpeech, feedbackContext, playFeedbackTone, playSoundCue, preloadFeedbackSounds, primeFeedbackSounds, speakWord, startRewardMusic } from "./shared/audio";
import { fetchWithTimeout, storePendingCloudSave } from "./shared/cloud-client";
import { PROTECTED_EXIT_HOLD_HINT, exerciseKind, helpTypes } from "./shared/constants";
import { AudioVolumeContext, emitRemoteComponentCommand, RemoteHostContext, RewardActiveContext, useStoredState, useToastMessage } from "./shared/hooks";
import { prepareUploadedImage, storeLibraryImage, uploadRemoteImage } from "./shared/media-storage";
import { initialAdministrator } from "./shared/seed-data";
import { compileExercises } from "./shared/state-hydration";
import { type ChildProfile, type Exercise, type LibraryItem, type Mode, type Presentation, type QuickStartConfig, type Sequence, type SharedPreviewPayload, type View } from "./shared/types";

export default function HomePage() {
  return <AppUpdateProvider><HomePageContent /></AppUpdateProvider>;
}

function HomePageContent() {
  const appUpdating = useAppUpdating();
  const [view, setView] = useUpdateState<View>("root:view", "home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, notify, dismissToast] = useToastMessage();
  const [saveJournalOpen, setSaveJournalOpen] = useState(false);
  const sharingLaunch = useRef(false);
  const data = useAppData(notify);
  const {
    therapists, setTherapists, children, setChildren, activeChildId, setActiveChildId, library, setLibrary, exercises, setExercises,
    sequences, setSequences, activeSequenceId, setActiveSequenceId, attempts, setAttempts, helps, setHelps, sessionHistory, setSessionHistory,
    appearance, setAppearance, categorySymbols, setCategorySymbols, soundPreferences, setSoundPreferences, allLocalDataLoaded, localLoadSlow, localBootstrapSnapshot,
  } = data;
  const [loggedInTherapistId, setLoggedInTherapistId] = useState<string | null>(null);
  const [showTherapistLogin, setShowTherapistLogin] = useState(false);
  const [logoutState, setLogoutState] = useState<"idle" | "pending" | "failed">("idle");
  const logoutInFlight = useRef(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [controllerToken, setControllerToken] = useState<string | null>(null);
  const controllerActiveRef = useRef(false);
  const [realtimeControllerSessionId, setRealtimeControllerSessionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
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
  const [sessionMode, setSessionMode] = useUpdateState<Mode>("root:sessionMode", "test");
  const [soundEffects, setSoundEffects] = useStoredState<boolean>("lg-sound-effects", true);
  const [soundVolume, setSoundVolume] = useStoredState<number>("lg-sound-volume", 100, (saved) => Math.min(100, Math.max(0, Number(saved) || 0)));
  const [celebratingSequence, setCelebratingSequence] = useState(false);
  const [standaloneGameOpen, setStandaloneGameOpen] = useState(false);
  const [rewardActive, setRewardActive] = useUpdateState("root:rewardActive", false);
  const rewardActiveRef = useRef(rewardActive);
  const changeReward = useCallback((active: boolean) => {
    rewardActiveRef.current = active;
    setRewardActive(active);
    if (active) cancelSpeech();
  }, [setRewardActive]);
  const [sessionPresentation, setSessionPresentation] = useUpdateState<Presentation>("root:sessionPresentation", "images");
  const [sessionIndex, setSessionIndex] = useUpdateState("root:sessionIndex", 0);
  const sessionAdvanceGuard = useRef(new SessionAdvanceGuard());
  const [sessionFurthestIndex, setSessionFurthestIndex] = useUpdateState("root:sessionFurthestIndex", 0);
  const [sessionPlan, setSessionPlan] = useUpdateState<Exercise[]>("root:sessionPlan", []);
  const [sessionRunId, setSessionRunId] = useUpdateState("root:sessionRunId", "");
  const [sessionChildId, setSessionChildId] = useUpdateState("root:sessionChildId", "");
  const [sessionStartedAt, setSessionStartedAt] = useUpdateState("root:sessionStartedAt", "");
  const [sessionDescriptor, setSessionDescriptor] = useUpdateState<{ title: string; source: "sequence" | "quick" }>("root:sessionDescriptor", { title: "Sessione", source: "sequence" });
  const [sessionActive, setSessionActive] = useUpdateState("root:sessionActive", false);
  const [sessionReady, setSessionReady] = useUpdateState("root:sessionReady", false);
  const sessionReadyRef = useRef(sessionReady);
  const [sessionWizardKey, setSessionWizardKey] = useUpdateState("root:sessionWizardKey", 0);
  const [sessionComplete, setSessionComplete] = useUpdateState("root:sessionComplete", false);
  const [sessionPaused, setSessionPaused] = useUpdateState("root:sessionPaused", false);
  const sessionPausedRef = useRef(sessionPaused);
  const [awaitingNextExercise, setAwaitingNextExercise] = useUpdateState("root:awaitingNextExercise", false);
  const [quickExerciseToSave, setQuickExerciseToSave] = useUpdateState<Exercise | null>("root:quickExerciseToSave", null);
  const [sessionFromSharedLink, setSessionFromSharedLink] = useUpdateState("root:sessionFromSharedLink", false);
  const [sessionIsTrial, setSessionIsTrial] = useUpdateState("root:sessionIsTrial", false);
  const [pendingSharedLaunch, setPendingSharedLaunch] = useState<SharedLaunch | null>(null);
  const [pendingSharedPreviewToken, setPendingSharedPreviewToken] = useState<string | null>(null);
  const [sharedPreview, setSharedPreview] = useUpdateState<SharedPreviewPayload | null>("root:sharedPreview", null);
  const [sharedPreviewStatus, setSharedPreviewStatus] = useUpdateState<"idle" | "loading" | "ready" | "error">("root:sharedPreviewStatus", "idle");
  const [answerState, setAnswerState] = useUpdateState<"idle" | "wrong" | "correct">("root:answerState", "idle");
  const [wrongAnswerId, setWrongAnswerId] = useUpdateState<string | null>("root:wrongAnswerId", null);
  const wrongFeedbackTimer = useRef<number | null>(null);
  useEffect(() => {
    if (answerState !== "wrong" || !wrongAnswerId) return;
    wrongFeedbackTimer.current = window.setTimeout(() => { setWrongAnswerId(null); setAnswerState("idle"); wrongFeedbackTimer.current = null; }, 900);
    return () => { if (wrongFeedbackTimer.current !== null) window.clearTimeout(wrongFeedbackTimer.current); };
  }, [answerState, wrongAnswerId, setAnswerState, setWrongAnswerId]);
  const handledSharedLaunch = useRef("");

  const effectiveSoundVolume = soundEffects ? soundVolume : 0;
  const playBalloonPopSound = () => {
    if (effectiveSoundVolume <= 0) return;
    void playBalloonPop(feedbackContext(), effectiveSoundVolume / 100);
  };
  useEffect(() => { sessionPausedRef.current = sessionPaused; }, [sessionPaused]);
  const changeSoundVolume = useCallback((nextVolume: number) => {
    const volume = Math.min(100, Math.max(0, Math.round(nextVolume)));
    setSoundVolume(volume);
    setSoundEffects(volume > 0);
    if (volume === 0) cancelSpeech();
  }, [setSoundEffects, setSoundVolume]);

  useEffect(() => {
    applyAudioVolume(effectiveSoundVolume / 100);
  }, [effectiveSoundVolume]);

  const sessionReturnView = useRef<View>("session");
  const modalHistoryMarker = useRef<string | null>(null);
  const ignoreNextModalPop = useRef(false);
  const modalOpen = showUpload || showBuilder || Boolean(editingSequence) || Boolean(pendingExerciseDelete) || Boolean(pendingSequenceDelete) || Boolean(editingItem) || Boolean(pendingLibraryDelete) || Boolean(pendingDelete) || pendingStatsReset || Boolean(pendingHistoryDelete) || exitPinOpen || Boolean(recoveryCandidate) || saveJournalOpen;
  const guardGameBack = useGameBackGuard((view === "games" && standaloneGameOpen) || celebratingSequence || (sessionActive && rewardActive));

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.palette = appearance.palette;
    root.dataset.shape = appearance.shape;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(root).getPropertyValue("--violet").trim() || "#6659d9");
  }, [appearance]);

  useEffect(() => {
    // Capture the intent before login, history cleanup or a service-worker update can remove it.
    const controllerLaunch = resolveControllerLaunch(window.location.search, sessionStorage);
    controllerActiveRef.current = Boolean(controllerLaunch);
    preloadFeedbackSounds();
    const prime = () => primeFeedbackSounds();
    const removeAudioGestures = listenForAudioGestures(window, prime);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => registration.update()).catch(() => undefined);
    }
    const authTimer = window.setTimeout(() => {
      const legacyLaunch = parseSharedLaunch(window.location.search);
      const publicPreview = parseSharedPreview(window.location.search);
      const scannedControllerToken = controllerLaunch?.token ?? null;
      setControllerToken(scannedControllerToken);
      setRealtimeControllerSessionId(controllerLaunch?.realtimeSessionId ?? null);
      setPendingSharedLaunch(legacyLaunch);
      setPendingSharedPreviewToken(publicPreview?.token ?? null);
      const persistentTherapistId = parsePersistentTherapistSession(localStorage.getItem(THERAPIST_SESSION_STORAGE_KEY));
      const legacyTherapistId = sessionStorage.getItem(THERAPIST_SESSION_STORAGE_KEY);
      const restoredTherapistId = persistentTherapistId ?? legacyTherapistId;
      if (scannedControllerToken && restoredTherapistId) {
        const homeUrl = new URL(window.location.href);
        homeUrl.searchParams.delete("controller");
        homeUrl.searchParams.delete("transport");
        homeUrl.searchParams.delete("session");
        window.history.replaceState({ lgView: "home" }, "", homeUrl.pathname + homeUrl.search + homeUrl.hash);
      }
      if (legacyTherapistId && !persistentTherapistId) localStorage.setItem(THERAPIST_SESSION_STORAGE_KEY, createPersistentTherapistSession(legacyTherapistId));
      sessionStorage.removeItem(THERAPIST_SESSION_STORAGE_KEY);
      if (!restoredTherapistId) localStorage.removeItem(THERAPIST_SESSION_STORAGE_KEY);
      setLoggedInTherapistId(restoredTherapistId);
      if (!legacyLaunch && !publicPreview) window.history.replaceState({ lgView: "home" }, "", window.location.href);
      setSessionChecked(true);
    }, 0);
    return () => {
      window.clearTimeout(authTimer);
      removeAudioGestures();
    };
  }, []);

  useEffect(() => {
    applySoundPreferences(soundPreferences);
  }, [soundPreferences]);

  useEffect(() => {
    if (!celebratingSequence) return;
    const timeout = window.setTimeout(() => setCelebratingSequence(false), CELEBRATION_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [celebratingSequence]);


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
    if (sessionFromSharedLink && sharedPreview && sessionActive && sharedPreviewStatus === "ready") return;
    let cancelled = false;
    fetchWithTimeout(`/api/shared-launch/${encodeURIComponent(pendingSharedPreviewToken)}`, { cache: "no-store" }, 8000)
      .then(async (response) => {
        if (!response.ok) throw new Error("preview_load_failed");
        return response.json() as Promise<SharedPreviewPayload>;
      })
      .then((payload) => {
        if (cancelled || payload.schemaVersion !== 1 || !payload.exercises?.length || !Array.isArray(payload.library)) throw new Error("invalid_preview");
        if (validateSharedExercises(payload.exercises, payload.library)) throw new Error("incomplete_preview");
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
        // Keep the public token until explicit exit: refresh, first-install SW
        // updates and copying the address must reopen the preview, not adult login.
      })
      .catch(() => { if (!cancelled) setSharedPreviewStatus("error"); });
    return () => { cancelled = true; };
  }, [pendingSharedPreviewToken, sessionFromSharedLink, sharedPreview, sessionActive, sharedPreviewStatus, setAnswerState, setSessionActive, setSessionChildId, setSessionComplete, setSessionFromSharedLink, setSessionFurthestIndex, setSessionIndex, setSessionIsTrial, setSessionMode, setSessionPlan, setSessionPresentation, setSessionRunId, setSharedPreview, setSharedPreviewStatus, setView, setWrongAnswerId]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (guardGameBack()) return;
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
      const nextView = navItems.find(item => item.id === event.state?.lgView)?.id ?? "home";
      if (sessionActive) {
        window.history.pushState({ lgView: "session", lgActivity: true }, "", window.location.pathname);
        notify(PROTECTED_EXIT_HOLD_HINT, 3200);
        return;
      }
      setView(nextView);
      if (nextView !== "session") { sessionReadyRef.current = false; setSessionReady(false); }
      setMenuOpen(false);
      window.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [guardGameBack, notify, sessionActive, setSessionReady, setView]);

  const cloud = useCloudSync({ data, loggedInTherapistId, setLoggedInTherapistId, logoutState, sessionActive, sessionReady, notify });
  const { backendStatus, setBackendStatus, backendInitialized, enqueueBackendSave } = cloud;
  // Management messages (e.g. "Dati aggiornati dal cloud") must not stay on the
  // child-facing screen; messages raised during the session are still shown.
  useEffect(() => { if (sessionActive) dismissToast(); }, [dismissToast, sessionActive]);


  const therapist = useMemo(() => therapists.find((item) => item.id === loggedInTherapistId), [loggedInTherapistId, therapists]);
  const caaStories = useCaaStories(therapist?.id ?? null);
  useBeforeAppUpdate("cloud-save", async () => {
    cancelSpeech();
    if (controllerToken) {
      sessionStorage.setItem(PENDING_CONTROLLER_LAUNCH_KEY, JSON.stringify({ token: controllerToken, realtimeSessionId: realtimeControllerSessionId, createdAt: Date.now() }));
      return;
    }
    if (sessionFromSharedLink || !loggedInTherapistId) return;
    if (!backendInitialized || !navigator.onLine) throw new Error("cloud_save_unavailable");
    cloud.cancelScheduledSave();
    for (let attempt = 0; attempt < 3; attempt++) {
      await cloud.saveNow();
      await cloud.saveQueue();
      if (cloud.isSynced()) return;
    }
    throw new Error("cloud_save_pending");
  });
  const canSeeAllSequences = canViewAllSequences(therapist?.role);
  const associatedChildren = useMemo(() => therapist?.role === "Amministratore" ? children : children.filter((child) => therapist?.childIds.includes(child.id)), [children, therapist]);
  const activeChild = associatedChildren.find((child) => child.id === activeChildId) ?? associatedChildren[0];

  useEffect(() => {
    if (controllerActiveRef.current || controllerToken || !sessionChecked || !allLocalDataLoaded || !therapist || sessionActive || sessionReady || recoveryCheckedFor.current === therapist.id || backendStatus === "loading" || backendStatus === "migrating") return;
    recoveryCheckedFor.current = therapist.id;
    const saved = parseRecoverableSession(localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY));
    if (!saved || saved.therapistId !== therapist.id || !associatedChildren.some((child) => child.id === saved.childId)) {
      if (!saved || saved?.therapistId !== therapist.id) localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      return;
    }
    const timer = window.setTimeout(() => { if (!controllerActiveRef.current) setRecoveryCandidate(saved); }, 0);
    return () => window.clearTimeout(timer);
  }, [allLocalDataLoaded, associatedChildren, backendStatus, controllerToken, sessionActive, sessionReady, sessionChecked, therapist]);

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
  const visibleLibrary = useMemo(() => library.filter((item) => !item.deleted), [library]);
  const visibleLibraryById = useMemo(() => new Map(visibleLibrary.map((item) => [item.id, item])), [visibleLibrary]);
  const visibleIds = useMemo(() => new Set(visibleLibraryById.keys()), [visibleLibraryById]);
  const visibleExercises: Exercise[] = useMemo(() => exercises.filter((exercise) => !exercise.deleted).map((exercise): Exercise => ({
    ...exercise,
    optionIds: exercise.optionIds.filter((id) => { const item = visibleLibraryById.get(id); return Boolean(item && (exercise.presentation === "words" || hasArtwork(item))); }),
    articleItemIds: exercise.articleItemIds?.filter((id) => { const item = visibleLibraryById.get(id); return Boolean(item && hasArtwork(item) && articleFor(item)); }),
    categoryItemIds: exercise.categoryItemIds?.filter((id) => { const item = visibleLibraryById.get(id); return Boolean(item && isWordCategoryContent(item)); }),
    categoryNames: exerciseKind(exercise) === "word-categories" ? wordCategoryNames(visibleLibrary, exercise.categoryNames ?? []) : exercise.categoryNames,
    recognitionItemIds: exercise.recognitionItemIds?.filter((id) => visibleIds.has(id)),
    sentenceItemIds: exercise.sentenceItemIds?.filter((id) => visibleIds.has(id)),
    namingItemIds: exercise.namingItemIds?.filter((id) => { const item = visibleLibraryById.get(id); return Boolean(item && hasArtwork(item)); }),
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
    const prompt = visibleLibraryById.get(exercise.promptId ?? "");
    return Boolean(prompt && (exercise.presentation === "words" || hasArtwork(prompt)) && exercise.optionIds.length >= 2);
  }), [exercises, visibleIds, visibleLibrary, visibleLibraryById]);
  const visibleExerciseById = useMemo(() => new Map(visibleExercises.map((exercise) => [exercise.id, exercise])), [visibleExercises]);
  const visibleSequences = useMemo(() => sequences.filter((sequence) => !sequence.deleted && canAccessSequence(sequence.therapistId, therapist?.id, therapist?.role)), [sequences, therapist]);
  const activeSequence = useMemo(() => visibleSequences.find((sequence) => sequence.id === activeSequenceId) ?? visibleSequences[0], [activeSequenceId, visibleSequences]);
  const sequenceExercises = useMemo(() => activeSequence?.exerciseIds.map((id) => visibleExerciseById.get(id)).filter((exercise): exercise is Exercise => Boolean(exercise)) ?? [], [activeSequence, visibleExerciseById]);
  const sessionExercises = sessionPlan;
  const currentExercise = sessionExercises[sessionIndex] ?? sessionExercises[0];
  const currentPresentation = currentExercise?.presentation ?? sessionPresentation;
  const sessionLibrary = useMemo(() => sessionFromSharedLink && sharedPreview ? sharedPreview.library.filter((item) => !item.deleted) : visibleLibrary, [sessionFromSharedLink, sharedPreview, visibleLibrary]);
  const sessionLibraryById = useMemo(() => new Map(sessionLibrary.map((item) => [item.id, item])), [sessionLibrary]);
  const promptItem = sessionLibraryById.get(currentExercise?.promptId ?? "");
  const promptWord = promptItem?.word;
  const childAttempts = useMemo(() => attempts.filter((attempt) => !attempt.childId || attempt.childId === activeChild?.id), [activeChild?.id, attempts]);
  const childHelps = useMemo(() => helps.filter((help) => !help.childId || help.childId === activeChild?.id), [activeChild?.id, helps]);
  const childSessionHistory = useMemo(() => sessionHistory.filter((record) => !record.deletedAt && record.childId === activeChild?.id && (
    therapist?.role === "Amministratore" || therapist?.role === "Genitore" || therapist?.role === "Supervisore" || record.therapistId === therapist?.id
  )), [activeChild?.id, sessionHistory, therapist]);
  const completedSessionRecord = useMemo(() => sessionHistory.find((record) => record.id === sessionRunId && !record.deletedAt), [sessionHistory, sessionRunId]);
  const firstAttempts = useMemo(() => childAttempts.filter((attempt) => attempt.firstAttempt), [childAttempts]);
  const firstCorrect = useMemo(() => firstAttempts.filter((attempt) => attempt.correct).length, [firstAttempts]);
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
        notify("Il contenuto condiviso non è più disponibile", 3200);
        setView("home");
        return;
      }
      if (selectedSequence) setActiveSequenceId(selectedSequence.id);
      const plan = compileExercises(selectedExercises, visibleLibrary, categorySymbols);
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
  }, [activeChild, backendInitialized, backendStatus, notify, pendingSharedLaunch, setActiveSequenceId, therapist, visibleExercises, visibleLibrary, visibleSequences, categorySymbols, setAnswerState, setSessionActive, setSessionChildId, setSessionFromSharedLink, setSessionFurthestIndex, setSessionIndex, setSessionIsTrial, setSessionPlan, setSessionRunId, setView, setWrongAnswerId]);

  const initialPromptText = currentExercise && (exerciseKind(currentExercise) === "sentence-matching" || (exerciseKind(currentExercise) === "recognition" && (currentExercise.autoPronounce ?? currentPresentation === "words"))) ? promptWord : "";
  const initialPromptId = currentExercise?.id;
  useEffect(() => {
    if (!sessionActive || awaitingNextExercise || !initialPromptText) return;
    return speakWord(initialPromptText);
  }, [sessionActive, awaitingNextExercise, initialPromptId, initialPromptText, sessionIndex, sessionRunId]);

  useEffect(() => {
    const unavailable = () => notify("La voce non è partita. Tocca la parola o il tasto Riascolta per riprovare.", 4500);
    window.addEventListener("lg-speech-unavailable", unavailable);
    return () => window.removeEventListener("lg-speech-unavailable", unavailable);
  }, [notify]);

  useEffect(() => {
    if (!sessionActive) return;
    const sentenceArtworkIds = new Set(sessionExercises.flatMap((exercise) => exerciseKind(exercise) === "sentence-matching" ? [exercise.promptId, ...exercise.optionIds] : exerciseKind(exercise) === "word-categories" ? [...(exercise.categoryShowTargetImage ? exercise.categoryItemIds ?? [] : []), ...Object.values(exercise.categorySymbolIds ?? {})] : []).filter((id): id is string => Boolean(id)));
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

  const shareLaunch = async (launch: SharedLaunch, title: string) => {
    if (sharingLaunch.current) return;
    sharingLaunch.current = true;
    let url = "";
    try {
      if (!backendInitialized || !loggedInTherapistId || logoutState !== "idle" || !navigator.onLine) throw new Error("share_sync_pending");
      cloud.cancelScheduledSave();
      const revision = await prepareCloudShare(() => cloud.saveNow(), () => !cloud.isSynced(), cloud.revision);
      const response = await fetchWithTimeout("/api/shared-launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...launch, revision }) }, 8000);
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { error?: string; exerciseId?: string };
        if (error.error === "incomplete_exercise") {
          const exercise = exercises.find((item) => item.id === error.exerciseId);
          notify(exercise ? `Controlla “${exercise.title}”: contiene elementi mancanti o una configurazione non utilizzabile.` : "La sequenza contiene un esercizio incompleto. Controlla immagini e configurazione prima di condividere.");
          return;
        }
        if (response.status === 409) throw new Error("share_sync_pending");
        throw new Error("share_create_failed");
      }
      const { token, expiresAt } = await response.json() as { token: string; expiresAt: number };
      url = buildSharedPreviewUrl(window.location.origin, token);
      const expiryLabel = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(expiresAt);
      if (navigator.share) {
        await navigator.share({ title: `Lettura Globale · ${title}`, text: `Prova “${title}” senza registrare risultati. Link valido fino al ${expiryLabel}.`, url });
        notify("Link condiviso");
      } else {
        await navigator.clipboard.writeText(url);
        notify("Link copiato negli appunti");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (!url) { notify(error instanceof Error && error.message === "share_sync_pending" ? "Condivisione sospesa: completa il salvataggio cloud e riprova." : "Non è stato possibile creare il link. Le modifiche devono essere salvate nel cloud."); return; }
      try { await navigator.clipboard.writeText(url); notify("Link copiato negli appunti"); } catch { notify("Non è stato possibile copiare il link"); }
    } finally { sharingLaunch.current = false; }
  };
  const navigate = (next: View) => {
    if (sessionActive && next !== "session") { notify(PROTECTED_EXIT_HOLD_HINT); return; }
    if (next !== "session") { sessionReadyRef.current = false; setSessionReady(false); }
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
  const compileSession = (selectedExercises: Exercise[]) => compileExercises(selectedExercises, visibleLibrary, categorySymbols);
  const beginSession = (selectedExercises: Exercise[], quickExercise?: Exercise, options?: { ready?: boolean; trial?: boolean; returnView?: View; title?: string; source?: "sequence" | "quick" }) => {
    const configurationError = selectedExercises.map((item) => categoryImageError(item, visibleLibrary, categorySymbols)).find(Boolean);
    if (configurationError) { notify(configurationError); return; }
    const plan = compileSession(selectedExercises);
    if (!plan.length || !activeChild) return;
    const ready = options?.ready === true;
    if (!ready) localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    const returnView = options?.returnView ?? "session";
    sessionReturnView.current = returnView;
    window.history.replaceState({ lgView: returnView }, "", window.location.pathname);
    if (!ready) window.history.pushState({ lgView: "session", lgActivity: true }, "", window.location.pathname);
    setSessionPlan(plan);
    setSessionRunId(crypto.randomUUID());
    setSessionChildId(activeChild.id);
    setSessionStartedAt(ready ? "" : new Date().toISOString());
    setSessionDescriptor({ title: options?.title ?? quickExercise?.title ?? "Sessione", source: options?.source ?? (quickExercise ? "quick" : "sequence") });
    setSessionIndex(0); setSessionFurthestIndex(0); setAnswerState("idle"); setWrongAnswerId(null);
    setSessionFromSharedLink(false); setSessionIsTrial(Boolean(options?.trial)); setSessionComplete(false);
    changeReward(false);
    sessionPausedRef.current = false; setSessionPaused(false); setAwaitingNextExercise(false);
    setQuickExerciseToSave(quickExercise ?? null);
    sessionReadyRef.current = ready;
    setSessionReady(ready); setSessionActive(!ready); setView("session");
  };
  const startPreparedSession = () => {
    if (!sessionReadyRef.current || !sessionPlan.length || view !== "session") return;
    sessionReadyRef.current = false; // Atomic even if PC and phone press Inizia together.
    localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    window.history.pushState({ lgView: "session", lgActivity: true }, "", window.location.pathname);
    setSessionStartedAt(new Date().toISOString());
    setSessionReady(false); setSessionActive(true);
  };
  const cancelPreparedSession = () => { sessionReadyRef.current = false; setSessionReady(false); };
  const startSequenceById = (sequenceId: string, ready = false) => {
    const sequence = visibleSequences.find((item) => item.id === sequenceId);
    if (!sequence) return;
    const selected = sequence.exerciseIds.map((id) => visibleExercises.find((exercise) => exercise.id === id)).filter((exercise): exercise is Exercise => Boolean(exercise));
    setActiveSequenceId(sequence.id);
    setSequences((current) => current.map((item) => item.id === sequence.id ? { ...item, lastUsedAt: new Date().toISOString() } : item));
    beginSession(selected, undefined, { ready, title: sequence.title, source: "sequence" });
  };
  const createQuickExercise = (config: QuickStartConfig) => {
    const requiresArtwork = config.activity === "articles" || config.activity === "naming" || config.activity === "sentence-matching" || (config.activity === "recognition" && config.presentation === "images");
    const source = visibleLibrary.filter((item) => (!requiresArtwork || hasArtwork(item)) && (config.activity !== "articles" || articleFor(item)) && (config.activity !== "sentence-matching" || isSimpleSentenceScene(item)));
    const candidates = filterQuickCandidates(source, config);
    const id = `quick:${crypto.randomUUID()}`;
    const base = { id, sourceExerciseId: id, promptId: "", optionIds: [], rounds: config.activity === "recognition" ? Math.max(1, config.rounds) : Math.min(Math.max(1, config.rounds), Math.max(1, candidates.length)), updatedAt: new Date().toISOString(), deleted: false };
    if (config.activity === "number-quantity") return { ...base, title: "Avvio rapido · Numero quantità", kind: "number-quantity" as const, rounds: Math.max(1, config.rounds), quantityMin: config.quantityMin, quantityMax: config.quantityMax, quantityObjectSet: config.quantityObjectSet, quantityAutoComplete: config.quantityAutoComplete, quantitySpeakNumbers: config.quantitySpeakNumbers, quantityErrorless: config.quantityErrorless, quantityIdleSeconds: config.quantityIdleSeconds };
    if (config.activity === "sentence-matching") return { ...base, title: "Avvio rapido · Abbina la frase", kind: "sentence-matching" as const, rounds: Math.max(1, config.rounds), sentenceItemIds: candidates.map((item) => item.id), sentenceOptionCount: config.sentenceOptionCount, sentenceDifficulty: config.sentenceDifficulty, presentation: "images" as const, autoPronounce: true };
    if (config.activity === "articles") return { ...base, title: "Avvio rapido · IL / LA", kind: "articles" as const, autoPronounce: config.matchAutoPronounce, articleItemIds: candidates.filter((item) => articleFor(item)).map((item) => item.id) };
    if (config.activity === "word-categories") return { ...base, title: "Avvio rapido · Parola nella categoria", kind: "word-categories" as const, autoPronounce: config.matchAutoPronounce, categorySpeakWord: config.categorySpeakWord, categoryShowTargetImage: config.categoryShowTargetImage, categoryShowSymbols: config.categoryShowSymbols, categoryNames: config.categoryNames, categoryItemIds: candidates.map((item) => item.id) };
    if (config.activity === "naming") return { ...base, title: "Avvio rapido · Mix and vary", kind: "naming" as const, namingItemIds: candidates.map((item) => item.id), namingCategories: [] };
    return { ...base, title: "Avvio rapido · Trova la parola", kind: "recognition" as const, recognitionMode: "random" as const, recognitionItemIds: candidates.map((item) => item.id), recognitionCategories: [], recognitionSyllables: config.recognitionSyllables, distractorCount: config.distractorCount, distractorSource: config.distractorSource, presentation: config.presentation, autoPronounce: config.autoPronounce };
  };
  const startQuickSession = (config: QuickStartConfig, ready = false) => {
    const exercise = createQuickExercise(config);
    setSessionPresentation(config.presentation);
    beginSession([exercise], exercise, { ready, title: exercise.title, source: "quick" });
  };
  const tryExercise = (exerciseId: string) => { const exercise = visibleExercises.find((item) => item.id === exerciseId); if (exercise) beginSession([exercise], undefined, { trial: true, returnView: "exercises" }); };
  const chooseAnswer = (answerId: string) => {
    if (rewardActiveRef.current) return;
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
  };
  const addHelp = (label: string, wordId?: string) => {
    if (rewardActiveRef.current) return;
    if (!shouldRecordSessionEvents(sessionFromSharedLink || sessionIsTrial)) return;
    const exerciseId = currentExercise?.sourceExerciseId ?? currentExercise?.id;
    if (!exerciseId) return;
    const sessionItemId = `${sessionRunId}:${exerciseId}:${sessionIndex}`;
    setHelps((current) => appendHelp(current, { id: crypto.randomUUID(), sessionId: sessionRunId, sessionItemId, exerciseId, wordId: wordId ?? currentExercise.promptId, mode: sessionMode, label, createdAt: new Date().toISOString(), childId: sessionChildId || activeChild?.id, therapistId: therapist?.id }));
    notify(`Aiuto registrato: ${label}`);
  };
  const closeActiveSession = () => {
    changeReward(false);
    cancelPreparedSession();
    const exitModalMarker = modalHistoryMarker.current;
    if (exitModalMarker) modalHistoryMarker.current = null;
    localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    setExitPinOpen(false);
    cancelSpeech();
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
  const completeActiveSession = () => {
    changeReward(false);
    cancelSpeech();
    if (wrongFeedbackTimer.current !== null) {
      window.clearTimeout(wrongFeedbackTimer.current);
      wrongFeedbackTimer.current = null;
    }
    if (sessionFromSharedLink) { notify("Anteprima completata"); closeActiveSession(); return; }
    if (sessionIsTrial) { notify("Prova completata · nessun risultato registrato"); closeActiveSession(); return; }
    setCelebratingSequence(true);
    localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    setSessionActive(false);
    setAwaitingNextExercise(false);
    setSessionComplete(true);
    setAnswerState("idle");
    setWrongAnswerId(null);
    notify("Sessione completata e salvata");
  };
  const nextExercise = (options?: { skipTransition?: boolean }) => {
    if (sessionPausedRef.current || rewardActiveRef.current) return;
    if (!sessionAdvanceGuard.current.claim(sessionRunId, sessionIndex)) return;
    cancelSpeech();
    if (wrongFeedbackTimer.current !== null) {
      window.clearTimeout(wrongFeedbackTimer.current);
      wrongFeedbackTimer.current = null;
    }
    const isLast = sessionIndex >= sessionExercises.length - 1;
    const completesExercise = completesSequenceExercise(sessionExercises[sessionIndex], sessionExercises[sessionIndex + 1]);
    if (sessionDescriptor.source === "sequence" && completesExercise) playSoundCue("finish", soundEffects);
    if (isLast) {
      completeActiveSession();
      return;
    }
    const nextIndex = sessionIndex + 1;
    setSessionFurthestIndex((current) => Math.max(current, nextIndex));
    setSessionIndex(nextIndex); setAnswerState("idle"); setWrongAnswerId(null);
    setAwaitingNextExercise(sessionDescriptor.source === "sequence" && completesExercise && options?.skipTransition !== true);
  };
  const navigateReachedExercise = (direction: -1 | 1) => {
    if (sessionPausedRef.current || rewardActiveRef.current) return;
    const nextIndex = sessionIndex + direction;
    if (nextIndex < 0 || nextIndex > sessionFurthestIndex) return;
    sessionAdvanceGuard.current.navigated();
    cancelSpeech();
    if (wrongFeedbackTimer.current !== null) {
      window.clearTimeout(wrongFeedbackTimer.current);
      wrongFeedbackTimer.current = null;
    }
    setSessionIndex(nextIndex);
    setAnswerState("idle");
    setWrongAnswerId(null);
    setAwaitingNextExercise(false);
  };
  const recordClassificationAttempt = (itemId: string, answer: string, correct: boolean) => {
    if (rewardActiveRef.current) return;
    if (!currentExercise || !shouldRecordSessionEvents(sessionFromSharedLink || sessionIsTrial)) return;
    const exerciseId = currentExercise.sourceExerciseId ?? currentExercise.id;
    const sessionItemId = `${sessionRunId}:${exerciseId}:${itemId}`;
    setAttempts((current) => appendAttempt(current, { id: crypto.randomUUID(), sessionId: sessionRunId, sessionItemId, exerciseId, wordId: itemId, answerId: answer, correct, quantityErrorless: currentExercise.quantityErrorless || undefined, mode: sessionMode, createdAt: new Date().toISOString(), childId: sessionChildId || activeChild?.id, therapistId: therapist?.id }).events);
  };

  const jumpToSessionIndex = (nextIndex: number) => {
    if (sessionPausedRef.current || rewardActiveRef.current) return;
    if (nextIndex < 0 || nextIndex >= sessionExercises.length) return;
    if (nextIndex !== sessionIndex) sessionAdvanceGuard.current.navigated();
    cancelSpeech();
    setSessionFurthestIndex((current) => Math.max(current, nextIndex));
    setSessionIndex(nextIndex);
    setAnswerState("idle");
    setWrongAnswerId(null);
    setAwaitingNextExercise(false);
  };
  const activityBounds = activityNavigation(sessionExercises, sessionIndex);
  const jumpActivity = (direction: -1 | 1) => {
    const target = direction === 1 ? activityBounds.next : activityBounds.previous;
    if (target !== null) jumpToSessionIndex(target);
  };
  const handleRemoteCommand = (event: RemoteControllerEvent) => {
    const command = event.command;
    if (sessionReadyRef.current) {
      if (command === "start") startPreparedSession();
      return;
    }
    if (!sessionActive || command === "start") return;
    const disposition = remoteCommandDisposition(command, sessionPausedRef.current, awaitingNextExercise, "active", rewardActiveRef.current);
    if (disposition === "ignore") return;
    if (command === "toggle_reward") { changeReward(!rewardActiveRef.current); return; }
    // Check actual PC bounds too: a stale/forged phone snapshot cannot skip past the plan.
    if (command === "next_activity" && activityBounds.next === null) return;
    if (command === "previous_activity" && activityBounds.previous === null) return;
    if (disposition === "continue") { setAwaitingNextExercise(false); return; }
    if (command === "finish") {
      if (activityBounds.next === null && sessionAdvanceGuard.current.claim(sessionRunId, sessionIndex)) completeActiveSession();
      return;
    }
    if (command === "next") { nextExercise({ skipTransition: true }); return; }
    if (command === "previous") { navigateReachedExercise(-1); return; }
    if (command === "next_activity") { jumpActivity(1); return; }
    if (command === "previous_activity") { jumpActivity(-1); return; }
    if (command === "pause") {
      sessionPausedRef.current = true;
      setSessionPaused(true);
      cancelSpeech();
      return;
    }
    if (command === "resume") { sessionPausedRef.current = false; setSessionPaused(false); return; }
    if (command === "toggle_audio") {
      setSoundEffects((current) => {
        if (current) cancelSpeech();
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
  const remoteSnapshot: RemoteSessionSnapshot | null = (sessionActive || sessionReady) && sessionRunId && activeChild && currentExercise ? {
    sessionId: sessionRunId,
    childName: activeChild.firstName,
    sessionTitle: sessionDescriptor.title,
    exerciseTitle: currentExercise.title,
    exerciseKind: currentKind,
    prompt: sessionReady ? "" : remotePrompt,
    phase: sessionReady ? "ready" : "active",
    currentIndex: sessionIndex,
    total: sessionExercises.length,
    answerState,
    soundEffects,
    paused: sessionPaused,
    rewardActive,
    awaitingNextExercise,
    canPreviousActivity: activityBounds.previous !== null,
    canNextActivity: activityBounds.next !== null,
    updatedAt: 0,
  } : null;
  const remoteHost = useRemoteSessionHost({
    enabled: Boolean(!controllerToken && (sessionActive || (sessionReady && view === "session")) && !sessionFromSharedLink && !sessionIsTrial && therapist && activeChild),
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
  }, [remoteConnected, setSessionPaused]);

  const saveExercise = (exercise: Exercise) => {
    const error = categoryImageError(exercise, visibleLibrary, categorySymbols);
    if (error) { notify(error); return; }
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
    appendSaveJournal(localStorage, { at: new Date().toISOString(), event: "sequence_changed", revision: cloud.revision(), changedSequences: 1, sequenceCount: exists ? sequences.length : sequences.length + 1 });
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

  const exitController = useCallback(() => {
    changeReward(false);
    if (controllerToken) sessionStorage.removeItem(`lg-controller:${controllerToken}`);
    sessionStorage.removeItem(PENDING_CONTROLLER_LAUNCH_KEY);
    controllerActiveRef.current = false;
    setControllerToken(null);
    setRealtimeControllerSessionId(null);
    setSessionPaused(false);
    setSessionActive(false);
    sessionReadyRef.current = false;
    setSessionReady(false);
    setAwaitingNextExercise(false);
    setRecoveryCandidate(null);
    setView("home");
    window.history.replaceState({ lgView: "home" }, "", window.location.pathname);
  }, [controllerToken, changeReward, setAwaitingNextExercise, setSessionActive, setSessionPaused, setSessionReady, setView]);
  const controllerJoined = useCallback(() => {
    sessionStorage.removeItem(PENDING_CONTROLLER_LAUNCH_KEY);
  }, []);
  const logout = async () => {
    if (logoutInFlight.current) return;
    logoutInFlight.current = true;
    setLogoutState("pending");
    cloud.cancelScheduledSave();
    const snapshot = cloud.currentSnapshot();
    const hasBaseline = cloud.hasBaseline();
    const pendingChange = cloud.pendingChange(snapshot);
    if (pendingChange) storePendingCloudSave(pendingChange);
    cloud.resetReadScope();
    localStorage.removeItem(THERAPIST_SESSION_STORAGE_KEY);
    sessionStorage.removeItem(THERAPIST_SESSION_STORAGE_KEY);
    exitController();
    setLoggedInTherapistId(null);
    setShowTherapistLogin(false);
    setView("home");
    try {
      // Finish queued/profile writes under the old cookie before revoking it.
      // A failed flush remains in the existing offline queue, never discarded.
      if (loggedInTherapistId && backendInitialized && hasBaseline) await enqueueBackendSave(snapshot).catch(() => undefined);
      else await cloud.saveQueue().catch(() => undefined);
      await logoutFromCloud((input, init) => fetchWithTimeout(input, init, 6500));
      setBackendStatus("local");
      setLogoutState("idle");
    } catch {
      // Do not expose a new login while an old logout is unconfirmed.
      setLogoutState("failed");
    } finally { logoutInFlight.current = false; }
  };
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
  if (logoutState !== "idle") return <LoadingScreen label={logoutState === "failed" ? "Disconnessione non confermata. Controlla la rete e riprova." : "Salvataggio e disconnessione..."} stalled={logoutState === "failed"} onRetry={() => { void logout(); }} />;
  if (pendingSharedPreviewToken && sharedPreviewStatus === "error") return <PublicPreviewError />;
  if (sessionFromSharedLink && sharedPreview && sessionActive) {
    const previewChild: ChildProfile = { id: "preview", firstName: "Anteprima", lastName: "", birthYear: "", notes: "", avatarColor: "#7568d9" };
    return <AudioVolumeContext.Provider value={{ volume: effectiveSoundVolume, setVolume: changeSoundVolume }}><main className="public-preview-shell">{awaitingNextExercise ? <SequenceTransition title={sessionExercises[sessionIndex]?.title ?? "Esercizio"} onContinue={() => setAwaitingNextExercise(false)} /> : <SessionView active complete={false} fromSharedLink isTrial={false} mode={sessionMode} setMode={setSessionMode} presentation={currentPresentation} setPresentation={setSessionPresentation} sequences={[]} therapists={[]} showSequenceOwners={false} activeChild={previewChild} childProfiles={[]} onSelectChild={() => undefined} onStartSequence={() => undefined} onStartQuick={() => undefined} quickCanBeSaved={false} onSaveQuick={() => undefined} completionComment="" onSaveCompletionComment={() => undefined} onCloseComplete={() => undefined} onExit={closeActiveSession} currentIndex={sessionIndex} total={sessionExercises.length} canPrevious={sessionIndex > 0} canForward={sessionIndex < sessionFurthestIndex} onPrevious={() => navigateReachedExercise(-1)} onForward={() => navigateReachedExercise(1)} exercise={currentExercise} prompt={promptItem} library={sessionLibrary} answerState={answerState} wrongAnswerId={wrongAnswerId} onChoose={chooseAnswer} onClassificationAttempt={recordClassificationAttempt} onClassificationComplete={nextExercise} onHelp={addHelp} onNext={nextExercise} soundEffects={soundEffects} onToggleSound={() => setSoundEffects((current) => !current)} />}{toast && <div className={sessionActive ? "toast toast-in-session" : "toast"} role="status"><Check size={18} />{toast}</div>}</main></AudioVolumeContext.Provider>;
  }
  if (!allLocalDataLoaded) return <LoadingScreen label="Caricamento dati…" stalled={localLoadSlow} />;
  if (!backendInitialized && (backendStatus === "loading" || backendStatus === "migrating")) return <LoadingScreen label={backendStatus === "migrating" ? "Trasferimento dei dati nel cloud…" : "Sincronizzazione dei dati…"} stalled onRetry={cloud.retryLoad} onContinueLocal={cloud.fallBackToLocal} />;
  if (!therapist) return <>{showTherapistLogin ? <TherapistLogin defaultEmail={therapists[0]?.email ?? ""} onBack={() => setShowTherapistLogin(false)} /> : <PublicLanding onLogin={() => setShowTherapistLogin(true)} />}{celebratingSequence && <SequenceCelebration startMusic={startRewardMusic} musicVolume={effectiveSoundVolume / 100} onPop={playBalloonPopSound} onClose={() => setCelebratingSequence(false)} />}</>;
  if (controllerToken) return <RemoteControllerConsole token={controllerToken} realtimeSessionId={realtimeControllerSessionId} therapist={therapist} onLogout={logout} onExit={exitController} onJoined={controllerJoined} />;
  if (!activeChild && (view === "caa" || view === "games")) return (
    <div className="app-shell">
      <Sidebar view={view} onNavigate={navigate} open={menuOpen} onClose={() => setMenuOpen(false)} therapist={therapist} onLogout={logout} backendStatus={backendStatus} />
      <main className="main-content">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Apri menu"><Menu /></button>
          <button className="ghost-button" onClick={() => navigate("home")}>Torna alla scelta del profilo</button>
          <AppVersionBadge />
        </header>
        {view === "games" ? <GamesView library={visibleLibrary} soundVolume={effectiveSoundVolume / 100} onPlayingChange={setStandaloneGameOpen} /> : (
          <CaaStoriesView key={caaStories.owner || therapist.id} owner={caaStories.owner} store={caaStories} library={visibleLibrary} prepareImage={prepareUploadedImage} />
        )}
      </main>
    </div>
  );
  if (!activeChild) return <ChildChooser therapist={therapist} childProfiles={children} onChoose={setActiveChildId} onLogout={logout} onCaa={() => navigate("caa")} onGames={() => navigate("games")} />;

  return (
    <RewardActiveContext.Provider value={rewardActive || appUpdating}>
    <div className="app-shell">
      <Sidebar view={view} onNavigate={navigate} open={menuOpen} onClose={() => setMenuOpen(false)} therapist={therapist} onLogout={logout} backendStatus={backendStatus} />
      <main className="main-content" inert={rewardActive} aria-hidden={rewardActive || undefined}>
        <Topbar onMenu={() => setMenuOpen(true)} therapist={therapist} child={activeChild} childProfiles={sessionActive || sessionReady ? [activeChild] : associatedChildren} onSelectChild={setActiveChildId} onOpenProfiles={() => navigate("profiles")} backendStatus={backendStatus} onOpenSaveJournal={() => setSaveJournalOpen(true)} />
        {view === "home" && <Dashboard therapist={therapist} child={activeChild} libraryCount={visibleLibrary.length} exerciseCount={visibleExercises.length} sequenceTotal={visibleSequences.length} activeSequence={activeSequence ? { title: activeSequence.title, exerciseTitles: sequenceExercises.map((exercise) => exercise.title) } : undefined} accuracy={accuracy} attemptCount={firstAttempts.length} onStart={() => navigate("session")} onNavigate={navigate} />}
        {view === "library" && <LibraryView categorySymbols={categorySymbols} onCategorySymbol={(category, id) => setCategorySymbols((current) => { const next = { ...current }; if (id) next[category] = id; else delete next[category]; return next; })} onCategoryUpload={async (category, image) => {
          const id = crypto.randomUUID();
          const remote = navigator.onLine && backendStatus !== "local" ? await uploadRemoteImage(crypto.randomUUID(), image) : null;
          const imageKey = `library-image-${id}`;
          await storeLibraryImage(imageKey, image);
          setLibrary((current) => [{ id, word: category, category, categorySymbolOnly: true, image, imageKey, remoteImageId: remote?.id, privateUpload: true, source: "Upload privato", license: "Diritti confermati dall’adulto", author: "Utente" }, ...current]);
          setCategorySymbols((current) => ({ ...current, [category]: id }));
        }} items={visibleLibrary} search={search} setSearch={setSearch} onUpload={setShowUpload} onEdit={setEditingItem} onDelete={setPendingLibraryDelete} sounds={soundPreferences} onSoundsChange={setSoundPreferences} />}
        {view === "exercises" && <ExercisesView exercises={visibleExercises} sequences={visibleSequences} activeSequence={activeSequence} therapists={therapists} showSequenceOwners={canSeeAllSequences} library={visibleLibrary} onSelectSequence={setActiveSequenceId} onCreateSequence={() => setEditingSequence("new")} onRenameSequence={() => activeSequence && setEditingSequence(activeSequence)} onDeleteSequence={() => activeSequence && setPendingSequenceDelete(activeSequence)} onBuild={(kind) => { setEditingExercise(null); setNewExerciseKind(kind); setShowBuilder(true); }} onEdit={(exercise) => { setEditingExercise(exercise); setNewExerciseKind(exerciseKind(exercise)); setShowBuilder(true); }} onDuplicate={duplicateExercise} onDelete={setPendingExerciseDelete} onToggleInSequence={toggleExerciseInSequence} onMove={moveSequenceExercise} onTry={tryExercise} onShareSequence={() => activeSequence && shareLaunch({ kind: "sequence", id: activeSequence.id }, activeSequence.title)} onShareExercise={(exercise) => shareLaunch({ kind: "exercise", id: exercise.id }, exercise.title)} />}
        {view === "session" && <AudioVolumeContext.Provider value={{ volume: effectiveSoundVolume, setVolume: changeSoundVolume }}><RemoteHostContext.Provider value={(sessionActive || sessionReady) && !sessionFromSharedLink && !sessionIsTrial ? remoteHost : null}>{awaitingNextExercise ? <SequenceTransition title={sessionExercises[sessionIndex]?.title ?? "Esercizio"} onContinue={() => setAwaitingNextExercise(false)} /> : <SessionView categorySymbols={categorySymbols} key={sessionWizardKey} onStartPrepared={startPreparedSession} onCancelPrepared={cancelPreparedSession} active={sessionActive} complete={sessionComplete} fromSharedLink={sessionFromSharedLink} isTrial={sessionIsTrial} remoteConnected={remoteConnected} mode={sessionMode} setMode={setSessionMode} presentation={currentPresentation} setPresentation={setSessionPresentation} sequences={visibleSequences} therapists={therapists} showSequenceOwners={canSeeAllSequences} activeChild={activeChild} childProfiles={associatedChildren} onSelectChild={setActiveChildId} onStartSequence={startSequenceById} onStartQuick={startQuickSession} quickCanBeSaved={Boolean(quickExerciseToSave)} onSaveQuick={saveQuickAsSequence} completionComment={completedSessionRecord?.comment ?? ""} onSaveCompletionComment={(comment) => { setSessionHistory((current) => current.map((record) => record.id === sessionRunId ? { ...record, comment } : record)); notify("Valutazione della sessione salvata"); }} onCloseComplete={() => { setSessionComplete(false); setQuickExerciseToSave(null); navigate("stats"); }} onExit={sessionIsTrial ? closeActiveSession : () => setExitPinOpen(true)} currentIndex={sessionIndex} total={sessionExercises.length} canPrevious={sessionIndex > 0} canForward={sessionIndex < sessionFurthestIndex} onPrevious={() => navigateReachedExercise(-1)} onForward={() => navigateReachedExercise(1)} exercise={currentExercise} prompt={promptItem} library={sessionLibrary} answerState={answerState} wrongAnswerId={wrongAnswerId} onChoose={chooseAnswer} onClassificationAttempt={recordClassificationAttempt} onClassificationComplete={nextExercise} onHelp={addHelp} onNext={nextExercise} soundEffects={soundEffects} onToggleSound={() => setSoundEffects((current) => !current)} />}</RemoteHostContext.Provider></AudioVolumeContext.Provider>}
        {view === "session" && sessionActive && sessionPaused && remoteConnected && <div className="remote-pause-overlay" role="status"><Pause /><strong>Sessione in pausa</strong><span>Riprendi dal telefono collegato.</span></div>}
        {view === "appearance" && <AppearanceView settings={appearance} onChange={setAppearance} />}
        {view === "caa" && <CaaStoriesView key={caaStories.owner || therapist.id} owner={caaStories.owner} store={caaStories} library={visibleLibrary} prepareImage={prepareUploadedImage} />}
        {view === "games" && <GamesView library={visibleLibrary} soundVolume={effectiveSoundVolume / 100} onPlayingChange={setStandaloneGameOpen} />}
        {view === "stats" && <StatsView child={activeChild} therapist={therapist} therapists={therapists} attempts={childAttempts} helps={childHelps} histories={childSessionHistory} exercises={exercises} library={library} onSaveHistoryComment={(id, comment) => { setSessionHistory((current) => current.map((record) => record.id === id ? { ...record, comment } : record)); notify("Valutazione aggiornata"); }} onDeleteHistory={(id, label) => setPendingHistoryDelete({ id, label })} onDeleteAllHistory={() => setPendingHistoryDelete({ label: `tutto lo storico di ${activeChild.firstName}` })} onReset={() => setPendingStatsReset(true)} />}
        {view === "profiles" && <ProfilesView key={`${therapist.id}:${associatedChildren.map((child) => child.id).join(":")}`} therapist={therapist} therapists={therapists} childProfiles={associatedChildren} allChildren={children} activeChildId={activeChild.id} canDeleteTherapist={therapists.length > 1 && therapist.role !== "Amministratore"} onSelectChild={setActiveChildId} onSaveTherapist={(updated) => { setTherapists((current) => current.map((item) => item.id === updated.id ? updated : item)); notify("Profilo adulto aggiornato"); }} onSaveTherapists={(updated) => { setTherapists(updated); notify("Profili adulti e associazioni aggiornati"); }} onSaveChild={(updated) => { setChildren((current) => current.map((item) => item.id === updated.id ? updated : item)); notify("Profilo bambino aggiornato"); }} onRequestDelete={setPendingDelete} />}
      </main>
      {showUpload && <UploadDialog kind={showUpload} onClose={() => setShowUpload(null)} onSave={async (item) => { try { let next = item; if (item.image) { const remote = backendStatus === "local" ? null : await uploadRemoteImage(crypto.randomUUID(), item.image); const imageKey = `library-image-${item.id}`; await storeLibraryImage(imageKey, item.image); next = { ...item, imageKey, remoteImageId: remote?.id }; } const outcome = await cloud.persistLibraryNow([next, ...localBootstrapSnapshot.current.library.filter((current) => current.id !== next.id)]); setShowUpload(null); notify(outcome === "cloud" ? "Elemento salvato nel cloud" : outcome === "local" ? "Elemento salvato solo su questo dispositivo" : `Elemento locale · errore cloud: ${cloud.lastSaveError()}`); } catch { notify("Impossibile salvare l’elemento"); } }} />}
      {editingItem && <EditLibraryDialog item={editingItem} onClose={() => setEditingItem(null)} onSave={async (updated) => { try { if (!libraryItemWasEdited({ ...hydrateSyllables(editingItem), article: articleFor(editingItem) ?? null }, updated)) { setEditingItem(null); notify("Nessuna modifica da salvare"); return; } let next = updated; if (updated.image && updated.image !== editingItem.image) { const remote = backendStatus === "local" ? null : await uploadRemoteImage(crypto.randomUUID(), updated.image); const imageKey = `library-image-${updated.id}-${crypto.randomUUID()}`; await storeLibraryImage(imageKey, updated.image); next = { ...updated, imageKey, remoteImageId: remote?.id }; } const currentLibrary = localBootstrapSnapshot.current.library; const outcome = await cloud.persistLibraryNow(currentLibrary.map((item) => item.id === next.id ? next : item)); setEditingItem(null); notify(outcome === "cloud" ? "Elemento salvato nel cloud" : outcome === "local" ? "Elemento salvato solo su questo dispositivo" : `Modifica locale · errore cloud: ${cloud.lastSaveError()}`); } catch { notify("Impossibile salvare le modifiche"); } }} />}
      {pendingLibraryDelete && <LibraryDeleteDialog item={pendingLibraryDelete} onCancel={() => setPendingLibraryDelete(null)} onConfirm={() => { setLibrary((current) => current.map((item) => item.id === pendingLibraryDelete.id ? { ...item, deleted: true } : item)); setPendingLibraryDelete(null); notify("Elemento archiviato e rimosso dai nuovi esercizi"); }} />}
      {showBuilder && <ExerciseBuilder categorySymbols={categorySymbols} kind={editingExercise ? exerciseKind(editingExercise) : newExerciseKind} library={visibleLibrary} exercise={editingExercise ?? undefined} onClose={() => { setShowBuilder(false); setEditingExercise(null); }} onSave={saveExercise} />}
      {editingSequence && <SequenceDialog sequence={editingSequence === "new" ? undefined : editingSequence} therapistId={therapist.id} onClose={() => setEditingSequence(null)} onSave={saveSequence} />}
      {saveJournalOpen && <SaveJournalDialog onClose={() => setSaveJournalOpen(false)} />}
      {pendingExerciseDelete && <ContentDeleteDialog title={`Eliminare “${pendingExerciseDelete.title}”?`} detail="L’esercizio sarà rimosso dalle sequenze. I risultati già registrati resteranno nello storico." onCancel={() => setPendingExerciseDelete(null)} onConfirm={deleteExercise} />}
      {pendingSequenceDelete && <ContentDeleteDialog title={`Eliminare la sequenza “${pendingSequenceDelete.title}”?`} detail="Gli esercizi e i risultati già registrati resteranno disponibili." onCancel={() => setPendingSequenceDelete(null)} onConfirm={deleteSequence} />}
      {pendingDelete && <DeleteDialog item={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />}
      {pendingHistoryDelete && <ContentDeleteDialog title={`Eliminare ${pendingHistoryDelete.label}?`} detail="Lo storico verrà nascosto agli utenti. Le immagini archiviate resteranno nello storage per non alterare altre sessioni." onCancel={() => setPendingHistoryDelete(null)} onConfirm={() => { const deletedAt = new Date().toISOString(); setSessionHistory((current) => current.map((record) => (!pendingHistoryDelete.id || record.id === pendingHistoryDelete.id) && record.childId === activeChild.id ? { ...record, deletedAt } : record)); setPendingHistoryDelete(null); notify("Storico eliminato"); }} />}
      {pendingStatsReset && <ContentDeleteDialog title={`Azzerare le statistiche di ${activeChild.firstName}?`} detail="Saranno eliminati tutti i tentativi e gli aiuti registrati per questo bambino. Profili, immagini, esercizi e sequenze restano invariati." onCancel={() => setPendingStatsReset(false)} onConfirm={() => { setAttempts((current) => current.filter((attempt) => attempt.childId && attempt.childId !== activeChild.id)); setHelps((current) => current.filter((help) => help.childId && help.childId !== activeChild.id)); setPendingStatsReset(false); notify("Statistiche del bambino azzerate"); }} />}
      {exitPinOpen && <SessionExitDialog therapist={therapist} onCancel={() => setExitPinOpen(false)} onConfirm={closeActiveSession} />}
      {recoveryCandidate && <SessionRecoveryDialog saved={recoveryCandidate} childName={children.find((child) => child.id === recoveryCandidate.childId)?.firstName ?? "il bambino"} onResume={resumeRecoveredSession} onDiscard={discardRecoveredSession} />}
      {toast && <div className={sessionActive ? "toast toast-in-session" : "toast"} role="status"><Check size={18} />{toast}</div>}
      {rewardActive && sessionActive && <SequenceCelebration startMusic={startRewardMusic} musicVolume={effectiveSoundVolume / 100} key="remote-reward" mode="reward" onPop={playBalloonPopSound} onClose={() => changeReward(false)} />}
      {celebratingSequence && <SequenceCelebration startMusic={startRewardMusic} musicVolume={effectiveSoundVolume / 100} key="completion-reward" onPop={playBalloonPopSound} onClose={() => setCelebratingSequence(false)} />}
    </div>
    </RewardActiveContext.Provider>
  );
}
