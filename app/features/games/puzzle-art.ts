export const puzzleGrids = {
  "4x4": { columns: 4, rows: 4 },
  "5x4": { columns: 5, rows: 4 },
  "5x5": { columns: 5, rows: 5 },
} as const;
export type PuzzleSize = keyof typeof puzzleGrids;
export const demoPuzzleImage = "/images/categories/casa.webp";
const CELL = 120;
const TAB = 19;
export const PUZZLE_ART_SCALE = (CELL + 2 * TAB) / CELL;

function edge(x: number, y: number, dx: number, dy: number, depth: number) {
  const at = (along: number, normal = 0) => [x + along * CELL * dx - normal * dy, y + along * CELL * dy + normal * dx].join(" ");
  if (!depth) return " L" + at(1);
  return " L" + at(.4) + " C" + [at(.44), at(.44, depth * .22), at(.42, depth * .37)].join(" ") +
    " C" + [at(.35, depth * 1.15), at(.65, depth * 1.15), at(.58, depth * .37)].join(" ") +
    " C" + [at(.56, depth * .22), at(.56), at(.6)].join(" ") + " L" + at(1);
}

function piecePath(row: number, column: number, rows: number, columns: number) {
  const direction = (y: number, x: number) => (x + y) % 2 ? -TAB : TAB;
  return "M0 0" +
    edge(0, 0, 1, 0, row ? direction(row - 1, column) : 0) +
    edge(CELL, 0, 0, 1, column + 1 < columns ? -direction(row, column) : 0) +
    edge(CELL, CELL, -1, 0, row + 1 < rows ? -direction(row, column) : 0) +
    edge(0, CELL, 0, -1, column ? direction(row, column - 1) : 0) + " Z";
}

export function buildPuzzleArt(image: HTMLImageElement, size: PuzzleSize) {
  const { columns, rows } = puzzleGrids[size];
  const picture = document.createElement("canvas");
  picture.width = columns * CELL;
  picture.height = rows * CELL;
  const context = picture.getContext("2d")!;
  const contain = Math.min(picture.width / image.naturalWidth, picture.height / image.naturalHeight);
  const cover = Math.max(picture.width / image.naturalWidth, picture.height / image.naturalHeight);
  const drawPhoto = (scale: number) => {
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (picture.width - width) / 2, (picture.height - height) / 2, width, height);
  };
  // Only the bands outside the contained photo use the softer background.
  context.fillStyle = "#eae5f5";
  context.fillRect(0, 0, picture.width, picture.height);
  context.filter = "blur(14px) saturate(.7)";
  drawPhoto(cover * 1.14);
  context.filter = "none";
  drawPhoto(contain);

  const tiles = Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const path = new Path2D(piecePath(row, column, rows, columns));
    const tile = document.createElement("canvas");
    tile.width = tile.height = CELL + 2 * TAB;
    const layer = tile.getContext("2d")!;
    layer.translate(TAB, TAB);
    layer.save();
    layer.clip(path);
    layer.drawImage(picture, -column * CELL, -row * CELL);
    layer.restore();
    layer.lineWidth = 2;
    layer.strokeStyle = "#322d48";
    layer.stroke(path);
    return { tile, path, row, column };
  });
  return { picture, tiles };
}

export function drawPuzzleBoard(canvas: HTMLCanvasElement, art: ReturnType<typeof buildPuzzleArt>, fitted: ReadonlySet<number>, guide: boolean, line: string) {
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (guide) {
    context.globalAlpha = 0.28;
    context.drawImage(art.picture, 0, 0);
    context.globalAlpha = 1;
  }
  art.tiles.forEach(({ tile, path, row, column }, index) => {
    const x = column * CELL;
    const y = row * CELL;
    if (fitted.has(index)) {
      context.drawImage(tile, x - TAB, y - TAB);
      return;
    }
    context.save();
    context.translate(x, y);
    context.strokeStyle = line;
    context.lineWidth = 2;
    context.setLineDash([6, 4]);
    context.stroke(path);
    context.restore();
  });
  if (fitted.size === art.tiles.length) context.drawImage(art.picture, 0, 0);
}
