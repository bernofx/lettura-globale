export type SyllableStatus = "automatic" | "needs-review" | "verified";
export type SyllableFilter = "all" | "2" | "3" | "2-3" | "4+";

export type SyllableAnalysis = {
  syllabification: string;
  syllableCount: number;
  syllableStatus: SyllableStatus;
};

type SyllableMetadata = Partial<SyllableAnalysis> & { word: string };

// The bundled catalogue is reviewed once here. User words still receive an
// automatic proposal and only ambiguous spellings are queued for review.
const reviewedWords: Record<string, string> = {
  mela: "me-la", gatto: "gat-to", pane: "pa-ne", casa: "ca-sa", palla: "pal-la", sole: "so-le", auto: "au-to", fiore: "fio-re",
  caramelle: "ca-ra-mel-le", yogurt: "yo-gurt", acqua: "ac-qua", grissini: "gris-si-ni", bocca: "boc-ca", schiena: "schie-na",
  telefono: "te-le-fo-no", pigiama: "pi-gia-ma", bicicletta: "bi-ci-clet-ta", gallo: "gal-lo", gelato: "ge-la-to", maiale: "ma-ia-le",
  coniglio: "co-ni-glio", maglietta: "ma-gliet-ta", piadina: "pia-di-na", giacca: "giac-ca", camion: "ca-mion", granchio: "gran-chio",
  "coca cola": "co-ca co-la", carota: "ca-ro-ta", sedia: "se-dia", barca: "bar-ca", cane: "ca-ne", pesce: "pe-sce", mucca: "muc-ca",
  uccello: "uc-cel-lo", banana: "ba-na-na", pera: "pe-ra", latte: "lat-te", letto: "let-to", porta: "por-ta", libro: "li-bro",
  matita: "ma-ti-ta", scarpa: "scar-pa", mano: "ma-no", occhio: "oc-chio", luna: "lu-na", albero: "al-be-ro", treno: "tre-no",
  rana: "ra-na", topo: "to-po", orso: "or-so", volpe: "vol-pe", zebra: "ze-bra", tigre: "ti-gre", lepre: "le-pre", gufo: "gu-fo",
  ape: "a-pe", mosca: "mo-sca", naso: "na-so", dito: "di-to", piede: "pie-de", gamba: "gam-ba", braccio: "brac-cio", spalla: "spal-la",
  collo: "col-lo", pancia: "pan-cia", dente: "den-te", testa: "te-sta", gonna: "gon-na", calza: "cal-za", guanto: "guan-to", felpa: "fel-pa",
  tuta: "tu-ta", borsa: "bor-sa", fascia: "fa-scia", sciarpa: "sciar-pa", casco: "ca-sco", cuffia: "cuf-fia", sasso: "sas-so",
  roccia: "roc-cia", foglia: "fo-glia", ramo: "ra-mo", tronco: "tron-co", prato: "pra-to", monte: "mon-te", mare: "ma-re", lago: "la-go",
  neve: "ne-ve", pasta: "pa-sta", pizza: "piz-za", riso: "ri-so", pollo: "pol-lo", torta: "tor-ta", uovo: "uo-vo", burro: "bur-ro",
  zuppa: "zup-pa", pesca: "pe-sca", noce: "no-ce",
};

const vowels = "aeiouàèéìíòóùú";
const strongVowels = "aeoàèéòóìíùú";
const allowedOnsets = new Set(["br", "cr", "dr", "fr", "gr", "pr", "tr", "vr", "bl", "cl", "fl", "gl", "pl", "gn", "ch", "gh"]);
const allowedTripleOnsets = new Set(["sch", "sbr", "scr", "sdr", "sfr", "sgr", "spr", "str", "scl", "spl"]);

function normalizeWord(word: string) {
  return word.trim().toLocaleLowerCase("it-IT").replace(/\s+/g, " ");
}

function isVowel(character: string) { return vowels.includes(character); }

function vowelNuclei(word: string) {
  const nuclei: Array<{ start: number; end: number }> = [];
  let index = 0;
  while (index < word.length) {
    if (!isVowel(word[index])) { index += 1; continue; }
    const start = index;
    while (index + 1 < word.length && isVowel(word[index + 1])) index += 1;
    const end = index + 1;
    const cluster = word.slice(start, end);
    const strongIndexes = [...cluster].map((character, offset) => strongVowels.includes(character) ? start + offset : -1).filter((value) => value >= 0);
    if (strongIndexes.length <= 1) nuclei.push({ start, end });
    else strongIndexes.forEach((position, strongIndex) => nuclei.push({ start: strongIndex === 0 ? start : position, end: strongIndex === strongIndexes.length - 1 ? end : strongIndexes[strongIndex + 1] }));
    index = end;
  }
  return nuclei;
}

function onsetLength(consonants: string) {
  if (consonants.length <= 1) return consonants.length;
  if (consonants.length >= 3 && allowedTripleOnsets.has(consonants.slice(-3))) return 3;
  const tail2 = consonants.slice(-2);
  if (allowedOnsets.has(tail2) || tail2[0] === "s") return 2;
  return 1;
}

function syllabifyToken(token: string) {
  const nuclei = vowelNuclei(token);
  if (nuclei.length <= 1) return token;
  const boundaries: number[] = [];
  for (let index = 0; index < nuclei.length - 1; index += 1) {
    const consonantStart = nuclei[index].end;
    const consonantEnd = nuclei[index + 1].start;
    const consonants = token.slice(consonantStart, consonantEnd);
    boundaries.push(consonants.length ? consonantEnd - onsetLength(consonants) : nuclei[index].end);
  }
  let start = 0;
  const parts = boundaries.map((boundary) => { const part = token.slice(start, boundary); start = boundary; return part; });
  parts.push(token.slice(start));
  return parts.filter(Boolean).join("-");
}

export function countSyllables(syllabification: string) {
  return syllabification.trim().split(/[\s-]+/).filter(Boolean).length;
}

export function analyzeItalianSyllables(word: string): SyllableAnalysis {
  const normalized = normalizeWord(word);
  const reviewed = reviewedWords[normalized];
  if (reviewed) return { syllabification: reviewed, syllableCount: countSyllables(reviewed), syllableStatus: "verified" };

  const tokens = normalized.split(" ").filter(Boolean);
  const syllabification = tokens.map(syllabifyToken).join(" ");
  const hasUnusualCharacters = !/^[a-zàèéìíòóùú ]+$/i.test(normalized);
  const hasAdjacentVowels = /[aeiouàèéìíòóùú]{2,}/i.test(normalized);
  const needsReview = tokens.length !== 1 || hasUnusualCharacters || hasAdjacentVowels || countSyllables(syllabification) < 1;
  return { syllabification: syllabification || normalized, syllableCount: Math.max(1, countSyllables(syllabification)), syllableStatus: needsReview ? "needs-review" : "automatic" };
}

export function hydrateSyllables<T extends SyllableMetadata>(item: T): T & SyllableAnalysis {
  if (item.syllabification && item.syllableCount && item.syllableStatus) return item as T & SyllableAnalysis;
  return { ...item, ...analyzeItalianSyllables(item.word) };
}

export function matchesSyllableFilter(item: { syllableCount?: number }, filter?: SyllableFilter) {
  if (!filter || filter === "all") return true;
  if (filter === "2-3") return item.syllableCount === 2 || item.syllableCount === 3;
  if (filter === "4+") return (item.syllableCount ?? 0) >= 4;
  return item.syllableCount === Number(filter);
}

