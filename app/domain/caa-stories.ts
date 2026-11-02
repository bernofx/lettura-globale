export const ARASAAC_CREDIT = "Pittogrammi: Sergio Palao · ARASAAC (arasaac.org) · Proprietà: Governo di Aragona · CC BY-NC-SA";
export const CAA_MAX_TEXT = 4000;
export const CAA_MAX_SENTENCES = 32;
export const CAA_MAX_TOKENS = 300;
export const CAA_PAPERS = {
  "a4-portrait": { label: "A4 verticale",width: 210,height: 297 },
  "a4-landscape": { label: "A4 orizzontale",width: 297,height: 210 },
  "a3-portrait": { label: "A3 verticale",width: 297,height: 420 },
  "a3-landscape": { label: "A3 orizzontale",width: 420,height: 297 },
  "a5-portrait": { label: "A5 verticale",width: 148,height: 210 },
  "a5-landscape": { label: "A5 orizzontale",width: 210,height: 148 },
  "a6-portrait": { label: "A6 verticale",width: 105,height: 148 },
  "a6-landscape": { label: "A6 orizzontale",width: 148,height: 105 },
  "letter-portrait": { label: "Letter verticale",width: 215.9,height: 279.4 },
  "letter-landscape": { label: "Letter orizzontale",width: 279.4,height: 215.9 },
  "legal-portrait": { label: "Legal verticale",width: 215.9,height: 355.6 },
  "legal-landscape": { label: "Legal orizzontale",width: 355.6,height: 215.9 },
} as const;
export const CAA_BOOK_PAPERS = {
  a4: { label: "A4 → pagine A5",width: 297,height: 210 },
  a3: { label: "A3 → pagine A4",width: 420,height: 297 },
  letter: { label: "Letter → mezzo Letter",width: 279.4,height: 215.9 },
} as const;
export type CaaSymbol =
  | { kind: "arasaac"; id: number }
  | { kind: "media"; id: string; source: string; author: string; license: string }
  | { kind: "bundled"; path: string; source: string; author: string; license: string };
