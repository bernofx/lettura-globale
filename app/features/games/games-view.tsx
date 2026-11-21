"use client";

import { Check, Music2, Paintbrush, PaintBucket, Pencil, RotateCw, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { COLORING_HEIGHT, COLORING_WIDTH, coloringPages, type ColoringPage } from "../../domain/coloring-pages";
import { startBackgroundMusic } from "../../shared/audio";
import { PageHeader } from "../../shared/ui/headings";
import { ColoringCanvas, type ColoringPoint, type ColoringTool } from "./coloring-canvas";
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

const COLORING_MUSIC = "/audio/coloring-game.mp3";

export function GamesView({ soundVolume }: { soundVolume: number }) {
  const [game, setGame] = useState<{ page: ColoringPage; painting: ColoringCanvas } | null>(null);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const artwork = useRef(new Map<string, ColoringCanvas>());

  function paintingFor(page: ColoringPage) {
    const existing = artwork.current.get(page.id);
    if (existing) return existing;
    const painting = new ColoringCanvas(page);
    artwork.current.set(page.id, painting);
    return painting;
  }

  return (
    <div className="page games-page">
      <PageHeader title="Giochi" description="Scegli un disegno da colorare." />
      <section aria-labelledby="coloring-gallery">
        <h2 id="coloring-gallery">Colorare</h2>
        <div className="coloring-gallery">
          {coloringPages.map(page => (
            <button className="coloring-card" key={page.id} type="button" onClick={() => setGame({ page, painting: paintingFor(page) })}>
              <DrawingThumbnail page={page} />
              <span>{page.title}</span>
            </button>
          ))}
        </div>
      </section>
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
    context.setTransform(1 / 3, 0, 0, 1 / 3, 0, 0);
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

function pointOnDrawing(event: PointerEvent<HTMLCanvasElement>): ColoringPoint {
  const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
  return {
    x: (event.clientX - left) / width * COLORING_WIDTH,
    y: (event.clientY - top) / height * COLORING_HEIGHT,
  };
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
  const music = useRef<ReturnType<typeof startBackgroundMusic> | null>(null);
  const [tool, setTool] = useState<ColoringTool>("brush");
  const [color, setColor] = useState<string>(colors[0][1]);

  useEffect(() => {
    const player = startBackgroundMusic(COLORING_MUSIC, 0);
    music.current = player;
    return () => {
      player.stop();
      music.current = null;
    };
  }, []);

  useEffect(() => {
    const orientation = window.matchMedia("(orientation: landscape)");
    function updateMusic() {
      const audible = musicEnabled && orientation.matches && !document.hidden;
      music.current?.setVolume(audible ? soundVolume * 0.55 : 0);
    }
    updateMusic();
    orientation.addEventListener("change", updateMusic);
    document.addEventListener("visibilitychange", updateMusic);
    return () => {
      orientation.removeEventListener("change", updateMusic);
      document.removeEventListener("visibilitychange", updateMusic);
    };
  }, [musicEnabled, soundVolume]);

  useEffect(() => {
    const element = dialog.current;
    const surface = canvas.current;
    if (!element) return;
    const orientation = window.matchMedia("(orientation: landscape)");
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
      if (!element || !viewport || viewport.width <= 0 || viewport.height <= 0) return;
      const { width, height, offsetLeft, offsetTop, scale } = viewport;
      // Fixed dialogs use the layout viewport. Follow the visible rectangle
      // and compensate for pinch zoom to keep the full-size game usable in it.
      element.style.setProperty("--coloring-viewport-width", `${width * scale}px`);
      element.style.setProperty("--coloring-viewport-height", `${height * scale}px`);
      element.style.transform = `translate(${offsetLeft}px, ${offsetTop}px) scale(${1 / scale})`;
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
    orientation.addEventListener("change", stopStroke);
    window.addEventListener("blur", stopStroke);
    return () => {
      element.close();
      stopStroke();
      cancelAnimationFrame(viewportFrame);
      viewport?.removeEventListener("resize", scheduleFit);
      viewport?.removeEventListener("scroll", scheduleFit);
      orientation.removeEventListener("change", stopStroke);
      window.removeEventListener("blur", stopStroke);
    };
  }, []);

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (context) painting.render(context);
  }, [painting]);

  function start(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 || stroke.current || !window.matchMedia("(orientation: landscape)").matches) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = pointOnDrawing(event);
    const area = painting.areaAt(context, point);
    if (area < 0) return;

    if (tool === "fill") {
      painting.fill(area, color);
    } else {
      event.currentTarget.setPointerCapture(event.pointerId);
      stroke.current = { pointerId: event.pointerId, area, point, tool, color };
      painting.stroke(area, point, point, color, tool);
    }
    painting.render(context);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    const current = stroke.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = pointOnDrawing(event);
    painting.stroke(current.area, current.point, point, current.color, current.tool);
    current.point = point;
    painting.render(context);
  }

  function stop(event: PointerEvent<HTMLCanvasElement>) {
    if (stroke.current?.pointerId === event.pointerId) stroke.current = null;
  }

  return (
    <dialog ref={dialog} className="coloring-dialog" aria-label="Colorare" onClick={() => music.current?.retry()} onCancel={event => {
      event.preventDefault();
      onClose();
    }}>
      <header className="coloring-heading">
        <div className="coloring-header-actions">
          <button
            type="button"
            className="ghost-button coloring-music-button"
            onClick={onToggleMusic}
            aria-pressed={musicEnabled && soundVolume > 0}
            aria-label="Musica di sottofondo"
            title={soundVolume > 0 ? "Musica di sottofondo" : "Audio generale disattivato"}
            disabled={soundVolume <= 0}
          >
            {musicEnabled && soundVolume > 0 ? <Music2 size={21} aria-hidden="true" /> : <VolumeX size={21} aria-hidden="true" />}
          </button>
          <button type="button" className="ghost-button" onClick={onClose}><X size={20} aria-hidden="true" /> Esci</button>
        </div>
      </header>
      <div className="coloring-rotate">
        <RotateCw size={44} aria-hidden="true" />
        <p>Gira lo schermo per colorare.</p>
      </div>
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
          <div role="group" aria-label="Strumenti" className="coloring-tools">
            {tools.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" aria-label={label} title={label} aria-pressed={tool === id} onClick={() => setTool(id)}>
                <Icon size={22} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div role="group" aria-label="Colori" className="coloring-colors">
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
