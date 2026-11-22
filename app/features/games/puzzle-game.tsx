"use client";

import { Check, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { RewardMusicPlayer } from "../../domain/reward-soundtrack";
import { playFeedbackTone } from "../../shared/audio";
import { startGameMusic } from "./game-music";
import { landscapePoint, mountLandscapeDialog } from "./landscape-dialog";
import { useKeepDialogOpen } from "./use-keep-dialog-open";
import { buildPuzzleArt, drawPuzzleBoard, loadPuzzleImage, PUZZLE_ART_SCALE, puzzleGrids, type PuzzleSize, type PuzzleSource } from "./puzzle-art";
import "./puzzle-game.css";

export type PuzzleSelection = { image: HTMLImageElement; size: PuzzleSize; sources: PuzzleSource[]; startIndex: number };
type Point = { x: number; y: number };
type Piece = Point & { id: number; angle: number; layer: number };
type Gesture = { pointerId: number; button: HTMLButtonElement; piece: Piece; start: Point; offset: Point; moving: boolean };
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function PuzzleThumbnail() {
  return <div className="coloring-card-art puzzle-thumbnail" aria-hidden="true" />;
}

function PuzzleTile({ tile }: { tile: HTMLCanvasElement }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => { ref.current?.getContext("2d")?.drawImage(tile, 0, 0); }, [tile]);
  return <canvas ref={ref} width={tile.width} height={tile.height} aria-hidden="true" />;
}

