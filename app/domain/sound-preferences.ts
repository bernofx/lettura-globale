export type SoundCue = "wrong" | "correct" | "finish" | "select";

export type SoundPreferences = {
  wrong: "classic" | "naaa" | "soft";
  correct: "classic" | "chime" | "bright";
  finish: "applause" | "classic" | "fanfare";
  select: "plin" | "select" | "soft";
};

export const defaultSoundPreferences: SoundPreferences = {
  wrong: "classic",
  correct: "classic",
  finish: "fanfare",
  select: "plin",
};

export const soundOptions: { [K in SoundCue]: Array<{ id: SoundPreferences[K]; label: string }> } = {
  wrong: [
    { id: "classic", label: "Attuale" },
    { id: "naaa", label: "Naaa" },
    { id: "soft", label: "Tono gentile" },
  ],
  correct: [
    { id: "classic", label: "Attuale" },
    { id: "chime", label: "Carillon" },
    { id: "bright", label: "Squillo allegro" },
  ],
  finish: [
    { id: "applause", label: "Applausi" },
    { id: "classic", label: "Conferma attuale" },
    { id: "fanfare", label: "Piccola fanfara" },
  ],
  select: [
    { id: "plin", label: "Plin attuale" },
    { id: "select", label: "Select" },
    { id: "soft", label: "Tocco leggero" },
  ],
};

export function hydrateSoundPreferences(value: unknown): SoundPreferences {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result = { ...defaultSoundPreferences };
  for (const cue of Object.keys(soundOptions) as SoundCue[]) {
    const choice = raw[cue];
    if (typeof choice === "string" && soundOptions[cue].some((option) => option.id === choice)) {
      // A sound option is selected only from this fixed, bundled allowlist.
      (result as Record<SoundCue, string>)[cue] = choice;
    }
  }
  return result;
}

export function soundAsset(cue: SoundCue, choice: string): string | null {
  if (cue === "wrong") return choice === "classic" ? "/audio/wrong.mp3" : choice === "naaa" ? "/audio/naaa.mp3" : null;
  if (cue === "correct") return choice === "classic" ? "/audio/correct.mp3" : null;
  if (cue === "finish") return choice === "applause" ? "/audio/applausi.mp3" : choice === "classic" ? "/audio/correct.mp3" : null;
  return choice === "select" ? "/audio/select.mp3" : null;
}
