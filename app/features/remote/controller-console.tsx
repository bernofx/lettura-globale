import { Candy, Check, ChevronLeft, ChevronRight, CircleHelp, Home, LogOut, Pause, Play, RefreshCw, Shuffle, Square, Volume2, VolumeX, Wifi, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { controllerSessionView, REMOTE_CONTROLLER_POLL_MS, remoteCommandDisposition, remoteCommandFeedback, type RemoteCommandName, remoteExerciseControls, type RemoteSessionSnapshot } from "../../domain/remote-controller";
import { type CommandTiming, RealtimeSocket } from "../../realtime-socket";
import { fetchWithTimeout } from "../../shared/cloud-client";
import { helpTypes } from "../../shared/constants";
import { type Therapist } from "../../shared/types";
import { browserRandomHex } from "../../shared/utils";

type ControllerConsoleState = { status: "joining" | "pending" | "connected" | "lost" | "error"; sessionId: string; controllerKey: string; snapshot: RemoteSessionSnapshot | null; error: string };

type ControllerCommandFeedback = { id: string; key: string; phase: "sending" | "sent" | "error"; label: string };

export function RemoteControllerConsole({ token, realtimeSessionId, therapist, onLogout, onExit, onJoined }: { token: string; realtimeSessionId: string | null; therapist: Therapist; onLogout: () => void; onExit: () => void; onJoined: () => void }) {
  const [state, setState] = useState<ControllerConsoleState>({ status: "joining", sessionId: "", controllerKey: "", snapshot: null, error: "" });
  const [commandFeedback, setCommandFeedback] = useState<ControllerCommandFeedback | null>(null);
  const [commandTiming, setCommandTiming] = useState<CommandTiming | null>(null);
  const sendQueue = useRef<Promise<void>>(Promise.resolve());
  const feedbackTimer = useRef<number | null>(null);
  const [connectAttempt, setConnectAttempt] = useState(0);
  const leaving = useRef(false);
  const realtimeSocket = useRef<RealtimeSocket | null>(null);
  const storageKey = `lg-controller:${token}`;

  useEffect(() => {
    if (state.status === "connected" && state.snapshot) onJoined();
  }, [onJoined, state.status, state.snapshot]);

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
        const response = await fetch(realtimeSessionId ? "/api/controller/realtime" : "/api/controller/pairing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "join", token, controllerKey, ...(realtimeSessionId ? { sessionId: realtimeSessionId } : {}) }) });
        if (!response.ok) throw new Error(response.status === 404 ? "Il QR è scaduto. Generane uno nuovo dal PC." : response.status === 403 ? "Questo profilo non può controllare la sessione." : "Collegamento non riuscito.");
        const result = await response.json() as { sessionId: string };
        if (cancelled || leaving.current) return;
        sessionStorage.setItem(storageKey, JSON.stringify({ sessionId: result.sessionId, controllerKey }));
        if (!cancelled) setState((current) => ({ ...current, status: "connected", sessionId: result.sessionId, controllerKey }));
      } catch (error) {
        if (!cancelled) setState((current) => ({ ...current, status: "error", error: error instanceof Error ? error.message : "Collegamento non riuscito." }));
      }
    };
    void connect();
    return () => { cancelled = true; };
  }, [connectAttempt, storageKey, token, realtimeSessionId]);

  useEffect(() => {
    if (!state.sessionId || !state.controllerKey) return;
    if (realtimeSessionId) {
      const socket = new RealtimeSocket({ sessionId: state.sessionId, role: "controller", controllerKey: state.controllerKey,
        onTiming: (timing) => { if (!leaving.current) setCommandTiming((old) => old && old.startedAt > timing.startedAt ? old : timing); },
        onConnection: (connected, reason) => {
          if (leaving.current || connected) return;
          if (reason === "session_closed") { leaving.current = true; onExit(); return; }
          setState((old) => ({ ...old, status: "lost", snapshot: null, error: reason === "controller_replaced" ? "Un altro telefono ha preso il controllo della sessione." : "Connessione DO interrotta. Riconnessione in corso…" }));
        },
        onMessage: (message) => {
          if (leaving.current || message.type !== "state") return;
          const next = controllerSessionView(message);
          if (next.status === "closed") { leaving.current = true; onExit(); return; }
          const { status, snapshot } = next;
          setState((old) => old.status === status && !old.error && JSON.stringify(old.snapshot) === JSON.stringify(snapshot) ? old : { ...old, status, snapshot, error: "" });
        },
      });
      realtimeSocket.current = socket;
      return () => { socket.stop(); if (realtimeSocket.current === socket) realtimeSocket.current = null; };
    }
    let cancelled = false;
    let polling = false;
    const poll = async () => {
      if (polling || cancelled) return;
      polling = true;
      try {
        const response = await fetch(`/api/controller/session/${encodeURIComponent(state.sessionId)}`, { headers: { "x-controller-key": state.controllerKey }, cache: "no-store" });
        if (response.status === 403) throw new Error("Un altro telefono ha preso il controllo della sessione.");
        if (!response.ok) throw new Error("Connessione al PC non disponibile.");
        const result = await response.json() as { status: string; connected: boolean; snapshot?: RemoteSessionSnapshot | null };
        if (cancelled || leaving.current) return;
        const next = controllerSessionView(result);
        const { status, snapshot } = next;
        if (status === "closed") {
          leaving.current = true;
          onExit();
          return;
        }
        if (!cancelled) setState((current) => {
          return current.status === status && !current.error && JSON.stringify(current.snapshot) === JSON.stringify(snapshot)
            ? current
            : { ...current, status, snapshot, error: "" };
        });
      } catch (error) {
        if (!cancelled) setState((current) => {
          const message = error instanceof Error ? error.message : "Connessione persa.";
          return current.status === "error" && current.error === message && !current.snapshot ? current : { ...current, status: "error", snapshot: null, error: message };
        });
      } finally { polling = false; }
    };
    void poll();
    const timer = window.setInterval(poll, REMOTE_CONTROLLER_POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [onExit, state.controllerKey, state.sessionId, realtimeSessionId]);

  const leaveController = (logOut: boolean) => {
    leaving.current = true;
    if (state.sessionId && state.controllerKey) {
      void fetchWithTimeout(realtimeSessionId ? "/api/controller/realtime" : `/api/controller/session/${encodeURIComponent(state.sessionId)}`, {
        method: "POST", keepalive: true, headers: { "content-type": "application/json", "x-controller-key": state.controllerKey },
        body: JSON.stringify({ action: "disconnect", ...(realtimeSessionId ? { sessionId: state.sessionId, controllerKey: state.controllerKey } : {}) }),
      }, 2_500).catch(() => undefined).finally(() => { if (logOut) onLogout(); });
    } else if (logOut) onLogout();
    if (!logOut) onExit();
  };

  const send = (command: RemoteCommandName, payload?: { label?: string }) => {
    if (state.status !== "connected" || remoteCommandDisposition(command, state.snapshot?.paused ?? false, state.snapshot?.awaitingNextExercise, state.snapshot?.phase, state.snapshot?.rewardActive) === "ignore") return;
    if (command === "previous_activity" && state.snapshot?.canPreviousActivity !== true) return;
    if (command === "next_activity" && state.snapshot?.canNextActivity !== true) return;
    if (command === "finish" && state.snapshot?.canNextActivity !== false) return;
    const id = crypto.randomUUID();
    const key = `${command}:${payload?.label ?? ""}`;
    const label = remoteCommandFeedback(command, payload);
    const tappedAt = performance.now();
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    setCommandFeedback({ id, key, phase: "sending", label });
    if ("vibrate" in navigator) navigator.vibrate(12);
    const dispatch = async () => {
      if (leaving.current) return;
      if (realtimeSessionId) {
        if (!realtimeSocket.current) throw new Error("not_connected");
        await realtimeSocket.current.command({ clientEventId: id, command, payload }, tappedAt);
      } else {
        const response = await fetchWithTimeout(`/api/controller/session/${encodeURIComponent(state.sessionId)}`, { method: "POST", headers: { "content-type": "application/json", "x-controller-key": state.controllerKey }, body: JSON.stringify({ action: "command", command: { clientEventId: id, command, payload } }) }, 6_500);
        if (!response.ok) throw new Error("command_failed");
      }
      if (leaving.current) return;
      setCommandFeedback((current) => current?.id === id ? { ...current, phase: "sent" } : current);
      if ("vibrate" in navigator) navigator.vibrate([10, 30, 10]);
      feedbackTimer.current = window.setTimeout(() => setCommandFeedback((current) => current?.id === id ? null : current), 1_100);
    };
    const pending = realtimeSessionId ? dispatch() : sendQueue.current.catch(() => undefined).then(dispatch);
    if (!realtimeSessionId) sendQueue.current = pending;
    void pending.catch((error) => {
      if (leaving.current) return;
      setCommandFeedback((current) => current?.id === id ? { ...current, phase: "error" } : current);
      feedbackTimer.current = window.setTimeout(() => setCommandFeedback((current) => current?.id === id ? null : current), 2_500);
      if ("vibrate" in navigator) navigator.vibrate([35, 30, 35]);
      if (error instanceof Error && ["not_connected", "disconnected"].includes(error.message)) setState((current) => ({ ...current, status: "lost", snapshot: null, error: "Connessione interrotta. Riconnessione in corso…" }));
    });
  };
  const feedbackFor = (command: RemoteCommandName, payload?: { label?: string }) => commandFeedback?.key === `${command}:${payload?.label ?? ""}` ? commandFeedback.phase : undefined;
  const snapshot = state.snapshot;
  const connected = state.status === "connected";
  const exerciseControlsEnabled = connected && !snapshot?.paused && !snapshot?.rewardActive;
  const controls = remoteExerciseControls(snapshot?.exerciseKind);

  return <main className="remote-controller-page">
    <header><div><span className="brand-mark brand-logo" aria-hidden="true" /><span><small>CONSOLE ADULTA</small><strong>{therapist.firstName} {therapist.lastName}</strong></span></div><div><button type="button" onClick={() => leaveController(false)}><Home />Home</button><button type="button" onClick={() => leaveController(true)} aria-label="Esci dall'account"><LogOut />Esci</button></div></header>
    <section className="remote-controller-status"><span className={`remote-status-dot ${connected ? "connected" : ""}`} />
      <div><strong>{connected ? "Collegato al PC" : state.status === "joining" ? "Collegamento…" : "Non collegato"}{realtimeSessionId ? " · Realtime DO" : ""}</strong><small>{state.error || (connected ? "I comandi vengono registrati nella sessione." : "I controlli restano disponibili sul PC.")}</small></div>
      {state.error.startsWith("Un altro telefono") && <button type="button" onClick={() => { sessionStorage.removeItem(storageKey); setState({ status: "joining", sessionId: "", controllerKey: "", snapshot: null, error: "" }); setConnectAttempt((current) => current + 1); }}><RefreshCw />Riprendi il controllo</button>}
    </section>
    {commandFeedback && <div className={`remote-command-feedback ${commandFeedback.phase}`} role="status" aria-live="polite">
      {commandFeedback.phase === "sending" ? <RefreshCw /> : commandFeedback.phase === "sent" ? <Check /> : <X />}
      <span><strong>{commandFeedback.label}</strong><small>{commandFeedback.phase === "sending" ? "Invio al PC…" : commandFeedback.phase === "sent" ? commandTiming?.clientEventId === commandFeedback.id && commandTiming.appliedMs !== undefined ? `Elaborato sul PC · ${commandTiming.appliedMs} ms` : "Ricevuto dal server" : "Conferma non ricevuta: controlla il PC prima di riprovare"}</small></span>
    </div>}
    {realtimeSessionId && <details className="remote-latency"><summary>Tempi del collegamento</summary>{commandTiming ? <small>Ultimo comando: conferma server {commandTiming.ackMs === undefined ? "in attesa" : `${commandTiming.ackMs} ms`} · elaborazione sul PC {commandTiming.appliedMs === undefined ? "non ancora confermata" : `${commandTiming.appliedMs} ms complessivi (${commandTiming.hostMs ?? 0} ms sul PC)`}. Misure locali, senza nomi o risultati.</small> : <small>I tempi compariranno dopo il primo comando. Il pannello resta chiuso finché non lo apri.</small>}</details>}
    {snapshot?.phase === "ready" ? <section className="remote-now-card remote-ready-card"><span>{snapshot.childName}</span><h1>PRONTI?</h1><p>{snapshot.sessionTitle}</p><button className="primary-button large" type="button" data-feedback={feedbackFor("start")} disabled={!connected || commandFeedback?.phase === "sending"} onClick={() => send("start")}><Play fill="currentColor" />Inizia</button><small>Gli altri controlli saranno disponibili dopo l’avvio.</small></section> : snapshot ? <>
      <section className="remote-now-card"><span>{snapshot.childName} · {snapshot.currentIndex + 1} di {snapshot.total}</span><h1>{snapshot.exerciseTitle}</h1><p>{snapshot.prompt || snapshot.sessionTitle}</p><div><small>{snapshot.answerState === "correct" ? "Risposta corretta" : snapshot.answerState === "wrong" ? "Risposta errata" : "In attesa della risposta"}</small>{snapshot.paused && <strong>IN PAUSA</strong>}</div></section>
      <section className="remote-command-grid">
        <button type="button" data-feedback={feedbackFor("previous")} disabled={!exerciseControlsEnabled || snapshot.currentIndex === 0} onClick={() => send("previous")}><ChevronLeft />Passo precedente</button>
        <button type="button" className="primary" data-feedback={feedbackFor("next")} disabled={!exerciseControlsEnabled} onClick={() => send("next")}>{snapshot.awaitingNextExercise ? "Avvia esercizio" : "Passo successivo"}<ChevronRight /></button>
        <button type="button" data-feedback={feedbackFor("previous_activity")} disabled={!exerciseControlsEnabled || snapshot.canPreviousActivity !== true} onClick={() => send("previous_activity")}><ChevronLeft />Tipo precedente</button>
        <button type="button" data-feedback={feedbackFor("next_activity")} disabled={!exerciseControlsEnabled || snapshot.canNextActivity !== true} onClick={() => send("next_activity")}>Tipo successivo<ChevronRight /></button>
      </section>
      {snapshot.canNextActivity === false && <section className="remote-command-row"><button type="button" data-feedback={feedbackFor("finish")} disabled={!exerciseControlsEnabled} onClick={() => { if (window.confirm("Concludere la sessione e mostrare la festa finale? Le prove non svolte non saranno segnate come corrette.")) send("finish"); }}><Check />Concludi sessione</button></section>}
      <section className="remote-command-row">
        <button type="button" aria-pressed={Boolean(snapshot.rewardActive)} data-feedback={feedbackFor("toggle_reward")} disabled={!connected || commandFeedback?.phase === "sending"} onClick={() => send("toggle_reward")}><Candy />{snapshot.rewardActive ? "Chiudi premio" : "Premio"}</button>
        {controls.speak && <button type="button" data-feedback={feedbackFor("speak")} disabled={!exerciseControlsEnabled} onClick={() => send("speak")}><Volume2 />Riascolta</button>}
        <button type="button" data-feedback={feedbackFor("toggle_audio")} disabled={!connected} onClick={() => send("toggle_audio")}>{snapshot.soundEffects ? <VolumeX /> : <Volume2 />}{snapshot.soundEffects ? "Togli audio" : "Attiva audio"}</button>
        {controls.shuffle && <button type="button" data-feedback={feedbackFor("shuffle")} disabled={!exerciseControlsEnabled} onClick={() => send("shuffle")}><Shuffle />Mischia</button>}
        <button type="button" data-feedback={feedbackFor(snapshot.paused ? "resume" : "pause")} disabled={!connected || snapshot.rewardActive} onClick={() => send(snapshot.paused ? "resume" : "pause")}>{snapshot.paused ? <Play /> : <Pause />}{snapshot.paused ? "Riprendi" : "Pausa"}</button>
      </section>
      {controls.judgement && <section className="remote-judgement"><button data-feedback={feedbackFor("mark_wrong")} disabled={!exerciseControlsEnabled} onClick={() => send("mark_wrong")}><X />Errata</button>{controls.helped && <button data-feedback={feedbackFor("mark_helped")} disabled={!exerciseControlsEnabled} onClick={() => send("mark_helped")}><CircleHelp />Corretta con aiuto</button>}<button data-feedback={feedbackFor("mark_correct")} disabled={!exerciseControlsEnabled} onClick={() => send("mark_correct")}><Check />Corretta</button>{controls.retry && <button data-feedback={feedbackFor("retry")} disabled={!exerciseControlsEnabled} onClick={() => send("retry")}><RefreshCw />Riprova</button>}</section>}
      <section className="remote-help-panel"><span>Aiuti forniti</span><div>{helpTypes.map((label) => <button type="button" data-feedback={feedbackFor("help", { label })} disabled={!exerciseControlsEnabled} key={label} onClick={() => send("help", { label })}>{label}</button>)}</div></section>
      <button className="remote-end-button" data-feedback={feedbackFor("end")} type="button" disabled={!connected} onClick={() => { if (window.confirm("Interrompere la sessione sul PC?")) send("end"); }}><Square />Interrompi sessione</button>
    </> : <section className="remote-waiting"><Wifi /><h1>{state.status === "error" ? "Collegamento non disponibile" : "Connessione alla sessione"}</h1><p>{state.error || "Il collegamento si completa automaticamente."}</p></section>}
  </main>;
}
