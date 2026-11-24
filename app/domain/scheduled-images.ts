export const SCHEDULED_IMAGES_URL = "/api/scheduled-images";
export const MAX_SCHEDULED_IMAGES = 20;
export const MAX_SCHEDULED_INPUT_LENGTH = 6_000;
export const SCHEDULED_REPOSITORY = "https://github.com/bernofx/lettura-globale";

export const scheduledImageStatuses = {
  queued: "In coda",
  processing: "In lavorazione",
  pull_request: "PR aperta",
  published: "Pubblicata",
  existing: "Già presente",
  needs_review: "Da chiarire",
  failed: "Da riprovare",
  cancelled: "Annullata",
} as const;

export type ScheduledImageStatus = keyof typeof scheduledImageStatuses;
export type ScheduledImageRequest = {
  id: string;
  word: string;
  detail: string;
  status: ScheduledImageStatus;
  message: string;
  prNumber: number | null;
};

export const workerReportStatuses = ["pull_request", "published", "existing", "needs_review", "failed"] as const;
export type WorkerReportStatus = (typeof workerReportStatuses)[number];

export function scheduledWordKey(word: string) {
  return word.normalize("NFC").trim().replace(/[’‘]/g, "'").replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

export function parseScheduledWords(input: unknown) {
  if (typeof input !== "string" || input.length > MAX_SCHEDULED_INPUT_LENGTH) throw new Error("invalid_words");
  const lines = input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length || lines.length > MAX_SCHEDULED_IMAGES) throw new Error("invalid_words");
  const words = new Map<string, { word: string; key: string; detail: string }>();
  for (const line of lines) {
    const [label, hint = "", ...extra] = line.split("|");
    const word = label.trim().normalize("NFC").replace(/\s+/g, " ");
    const detail = hint.trim();
    if (extra.length || word.length > 64 || !/^\p{L}+(?:[ ’'-]\p{L}+)*$/u.test(word) || detail.length > 200) {
      throw new Error("invalid_words");
    }
    const key = scheduledWordKey(word);
    if (!words.has(key)) words.set(key, { word, key, detail });
  }
  return [...words.values()];
}