export type CaaToken = { id: string; text: string; symbol?: CaaSymbol };
export type CaaSentence = { id: string; text?: string; tokens: CaaToken[]; pageBreak: boolean };
export type CaaStory = {
  schemaVersion: 1; id: string; title: string; draftText: string; sentences: CaaSentence[];
  format: "sheet" | "book"; paper: keyof typeof CAA_PAPERS | "custom";
  letterCase?: "uppercase" | "original"; customPaper?: { width: number; height: number }; bookPaper?: keyof typeof CAA_BOOK_PAPERS;
  symbolSize: 20 | 26 | 32; sentencesPerPage: 1 | 2 | 3; cover: boolean;
  nonCommercial: boolean; archived: boolean; updatedAt: string;
};
export type CaaSummary = Pick<CaaStory, "id" | "title" | "updatedAt" | "archived"> & { etag: string };
export type CaaStored = { owner: string; story: CaaStory; etag: string | null; pending: boolean; operationId: string; conflict?: boolean };
export const caaId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(value);
// Library/media IDs predate story UUIDs: IDs such as "letto" are valid media keys.
export const caaMediaId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);
export type CaaLibraryItem = { id: string; word: string; image?: string; remoteImageId?: string; source: string; author: string; license: string };
export function caaLibrarySymbol(item: CaaLibraryItem): CaaSymbol | null {
  if ([item.source,item.author,item.license].some(text => typeof text !== "string" || !text.trim() || text.length > 300)) return null;
  const rights = { source: item.source,author: item.author,license: item.license };
  if (caaMediaId(item.remoteImageId)) return { kind: "media",id: item.remoteImageId,...rights };
  if (item.image && /^\/images\/[a-zA-Z0-9/_-]+\.(webp|png|jpg|jpeg)$/.test(item.image)) return { kind: "bundled",path: item.image,...rights };
  return null;
}
export const caaSearchTerm = (value: string) => value.toLocaleLowerCase("it-IT").normalize("NFC").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").trim();
export const normalizeCaaTerm = (value: string) => caaSearchTerm(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export function caaSearchAllowed(value: string) {
  const term = value.trim().normalize("NFC").toLocaleLowerCase("it-IT");
  if (!term || value.length > 60) return false;
  // One-letter Italian function words; consonants and U are not useful here.
  return term.length > 1 || ["a","e","è","i","o"].includes(term);
}
export const sentenceText = (sentence: CaaSentence) => sentence.text ?? sentence.tokens.map(token => token.text).join(" ");
export function splitCaaText(text: string) {
  return text.trim().split(/\n+|(?<=[.!?])\s+(?=[\p{Lu}\d])/u).map(line => line.trim()).filter(Boolean);
}
export function editCaaSentence(previous: CaaSentence, text: string, id = () => crypto.randomUUID()): CaaSentence {
  if (sentenceText(previous) === text) return previous;
  const available = [...previous.tokens];
  const words = text.trim().split(/\s+/).filter(Boolean); const tokens: CaaToken[] = [];
  for (let position = 0; position < words.length;) {
    const matches = available.map((token,index) => ({ token,index,words: token.text.split(/\s+/) })).filter(item => item.words.join(" ") === words.slice(position,position + item.words.length).join(" ")).sort((a,b) => b.words.length - a.words.length);
    const match = matches[0];
    if (match) { tokens.push(available.splice(match.index,1)[0]); position += match.words.length; }
    else { tokens.push({ id: id(),text: words[position] }); position++; }
  }
  return { ...previous,text,tokens };
}
export function newCaaStory(id = () => crypto.randomUUID()): CaaStory {
  return { schemaVersion: 1, id: id(), title: "Nuova storia", draftText: "", sentences: [], format: "sheet", paper: "a4-portrait", letterCase: "uppercase", symbolSize: 26, sentencesPerPage: 1, cover: false, nonCommercial: false, archived: false, updatedAt: new Date().toISOString() };
}
export function sentencesFromText(text: string, id = () => crypto.randomUUID()) {
  return splitCaaText(text).map(line => editCaaSentence({ id: id(), tokens: [], pageBreak: false }, line, id));
}
export function parseCaaStory(value: unknown): CaaStory {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_story");
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 180_000) throw new Error("story_too_large");
  const v = value as CaaStory;
  if (v.schemaVersion !== 1 || typeof v.id !== "string" || !caaId(v.id) || typeof v.title !== "string" || v.title.length > 140 || typeof v.draftText !== "string" || v.draftText.length > CAA_MAX_TEXT || !Array.isArray(v.sentences) || v.sentences.length > CAA_MAX_SENTENCES) throw new Error("invalid_story");
  if (!["sheet", "book"].includes(v.format) || !(v.paper === "custom" || Object.hasOwn(CAA_PAPERS,v.paper)) || ![20,26,32].includes(v.symbolSize) || ![1,2,3].includes(v.sentencesPerPage)) throw new Error("invalid_format");
  if (v.letterCase !== undefined && !["uppercase","original"].includes(v.letterCase)) throw new Error("invalid_letter_case");
  if (v.bookPaper !== undefined && !Object.hasOwn(CAA_BOOK_PAPERS,v.bookPaper)) throw new Error("invalid_book_paper");
  if (v.customPaper !== undefined && (!v.customPaper || [v.customPaper.width,v.customPaper.height].some(n => !Number.isInteger(n) || n < 80 || n > 600))) throw new Error("invalid_custom_paper");
  if (v.paper === "custom" && !v.customPaper) throw new Error("missing_custom_paper");
  if (typeof v.cover !== "boolean" || typeof v.nonCommercial !== "boolean" || typeof v.archived !== "boolean" || !Number.isFinite(Date.parse(v.updatedAt))) throw new Error("invalid_story");
  const ids = new Set<string>(); let count = 0; let characters = 0;
  for (const sentence of v.sentences) {
    if (!sentence || !caaId(sentence.id) || ids.has(sentence.id) || typeof sentence.pageBreak !== "boolean" || !Array.isArray(sentence.tokens) || (sentence.text !== undefined && (typeof sentence.text !== "string" || sentence.text.length > CAA_MAX_TEXT))) throw new Error("invalid_sentence");
    ids.add(sentence.id);
    for (const token of sentence.tokens) {
      if (!token || !caaId(token.id) || ids.has(token.id) || typeof token.text !== "string" || !token.text.trim() || token.text.length > 100) throw new Error("invalid_token");
      ids.add(token.id); count++; characters += token.text.length + 1;
      const s = token.symbol;
      if (!s) continue;
      if (s.kind === "arasaac") { if (!v.nonCommercial || !Number.isSafeInteger(s.id) || s.id < 1 || s.id > 1_000_000) throw new Error("invalid_arasaac_symbol"); }
      else {
        if (s.kind === "media" ? !caaMediaId(s.id) : s.kind !== "bundled" || typeof s.path !== "string" || !/^\/images\/[a-zA-Z0-9/_-]+\.(webp|png|jpg|jpeg)$/.test(s.path)) throw new Error("invalid_image");
        if ([s.source,s.author,s.license].some(text => typeof text !== "string" || !text.trim() || text.length > 300)) throw new Error("missing_image_rights");
      }
    }
  }
  if (count > CAA_MAX_TOKENS || characters > CAA_MAX_TEXT) throw new Error("story_too_long");
  // Rebuild the document so unexpected fields cannot smuggle account IDs or URLs.
  return { schemaVersion: 1, id: v.id, title: v.title, draftText: v.draftText, sentences: v.sentences.map(s => ({ id: s.id, text: sentenceText(s), pageBreak: s.pageBreak, tokens: s.tokens.map(t => ({ id: t.id, text: t.text, ...(t.symbol ? { symbol: t.symbol.kind === "arasaac" ? { kind: "arasaac" as const, id: t.symbol.id } : t.symbol.kind === "media" ? { kind: "media" as const, id: t.symbol.id, source: t.symbol.source, author: t.symbol.author, license: t.symbol.license } : { kind: "bundled" as const, path: t.symbol.path, source: t.symbol.source, author: t.symbol.author, license: t.symbol.license } } : {}) })) })), format: v.format, paper: v.paper, ...(v.letterCase !== undefined ? { letterCase: v.letterCase } : {}), ...(v.bookPaper !== undefined ? { bookPaper: v.bookPaper } : {}), ...(v.customPaper !== undefined ? { customPaper: { width: v.customPaper.width,height: v.customPaper.height } } : {}), symbolSize: v.symbolSize, sentencesPerPage: v.sentencesPerPage, cover: v.cover, nonCommercial: v.nonCommercial, archived: v.archived, updatedAt: v.updatedAt };
}
export function caaSymbolUrl(symbol: CaaSymbol) {
  return symbol.kind === "arasaac" ? `https://static.arasaac.org/pictograms/${symbol.id}/${symbol.id}_500.png` : symbol.kind === "media" ? `/api/media/${symbol.id}` : symbol.path;
}
export type CaaPage = { number: number; cover: boolean; sentences: CaaSentence[] };
export function caaPages(story: CaaStory): CaaPage[] {
  if (story.format === "sheet") return [{ number: 1, cover: false, sentences: story.sentences }];
  const groups: CaaSentence[][] = [];
  for (const sentence of story.sentences) {
    if (!groups.length || sentence.pageBreak || groups.at(-1)!.length >= story.sentencesPerPage) groups.push([]);
    groups.at(-1)!.push(sentence);
  }
  const pages: CaaPage[] = story.cover ? [{ number: 1, cover: true, sentences: [] }] : [];
  for (const sentences of groups) pages.push({ number: pages.length + 1, cover: false, sentences });
  return pages.length ? pages : [{ number: 1, cover: false, sentences: [] }];
}
/** Stack, cut vertically, then put the left stack before the right. Single-sided. */
export function caaCutSheets(pages: CaaPage[]) {
  const count = Math.ceil(pages.length / 2);
  return Array.from({ length: count }, (_, index) => ({ left: pages[index], right: pages[index + count] ?? null }));
}
export const caaDisplayText = (story: CaaStory,text: string) => story.letterCase === "uppercase" ? text.toLocaleUpperCase("it-IT") : text;
export function caaPrintSheetSize(story: CaaStory) {
  if (story.format === "book") { const { width,height } = CAA_BOOK_PAPERS[story.bookPaper ?? "a4"]; return { width,height }; }
  const { width,height } = story.paper === "custom" ? story.customPaper! : CAA_PAPERS[story.paper];
  return { width,height };
}
export function caaPageSize(story: CaaStory) {
  const size = caaPrintSheetSize(story);
  return story.format === "book" ? { width: size.width / 2,height: size.height } : size;
}
export function arasaacResults(raw: unknown) {
  if (!Array.isArray(raw)) throw new Error("invalid_arasaac_response");
  return raw.filter((item): item is { _id: number; keywords?: Array<{ keyword: string }> } => Boolean(item && typeof item === "object" && Number.isSafeInteger(item._id) && item._id > 0 && item._id < 1_000_000)).slice(0,24).map(item => ({ id: item._id, label: Array.isArray(item.keywords) ? item.keywords.map(word => typeof word?.keyword === "string" ? word.keyword.slice(0,80) : "").filter(Boolean).slice(0,3).join(", ") : "Pittogramma" }));
}
