"use client";

import { ArrowRight, Check, Pointer, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { RewardMusicPlayer } from "../../domain/reward-soundtrack";
import { nextTracingGlyph, TRACE_HEIGHT, TRACE_WIDTH, tracingGlyphs, tracingSets, tracingTitle, type TracingGlyph, type TracingSet } from "../../domain/tracing-glyphs";
import { createTraceInk, orderedStrokeCompleted, paintOrderedTrace, paintTrace, startOrderedTrace, traceInkCompleted, traceInkPath, tracePrefixPath, TRACE_SAMPLE_STEP, type TracePoint } from "../../domain/tracing-ink";
import { playFeedbackTone } from "../../shared/audio";
import { CheckLine } from "../../shared/ui/form-controls";
import { startGameMusic } from "./game-music";
import { landscapePoint, mountLandscapeDialog } from "./landscape-dialog";
import { useKeepDialogOpen } from "./use-keep-dialog-open";
import "./tracing-game.css";

const viewBox = `0 0 ${TRACE_WIDTH} ${TRACE_HEIGHT}`;
const demoDuration = 1150;
const liftDuration = 65;
const completionPause = 1500;
type Phase = "demo" | "practice" | "completed";
type TracingPointer = { id: number; point: TracePoint; ordered?: ReturnType<typeof startOrderedTrace>; rawPath: string };

export function TracingThumbnail({ glyph = "A" }: { glyph?: TracingGlyph }) {
  return <div className="coloring-card-art tracing-thumbnail" aria-hidden="true">
    <svg viewBox={viewBox} className="tracing-art">
      {tracingGlyphs[glyph].map(path => <path className="tracing-guide" key={path} d={path} />)}
      <path className="tracing-ink" d={tracingGlyphs[glyph][0]} />
    </svg>
  </div>;
}

/** The child chooses Letters or Numbers; the game then goes through the set in order. */
export function TracingPicker({ requireOrder, onOrderChange, onStart }: { requireOrder: boolean; onOrderChange: (required: boolean) => void; onStart: (set: TracingSet) => void }) {
  return <>
    <div className="panel tracing-options">
      <CheckLine checked={requireOrder} onChange={onOrderChange} title="Ordine dei tratti obbligatorio" detail="Segui l’ordine e il verso mostrati dal ditino. Se disattivato, basta completare il simbolo." />
    </div>
    <div className="game-picker tracing-picker">{(Object.keys(tracingSets) as TracingSet[]).map(set => {
      const { title, glyphs } = tracingSets[set];
      return <button className="coloring-card" key={set} type="button" onClick={() => onStart(set)}>
        <TracingThumbnail glyph={glyphs[0]} />
        <span>{title}</span>
      </button>;
    })}</div>
  </>;
}

function samplePath(path: SVGPathElement, length: number) {
  const steps = Math.max(1, Math.ceil(length / TRACE_SAMPLE_STEP));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const { x, y } = path.getPointAtLength(length * index / steps);
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });
}

