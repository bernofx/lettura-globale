"use client";

import { ArrowRight, Check, Pointer, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { RewardMusicPlayer } from "../../domain/reward-soundtrack";
import { nextTracingGlyph, TRACE_HEIGHT, TRACE_WIDTH, tracingDigits, tracingGlyphs, tracingLetters, type TracingGlyph } from "../../domain/tracing-glyphs";
import { createTraceInk, paintTrace, traceInkCompleted, traceInkPath, TRACE_SAMPLE_STEP, type TracePoint } from "../../domain/tracing-ink";
import { playFeedbackTone } from "../../shared/audio";
import { startGameMusic } from "./game-music";
import { landscapePoint, mountLandscapeDialog } from "./landscape-dialog";
import { useKeepDialogOpen } from "./use-keep-dialog-open";
import "./tracing-game.css";

const viewBox = `0 0 ${TRACE_WIDTH} ${TRACE_HEIGHT}`;
const demoDuration = 1150;
const liftDuration = 65;
const completionPause = 1500;
type Phase = "demo" | "practice" | "completed";

export function TracingThumbnail() {
  return <div className="coloring-card-art tracing-thumbnail" aria-hidden="true">
    <svg viewBox={viewBox} className="tracing-art">
      {tracingGlyphs.A.map(path => <path className="tracing-guide" key={path} d={path} />)}
      <path className="tracing-ink" d={tracingGlyphs.A[0]} />
    </svg>
  </div>;
}

export function TracingPicker({ onStart }: { onStart: (glyph: TracingGlyph) => void }) {
  return <div className="tracing-picker">
    {[{ title: "Lettere", glyphs: tracingLetters }, { title: "Numeri", glyphs: tracingDigits }].map(({ title, glyphs }) =>
      <section className="panel" key={title} aria-label={title}>
        <h2>{title}</h2>
        <div className="tracing-picker-grid">
          {glyphs.map(glyph => <button key={glyph} type="button" className="ghost-button" onClick={() => onStart(glyph)}>{glyph}</button>)}
        </div>
      </section>
    )}
  </div>;
}

function samplePath(path: SVGPathElement, length: number) {
  const steps = Math.max(1, Math.ceil(length / TRACE_SAMPLE_STEP));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const { x, y } = path.getPointAtLength(length * index / steps);
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });
}

