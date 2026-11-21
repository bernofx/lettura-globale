import { ChevronLeft, ChevronRight, CircleHelp, Volume2, VolumeX } from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";
import { AppVersionBadge } from "../../components/app-update";
import { RemoteHostBadge } from "../remote/remote-host";
import { type SessionNavigationProps } from "./session-view";
import { PROTECTED_EXIT_HOLD_MS, helpTypes } from "../../shared/constants";
import { AudioVolumeContext, RemoteHostContext } from "../../shared/hooks";

export function SessionTools({ onExit, protectedExit = true, canPrevious, canForward, onPrevious, onForward }: { soundEffects: boolean; onToggleSound: () => void; onExit: () => void; protectedExit?: boolean } & SessionNavigationProps) {
  const remoteHost = useContext(RemoteHostContext);
  return <div className="session-controls-stack"><div className="session-tools"><div className="session-step-navigation" aria-label="Navigazione tra i passaggi"><button type="button" onClick={onPrevious} disabled={!canPrevious} aria-label="Passaggio precedente"><ChevronLeft /></button><button type="button" onClick={onForward} disabled={!canForward} aria-label="Passaggio successivo già raggiunto"><ChevronRight /></button></div><VolumeControl />{remoteHost && <RemoteHostBadge host={remoteHost} />}{protectedExit ? <ProtectedExitButton onComplete={onExit} /> : <button className="ghost-button" type="button" onClick={onExit}>Chiudi</button>}</div><AppVersionBadge /></div>;
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
  return <button className={`ghost-button protected-exit-button ${holding ? "holding" : ""}`} type="button" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); start(); }} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onKeyDown={(event) => { if (!event.repeat && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); start(); } }} onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") cancel(); }} onClick={(event) => event.preventDefault()} aria-label={`Tieni premuto per ${PROTECTED_EXIT_HOLD_MS / 1000} secondi per terminare`} style={{ "--protected-exit-duration": `${PROTECTED_EXIT_HOLD_MS}ms` } as React.CSSProperties}><span>{holding ? "Premi…" : "Termina"}</span><i aria-hidden="true" /></button>;
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

export function HelpDock({ onHelp }: { onHelp: (label: string) => void }) {
  return <aside className="help-dock"><div><CircleHelp /><span><strong>Aiuti dell’adulto</strong><small>Scegli solo quando serve</small></span></div><div className="help-actions">{helpTypes.map((help) => <button key={help} onClick={() => onHelp(help)}>{help}</button>)}</div></aside>;
}
