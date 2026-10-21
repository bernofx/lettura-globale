export type ThemePalette = "violet" | "brand" | "ocean" | "forest" | "sunset" | "berry" | "slate";
export type ControlShape = "square" | "compact" | "soft" | "round";

export type AppearanceSettings = {
  palette: ThemePalette;
  shape: ControlShape;
};

export const defaultAppearance: AppearanceSettings = { palette: "violet", shape: "soft" };

export const appearancePresets: Array<{ id: string; name: string; description: string; settings: AppearanceSettings }> = [
  { id: "classico", name: "Classico", description: "Viola calmo e forme morbide", settings: { palette: "violet", shape: "soft" } },
  { id: "lettura-globale", name: "Lettura Globale", description: "Giallo, blu notte e azzurro come l’icona", settings: { palette: "brand", shape: "round" } },
  { id: "mare", name: "Mare", description: "Blu luminoso e controlli arrotondati", settings: { palette: "ocean", shape: "round" } },
  { id: "natura", name: "Natura", description: "Verde distensivo e forme morbide", settings: { palette: "forest", shape: "soft" } },
  { id: "energia", name: "Energia", description: "Arancio caldo e controlli compatti", settings: { palette: "sunset", shape: "compact" } },
  { id: "bacca", name: "Bacca", description: "Rosa prugna e forme morbide", settings: { palette: "berry", shape: "soft" } },
  { id: "focus", name: "Focus", description: "Blu ardesia e geometrie essenziali", settings: { palette: "slate", shape: "square" } },
];

const palettes = new Set<ThemePalette>(["violet", "brand", "ocean", "forest", "sunset", "berry", "slate"]);
const shapes = new Set<ControlShape>(["square", "compact", "soft", "round"]);

export function hydrateAppearance(value: unknown): AppearanceSettings {
  if (!value || typeof value !== "object") return defaultAppearance;
  const candidate = value as Partial<AppearanceSettings>;
  return {
    palette: candidate.palette && palettes.has(candidate.palette) ? candidate.palette : defaultAppearance.palette,
    shape: candidate.shape && shapes.has(candidate.shape) ? candidate.shape : defaultAppearance.shape,
  };
}

export function appearancePresetId(settings: AppearanceSettings) {
  return appearancePresets.find((preset) => preset.settings.palette === settings.palette && preset.settings.shape === settings.shape)?.id;
}

