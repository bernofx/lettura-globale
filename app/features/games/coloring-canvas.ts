import { COLORING_HEIGHT, COLORING_WIDTH, detailStrokes, type ColoringPage } from "../../domain/coloring-pages";

export type ColoringTool = "brush" | "crayon" | "fill";
import type { ColoringArea, ColoringPoint, ColoringStroke, ColoringTexture } from "../../domain/coloring-drawings";
import { animatedTextures, textureLayers } from "./coloring-textures";
export type { ColoringPoint } from "../../domain/coloring-drawings";
type Bounds = { left: number; top: number; right: number; bottom: number };
/** Raster cache of an area's strokes at the current device resolution. */
type MarkCache = { context: CanvasRenderingContext2D; bounds: Bounds; key: string };
type PaintedArea = { fill?: string; fillTexture?: ColoringTexture; strokes: ColoringStroke[]; cache?: MarkCache };

const outlineColor = "#312d43";
const backgroundIndex = -1;
const boundsCache = new Map<string, Bounds>();

export function coloringFrame(width: number, height: number) {
  const scale = Math.min(width / COLORING_WIDTH, height / COLORING_HEIGHT);
  const left = (COLORING_WIDTH - width / scale) / 2;
  const top = (COLORING_HEIGHT - height / scale) / 2;
  return { scale, left, top, right: COLORING_WIDTH - left, bottom: COLORING_HEIGHT - top };
}

type ColoringFrame = ReturnType<typeof coloringFrame>;
const frameKey = (frame: ColoringFrame) => `${frame.scale}:${frame.left}:${frame.top}`;

/**
 * Strokes are stored as vectors (tool, colour, points) and replayed into small
 * per-area caches drawn at device resolution, so marks stay as sharp as the
 * outlines and memory is bounded by the painted areas of the open drawing only.
 */
export class ColoringCanvas {
  private readonly id: string;
  private readonly areas: Path2D[];
  private readonly areaFills: readonly (string | undefined)[];
  private readonly dots: Path2D;
  private readonly lines: Path2D;
  private readonly paint = new Map<number, PaintedArea>();
  /** Animation clock in seconds for lava and glitter; 0 keeps them still. */
  time = 0;

  constructor(page: ColoringPage, areas: ColoringArea[] = []) {
    this.id = page.id;
    this.areas = page.areas.map(path => new Path2D(path));
    this.areaFills = "areaFills" in page ? page.areaFills : [];
    const strokes = detailStrokes(page.details);
    this.dots = new Path2D(strokes.dots);
    this.lines = new Path2D(strokes.lines);
    for (const { index, fill, fillTexture, strokes } of areas) this.paint.set(index, { fill, fillTexture, strokes: structuredClone(strokes) });
  }

  areaAt(context: CanvasRenderingContext2D, point: ColoringPoint): number {
    for (let index = this.areas.length - 1; index >= 0; index--) {
      if (context.isPointInPath(this.areas[index], point.x, point.y)) return index;
    }
    return backgroundIndex;
  }

  fill(index: number, color: string, texture?: ColoringTexture) {
    // A fill covers the area's previous marks: drop them and their cache.
    this.releaseCache(this.paint.get(index));
    this.paint.set(index, { fill: color, ...(texture ? { fillTexture: texture } : {}), strokes: [] });
  }

  /** True when a lava or glitter paint is visible, so the game keeps animating. */
  hasAnimation() {
    for (const area of this.paint.values()) {
      if (area.fillTexture && animatedTextures.has(area.fillTexture)) return true;
      if (area.strokes.some((stroke) => stroke.texture && animatedTextures.has(stroke.texture))) return true;
    }
    return false;
  }

