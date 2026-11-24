import { Info } from "lucide-react";
import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { commonsCreditLinks } from "../../domain/openverse-catalog";
import { exerciseKind } from "../../shared/constants";
import type { Exercise, LibraryItem, Presentation } from "../../shared/types";
import type { CategorySymbols } from "../../domain/category-images";
import { Modal, ModalActions, ModalTitle } from "../../shared/ui/modal";

function imageCredits(exercise: Exercise, library: LibraryItem[], presentation: Presentation, symbols: CategorySymbols) {
  const kind = exerciseKind(exercise);
  const ids = new Set<string>();
  if ((kind === "recognition" && presentation === "images") || kind === "sentence-matching") exercise.optionIds.forEach(id => ids.add(id));
  if (kind === "articles") exercise.articleItemIds?.forEach(id => ids.add(id));
  if (kind === "naming") exercise.namingItemIds?.forEach(id => ids.add(id));
  if (kind === "word-categories") {
    if (exercise.categoryShowTargetImage) exercise.categoryItemIds?.forEach(id => ids.add(id));
    if (exercise.categoryShowSymbols) exercise.categoryNames?.forEach(name => {
      const id = (exercise.categorySymbolIds ?? symbols)[name];
      if (id) ids.add(id);
    });
  }
  return library.flatMap(item => {
    const links = ids.has(item.id) && commonsCreditLinks(item.sourceUrl, item.licenseUrl);
    return links ? [{ id: item.id, title: item.source, author: item.author, license: item.license, ...links }] : [];
  });
}

const ImageCreditsContext = createContext<ReturnType<typeof imageCredits>>([]);

export function SessionImageCredits({ exercise, library, presentation, symbols, children }: {
  exercise: Exercise; library: LibraryItem[]; presentation: Presentation; symbols: CategorySymbols; children: ReactNode;
}) {
  return <ImageCreditsContext.Provider value={imageCredits(exercise, library, presentation, symbols)}>{children}</ImageCreditsContext.Provider>;
}

export function ImageCreditsButton() {
  const credits = useContext(ImageCreditsContext);
  const [open, setOpen] = useState(false);
  const title = useId();
  if (!credits.length) return null;
  return <>
    <button type="button" className="session-image-credits" aria-label="Crediti immagini" title="Crediti immagini"
      onClick={() => setOpen(true)}><Info size={16} aria-hidden="true" /></button>
    {open && <Modal labelledBy={title} onClose={() => setOpen(false)} closeButton>
      <ModalTitle id={title}>Crediti immagini</ModalTitle>
      <ul>{credits.map(item => <li key={item.id}>
        <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.title}</a> · {item.author} ·{" "}
        <a href={item.licenseUrl} target="_blank" rel="noreferrer">{item.license}</a> · Ridimensionata
      </li>)}</ul>
      <ModalActions onCancel={() => setOpen(false)} cancelLabel="Chiudi" />
    </Modal>}
  </>;
}
