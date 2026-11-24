import { useId } from "react";
import { scheduledCategories, type ScheduledImageMetadata } from "../../domain/scheduled-images";

export function CatalogMetadataFields({ metadata, disabled, valid, onChange }: {
  metadata: ScheduledImageMetadata;
  disabled: boolean;
  valid: boolean;
  onChange: (value: ScheduledImageMetadata) => void;
}) {
  const hint = useId();
  return <div className="scheduled-images-metadata">
    <label>Categoria
      <select value={metadata.category} disabled={disabled} onChange={event => {
        const category = scheduledCategories.find(value => value === event.target.value);
        if (category) onChange({ ...metadata, category });
      }}>
        {scheduledCategories.map(category => <option key={category}>{category}</option>)}
      </select>
    </label>
    <label>Articolo nell’esercizio IL / LA
      <select value={metadata.article ?? ""} disabled={disabled} onChange={event => {
        const value = event.target.value;
        onChange({ ...metadata, article: value === "IL" || value === "LA" ? value : null });
      }}>
        <option value="">Non usare nell’esercizio</option>
        <option>IL</option>
        <option>LA</option>
      </select>
    </label>
    <label className="scheduled-images-syllables">Divisione in sillabe
      <input value={metadata.syllabification} maxLength={96} disabled={disabled} aria-describedby={hint}
        onChange={event => onChange({ ...metadata, syllabification: event.target.value })} aria-invalid={!valid} />
      <small id={hint}>Separa le sillabe con i trattini, per esempio lan-ter-na.</small>
    </label>
  </div>;
}
