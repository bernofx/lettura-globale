"use client";

import { useState } from "react";
import { numericFieldValue } from "../domain/numeric-field";

export function NumericField({ value, min, max, onValueChange }: { value: number; min: number; max: number; onValueChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <input type="text" inputMode="numeric" pattern="[0-9]*" value={draft ?? value} onChange={(event) => {
    const text = event.target.value;
    if (!/^\d*$/.test(text)) return;
    setDraft(text);
    const next = numericFieldValue(text, min, max);
    if (next !== null) onValueChange(next);
  }} onBlur={() => {
    onValueChange(numericFieldValue(draft ?? String(value), min, max) ?? Math.min(max, Math.max(min, value)));
    setDraft(null);
  }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
}
