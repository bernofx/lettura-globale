import { COLORING_HEIGHT, COLORING_WIDTH, type ColoringPage } from "../../domain/coloring-pages";

export type ColoringTool = "brush" | "crayon" | "fill";
export type ColoringPoint = { x: number; y: number };
type MarkLayer = { context: CanvasRenderingContext2D; left: number; top: number };
type PaintedArea = { fill?: string; marks?: MarkLayer };

const outlineColor = "#312d43";
const backgroundIndex = -1;

export function coloringFrame(width: number, height: number) {
  const scale = Math.min(width / COLORING_WIDTH, height / COLORING_HEIGHT);
  const left = (COLORING_WIDTH - width / scale) / 2;
  const top = (COLORING_HEIGHT - height / scale) / 2;
  return { scale, left, top, right: COLORING_WIDTH - left, bottom: COLORING_HEIGHT - top };
}

type ColoringFrame = ReturnType<typeof coloringFrame>;

export class ColoringCanvas {
  private readonly areas: Path2D[];
  private readonly details: Path2D[];
  private readonly paint = new Map<number, PaintedArea>();

  constructor(page: ColoringPage) {
    this.areas = page.areas.map(path => new Path2D(path));
    this.details = page.details.map(path => new Path2D(path));
  }

  areaAt(context: CanvasRenderingContext2D, point: ColoringPoint): number {
    for (let index = this.areas.length - 1; index >= 0; index--) {
      if (context.isPointInPath(this.areas[index], point.x, point.y)) return index;
    }
    return backgroundIndex;
  }

  fill(index: number, color: string) {
    this.paint.set(index, { fill: color });
  }

  stroke(index: number, from: ColoringPoint, to: ColoringPoint, color: string, tool: "brush" | "crayon", frame: ColoringFrame) {
    const area = this.paint.get(index) ?? {};
    const marks = this.markLayer(index, frame, area.marks);
    if (!marks) return;
    if (marks !== area.marks) {
      area.marks = marks;
      this.paint.set(index, area);
    }
    const { context } = marks;
    context.strokeStyle = context.fillStyle = color;
    context.lineCap = "round";
    if (tool === "brush") {
      this.line(context, from, to, 26);
    } else {
      // Thin, offset strokes give the crayon a visibly different texture.
      context.globalAlpha = 0.55;
      for (const offset of [-6, -2, 2, 6]) {
        this.line(context, { x: from.x + offset, y: from.y - offset },
          { x: to.x + offset, y: to.y - offset }, 4.5);
      }
      context.globalAlpha = 1;
    }
  }

  render(context: CanvasRenderingContext2D) {
    const { width, height } = context.canvas;
    const { scale, left, top } = coloringFrame(width, height);
    const background = this.paint.get(backgroundIndex);
    context.clearRect(0, 0, width, height);
    if (background?.fill) {
      context.fillStyle = background.fill;
      context.fillRect(0, 0, width, height);
    }
    context.save();
    context.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
    if (background?.marks) {
      const { context: marks, left: x, top: y } = background.marks;
      context.drawImage(marks.canvas, x, y);
    }
    context.strokeStyle = outlineColor;
    context.lineJoin = context.lineCap = "round";
    context.lineWidth = 6;
    for (const [index, path] of this.areas.entries()) {
      const area = this.paint.get(index);
      context.fillStyle = area?.fill ?? "#ffffff";
      context.fill(path);
      if (area?.marks) context.drawImage(area.marks.context.canvas, 0, 0);
      context.stroke(path);
    }
    for (const [index, path] of this.details.entries()) {
      context.lineWidth = index === 0 ? 11 : 4;
      context.stroke(path);
    }
    context.restore();
  }

  private markLayer(index: number, frame: ColoringFrame, previous?: MarkLayer): MarkLayer | undefined {
    const background = index === backgroundIndex;
    if (previous && !background) return previous;
    const oldLeft = previous?.left ?? 0;
    const oldTop = previous?.top ?? 0;
    const oldRight = previous ? oldLeft + previous.context.canvas.width : COLORING_WIDTH;
    const oldBottom = previous ? oldTop + previous.context.canvas.height : COLORING_HEIGHT;
    const left = background ? Math.min(Math.floor(frame.left), oldLeft) : 0;
    const top = background ? Math.min(Math.floor(frame.top), oldTop) : 0;
    const right = background ? Math.max(Math.ceil(frame.right), oldRight) : COLORING_WIDTH;
    const bottom = background ? Math.max(Math.ceil(frame.bottom), oldBottom) : COLORING_HEIGHT;
    if (previous && left === oldLeft && top === oldTop && right === oldRight && bottom === oldBottom) return previous;

    const layer = document.createElement("canvas");
    layer.width = right - left;
    layer.height = bottom - top;
    const context = layer.getContext("2d");
    if (!context) return;
    // Keep marks anchored to the artwork when additional paper becomes visible.
    context.translate(-left, -top);
    if (previous) context.drawImage(previous.context.canvas, oldLeft, oldTop);
    if (!background) context.clip(this.areas[index]);
    return { context, left, top };
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
