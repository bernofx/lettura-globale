/** Keep the edit buffer separate from the bounded, persisted integer. */
export function numericFieldValue(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) ? Math.min(max, Math.max(min, value)) : null;
}
