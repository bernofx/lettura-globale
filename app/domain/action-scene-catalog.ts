import type { PhraseStructure } from "./sentence-matching.ts";

export type ActionSceneCatalogEntry = {
  id: string;
  word: string;
  image: string;
  category: "Azioni";
  contentKind: "sentence";
  phraseStructure: PhraseStructure;
  subject: string;
  verb: string;
  complement?: string;
  source: string;
  license: string;
  author: string;
};

const subjects = [
  { id: "gatto", label: "Il gatto" },
  { id: "cane", label: "Il cane" },
  { id: "bimbo", label: "Il bimbo" },
  { id: "mamma", label: "La mamma" },
  { id: "coniglio", label: "Il coniglio" },
  { id: "cavallo", label: "Il cavallo" },
  { id: "panda", label: "Il panda" },
  { id: "scimmia", label: "La scimmia" },
] as const;

const verbs = ["mangia", "dorme", "corre", "salta", "gioca"] as const;

export const actionSceneCatalog: ActionSceneCatalogEntry[] = subjects.flatMap((subject) => verbs.map((verb) => ({
  id: `azione-${subject.id}-${verb}`,
  word: `${subject.label} ${verb}`,
  image: `/images/actions/${subject.id}-${verb}.webp`,
  category: "Azioni",
  contentKind: "sentence",
  phraseStructure: "subject-verb",
  subject: subject.label,
  verb,
  source: "OpenAI ImageGen",
  license: "Uso interno del progetto",
  author: "OpenAI ImageGen",
})));
