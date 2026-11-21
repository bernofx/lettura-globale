"use client";

import { ArrowLeft, Check, Music2, Paintbrush, PaintBucket, Pencil, VolumeX, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { COLORING_HEIGHT, COLORING_WIDTH, coloringPages, type ColoringPage } from "../../domain/coloring-pages";
import { DEFAULT_GAME_SOUNDTRACK, GAME_SOUNDTRACK_URL } from "../../domain/game-soundtrack";
import { createRewardMusic, type RewardMusicPlayer } from "../../domain/reward-soundtrack";
import { feedbackContext } from "../../shared/audio";
import { PageHeader } from "../../shared/ui/headings";
import { ColoringCanvas, coloringFrame, type ColoringPoint, type ColoringTool } from "./coloring-canvas";
import "./games-view.css";

const tools = [
  { id: "brush", label: "Pennello", icon: Paintbrush },
  { id: "crayon", label: "Pastello", icon: Pencil },
  { id: "fill", label: "Secchio", icon: PaintBucket },
] as const;

const colors = [
  ["Rosso", "#e84252"], ["Arancione", "#f58a26"], ["Giallo", "#f8d245"],
  ["Verde chiaro", "#8ec850"], ["Verde", "#2b9b58"], ["Turchese", "#28b9b7"],
  ["Azzurro", "#59a8f5"], ["Blu", "#3558c7"], ["Viola", "#8656cb"],
  ["Rosa", "#f871ad"], ["Lilla", "#c5a7fa"], ["Beige", "#e8bc92"],
  ["Marrone", "#875237"], ["Grigio", "#9697a3"], ["Nero", "#272633"],
  ["Bianco", "#ffffff"],
] as const;

const games = [{ id: "coloring", title: "Colorare", picture: coloringPages[0] }] as const;
type GameId = (typeof games)[number]["id"];

async function loadGameSoundtrack(context: AudioContext, signal: AbortSignal) {
  try {
    const custom = await fetch(GAME_SOUNDTRACK_URL, {
      cache: "no-store",
      signal: typeof AbortSignal.any === "function" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.any([signal, AbortSignal.timeout(6000)])
        : signal,
    });
    if (custom.ok) return await context.decodeAudioData(await custom.arrayBuffer());
  } catch {
    // A custom track may be unavailable when the game is opened offline.
  }
  if (signal.aborted) return null;
  const standard = await fetch(DEFAULT_GAME_SOUNDTRACK, { signal });
  return standard.ok ? context.decodeAudioData(await standard.arrayBuffer()) : null;
}

export function GamesView({ soundVolume, onPlayingChange }: { soundVolume: number; onPlayingChange: (playing: boolean) => void }) {
  const [selectedGame, setSelectedGame] = useState<GameId | null>(null);
  const [game, setGame] = useState<{ page: ColoringPage; painting: ColoringCanvas } | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const artwork = useRef(new Map<string, ColoringCanvas>());
  const playing = game !== null;
  useLayoutEffect(() => {
    if (!playing) return;
    onPlayingChange(true);
    return () => onPlayingChange(false);
  }, [onPlayingChange, playing]);

  function paintingFor(page: ColoringPage) {
    const existing = artwork.current.get(page.id);
    if (existing) return existing;
    const painting = new ColoringCanvas(page);
    artwork.current.set(page.id, painting);
    return painting;
  }

  return (
    <div className="page games-page">
      <PageHeader title="Giochi" />
      {selectedGame === null && (
        <div className="game-picker">
          {games.map(({ id, title, picture }) => (
            <button className="coloring-card" key={id} type="button" onClick={() => setSelectedGame(id)}>
              <DrawingThumbnail page={picture} />
              <span>{title}</span>
            </button>
          ))}
        </div>
      )}
      {selectedGame === "coloring" && <section aria-labelledby="coloring-gallery">
        <button className="ghost-button game-picker-back" type="button" onClick={() => setSelectedGame(null)}>
          <ArrowLeft size={18} aria-hidden="true" /> Torna ai giochi
        </button>
        <h2 id="coloring-gallery">Colorare</h2>
        <div className="coloring-gallery">
          {coloringPages.map(page => (
            <button className="coloring-card" key={page.id} type="button" onClick={() => setGame({ page, painting: paintingFor(page) })}>
              <DrawingThumbnail page={page} />
              <span>{page.title}</span>
            </button>
          ))}
        </div>
      </section>}
      {game && (
        <ColoringGame
          page={game.page}
          painting={game.painting}
          soundVolume={soundVolume}
          musicEnabled={musicEnabled}
          onToggleMusic={() => setMusicEnabled(current => !current)}
          onClose={() => setGame(null)}
        />
      )}
    </div>
  );
}

function DrawingThumbnail({ page }: { page: ColoringPage }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    new ColoringCanvas(page).render(context);
  }, [page]);

  return (
    <div className="coloring-card-art" style={{ backgroundColor: page.background }}>
      <canvas ref={canvas} width={COLORING_WIDTH / 3} height={COLORING_HEIGHT / 3} aria-hidden="true" />
    </div>
  );
}