export function TracingGame({ set, requireOrder, soundVolume, onClose }: { set: TracingSet; requireOrder: boolean; soundVolume: number; onClose: () => void }) {
  const [glyph, setGlyph] = useState<TracingGlyph>(tracingSets[set].glyphs[0]);
  const paths = tracingGlyphs[glyph];
  const title = tracingTitle(glyph);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("demo");
  const [retryStroke, setRetryStroke] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const sheet = useRef<SVGSVGElement>(null);
  const guidePaths = useRef<Array<SVGPathElement | null>>([]);
  const demonstrationPaths = useRef<Array<SVGPathElement | null>>([]);
  const arrows = useRef<Array<SVGGElement | null>>([]);
  const startDots = useRef<Array<SVGCircleElement | null>>([]);
  const finger = useRef<SVGGElement>(null);
  const drawnPath = useRef<SVGPathElement>(null);
  const errorPath = useRef<SVGPathElement>(null);
  const rotated = useRef(false);
  const pointer = useRef<TracingPointer | null>(null);
  const ink = useRef<ReturnType<typeof createTraceInk>>([]);
  const ordered = useRef({ stroke: 0, covered: 0 });
  const committedPath = useRef("");
  const music = useRef<RewardMusicPlayer | null>(null);
  useKeepDialogOpen(dialog);

  const stopPointer = useCallback(() => {
    const id = pointer.current?.id;
    pointer.current = null;
    errorPath.current?.setAttribute("d", "");
    drawnPath.current?.setAttribute("d", committedPath.current);
    const surface = sheet.current;
    if (id !== undefined && surface?.hasPointerCapture(id)) surface.releasePointerCapture(id);
  }, []);

  const startRound = useCallback((nextGlyph: TracingGlyph) => {
    stopPointer();
    setRetryStroke(false);
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
    // After the last glyph of the set, go back to the Letters / Numbers choice.
    const timer = window.setTimeout(() => {
      const next = nextTracingGlyph(set, glyph);
      if (next) startRound(next);
      else onClose();
    }, completionPause);
    return () => window.clearTimeout(timer);
  }, [glyph, onClose, phase, set, startRound]);

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
    ordered.current = { stroke: 0, covered: 0 };
    committedPath.current = "";
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

  function coordinates(surface: SVGSVGElement) {
    const bounds = surface.getBoundingClientRect();
    const { clientWidth: width, clientHeight: height } = surface;
    const scale = Math.min(width / TRACE_WIDTH, height / TRACE_HEIGHT);
    return (event: Pick<PointerEvent, "clientX" | "clientY">): TracePoint => {
      const { x, y } = landscapePoint(bounds, event.clientX, event.clientY, rotated.current);
      return {
        x: (x * width - (width - TRACE_WIDTH * scale) / 2) / scale,
        y: (y * height - (height - TRACE_HEIGHT * scale) / 2) / scale,
      };
    };
  }

  function orderedPath(covered: number) {
    const index = ordered.current.stroke;
    const points = ink.current[index]?.points ?? [];
    return paths.slice(0, index).join(" ") + tracePrefixPath(points, covered);
  }

  function movePointer(current: TracingPointer, destination: TracePoint) {
    let changed = false;
    if (current.ordered) {
      paintOrderedTrace(ink.current[ordered.current.stroke].points, current.ordered, current.point, destination);
      if (current.point.x !== destination.x || current.point.y !== destination.y) current.rawPath += `L${destination.x.toFixed(1)} ${destination.y.toFixed(1)}`;
    } else {
      changed = paintTrace(ink.current, current.point, destination);
    }
    current.point = destination;
    return changed;
  }

  function renderStroke(current: TracingPointer, changed: boolean) {
    if (current.ordered) {
      drawnPath.current?.setAttribute("d", current.ordered.invalid ? committedPath.current : orderedPath(current.ordered.covered));
      errorPath.current?.setAttribute("d", current.ordered.invalid ? current.rawPath : "");
    } else if (changed) {
      committedPath.current = traceInkPath(ink.current);
      drawnPath.current?.setAttribute("d", committedPath.current);
    }
  }

  function startStroke(event: PointerEvent<SVGSVGElement>) {
    if (phase !== "practice" || event.button !== 0 || pointer.current) return;
    const origin = coordinates(event.currentTarget)(event);
    const { stroke, covered } = ordered.current;
    if (!ink.current[stroke]) return;
    const current = {
      id: event.pointerId, point: origin,
      ordered: requireOrder ? startOrderedTrace(ink.current[stroke].points, covered, origin) : undefined,
      rawPath: `M${origin.x.toFixed(1)} ${origin.y.toFixed(1)}L${origin.x.toFixed(1)} ${origin.y.toFixed(1)}`,
    };
    setRetryStroke(false);
    pointer.current = current;
    event.currentTarget.setPointerCapture(event.pointerId);
    renderStroke(current, movePointer(current, origin));
  }

  function moveStroke(event: PointerEvent<SVGSVGElement>) {
    const current = pointer.current;
    if (phase !== "practice" || current?.id !== event.pointerId) return;
    const point = coordinates(event.currentTarget);
    const coalesced = event.nativeEvent.getCoalescedEvents?.();
    let changed = false;
    for (const sample of coalesced ?? []) changed = movePointer(current, point(sample)) || changed;
    const end = point(event);
    if (current.point.x !== end.x || current.point.y !== end.y) changed = movePointer(current, end) || changed;
    renderStroke(current, changed);
  }

  function finishStroke(event: PointerEvent<SVGSVGElement>) {
    const current = pointer.current;
    if (current?.id !== event.pointerId) return;
    moveStroke(event);
    if (current.ordered?.invalid) {
      stopPointer();
      setRetryStroke(true);
      playFeedbackTone("wrong", soundVolume > 0);
      return;
    }
    if (current.ordered) {
      const points = ink.current[ordered.current.stroke].points;
      ordered.current.covered = current.ordered.covered;
      if (orderedStrokeCompleted(points, ordered.current.covered)) ordered.current = { stroke: ordered.current.stroke + 1, covered: 0 };
      committedPath.current = orderedPath(ordered.current.covered);
    }
    const complete = current.ordered ? ordered.current.stroke === paths.length : traceInkCompleted(ink.current);
    if (complete) committedPath.current = paths.join(" ");
    stopPointer();
    if (!complete) return;
    setPhase("completed");
    playFeedbackTone("correct", soundVolume > 0);
  }

  function cancelStroke(event: PointerEvent<SVGSVGElement>) {
    if (pointer.current?.id === event.pointerId) stopPointer();
  }

  return <dialog ref={dialog} className="tracing-dialog" aria-labelledby="tracing-title" data-phase={phase}
    onPointerDown={() => music.current?.retry()} onCancel={event => event.preventDefault()}>
    <header className="tracing-header">
      <h2 id="tracing-title">{title}</h2>
      <button type="button" className="ghost-button" aria-label="Ricomincia" title="Ricomincia" onClick={() => startRound(glyph)}><RotateCcw aria-hidden="true" /></button>
      <button type="button" className="ghost-button" aria-label="Esci dal ripasso" title="Esci" onClick={onClose}><X aria-hidden="true" /></button>
    </header>
    <p role="status" className="tracing-announcement">
      {phase === "demo" ? "Guarda il ditino." : phase === "completed" ? "Ripasso completato!" : retryStroke ? "Riprova seguendo il tratto mostrato dal ditino." : "Adesso ripassa con il dito."}
    </p>
    <svg ref={sheet} className="tracing-sheet tracing-art" viewBox={viewBox} aria-hidden="true"
      onPointerDown={startStroke} onPointerMove={moveStroke} onPointerUp={finishStroke}
      onPointerCancel={cancelStroke} onLostPointerCapture={cancelStroke} onContextMenu={event => event.preventDefault()}>
      {paths.map((path, index) => <path key={path} className="tracing-guide" d={path} ref={element => { guidePaths.current[index] = element; }} />)}
      <path className="tracing-ink" ref={drawnPath} />
      <path className="tracing-ink tracing-ink-error" ref={errorPath} />
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
