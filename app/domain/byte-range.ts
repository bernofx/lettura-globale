export type ByteRange = { offset: number; length: number };

/**
 * Resolves a single HTTP `Range: bytes=…` header against a resource size (RFC 9110).
 * Returns `null` when the header is absent, malformed or multi-range (serve the
 * whole resource with 200) and `"unsatisfiable"` when it must be answered with 416.
 */
export function resolveByteRange(header: string | null, size: number): ByteRange | "unsatisfiable" | null {
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || (!match[1] && !match[2])) return null;
  if (size <= 0) return "unsatisfiable";
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (suffix === 0) return "unsatisfiable";
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const offset = Number(match[1]);
  if (offset >= size) return "unsatisfiable";
  const last = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (last < offset) return null;
  return { offset, length: last - offset + 1 };
}
