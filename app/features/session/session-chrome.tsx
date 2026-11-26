import { Check, ChevronLeft, ChevronRight, CircleHelp, Volume2, VolumeX, X } from "lucide-react";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { sessionProgressLabel, sessionProgressSteps, type SessionProgressTurn } from "../../domain/session-progress";
import { ImageCreditsButton } from "./session-image-credits";
import { RemoteHostBadge } from "../remote/remote-host";
import { type SessionNavigationProps } from "./session-view";
import { PROTECTED_EXIT_HOLD_MS, helpTypes } from "../../shared/constants";
import { AudioVolumeContext, RemoteHostContext } from "../../shared/hooks";

export function SessionTools({ onExit, protectedExit = true, canPrevious, canForward, onPrevious, onForward }: { soundEffects: boolean; onToggleSound: () => void; onExit: () => void; protectedExit?: boolean } & SessionNavigationProps) {
  const remoteHost = useContext(RemoteHostContext);
  return <div className="session-controls-stack"><div className="session-tools"><div className="session-step-navigation" aria-label="Navigazione tra i passaggi"><button type="button" onClick={onPrevious} disabled={!canPrevious} aria-label="Passaggio precedente"><ChevronLeft /></button><button type="button" onClick={onForward} disabled={!canForward} aria-label="Passaggio successivo già raggiunto"><ChevronRight /></button></div><VolumeControl />{remoteHost && <RemoteHostBadge host={remoteHost} />}{protectedExit ? <ProtectedExitButton onComplete={onExit} /> : <button className="ghost-button" type="button" onClick={onExit}>Chiudi</button>}</div><div className="session-version-credits"><ImageCreditsButton /></div></div>;
}

/** The compiled session plan, so every activity shows the same per-exercise progress dots. */
export const SessionPlanContext = createContext<readonly SessionProgressTurn[] | null>(null);

/** One dot per exercise: its ring fills turn by turn and becomes a green check when the exercise is finished. */
export function SessionProgress({ currentIndex, total }: { currentIndex: number; total: number }) {
  const contextPlan = useContext(SessionPlanContext);
  const steps = useMemo(() => {
    const plan = contextPlan?.length === total ? contextPlan : Array.from({ length: total }, (_, index) => ({ id: String(index), title: `Passaggio ${index + 1}` }));
    return sessionProgressSteps(plan, currentIndex);
  }, [contextPlan, currentIndex, total]);
  const currentPosition = steps.findIndex((step) => step.status === "current");
  const current = steps[currentPosition];
  return <div className="session-progress" role="group" aria-label={sessionProgressLabel(steps)}>
    <ol className="progress-dots" aria-hidden="true">{steps.map((step, index) => <li key={step.key} className={`progress-dot ${step.status}`} title={step.title} style={{ "--progress": `${step.completedTurns / step.turns}` } as React.CSSProperties}><span>{step.status === "done" ? <Check /> : index + 1}</span></li>)}</ol>
    {current && <span className="progress-caption" aria-hidden="true">{current.turns > 1 ? `${current.completedTurns + 1} di ${current.turns}` : steps.length > 1 ? `${currentPosition + 1} di ${steps.length}` : "1 di 1"}</span>}
  </div>;
}

function VolumeControl() {
  const { volume, setVolume } = useContext(AudioVolumeContext);
  const [open, setOpen] = useState(false);
  const level = Math.min(100, Math.max(0, volume));
  return <div className="volume-control">
    <button className="sound-toggle" type="button" onClick={() => setOpen((current) => !current)} aria-label={`Volume ${level}%. Apri regolazione`} aria-expanded={open}>{level > 0 ? <Volume2 /> : <VolumeX />}</button>
    {open && <div className="volume-popover"><VolumeX aria-hidden="true" /><input type="range" min={0} max={100} step={5} value={level} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume di voce e suoni" /><Volume2 aria-hidden="true" /><output>{level}%</output></div>}
  </div>;
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
    }, PROTECTED_EXIT_HOLD_MS);
  };
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  return <button className={`ghost-button protected-exit-button ${holding ? "holding" : ""}`} type="button" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); start(); }} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onKeyDown={(event) => { if (!event.repeat && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); start(); } }} onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") cancel(); }} onClick={(event) => event.preventDefault()} aria-label={`Tieni premuto per ${PROTECTED_EXIT_HOLD_MS / 1000} secondi per terminare`} style={{ "--protected-exit-duration": `${PROTECTED_EXIT_HOLD_MS}ms` } as React.CSSProperties}><span>{holding ? "Premi…" : "Termina"}<small className="protected-exit-hint">tieni premuto</small></span><i aria-hidden="true" /></button>;
}

export function AnswerLabel({ word, wordOnly }: { word: string; wordOnly: boolean }) {
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

export function AnswerFeedback({ state, children }: { state: "idle" | "wrong" | "correct"; children: ReactNode }) {
  return <div className={`feedback answer-feedback ${state}`} role="status" aria-atomic="true">{children}</div>;
}

export function HelpDock({ onHelp }: { onHelp: (label: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const remoteConnected = useContext(RemoteHostContext)?.status === "connected";
  useEffect(() => {
    if (remoteConnected) dialog.current?.close();
  }, [remoteConnected]);

  return <aside className="help-dock" aria-label="Aiuti dell’adulto">
    <div className="help-dock-heading"><CircleHelp aria-hidden="true" /><span><strong>Aiuti dell’adulto</strong><small>Scegli solo quando serve</small></span></div>
    <HelpActions onSelect={onHelp} />
    <button ref={trigger} className="help-dock-trigger ghost-button" type="button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
      <CircleHelp size={18} aria-hidden="true" /> Aiuti dell’adulto
    </button>
    <dialog ref={dialog} className="help-dock-dialog" aria-labelledby={titleId} onClose={() => {
      if (!remoteConnected) trigger.current?.focus({ preventScroll: true });
    }}>
      <header><h2 id={titleId}>Aiuti dell’adulto</h2><button type="button" className="icon-button" aria-label="Chiudi aiuti" onClick={() => dialog.current?.close()}><X aria-hidden="true" /></button></header>
      <HelpActions onSelect={(help) => {
        onHelp(help);
        dialog.current?.close();
      }} />
    </dialog>
  </aside>;
}

function HelpActions({ onSelect }: { onSelect: (help: string) => void }) {
  return <div className="help-actions">
    {helpTypes.map((help) => <button key={help} type="button" onClick={() => onSelect(help)}>{help}</button>)}
  </div>;
}