export function TracingGame({ glyph: startingGlyph, soundVolume, onClose }: { glyph: TracingGlyph; soundVolume: number; onClose: () => void }) {
  const [glyph, setGlyph] = useState(startingGlyph);
  const paths = tracingGlyphs[glyph];
  const title = `Ripassa ${/^[0-9]$/.test(glyph) ? "il" : "la"} ${glyph}`;
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("demo");
  const dialog = useRef<HTMLDialogElement>(null);
  const sheet = useRef<SVGSVGElement>(null);
  const guidePaths = useRef<Array<SVGPathElement | null>>([]);
  const demonstrationPaths = useRef<Array<SVGPathElement | null>>([]);
  const arrows = useRef<Array<SVGGElement | null>>([]);
  const startDots = useRef<Array<SVGCircleElement | null>>([]);
  const finger = useRef<SVGGElement>(null);
  const drawnPath = useRef<SVGPathElement>(null);
  const rotated = useRef(false);
  const pointer = useRef<{ id: number; point: TracePoint } | null>(null);
  const ink = useRef<ReturnType<typeof createTraceInk>>([]);
  const music = useRef<RewardMusicPlayer | null>(null);
  useKeepDialogOpen(dialog);

  const stopPointer = useCallback(() => {
    const id = pointer.current?.id;
    pointer.current = null;
    const surface = sheet.current;
    if (id !== undefined && surface?.hasPointerCapture(id)) surface.releasePointerCapture(id);
  }, []);

  const startRound = useCallback((nextGlyph: TracingGlyph) => {
    stopPointer();
    setGlyph(nextGlyph);
    setPhase("demo");
    setAttempt(value => value + 1);
  }, [stopPointer]);

  useEffect(() => {
    const player = startGameMusic(0);
    music.current = player;
    return () => { player.stop(); music.current = null; };
  }, []);
  useEffect(() => { music.current?.setVolume(soundVolume * .55); }, [soundVolume]);

  useEffect(() => {
    if (phase !== "completed") return;
    const timer = window.setTimeout(() => startRound(nextTracingGlyph(glyph)), completionPause);
    return () => window.clearTimeout(timer);
  }, [glyph, phase, startRound]);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const unmount = mountLandscapeDialog(element, stopPointer, value => { rotated.current = value; });
    element.focus({ preventScroll: true });
    return () => { stopPointer(); unmount(); };
  }, [stopPointer]);

  useLayoutEffect(() => {
    const guides = guidePaths.current.slice(0, paths.length).filter(path => path !== null);
    const lengths = guides.map(path => path.getTotalLength());
    ink.current = createTraceInk(guides.map((path, index) => samplePath(path, lengths[index])));
    drawnPath.current?.setAttribute("d", "");
    guides.forEach((path, index) => {
      const length = lengths[index];
      const at = length * (glyph === "A" ? [0.55, 0.2, 0.5][index] : 0.42);
      const { x, y } = path.getPointAtLength(at);
      const before = path.getPointAtLength(at - 3);
      const after = path.getPointAtLength(at + 3);
      const angle = Math.atan2(after.y - before.y, after.x - before.x);
      const offset = glyph === "A" && index < 2 ? -33 : 0;
      arrows.current[index]?.setAttribute("transform", `translate(${x - offset * Math.sin(angle)} ${y + offset * Math.cos(angle)}) rotate(${angle * 180 / Math.PI})`);
      const start = path.getPointAtLength(0);
      startDots.current[index]?.setAttribute("cx", String(start.x));
      startDots.current[index]?.setAttribute("cy", String(start.y));
      demonstrationPaths.current[index]?.setAttribute("stroke-dasharray", `${length} ${length}`);
      demonstrationPaths.current[index]?.setAttribute("stroke-dashoffset", String(length));
    });

    let frame = 0;
    const start = performance.now();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const totalLength = lengths.reduce((total, length) => total + length, 0);
    const travelTime = demoDuration - liftDuration * (lengths.length - 1);
    function animate(now: number) {
      const elapsed = now - start;
      if (elapsed >= (reducedMotion ? 320 : demoDuration + 90)) {
        setPhase("practice");
        return;
      }
      let remaining = Math.max(0, elapsed);
      for (const [index, path] of guides.entries()) {
        const length = lengths[index];
        const duration = travelTime * length / totalLength;
        const distance = reducedMotion ? 0 : Math.max(0, Math.min(length, remaining * length / duration));
        demonstrationPaths.current[index]?.setAttribute("stroke-dashoffset", String(length - distance));
        if (remaining <= duration + liftDuration) {
          const point = path.getPointAtLength(distance);
          finger.current?.setAttribute("transform", `translate(${point.x - 11} ${point.y + 1})`);
          break;
        }
        remaining -= duration + liftDuration;
      }
      frame = requestAnimationFrame(animate);
    }
    animate(start);
    return () => cancelAnimationFrame(frame);
  }, [attempt, glyph, paths]);

  function point(event: Pick<PointerEvent, "clientX" | "clientY">, surface: SVGSVGElement) {
    const bounds = surface.getBoundingClientRect();
    const { x, y } = landscapePoint(bounds, event.clientX, event.clientY, rotated.current);
    const scale = Math.min(surface.clientWidth / TRACE_WIDTH, surface.clientHeight / TRACE_HEIGHT);
    return {
      x: (x * surface.clientWidth - (surface.clientWidth - TRACE_WIDTH * scale) / 2) / scale,
      y: (y * surface.clientHeight - (surface.clientHeight - TRACE_HEIGHT * scale) / 2) / scale,
    };
  }

  function draw(from: TracePoint, to: TracePoint) {
    if (!paintTrace(ink.current, from, to)) return;
    drawnPath.current?.setAttribute("d", traceInkPath(ink.current));
    if (traceInkCompleted(ink.current)) {
      stopPointer();
      setPhase("completed");
      playFeedbackTone("correct", soundVolume > 0);
    }
  }

  function startStroke(event: PointerEvent<SVGSVGElement>) {
    if (phase !== "practice" || event.button !== 0 || pointer.current) return;
    const origin = point(event, event.currentTarget);
    pointer.current = { id: event.pointerId, point: origin };
    event.currentTarget.setPointerCapture(event.pointerId);
    draw(origin, origin);
  }

  function moveStroke(event: PointerEvent<SVGSVGElement>) {
    if (phase !== "practice" || pointer.current?.id !== event.pointerId) return;
    const coalesced = event.nativeEvent.getCoalescedEvents?.();
    for (const sample of coalesced?.length ? coalesced : [event]) {
      const current = pointer.current;
      if (!current) break;
      const destination = point(sample, event.currentTarget);
      draw(current.point, destination);
      current.point = destination;
    }
  }

  function endStroke(event: PointerEvent<SVGSVGElement>) {
    if (pointer.current?.id === event.pointerId) pointer.current = null;
  }

  return <dialog ref={dialog} className="tracing-dialog" aria-labelledby="tracing-title" data-phase={phase}
    onPointerDown={() => music.current?.retry()} onCancel={event => event.preventDefault()}>
    <header className="tracing-header">
      <h2 id="tracing-title">{title}</h2>
      <button type="button" className="ghost-button" aria-label="Ricomincia" title="Ricomincia" onClick={() => startRound(glyph)}><RotateCcw aria-hidden="true" /></button>
      <button type="button" className="ghost-button" aria-label="Esci dal ripasso" title="Esci" onClick={onClose}><X aria-hidden="true" /></button>
    </header>
    <p role="status" className="tracing-announcement">
      {phase === "demo" ? "Guarda il ditino." : phase === "practice" ? "Adesso ripassa con il dito." : "Ripasso completato!"}
    </p>
    <svg ref={sheet} className="tracing-sheet tracing-art" viewBox={viewBox} aria-hidden="true"
      onPointerDown={startStroke} onPointerMove={moveStroke} onPointerUp={event => { moveStroke(event); endStroke(event); }}
      onPointerCancel={endStroke} onLostPointerCapture={endStroke} onContextMenu={event => event.preventDefault()}>
      {paths.map((path, index) => <path key={path} className="tracing-guide" d={path} ref={element => { guidePaths.current[index] = element; }} />)}
      <path className="tracing-ink" ref={drawnPath} />
      <g visibility={phase === "demo" ? "visible" : "hidden"}>
        {paths.map((path, index) => <path key={path} className="tracing-ink" d={path} ref={element => { demonstrationPaths.current[index] = element; }} />)}
      </g>
      {paths.map((path, index) => <g className="tracing-arrow" key={path} ref={element => { arrows.current[index] = element; }}>
        <ArrowRight x={-18} y={-18} size={36} strokeWidth={2} />
      </g>)}
      <g className="tracing-start">
        {paths.map((path, index) => glyph === "A" && index === 2 ? null :
          <circle key={path} r="8" ref={element => { startDots.current[index] = element; }} />)}
      </g>
      <g ref={finger} className="tracing-finger" visibility={phase === "demo" ? "visible" : "hidden"}>
        <Pointer size={30} />
      </g>
    </svg>
    {phase === "completed" && <span className="tracing-completed" aria-hidden="true"><Check size={42} strokeWidth={3} /></span>}
  </dialog>;
}