  stroke(index: number, from: ColoringPoint, to: ColoringPoint, color: string, tool: "brush" | "crayon", frame: ColoringFrame, paintTexture?: ColoringTexture) {
    // Textures belong to the brush; the crayon keeps its own grain in the base colour.
    const texture = tool === "brush" ? paintTexture : undefined;
    const area = this.paint.get(index) ?? { strokes: [] };
    this.paint.set(index, area);
    const last = area.strokes.at(-1);
    const end = last?.points.at(-1);
    const isDot = from.x === to.x && from.y === to.y;
    if (!isDot && last && last.tool === tool && last.color === color && last.texture === texture && end && end.x === from.x && end.y === from.y) last.points.push(to);
    else area.strokes.push({ tool, color, ...(texture ? { texture } : {}), points: isDot ? [from] : [from, to] });
    // Draw just the new segment into a cache that is already valid for this frame;
    // otherwise the next render rebuilds the cache from the vectors.
    if (area.cache?.key === frameKey(frame)) this.drawStroke(area.cache.context, index, { tool, color, ...(texture ? { texture } : {}), points: isDot ? [from] : [from, to] });
  }

  snapshot(): ColoringArea[] {
    return Array.from(this.paint, ([index, { fill, fillTexture, strokes }]) => ({
      index, fill, ...(fillTexture ? { fillTexture } : {}), strokes: strokes.map(stroke => ({
        ...stroke,
        points: stroke.points.map(({ x, y }) => ({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 })),
      })),
    }));
  }

  clear() {
    this.releaseCaches();
    this.paint.clear();
  }

  /** Frees the raster caches (e.g. when the drawing is closed); vectors are kept. */
  releaseCaches() {
    for (const area of this.paint.values()) this.releaseCache(area);
  }

  render(context: CanvasRenderingContext2D) {
    const { width, height } = context.canvas;
    const frame = coloringFrame(width, height);
    const { scale, left, top } = frame;
    const background = this.paint.get(backgroundIndex);
    context.clearRect(0, 0, width, height);
    if (background?.fill && !background.fillTexture) {
      context.fillStyle = background.fill;
      context.fillRect(0, 0, width, height);
    }
    context.save();
    context.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
    if (background?.fill && background.fillTexture) {
      this.paintLayers(context, background.fillTexture, () => context.fillRect(frame.left, frame.top, frame.right - frame.left, frame.bottom - frame.top));
    }
    if (background?.strokes.length) this.drawMarks(context, backgroundIndex, background, frame);
    context.lineJoin = context.lineCap = "round";
    for (const [index, path] of this.areas.entries()) {
      const area = this.paint.get(index);
      if (area?.fillTexture) this.paintLayers(context, area.fillTexture, () => context.fill(path));
      else {
        context.fillStyle = area?.fill ?? this.areaFills[index] ?? "#ffffff";
        context.fill(path);
      }
      if (area?.strokes.length) this.drawMarks(context, index, area, frame);
      context.strokeStyle = outlineColor;
      context.lineWidth = 6;
      context.stroke(path);
    }
    // Eyes and other dots need a thick round cap to be visible; lines stay thin.
    context.strokeStyle = outlineColor;
    context.lineWidth = 11;
    context.stroke(this.dots);
    context.lineWidth = 4;
    context.stroke(this.lines);
    context.restore();
  }

  private releaseCache(area?: PaintedArea) {
    if (!area?.cache) return;
    area.cache.context.canvas.width = area.cache.context.canvas.height = 0;
    area.cache = undefined;
  }

  /** Paints every layer of a texture with `draw` (a fill or a stroke), keeping the context state. */
  private paintLayers(context: CanvasRenderingContext2D, texture: ColoringTexture, draw: () => void) {
    const alpha = context.globalAlpha;
    for (const layer of textureLayers(context, texture, this.time)) {
      context.fillStyle = context.strokeStyle = layer.style;
      context.globalAlpha = alpha * layer.alpha;
      draw();
    }
    context.globalAlpha = alpha;
  }

  private drawMarks(context: CanvasRenderingContext2D, index: number, area: PaintedArea, frame: ColoringFrame) {
    // Moving paints are replayed every frame instead of being frozen into the cache.
    if (area.strokes.some((stroke) => stroke.texture && animatedTextures.has(stroke.texture))) {
      this.releaseCache(area);
      for (const record of area.strokes) this.drawStroke(context, index, record);
      return;
    }
    const cache = this.cacheFor(index, area, frame);
    if (cache) {
      const { left, top, right, bottom } = cache.bounds;
      context.drawImage(cache.context.canvas, left, top, right - left, bottom - top);
      return;
    }
    // No canvas memory available: replay the vectors directly instead of losing marks.
    for (const record of area.strokes) this.drawStroke(context, index, record);
  }

