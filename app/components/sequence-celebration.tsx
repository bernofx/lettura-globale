"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { X } from "lucide-react";
import { BALLOON_COLORS, BALLOON_WAVE_COUNT, BALLOON_WAVE_INTERVAL_MS, CELEBRATION_DURATION_MS, celebrationBalloons, pointsAlongDrag, popCelebrationBalloon, type DragPoint } from "../domain/celebration";
import { FingerTrail } from "./finger-trail";
import type { RewardMusicPlayer } from "../domain/reward-soundtrack";

const confettiColors = ["#ee6f8b", "#ffc65f", "#80cbb1", "#9c8de6", "#76b8ed"];
const burstDirections = Array.from({ length: 8 }, (_, index) => ({
  "--burst-x": `${Math.round(Math.cos(index * Math.PI / 4) * 38)}px`,
  "--burst-y": `${Math.round(Math.sin(index * Math.PI / 4) * 38)}px`,
  "--burst-angle": `${index * 45}deg`,
} as CSSProperties));

export function SequenceCelebration({ onPop, onClose, mode = "completion", startMusic, musicVolume = 0 }: {
  onPop?: () => void;
  onClose: () => void;
  mode?: "completion" | "reward" | "game";
  startMusic?: (volume: number) => RewardMusicPlayer;
  musicVolume?: number;
}) {
  const continuous = mode !== "completion";
  const isGame = mode === "game";
  const music = useRef<RewardMusicPlayer | null>(null);
  const [musicNeedsStart, setMusicNeedsStart] = useState(false);
  const volume = useRef(musicVolume);
  useEffect(() => { volume.current = musicVolume; music.current?.setVolume(musicVolume); }, [musicVolume]);
  useEffect(() => {
    const player = startMusic?.(volume.current);
    music.current = player ?? null;
    const retry = () => player?.retry();
    const visible = () => { if (document.visibilityState !== "hidden") retry(); };
    window.addEventListener("pointerdown", retry);
    window.addEventListener("pointerup", retry);
    window.addEventListener("click", retry);
    window.addEventListener("keydown", retry);
    window.addEventListener("online", retry);
    window.addEventListener("pageshow", visible);
    document.addEventListener("visibilitychange", visible);
    let checkTimer: number | undefined;
    const grace = window.setTimeout(() => {
      const check = () => setMusicNeedsStart(Boolean(player && volume.current > 0 && !player.isPlaying()));
      check();
      checkTimer = window.setInterval(check, 1000);
    }, 1500);
    return () => {
      window.clearTimeout(grace); window.clearInterval(checkTimer);
      window.removeEventListener("pointerdown", retry); window.removeEventListener("pointerup", retry); window.removeEventListener("click", retry); window.removeEventListener("keydown", retry);
      window.removeEventListener("online", retry); window.removeEventListener("pageshow", visible); document.removeEventListener("visibilitychange", visible);
      player?.stop(); music.current = null;
    };
  }, [startMusic]);
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
  // Game mode: dragging a finger (or the pressed mouse) pops every balloon it
  // crosses and leaves a light fading trail.
  const trailCanvas = useRef<HTMLCanvasElement>(null);
  const trail = useRef<FingerTrail | null>(null);
  const drag = useRef<{ pointerId: number; point: DragPoint } | null>(null);
  useEffect(() => {
    if (!isGame || !trailCanvas.current) return;
    const current = new FingerTrail(trailCanvas.current);
    trail.current = current;
    return () => { current.dispose(); trail.current = null; };
  }, [isGame]);
  const popAlong = (from: DragPoint, to: DragPoint, root: HTMLElement) => {
    for (const { x, y } of pointsAlongDrag(from, to)) {
      const balloon = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-balloon-index]");
      if (balloon && root.contains(balloon)) pop(Number(balloon.dataset.balloonIndex));
    }
  };
  const startDrag = (event: ReactPointerEvent<HTMLElement>, root: HTMLElement) => {
    if (!isGame || drag.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    const point = { x: event.clientX, y: event.clientY };
    drag.current = { pointerId: event.pointerId, point };
    try { root.setPointerCapture(event.pointerId); } catch { /* pointer already released */ }
    trail.current?.add(point.x, point.y);
    popAlong(point, point, root);
  };
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const root = event.currentTarget;
    const events = typeof event.nativeEvent.getCoalescedEvents === "function" ? event.nativeEvent.getCoalescedEvents() : [];
    for (const sample of events.length ? events : [event.nativeEvent]) {
      const point = { x: sample.clientX, y: sample.clientY };
      popAlong(current.point, point, root);
      trail.current?.add(point.x, point.y);
      current.point = point;
    }
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    trail.current?.end();
  };
  return <div className="sequence-celebration" role={isGame ? undefined : "dialog"} aria-modal={isGame ? undefined : true}
    aria-label={isGame ? undefined : `${mode === "reward" ? "Premio" : "Festa di fine sequenza"}: tocca i palloncini per farli scoppiare`}
    style={{ "--celebration-duration": `${CELEBRATION_DURATION_MS}ms` } as CSSProperties}
    onPointerDown={isGame ? (event) => { if (!(event.target as Element).closest("button")) startDrag(event, event.currentTarget); } : undefined}
    onPointerMove={isGame ? moveDrag : undefined}
    onPointerUp={isGame ? endDrag : undefined}
    onPointerCancel={isGame ? endDrag : undefined}
    onLostPointerCapture={isGame ? endDrag : undefined}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([tabindex="-1"])'));
      const first = controls[0], last = controls[controls.length - 1];
      if (!controls.includes(document.activeElement as HTMLButtonElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <button ref={closeRef} type="button" className="celebration-close" aria-label="Chiudi il gioco dei palloncini" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onClose(); }}><X aria-hidden="true" /></button>
    {musicNeedsStart && musicVolume > 0 && <button type="button" className="celebration-start-music" onClick={() => music.current?.retry()}>Avvia musica</button>}
    <div className="celebration-glow" aria-hidden="true" />
    <span className="celebration-instruction">Fai scoppiare i palloncini!</span>
    <span className="celebration-status" role="status" aria-live="polite">{popCount > 0 ? `${popCount} palloncini scoppiati` : "Tocca un palloncino"}</span>
    {celebrationBalloons(wave, continuous).map(({ id: index, slot, color, wave: flight }) => <span key={index} className="celebration-balloon-flight" data-current-wave={flight === wave} style={{ left: `calc(${((slot + flight * 3) % BALLOON_COLORS.length + 0.5) * 100 / BALLOON_COLORS.length}% - clamp(22px, 3.5vw, 38px))`, animationDelay: `${slot * 0.24}s`, "--balloon-color": color, "--rest-y": `${15 + (slot % 3) * 17}%` } as CSSProperties}>
      <button type="button" className={`celebration-balloon ${popped.has(index) ? "popped" : ""}`} disabled={popped.has(index)} tabIndex={flight === wave ? 0 : -1} aria-label={`Scoppia il palloncino ${index + 1}`}
        data-balloon-index={index}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation(); pop(index);
          const root = event.currentTarget.closest<HTMLElement>(".sequence-celebration");
          if (root) startDrag(event, root);
        }}
        onClick={(event) => { event.stopPropagation(); pop(index); }}>
        <span className="celebration-balloon-body" aria-hidden="true" />
        {popped.has(index) && <span className="celebration-balloon-burst" aria-hidden="true">{burstDirections.map((style, piece) => <i key={piece} style={style} />)}</span>}
      </button>
    </span>)}
    {isGame && <canvas ref={trailCanvas} className="celebration-trail" aria-hidden="true" />}
    {Array.from({ length: 36 }, (_, index) => <span aria-hidden="true" key={index} className="celebration-confetti" style={{ left: `${(index * 37) % 97}%`, backgroundColor: confettiColors[index % confettiColors.length], animationDelay: `${(index * 13) % 23 / 10}s`, animationDuration: `${3.1 + (index % 5) * 0.48}s` }} />)}
  </div>;
}
