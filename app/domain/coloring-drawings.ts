export const COLORING_DRAWINGS_URL = "/api/coloring-drawings";
export const MAX_DRAWING_BYTES = 1_500_000;

export type ColoringPoint = { x: number; y: number };
/** Playful paints with fixed colours; `color`/`fill` keep their base colour for older app versions. */
export const coloringTextures = ["dots", "glitter", "stars", "lava"] as const;
export type ColoringTexture = (typeof coloringTextures)[number];
export type ColoringStroke = { tool: "brush" | "crayon"; color: string; texture?: ColoringTexture; points: ColoringPoint[] };
export type ColoringArea = { index: number; fill?: string; fillTexture?: ColoringTexture; strokes: ColoringStroke[] };

export function isColoringTexture(value: unknown): value is ColoringTexture {
  return typeof value === "string" && (coloringTextures as readonly string[]).includes(value);
}
export type ColoringDrawing = {
  version: 1;
  editedAt: number;
  operation: string;
  areas: ColoringArea[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value);
}

function isPoint(value: unknown): value is ColoringPoint {
  return isRecord(value) && [value.x, value.y].every(coordinate =>
    typeof coordinate === "number" && Number.isFinite(coordinate) && Math.abs(coordinate) <= 32_768);
}

function isStroke(value: unknown): value is ColoringStroke {
  return isRecord(value) && (value.tool === "brush" || value.tool === "crayon") && isColor(value.color) &&
    (value.texture === undefined || (value.tool === "brush" && isColoringTexture(value.texture))) &&
    Array.isArray(value.points) && value.points.length > 0 && value.points.every(isPoint);
}

export function parseColoringDrawing(value: unknown, areaCount: number): ColoringDrawing | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.editedAt !== "number" ||
    !Number.isSafeInteger(value.editedAt) || value.editedAt < 1 || typeof value.operation !== "string" ||
    !/^[0-9a-f-]{36}$/.test(value.operation) || !Array.isArray(value.areas) || value.areas.length > areaCount + 1) return null;

  const seen = new Set<number>();
  const areas: ColoringArea[] = [];
  for (const area of value.areas) {
    if (!isRecord(area) || typeof area.index !== "number" || !Number.isInteger(area.index) ||
      area.index < -1 || area.index >= areaCount || seen.has(area.index) ||
      (area.fill !== undefined && !isColor(area.fill)) || (area.fillTexture !== undefined && (area.fill === undefined || !isColoringTexture(area.fillTexture))) ||
      !Array.isArray(area.strokes) || !area.strokes.every(isStroke)) return null;
    seen.add(area.index);
    areas.push({ index: area.index, fill: area.fill, ...(area.fillTexture ? { fillTexture: area.fillTexture as ColoringTexture } : {}), strokes: area.strokes as ColoringStroke[] });
  }
  return { version: 1, editedAt: value.editedAt, operation: value.operation, areas };
}

export function compareColoringDrawings(left: Pick<ColoringDrawing, "editedAt" | "operation">, right: Pick<ColoringDrawing, "editedAt" | "operation">) {
  return left.editedAt - right.editedAt || (left.operation < right.operation ? -1 : Number(left.operation > right.operation));
}

/** Characters of already-synced drawing copies kept on the device for offline previews. */
export const SYNCED_DEVICE_BUDGET = 900_000;

export type DeviceCopy = { key: string; size: number; pending: boolean; editedAt: number };

/**
 * Keys of synced device copies to evict so they stay within `budget`. Pending
 * (unsynced) drawings are never evicted; among synced ones the most recently
 * edited are kept. The cloud remains the source of the evicted drawings, and
 * the shared ~5 MB browser storage stays free for session recovery and the
 * cloud save queue.
 */
export function deviceEvictions(copies: DeviceCopy[], budget = SYNCED_DEVICE_BUDGET): string[] {
  let used = 0;
  return copies
    .filter((copy) => !copy.pending)
    .sort((left, right) => right.editedAt - left.editedAt)
    .flatMap((copy) => {
      used += copy.size;
      return used > budget ? [copy.key] : [];
    });
}

/** Upload timeout scaled to the body: at least 10 s, about 25 kB/s, at most 60 s. */
export function drawingUploadTimeout(bodyLength: number) {
  return Math.min(60_000, 10_000 + Math.ceil(bodyLength / 25));
}
