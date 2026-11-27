import { type ColoringTexture } from "../../domain/coloring-drawings";

/** Palette entries for the playful paints: fixed colours, the base also saved as a plain colour. */
export const textureSwatches: readonly { id: ColoringTexture; label: string; base: string }[] = [
  { id: "dots", label: "Pois", base: "#fff4c2" },
  { id: "glitter", label: "Brillantini", base: "#dcaa2a" },
  { id: "stars", label: "Stelline", base: "#26337a" },
  { id: "lava", label: "Lava", base: "#e2401c" },
];

export const animatedTextures: ReadonlySet<ColoringTexture> = new Set(["glitter", "lava"]);

export type TextureLayer = { style: CanvasPattern; alpha: number };

/** Tiles are drawn at twice the resolution of the artwork units they cover. */
const TILE = 128;
const TILE_SCALE = 0.5;
const tiles = new Map<string, HTMLCanvasElement>();
const patterns = new Map<string, CanvasPattern>();

function seeded(seed: number) {
  let value = seed;
  return () => { value = (value * 16807) % 2147483647; return value / 2147483647; };
}

/** Draws `paint` at (x, y) and at its wrapped copies so the tile repeats without seams. */
function wrapped(size: number, x: number, y: number, radius: number, paint: (x: number, y: number) => void) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
    const px = x + dx; const py = y + dy;
    if (px + radius < 0 || py + radius < 0 || px - radius > size || py - radius > size) continue;
    paint(px, py);
  }
}

function star(context: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, points = 5) {
  context.beginPath();
  for (let index = 0; index < points * 2; index++) {
    const radius = index % 2 ? inner : outer;
    const angle = -Math.PI / 2 + index * Math.PI / points;
    context.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  context.closePath();
  context.fill();
}

function drawTile(name: string, context: CanvasRenderingContext2D) {
  const random = seeded(name.length * 7919 + 17);
  if (name === "dots") {
    context.fillStyle = "#fff4c2";
    context.fillRect(0, 0, TILE, TILE);
    const colours = ["#e84252", "#f58a26", "#2b9b58", "#3558c7", "#8656cb", "#f871ad"];
    let colour = 0;
    for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
      const x = column * 32 + (row % 2 ? 16 : 0) + 8; const y = row * 32 + 16;
      context.fillStyle = colours[colour++ % colours.length];
      wrapped(TILE, x, y, 9, (px, py) => { context.beginPath(); context.arc(px, py, 9, 0, Math.PI * 2); context.fill(); });
    }
  } else if (name === "stars") {
    context.fillStyle = "#26337a";
    context.fillRect(0, 0, TILE, TILE);
    for (let index = 0; index < 10; index++) {
      const big = index < 4;
      const x = random() * TILE; const y = random() * TILE;
      context.fillStyle = big ? "#ffd84d" : "#ffffff";
      wrapped(TILE, x, y, 14, (px, py) => star(context, px, py, big ? 13 : 5, big ? 5.5 : 2.2));
    }
  } else if (name === "glitter") {
    context.fillStyle = "#dcaa2a";
    context.fillRect(0, 0, TILE, TILE);
    for (let index = 0; index < 220; index++) {
      context.fillStyle = ["#fff0a8", "#f6cf4e", "#a8740f", "#ffffff"][Math.floor(random() * 4)];
      context.fillRect(Math.floor(random() * TILE), Math.floor(random() * TILE), 3, 3);
    }
  } else if (name === "glitter-sparkle") {
    context.fillStyle = "#ffffff";
    for (let index = 0; index < 6; index++) {
      const x = random() * TILE; const y = random() * TILE;
      wrapped(TILE, x, y, 12, (px, py) => star(context, px, py, 11, 2, 4));
    }
  } else if (name === "lava" || name === "lava-flow") {
    if (name === "lava") { context.fillStyle = "#e2401c"; context.fillRect(0, 0, TILE, TILE); }
    const blobs = name === "lava" ? ["#ff7a1a", "#b3200f", "#ff9a1f", "#c9300f"] : ["#ffd23a", "#ffb347", "#ffe27a"];
    for (let index = 0; index < (name === "lava" ? 7 : 4); index++) {
      const x = random() * TILE; const y = random() * TILE; const radius = 18 + random() * 22;
      const colour = blobs[index % blobs.length];
      wrapped(TILE, x, y, radius, (px, py) => {
        const gradient = context.createRadialGradient(px, py, 0, px, py, radius);
        gradient.addColorStop(0, colour);
        gradient.addColorStop(1, `${colour}00`);
        context.fillStyle = gradient;
        context.beginPath(); context.arc(px, py, radius, 0, Math.PI * 2); context.fill();
      });
    }
  }
}

function pattern(context: CanvasRenderingContext2D, name: string) {
  const cached = patterns.get(name);
  if (cached) return cached;
  let tile = tiles.get(name);
  if (!tile) {
    tile = document.createElement("canvas");
    tile.width = tile.height = TILE;
    const tileContext = tile.getContext("2d");
    if (tileContext) drawTile(name, tileContext);
    tiles.set(name, tile);
  }
  const created = context.createPattern(tile, "repeat");
  if (!created) return undefined;
  patterns.set(name, created);
  return created;
}

const placed = (style: CanvasPattern, x = 0, y = 0) => {
  style.setTransform(new DOMMatrix().translateSelf(x, y).scaleSelf(TILE_SCALE));
  return style;
};

/**
 * Layers to paint for a texture at `time` (seconds). Motion is slow and has no flashes:
 * lava drifts at a few units per second; glitter sparkles fade over about 2.6 s.
 */
export function textureLayers(context: CanvasRenderingContext2D, texture: ColoringTexture, time: number): TextureLayer[] {
  const span = TILE * TILE_SCALE;
  if (texture === "lava") {
    const base = pattern(context, "lava"); const flow = pattern(context, "lava-flow");
    if (!base || !flow) return [];
    return [
      { style: placed(base, (time * 6) % span, (time * 3) % span), alpha: 1 },
      { style: placed(flow, span - ((time * 9) % span), (time * 5) % span), alpha: 0.8 },
    ];
  }
  if (texture === "glitter") {
    const base = pattern(context, "glitter"); const sparkle = pattern(context, "glitter-sparkle");
    if (!base || !sparkle) return [];
    return [{ style: placed(base), alpha: 1 }, { style: placed(sparkle), alpha: 0.55 + 0.4 * Math.sin(time * 2.4) }];
  }
  const style = pattern(context, texture);
  return style ? [{ style: placed(style), alpha: 1 }] : [];
}