  private cacheFor(index: number, area: PaintedArea, frame: ColoringFrame): MarkCache | undefined {
    const key = frameKey(frame);
    if (area.cache?.key === key) return area.cache;
    const bounds = index === backgroundIndex
      ? { left: Math.floor(frame.left), top: Math.floor(frame.top), right: Math.ceil(frame.right), bottom: Math.ceil(frame.bottom) }
      : this.areaBounds(index);
    const layer = area.cache?.context.canvas ?? document.createElement("canvas");
    layer.width = Math.max(1, Math.ceil((bounds.right - bounds.left) * frame.scale));
    layer.height = Math.max(1, Math.ceil((bounds.bottom - bounds.top) * frame.scale));
    const context = layer.getContext("2d");
    if (!context) { area.cache = undefined; return undefined; }
    context.setTransform(frame.scale, 0, 0, frame.scale, -bounds.left * frame.scale, -bounds.top * frame.scale);
    area.cache = { context, bounds, key };
    for (const record of area.strokes) this.drawStroke(context, index, record);
    return area.cache;
  }

  /** Draws a stroke (or one new segment of it) clipped to its area, exactly like live painting. */
  private drawStroke(context: CanvasRenderingContext2D, index: number, record: ColoringStroke) {
    context.save();
    if (index !== backgroundIndex) context.clip(this.areas[index]);
    context.lineCap = "round";
    const { points } = record;
    const draw = () => {
      if (points.length === 1) this.mark(context, record.tool, points[0], points[0]);
      for (let point = 1; point < points.length; point++) this.mark(context, record.tool, points[point - 1], points[point]);
    };
    if (record.texture && record.tool === "brush") this.paintLayers(context, record.texture, draw);
    else {
      context.strokeStyle = context.fillStyle = record.color;
      draw();
    }
    context.restore();
  }

  private mark(context: CanvasRenderingContext2D, tool: "brush" | "crayon", from: ColoringPoint, to: ColoringPoint) {
    if (tool === "brush") {
      this.line(context, from, to, 26);
      return;
    }
    // Thin, offset strokes give the crayon a visibly different texture.
    context.globalAlpha = 0.55;
    for (const offset of [-6, -2, 2, 6]) {
      this.line(context, { x: from.x + offset, y: from.y - offset }, { x: to.x + offset, y: to.y - offset }, 4.5);
    }
    context.globalAlpha = 1;
  }

  /** Bounding box of an area in artwork units, measured once per drawing area. */
  private areaBounds(index: number): Bounds {
    const cacheKey = `${this.id}:${index}`;
    const cached = boundsCache.get(cacheKey);
    if (cached) return cached;
    const probe = document.createElement("canvas").getContext("2d");
    let bounds: Bounds = { left: 0, top: 0, right: COLORING_WIDTH, bottom: COLORING_HEIGHT };
    if (probe) {
      const step = 4;
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (let y = 0; y <= COLORING_HEIGHT; y += step) {
        for (let x = 0; x <= COLORING_WIDTH; x += step) {
          if (!probe.isPointInPath(this.areas[index], x, y)) continue;
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
      // Pad by the sampling step so thin edges between samples are not cut off.
      if (Number.isFinite(left)) bounds = { left: Math.max(0, left - step), top: Math.max(0, top - step), right: Math.min(COLORING_WIDTH, right + step), bottom: Math.min(COLORING_HEIGHT, bottom + step) };
    }
    boundsCache.set(cacheKey, bounds);
    return bounds;
  }

  private line(context: CanvasRenderingContext2D, from: ColoringPoint, to: ColoringPoint, width: number) {
    context.beginPath();
    if (from.x === to.x && from.y === to.y) {
      context.arc(from.x, from.y, width / 2, 0, 2 * Math.PI);
      context.fill();
      return;
    }
    context.lineWidth = width;
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
}
