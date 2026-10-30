"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { BALLOON_COLORS, BALLOON_WAVE_COUNT, BALLOON_WAVE_INTERVAL_MS, CELEBRATION_DURATION_MS, celebrationBalloons, popCelebrationBalloon } from "../domain/celebration";

const confettiColors = ["#ee6f8b", "#ffc65f", "#80cbb1", "#9c8de6", "#76b8ed"];
const burstDirections = Array.from({ length: 8 }, (_, index) => ({
  "--burst-x": `${Math.round(Math.cos(index * Math.PI / 4) * 38)}px`,
  "--burst-y": `${Math.round(Math.sin(index * Math.PI / 4) * 38)}px`,
  "--burst-angle": `${index * 45}deg`,
} as CSSProperties));

export function SequenceCelebration({ onPop, onClose, continuous = false }: { onPop?: () => void; onClose: () => void; continuous?: boolean }) {
  const [wave, setWave] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    const timer = window.setInterval(() => setWave((current) => continuous ? current + 1 : Math.min(current + 1, BALLOON_WAVE_COUNT - 1)), BALLOON_WAVE_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [continuous]);
  const [popped, setPopped] = useState<ReadonlySet<number>>(() => new Set());
  const [popCount, setPopCount] = useState(0);
  const poppedRef = useRef(popped);
  const pop = (index: number) => {
    const next = popCelebrationBalloon(poppedRef.current, index, continuous);
    if (next === poppedRef.current) return;
    const visibleIds = new Set(celebrationBalloons(wave, continuous).map((item) => item.id));
    const retained = new Set([...next].filter((id) => visibleIds.has(id)));
    poppedRef.current = retained;
    setPopped(retained);
    setPopCount((count) => count + 1);
    onPop?.();
  };
  return <div className="sequence-celebration" role="dialog" aria-modal="true" aria-label={`${continuous ? "Premio" : "Festa di fine sequenza"}: tocca i palloncini per farli scoppiare`} style={{ "--celebration-duration": `${CELEBRATION_DURATION_MS}ms` } as CSSProperties}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([tabindex="-1"])'));
      const first = controls[0], last = controls[controls.length - 1];
      if (!controls.includes(document.activeElement as HTMLButtonElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <button ref={closeRef} type="button" className="celebration-close" aria-label="Chiudi il gioco dei palloncini" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onClose(); }}><X aria-hidden="true" /></button>
    <div className="celebration-glow" aria-hidden="true" />
    <span className="celebration-instruction">Fai scoppiare i palloncini!</span>
    <span className="celebration-status" role="status" aria-live="polite">{popCount > 0 ? `${popCount} palloncini scoppiati` : "Tocca un palloncino"}</span>
    {celebrationBalloons(wave, continuous).map(({ id: index, slot, color, wave: flight }) => <span key={index} className="celebration-balloon-flight" data-current-wave={flight === wave} style={{ left: `calc(${((slot + flight * 3) % BALLOON_COLORS.length + 0.5) * 100 / BALLOON_COLORS.length}% - clamp(22px, 3.5vw, 38px))`, animationDelay: `${slot * 0.24}s`, "--balloon-color": color, "--rest-y": `${15 + (slot % 3) * 17}%` } as CSSProperties}>
      <button type="button" className={`celebration-balloon ${popped.has(index) ? "popped" : ""}`} disabled={popped.has(index)} tabIndex={flight === wave ? 0 : -1} aria-label={`Scoppia il palloncino ${index + 1}`}
        onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); pop(index); }}
        onClick={(event) => { event.stopPropagation(); pop(index); }}>
        <span className="celebration-balloon-body" aria-hidden="true" />
        {popped.has(index) && <span className="celebration-balloon-burst" aria-hidden="true">{burstDirections.map((style, piece) => <i key={piece} style={style} />)}</span>}
      </button>
    </span>)}
    {Array.from({ length: 36 }, (_, index) => <span aria-hidden="true" key={index} className="celebration-confetti" style={{ left: `${(index * 37) % 97}%`, backgroundColor: confettiColors[index % confettiColors.length], animationDelay: `${(index * 13) % 23 / 10}s`, animationDuration: `${3.1 + (index % 5) * 0.48}s` }} />)}
  </div>;
}
