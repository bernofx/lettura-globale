export type SoundCue = "wrong" | "correct" | "finish" | "select";

export type SoundLibraryItem = {
  id: string;
  name: string;
  cue: SoundCue;
  byteLength: number;
  createdAt: number;
};

export const soundCueLabels: Record<SoundCue, string> = {
  wrong: "Risposta errata",
  correct: "Risposta corretta",
  finish: "Fine esercizio nella sequenza",
  select: "Selezione in Numero quantità",
};

export const maxSoundBytes = 2_000_000;
export const minSoundBytes = 128;
export const maxSoundDurationSeconds = 15;

export function isSoundCue(value: unknown): value is SoundCue {
  return value === "wrong" || value === "correct" || value === "finish" || value === "select";
}

export function customSoundChoice(id: string) { return `custom:${id}` as const; }

export function customSoundId(choice: string): string | null {
  const match = /^custom:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(choice);
  return match?.[1] ?? null;
}

export function isMp3Header(bytes: Uint8Array) {
  if (bytes.length < 4) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33 && bytes[3] <= 0x04) return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[2] & 0xf0) !== 0xf0;
}

export function normalizeSoundName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 60 && !/[\x00-\x1f\x7f]/.test(name) ? name : null;
}
