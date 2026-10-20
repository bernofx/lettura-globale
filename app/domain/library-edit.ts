export type EditableLibraryItem = {
  word: string;
  category: string;
  article?: string | null;
  syllabification?: string;
  syllableCount?: number;
  syllableStatus?: string;
  image?: string;
};

export function libraryItemWasEdited(before: EditableLibraryItem, after: EditableLibraryItem) {
  return before.word.trim() !== after.word.trim()
    || before.category !== after.category
    || (before.article ?? null) !== (after.article ?? null)
    || (before.syllabification ?? "").trim().toLocaleLowerCase("it-IT") !== (after.syllabification ?? "").trim().toLocaleLowerCase("it-IT")
    || before.syllableCount !== after.syllableCount
    || before.syllableStatus !== after.syllableStatus
    || before.image !== after.image;
}
