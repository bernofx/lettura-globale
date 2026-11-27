import { Check, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { Artwork } from "../../shared/artwork";
import { type LibraryItem, type Presentation } from "../../shared/types";

export function FullTextItemPicker({ items, selectedIds, onChange, multiple, presentation, placeholder, max }: { items: LibraryItem[]; selectedIds: string[]; onChange: (ids: string[]) => void; multiple: boolean; presentation: Presentation; placeholder: string; max?: number }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("it-IT");
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const selected = selectedIds.map((id) => items.find((item) => item.id === id)).filter((item): item is LibraryItem => Boolean(item));
  const results = tokens.length ? items.filter((item) => {
    const text = `${item.word} ${item.category} ${item.syllabification ?? ""}`.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("it-IT");
    return tokens.every((token) => text.includes(token));
  }).slice(0, 8) : [];
  const choose = (id: string) => {
    if (!multiple) { onChange([id]); setQuery(""); return; }
    if (selectedIds.includes(id)) onChange(selectedIds.filter((itemId) => itemId !== id));
    else if (!max || selectedIds.length < max) onChange([...selectedIds, id]);
  };
  return <div className="fulltext-picker">
    {selected.length > 0 && <div className="fulltext-selection" aria-label="Elementi selezionati">{selected.map((item) => <button type="button" key={item.id} onClick={() => multiple && choose(item.id)} className={!multiple ? "single" : ""} title={multiple ? `Rimuovi ${item.word}` : item.word}>{presentation === "images" && <span><Artwork item={item} compact /></span>}<strong>{item.word}</strong>{multiple && <X />}</button>)}</div>}
    <label className="search-box fulltext-search"><Search /><input type="search" aria-label={placeholder} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} autoComplete="off" /></label>
    {tokens.length > 0 && <div className="fulltext-results" role="listbox">{results.length ? results.map((item) => { const chosen = selectedIds.includes(item.id); return <button type="button" role="option" aria-selected={chosen} key={item.id} onClick={() => choose(item.id)} disabled={!chosen && Boolean(max && selectedIds.length >= max)}>{presentation === "images" && <span><Artwork item={item} compact /></span>}<span><strong>{item.word}</strong><small>{item.category}{item.syllabification ? ` · ${item.syllabification}` : ""}</small></span>{chosen ? <Check /> : <Plus />}</button>; }) : <p>Nessun risultato per “{query.trim()}”.</p>}</div>}
  </div>;
}
