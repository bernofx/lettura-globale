import { COLORING_HEIGHT, COLORING_WIDTH, type ColoringPage } from "../domain/coloring-pages";

export type ColoringTool = "brush" | "crayon" | "fill";
export type ColoringPoint = { x: number; y: number };
type PaintedArea = { fill?: string; marks?: CanvasRenderingContext2D };

const outlineColor = "#312d43";

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
    return -1;
  }

  fill(index: number, color: string) {
    this.paint.set(index, { fill: color });
  }

  stroke(index: number, from: ColoringPoint, to: ColoringPoint, color: string, tool: "brush" | "crayon") {
    const area = this.paint.get(index) ?? {};
    if (!area.marks) {
      const layer = document.createElement("canvas");
      layer.width = COLORING_WIDTH;
      layer.height = COLORING_HEIGHT;
      const context = layer.getContext("2d");
      if (!context) return;
      context.clip(this.areas[index]);
      area.marks = context;
      this.paint.set(index, area);
    }
    const context = area.marks;
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
    context.clearRect(0, 0, COLORING_WIDTH, COLORING_HEIGHT);
    context.strokeStyle = outlineColor;
    context.lineJoin = context.lineCap = "round";
    context.lineWidth = 6;
    for (const [index, path] of this.areas.entries()) {
      const area = this.paint.get(index);
      context.fillStyle = area?.fill ?? "#ffffff";
      context.fill(path);
      if (area?.marks) context.drawImage(area.marks.canvas, 0, 0);
      context.stroke(path);
    }
    for (const [index, path] of this.details.entries()) {
      context.lineWidth = index === 0 ? 11 : 4;
      context.stroke(path);
    }
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
