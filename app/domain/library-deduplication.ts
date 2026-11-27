export type DeduplicableLibraryItem = {
  categorySymbolOnly?: boolean;
  id: string;
  word: string;
  category?: string;
  contentKind?: string;
  image?: string;
  imageKey?: string;
  remoteImageId?: string;
  emoji?: string;
  source?: string;
  privateUpload?: boolean;
  deleted?: boolean;
};

function normalizedWord(word: string) {
  return word.trim().toLocaleLowerCase("it-IT").replace(/[’']/g, "").replace(/[^a-zà-öø-ÿ0-9]+/gi, " ").trim();
}

function isUploadedPhoto(item: DeduplicableLibraryItem) {
  return Boolean(!item.categorySymbolOnly && item.privateUpload && (item.remoteImageId || item.imageKey || item.image));
}

function isEmptyPlaceholder(item: DeduplicableLibraryItem) {
  const placeholderSource = /immagine da aggiungere|catalogo demo/i.test(item.source ?? "");
  return !item.categorySymbolOnly && !item.privateUpload && !item.image && !item.imageKey && !item.remoteImageId && Boolean(item.emoji || placeholderSource);
}

export function deduplicateLibraryPlaceholders<T extends DeduplicableLibraryItem>(items: T[]) {
  const activeByWord = new Map<string, T[]>();
  for (const item of items) {
    if (item.deleted) continue;
    const key = normalizedWord(item.word);
    if (!key) continue;
    activeByWord.set(key, [...(activeByWord.get(key) ?? []), item]);
  }

  const replacements = new Map<string, string>();
  for (const matches of activeByWord.values()) {
    for (const candidate of matches) {
      if (!isEmptyPlaceholder(candidate) || candidate.contentKind === "sentence") continue;
      const uploaded = matches.filter((item) => isUploadedPhoto(item) && item.category === candidate.category && item.contentKind !== "sentence");
      if (uploaded.length === 1) replacements.set(candidate.id, uploaded[0].id);
    }
  }

  // A placeholder may already have been archived by an older client without
  // updating exercises. Repair only an unambiguous uploaded replacement in the
  // same category; never revive deleted media or guess between real photos.
  for (const item of items) {
    if (!item.deleted || !item.category || item.contentKind === "sentence" || !isEmptyPlaceholder(item) || !/immagine da aggiungere|catalogo demo/i.test(item.source ?? "")) continue;
    const matches = (activeByWord.get(normalizedWord(item.word)) ?? []).filter((candidate) => isUploadedPhoto(candidate) && candidate.category === item.category && candidate.contentKind !== "sentence");
    if (matches.length === 1) replacements.set(item.id, matches[0].id);
  }

  return {
    items: items.map((item) => replacements.has(item.id) && !item.deleted ? { ...item, deleted: true } : item),
    replacements,
  };
}

export function remapLibraryId(id: string | undefined, replacements: Map<string, string>) {
  return id ? replacements.get(id) ?? id : id;
}

export function remapLibraryIds(ids: string[] | undefined, replacements: Map<string, string>) {
  return ids ? Array.from(new Set(ids.map((id) => replacements.get(id) ?? id))) : ids;
}

export function recoverPendingRemoteUploads<T extends DeduplicableLibraryItem>(remoteItems: T[], localItems: T[]) {
  const remoteIds = new Set(remoteItems.map((item) => item.id));
  const pending = localItems.filter((item) => item.privateUpload && item.remoteImageId && !remoteIds.has(item.id));
  return pending.length ? [...pending, ...remoteItems] : remoteItems;
}

// The PATCH checks an explicit replacement against the stored source and the
// final library. A concurrent second photo makes the proposed match ambiguous.
export function verifyLibraryReplacements(previous: DeduplicableLibraryItem[], next: DeduplicableLibraryItem[], pairs: [string, string][]) {
  const requested = new Map(pairs);
  const previousById = new Map(previous.map(item => [item.id, item]));
  const candidates = next.map(item => {
    if (!requested.has(item.id)) return item;
    const old = previousById.get(item.id);
    if (!old || !item.deleted || !isEmptyPlaceholder(old) || !isEmptyPlaceholder(item) ||
        !item.category || old.category !== item.category || normalizedWord(old.word) !== normalizedWord(item.word) ||
        old.contentKind === "sentence" || item.contentKind === "sentence") throw new Error("library_replacement_conflict");
    // A newly archived emoji placeholder is eligible under the original active-item rule.
    return old;
  });
  const { replacements } = deduplicateLibraryPlaceholders(candidates);
  const photos = new Map(next.filter(item => !item.deleted && (item.remoteImageId || item.image)).map(item => [item.id, item]));
  for (const [source, target] of requested) {
    if (replacements.get(source) !== target || !photos.has(target)) throw new Error("library_replacement_conflict");
  }
  return requested;
}