function shufflePieces(columns: number, rows: number): Piece[] {
  const order = Array.from({ length: columns * rows }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  return order.map((id, index) => ({
    id, layer: index + 1,
    x: clamp((index % columns) / (columns - 1) + Math.cos(index * 4.17) * (rows === 5 ? .08 : .04)),
    y: clamp(Math.floor(index / columns) / (rows - 1) + Math.sin(index * 2.81 + 1) * (rows === 5 ? .08 : .04)),
    angle: Math.cos(index * 2.93) * (rows === 5 ? 10 : 5),
  }));
}

export function PuzzleGame({ selection, soundVolume, onClose }: { selection: PuzzleSelection; soundVolume: number; onClose: () => void }) {
  const { columns, rows } = puzzleGrids[selection.size];
  const [round, setRound] = useState(() => ({ image: selection.image, index: selection.startIndex }));
  const art = useMemo(() => buildPuzzleArt(round.image, selection.size), [round.image, selection.size]);
  const [pieces, setPieces] = useState(() => shufflePieces(columns, rows));
  const [fitted, setFitted] = useState<ReadonlySet<number>>(() => new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [guide, setGuide] = useState(true);
  const [drag, setDrag] = useState<(Point & { id: number }) | null>(null);
  const [geometry, setGeometry] = useState({ cell: 0, width: 0, height: 0 });
  const dialog = useRef<HTMLDialogElement>(null);
  useKeepDialogOpen(dialog);
  const boardSpace = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const tray = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLCanvasElement>(null);
  const layer = useRef(columns * rows);
  const rotated = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const skipClick = useRef<number | null>(null);
  const music = useRef<RewardMusicPlayer | null>(null);

  useLayoutEffect(() => {
    const element = dialog.current;
    const table = tray.current;
    const panel = boardSpace.current;
    if (!element || !table || !panel) return;
    const unmount = mountLandscapeDialog(element, () => {
      const current = gesture.current;
      gesture.current = null;
      if (current?.button.hasPointerCapture(current.pointerId)) current.button.releasePointerCapture(current.pointerId);
      setDrag(null);
    }, value => { rotated.current = value; });
    function measure() {
      if (!panel || !table) return;
      const cell = Math.floor(Math.min(panel.clientWidth / columns, panel.clientHeight / rows));
      setGeometry({ cell, width: table.clientWidth, height: table.clientHeight });
    }
    const resize = new ResizeObserver(measure);
    resize.observe(panel);
    resize.observe(table);
    measure();
    return () => { resize.disconnect(); unmount(); };
  }, [columns, rows]);

  useLayoutEffect(() => {
    if (surface.current) {
      const line = getComputedStyle(surface.current).getPropertyValue("--muted").trim() || "#887da2";
      drawPuzzleBoard(surface.current, art, fitted, guide, line);
    }
  }, [art, fitted, guide]);

  useEffect(() => {
    const player = startGameMusic(0);
    music.current = player;
    return () => { player.stop(); music.current = null; };
  }, []);
  useEffect(() => { music.current?.setVolume(soundVolume * .55); }, [soundVolume]);

  const completed = fitted.size === pieces.length;
  useEffect(() => {
    if (!completed) return;
    let cancelled = false;

    async function advance() {
      for (let offset = 1; offset < selection.sources.length && !cancelled; offset++) {
        const index = (round.index + offset) % selection.sources.length;
        const source = selection.sources[index];
        if (source.image === selection.sources[round.index].image) continue;
        let image;
        try { image = await loadPuzzleImage(source.image); } catch { continue; }
        if (cancelled) return;
        layer.current = columns * rows;
        skipClick.current = null;
        setPieces(shufflePieces(columns, rows));
        setFitted(new Set());
        setSelected(null);
        setGuide(true);
        setDrag(null);
        setRound({ image, index });
        return;
      }
    }

    const timer = window.setTimeout(() => void advance(), 1500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [completed, round.index, selection.sources, columns, rows]);

  const pieceArt = geometry.cell * PUZZLE_ART_SCALE;
  const target = Math.min(geometry.cell, Math.max(44, geometry.cell - 3));
  function pieceInset(length: number) {
    return Math.min(length / 2, pieceArt / 2 + 3);
  }
  function position(value: number, length: number) {
    const inset = pieceInset(length);
    return inset + (length - 2 * inset) * value;
  }
  function fraction(value: number, length: number) {
    const inset = pieceInset(length);
    return clamp((value * length - inset) / Math.max(1, length - 2 * inset));
  }
  function updatePiece(id: number, change: Partial<Piece>) {
    setPieces(previous => previous.map(piece => piece.id === id ? { ...piece, ...change } : piece));
  }
  function fit(id: number, slot: number) {
    if (id !== slot || fitted.has(id)) return;
    setFitted(new Set(fitted).add(id));
    setSelected(null);
    if (fitted.size + 1 === pieces.length) playFeedbackTone("correct", soundVolume > 0);
  }
  function startDrag(event: PointerEvent<HTMLButtonElement>, piece: Piece) {
    if (event.button !== 0 || gesture.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    skipClick.current = null;
    gesture.current = {
      pointerId: event.pointerId, button: event.currentTarget, piece, moving: false,
      start: { x: event.clientX, y: event.clientY },
      offset: { x: rect.left + rect.width / 2 - event.clientX, y: rect.top + rect.height / 2 - event.clientY },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current;
    const element = dialog.current;
    if (!current || current.pointerId !== event.pointerId || !element) return;
    if (!current.moving) {
      if (Math.hypot(event.clientX - current.start.x, event.clientY - current.start.y) < 5) return;
      current.moving = true;
      updatePiece(current.piece.id, { layer: ++layer.current });
      setSelected(current.piece.id);
    }
    const point = landscapePoint(element.getBoundingClientRect(), event.clientX + current.offset.x, event.clientY + current.offset.y, rotated.current);
    setDrag({ ...point, id: current.piece.id });
  }
  function finishDrag(event: PointerEvent<HTMLButtonElement>, drop: boolean) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (!current.moving) return;
    setDrag(null);
    skipClick.current = current.piece.id;
    if (!drop || !board.current || !tray.current) return;
    const x = event.clientX + current.offset.x;
    const y = event.clientY + current.offset.y;
    const onBoard = landscapePoint(board.current.getBoundingClientRect(), x, y, rotated.current);
    const col = Math.floor(onBoard.x * columns);
    const row = Math.floor(onBoard.y * rows);
    if (col >= 0 && col < columns && row >= 0 && row < rows) {
      fit(current.piece.id, row * columns + col);
      return;
    }
    const onTray = landscapePoint(tray.current.getBoundingClientRect(), x, y, rotated.current);
    if (onTray.x >= 0 && onTray.x <= 1 && onTray.y >= 0 && onTray.y <= 1) {
      updatePiece(current.piece.id, { x: fraction(onTray.x, geometry.width), y: fraction(onTray.y, geometry.height) });
      setSelected(null);
    }
  }

  return (
    <dialog ref={dialog} className="puzzle-dialog" aria-label="Puzzle a incastro" onCancel={event => event.preventDefault()}
      onClick={() => music.current?.retry()}
      style={{ "--puzzle-art": pieceArt + "px", "--puzzle-target": target + "px" } as CSSProperties}>
      <header className="puzzle-toolbar">
        <span role="status" aria-label={selection.sources[round.index].title + ", " + (completed ? "Puzzle completato!" : fitted.size + "/" + pieces.length + " pezzi")}>
          {completed ? "Puzzle completato!" : fitted.size + "/" + pieces.length + " pezzi"}
        </span>
        <button type="button" className="ghost-button" aria-pressed={guide} onClick={() => setGuide(value => !value)}>
          {guide ? "Nascondi immagine" : "Mostra immagine"}
        </button>
        <button type="button" className="ghost-button puzzle-exit" aria-label="Esci dal puzzle" onClick={onClose}><X size={22} aria-hidden="true" /></button>
      </header>
      <div className="puzzle-workspace">
        <div className="puzzle-board-space" ref={boardSpace}>
          <div ref={board} className="puzzle-board" style={{ width: columns * geometry.cell, height: rows * geometry.cell }}>
            <canvas ref={surface} width={art.picture.width} height={art.picture.height} aria-hidden="true" />
            <div className="puzzle-slots" role="group" aria-label="Tabellone" style={{ gridTemplateColumns: "repeat(" + columns + ", minmax(0, 1fr))" }}>
              {art.tiles.map(({ row, column }, index) => (
                <button type="button" key={index} aria-label={"Riga " + (row + 1) + ", colonna " + (column + 1)}
                  disabled={fitted.has(index)} onClick={() => { if (selected !== null) fit(selected, index); }} />
              ))}
            </div>
          </div>
          {completed && <span className="puzzle-completion" aria-hidden="true"><Check size={48} strokeWidth={3} /></span>}
        </div>
        <div ref={tray} className="puzzle-tray" role="group" aria-label="Pezzi sul tavolo">
          {pieces.map((piece, index) => !fitted.has(piece.id) && (
            <button type="button" className="puzzle-piece" key={piece.id} aria-label={"Pezzo " + (index + 1)} aria-pressed={selected === piece.id}
              data-piece={piece.id} data-moving={drag?.id === piece.id || undefined} style={{
                left: position(piece.x, geometry.width), top: position(piece.y, geometry.height),
                zIndex: piece.layer, "--puzzle-angle": piece.angle + "deg",
              } as CSSProperties}
              onPointerDown={event => startDrag(event, piece)} onPointerMove={moveDrag}
              onPointerUp={event => finishDrag(event, true)} onPointerCancel={event => finishDrag(event, false)}
              onLostPointerCapture={event => finishDrag(event, false)}
              onClick={event => {
                if (skipClick.current === piece.id && event.detail) { skipClick.current = null; return; }
                updatePiece(piece.id, { layer: ++layer.current });
                setSelected(value => value === piece.id ? null : piece.id);
              }}>
              <PuzzleTile tile={art.tiles[piece.id].tile} />
            </button>
          ))}
        </div>
      </div>
      {drag && <div className="puzzle-ghost" style={{ left: drag.x * 100 + "%", top: drag.y * 100 + "%" }}><PuzzleTile tile={art.tiles[drag.id].tile} /></div>}
    </dialog>
  );
}
