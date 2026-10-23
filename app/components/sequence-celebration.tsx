"use client";

import { useRef, useState, type CSSProperties } from "react";
import { BALLOON_COLORS, CELEBRATION_DURATION_MS, popCelebrationBalloon } from "../domain/celebration";

const confettiColors = ["#ee6f8b", "#ffc65f", "#80cbb1", "#9c8de6", "#76b8ed"];
const burstDirections = Array.from({ length: 8 }, (_, index) => ({
  "--burst-x": `${Math.round(Math.cos(index * Math.PI / 4) * 38)}px`,
  "--burst-y": `${Math.round(Math.sin(index * Math.PI / 4) * 38)}px`,
  "--burst-angle": `${index * 45}deg`,
} as CSSProperties));

export function SequenceCelebration({ onPop }: { onPop?: () => void }) {
  const [popped, setPopped] = useState<ReadonlySet<number>>(() => new Set());
  const poppedRef = useRef(popped);
  const pop = (index: number) => {
    const next = popCelebrationBalloon(poppedRef.current, index);
    if (next === poppedRef.current) return;
    poppedRef.current = next;
    setPopped(next);
    onPop?.();
  };
  return <div className="sequence-celebration" role="region" aria-label="Festa di fine sequenza: tocca i palloncini per farli scoppiare" style={{ "--celebration-duration": `${CELEBRATION_DURATION_MS}ms` } as CSSProperties}>
    <div className="celebration-glow" aria-hidden="true" />
    <span className="celebration-instruction">Fai scoppiare i palloncini!</span>
    <span className="celebration-status" role="status" aria-live="polite">{popped.size > 0 ? `${popped.size} palloncini scoppiati` : "Tocca un palloncino"}</span>
    {BALLOON_COLORS.map((color, index) => <span key={index} className="celebration-balloon-flight" style={{ left: `calc(${(index + 0.5) * 100 / BALLOON_COLORS.length}% - clamp(22px, 3.5vw, 38px))`, animationDelay: `${index * 0.24}s`, "--balloon-color": color, "--rest-y": `${15 + (index % 3) * 17}%` } as CSSProperties}>
      <button type="button" className={`celebration-balloon ${popped.has(index) ? "popped" : ""}`} disabled={popped.has(index)} aria-label={`Scoppia il palloncino ${index + 1}`}
        onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); pop(index); }}
        onClick={(event) => { event.stopPropagation(); pop(index); }}>
        <span className="celebration-balloon-body" aria-hidden="true" />
        {popped.has(index) && <span className="celebration-balloon-burst" aria-hidden="true">{burstDirections.map((style, piece) => <i key={piece} style={style} />)}</span>}
      </button>
    </span>)}
    {Array.from({ length: 36 }, (_, index) => <span aria-hidden="true" key={index} className="celebration-confetti" style={{ left: `${(index * 37) % 97}%`, backgroundColor: confettiColors[index % confettiColors.length], animationDelay: `${(index * 13) % 23 / 10}s`, animationDuration: `${3.1 + (index % 5) * 0.48}s` }} />)}
  </div>;
}
