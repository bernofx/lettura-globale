import { categorySymbolCatalog } from "./category-symbol-catalog.ts";

export const SCHEDULED_IMAGES_URL = "/api/scheduled-images";
export const MAX_SCHEDULED_IMAGES = 20;
export const MAX_SCHEDULED_INPUT_LENGTH = 6_000;

export const scheduledImageStatuses = {
  queued: "In coda",
  processing: "In lavorazione",
  generated: "Da verificare",
  approved: "In pubblicazione",
  pull_request: "In pubblicazione",
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
};

export const scheduledCategories = categorySymbolCatalog.map(item => item.category);
export const scheduledId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?![\s\S])/;
export const scheduledAssetUrl = (id: string) => `/images/scheduled/${id}.webp`;

export type ScheduledImageMetadata = {
  category: (typeof scheduledCategories)[number];
  article: "IL" | "LA" | null;
  syllabification: string;
};

export function isScheduledWord(word: unknown): word is string {
  return typeof word === "string" && word.length <= 48 && /^[a-zàèéìòóù]+(?:[ ’'-][a-zàèéìòóù]+)*(?![\s\S])/iu.test(word)
    && word.split(" ").length <= 4;
}

export function scheduledImageMetadata(word: string, metadata: unknown): ScheduledImageMetadata | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const { category, article, syllabification } = metadata as ScheduledImageMetadata;
  if (Object.keys(metadata).length !== 3 || !scheduledCategories.includes(category) ||
    (article !== "IL" && article !== "LA" && article !== null) ||
    typeof syllabification !== "string" || !isScheduledWord(syllabification.replaceAll("-", "")) ||
    syllabification.split(" ").some(part => !isScheduledWord(part)) ||
    scheduledWordKey(syllabification.replaceAll("-", "")) !== scheduledWordKey(word.replaceAll("-", ""))) return null;
  return { category, article, syllabification };
}

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
    if (extra.length || !isScheduledWord(word) || detail.length > 200 || /[\p{C}@]|https?:|www\.|\d(?:[ .+()-]*\d){6}/iu.test(detail)) {
      throw new Error("invalid_words");
    }
    const key = scheduledWordKey(word);
    if (!words.has(key)) words.set(key, { word, key, detail });
  }
  return [...words.values()];
}
