export const PUZZLE_IMAGES_URL = "/api/puzzle-images";
export type PuzzleImage = { id: string; title: string; image: string };
export type PuzzleCatalog = { scope: string; images: PuzzleImage[] };