type Stroke = {
  pointerId: number;
  area: number;
  point: ColoringPoint;
  tool: "brush" | "crayon";
  color: string;
};

function pointOnDrawing(event: PointerEvent<HTMLCanvasElement>, rotated: boolean, frame: ReturnType<typeof coloringFrame>): ColoringPoint {
  const { left, top, right, width, height } = event.currentTarget.getBoundingClientRect();
  const x = rotated ? (event.clientY - top) / height : (event.clientX - left) / width;
  const y = rotated ? (right - event.clientX) / width : (event.clientY - top) / height;
  return { x: frame.left + x * (frame.right - frame.left), y: frame.top + y * (frame.bottom - frame.top) };
}

function ColoringGame({ page, painting, soundVolume, musicEnabled, onToggleMusic, onClose }: {
  page: ColoringPage;
  painting: ColoringCanvas;
  soundVolume: number;
  musicEnabled: boolean;
  onToggleMusic: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<Stroke | null>(null);
  const paletteDrag = useRef<{ pointerId: number; startX: number; scrollTop: number } | null>(null);
  const music = useRef<RewardMusicPlayer | null>(null);
  const rotated = useRef(false);
  const [tool, setTool] = useState<ColoringTool>("brush");
  const [color, setColor] = useState<string>(colors[0][1]);

  useEffect(() => {
    const context = feedbackContext();
    const request = new AbortController();
    const player = createRewardMusic(context, async () => context && loadGameSoundtrack(context, request.signal), 0);
    music.current = player;
    return () => {
      player.stop();
      request.abort();
      music.current = null;
    };
  }, []);

  useEffect(() => {
    function updateMusic() {
      const audible = musicEnabled && !document.hidden;
      music.current?.setVolume(audible ? soundVolume * 0.55 : 0);
    }
    updateMusic();
    document.addEventListener("visibilitychange", updateMusic);
    return () => document.removeEventListener("visibilitychange", updateMusic);
  }, [musicEnabled, soundVolume]);

  useEffect(() => {
    const element = dialog.current;
    const surface = canvas.current;
    if (!element) return;
    const viewport = window.visualViewport;
    let viewportFrame = 0;

    function stopStroke() {
      const current = stroke.current;
      stroke.current = null;
      if (current && surface?.hasPointerCapture(current.pointerId)) {
        surface.releasePointerCapture(current.pointerId);
      }
    }

    function fitViewport() {
      if (!element) return;
      const { width, height, offsetLeft, offsetTop, scale } = viewport ?? {
        width: window.innerWidth, height: window.innerHeight, offsetLeft: 0, offsetTop: 0, scale: 1,
      };
      if (width <= 0 || height <= 0 || scale <= 0) return;
      // Fixed dialogs use the layout viewport. Follow the visible rectangle
      // and compensate for pinch zoom to keep the full-size game usable in it.
      rotated.current = width < height;
      element.dataset.rotated = String(rotated.current);
      element.style.setProperty("--coloring-viewport-width", `${(rotated.current ? height : width) * scale}px`);
      element.style.setProperty("--coloring-viewport-height", `${(rotated.current ? width : height) * scale}px`);
      const left = offsetLeft + (rotated.current ? width : 0);
      element.style.transform = `translate(${left}px, ${offsetTop}px) scale(${1 / scale})${rotated.current ? " rotate(90deg)" : ""}`;
    }

    function scheduleFit() {
      if (viewportFrame) return;
      viewportFrame = requestAnimationFrame(() => {
        viewportFrame = 0;
        stopStroke();
        fitViewport();
      });
    }

    fitViewport();
    element.showModal();
    viewport?.addEventListener("resize", scheduleFit);
    viewport?.addEventListener("scroll", scheduleFit);
    window.addEventListener("resize", scheduleFit);
    window.addEventListener("blur", stopStroke);
    return () => {
      element.close();
      stopStroke();
      cancelAnimationFrame(viewportFrame);
      viewport?.removeEventListener("resize", scheduleFit);
      viewport?.removeEventListener("scroll", scheduleFit);
      window.removeEventListener("resize", scheduleFit);
      window.removeEventListener("blur", stopStroke);
    };
  }, []);

  useEffect(() => {
    const surface = canvas.current;
    const context = surface?.getContext("2d");
    if (!surface || !context) return;

    function fitCanvas() {
      if (!surface || !context || !surface.clientWidth || !surface.clientHeight) return;
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(surface.clientWidth * density);
      const height = Math.round(surface.clientHeight * density);
      if (surface.width !== width) surface.width = width;
      if (surface.height !== height) surface.height = height;
      painting.render(context);
    }

    const observer = new ResizeObserver(fitCanvas);
    observer.observe(surface);
    fitCanvas();
    return () => observer.disconnect();
  }, [painting]);

  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || stroke.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const frame = coloringFrame(context.canvas.width, context.canvas.height);
    const point = pointOnDrawing(event, rotated.current, frame);
    const area = painting.areaAt(context, point);

    if (tool === "fill") {
      painting.fill(area, color);
    } else {
      event.currentTarget.setPointerCapture(event.pointerId);
      stroke.current = { pointerId: event.pointerId, area, point, tool, color };
      painting.stroke(area, point, point, color, tool, frame);
    }
    painting.render(context);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    const current = stroke.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const frame = coloringFrame(context.canvas.width, context.canvas.height);
    const point = pointOnDrawing(event, rotated.current, frame);
    painting.stroke(current.area, current.point, point, current.color, current.tool, frame);
    current.point = point;
    painting.render(context);
  }

  function stop(event: PointerEvent<HTMLCanvasElement>) {
    if (stroke.current?.pointerId === event.pointerId) stroke.current = null;
  }

  function startPaletteDrag(event: PointerEvent<HTMLDivElement>) {
    if (!rotated.current || event.pointerType !== "touch" || !event.isPrimary) return;
    paletteDrag.current = { pointerId: event.pointerId, startX: event.clientX, scrollTop: event.currentTarget.scrollTop };
  }

  function movePaletteDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = paletteDrag.current;
    if (!drag || drag.pointerId !== event.pointerId || !rotated.current) return;
    const palette = event.currentTarget;
    const movement = (event.clientX - drag.startX) * palette.offsetHeight / palette.getBoundingClientRect().width;
    if (!palette.hasPointerCapture(drag.pointerId)) {
      if (Math.abs(movement) < 8) return;
      palette.setPointerCapture(drag.pointerId);
    }
    // The palette's local vertical axis maps to the viewport's horizontal axis.
    palette.scrollTop = drag.scrollTop + movement;
  }

  function endPaletteDrag(event: PointerEvent<HTMLDivElement>) {
    if (paletteDrag.current?.pointerId === event.pointerId) paletteDrag.current = null;
  }

  return (
    <dialog ref={dialog} className="coloring-dialog" aria-label="Colorare" onClick={() => music.current?.retry()} onCancel={event => event.preventDefault()}>
      <div className="coloring-workspace">
        <div className="coloring-board">
          <canvas
            ref={canvas}
            width={COLORING_WIDTH}
            height={COLORING_HEIGHT}
            aria-label={`Disegno da colorare: ${page.title}`}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
            onLostPointerCapture={stop}
            onContextMenu={event => event.preventDefault()}
          />
        </div>
        <aside className="coloring-controls" aria-label="Materiale per colorare">
          <div className="coloring-header-actions">
            <button
              type="button"
              className="coloring-music-button"
              onClick={onToggleMusic}
              aria-pressed={musicEnabled && soundVolume > 0}
              aria-label="Musica di sottofondo"
              title={soundVolume > 0 ? "Musica di sottofondo" : "Audio generale disattivato"}
              disabled={soundVolume <= 0}
            >
              {musicEnabled && soundVolume > 0 ? <Music2 size={21} aria-hidden="true" /> : <VolumeX size={21} aria-hidden="true" />}
            </button>
            <button type="button" aria-label="Esci" title="Esci" onClick={onClose}><X size={20} aria-hidden="true" /></button>
          </div>
          <div role="group" aria-label="Strumenti" className="coloring-tools">
            {tools.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" aria-label={label} title={label} aria-pressed={tool === id} onClick={() => setTool(id)}>
                <Icon size={22} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div role="group" aria-label="Colori" className="coloring-colors"
            onPointerDown={startPaletteDrag} onPointerMove={movePaletteDrag}
            onPointerUp={endPaletteDrag} onPointerCancel={endPaletteDrag}>
            {colors.map(([label, value]) => (
              <button key={value} type="button" aria-label={label} title={label} aria-pressed={color === value} onClick={() => setColor(value)}>
                <span className="coloring-swatch" style={{ backgroundColor: value }} aria-hidden="true">
                  {color === value && <Check size={16} aria-hidden="true" />}
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </dialog>
  );
}
