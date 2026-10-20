export type DeduplicableLibraryItem = {
  id: string;
  word: string;
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
  return Boolean(item.privateUpload && (item.remoteImageId || item.imageKey || item.image));
}

function isEmptyPlaceholder(item: DeduplicableLibraryItem) {
  const placeholderSource = /immagine da aggiungere|catalogo demo/i.test(item.source ?? "");
  return !item.privateUpload && !item.image && !item.imageKey && !item.remoteImageId && Boolean(item.emoji || placeholderSource);
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
    const uploaded = matches.find(isUploadedPhoto);
    if (!uploaded) continue;
    for (const candidate of matches) {
      if (candidate.id !== uploaded.id && isEmptyPlaceholder(candidate)) replacements.set(candidate.id, uploaded.id);
    }
  }

  return {
    items: items.map((item) => replacements.has(item.id) ? { ...item, deleted: true } : item),
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
