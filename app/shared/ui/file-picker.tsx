"use client";

import { Upload } from "lucide-react";
import { useRef } from "react";
import "./file-picker.css";

export const IMAGE_FILE_ACCEPT = "image/jpeg,image/png,image/webp";
export const IMAGE_FILE_HINT = "JPG, PNG o WebP";

export function FilePicker({ accept, label, hint, selection, image, multiple, disabled, compact, onFiles }: {
  accept: string;
  label: string;
  hint?: string;
  selection?: string;
  image?: string | null;
  multiple?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return <div className="file-picker">
    <button type="button" className={`drop-zone${compact ? " compact" : ""}`} disabled={disabled} onClick={() => input.current?.click()}>
      {image ? <div className="file-picker-preview" aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(image)})` }} /> : <Upload size={22} aria-hidden="true" />}
      <strong>{selection || label}</strong>
      {(selection || hint) && <small>{selection ? label : hint}</small>}
    </button>
    <input ref={input} type="file" accept={accept} multiple={multiple} hidden disabled={disabled} onChange={event => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = "";
      if (files.length) onFiles(files);
    }} />
  </div>;
}
