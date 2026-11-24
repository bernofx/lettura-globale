import { Buffer } from "node:buffer";
import { validateImageBytes, type SupportedImageType } from "./image-validation.ts";

// D1 allows 2 MB per row. The base64 image uses at most 1.8 MB, leaving
// room for the other fields and SQLite row overhead.
export const MAX_SCHEDULED_PREVIEW_BYTES = 1_350_000;
export const MAX_SCHEDULED_PREVIEW_BASE64 = Math.ceil(MAX_SCHEDULED_PREVIEW_BYTES / 3) * 4;
const MAX_SIDE = 2048;

type Preview = { imageType: SupportedImageType; bytes: Buffer; width: number; height: number };

function inspectWebp(bytes: Buffer) {
  if (bytes.length < 30 || bytes.toString("latin1", 0, 4) !== "RIFF" ||
    bytes.toString("latin1", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) + 8 !== bytes.length) return null;

  let extended: Buffer | undefined;
  let alpha: Buffer | undefined;
  let picture: Buffer | undefined;
  let offset = 12;
  for (; offset + 8 <= bytes.length;) {
    const type = bytes.toString("latin1", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + size + size % 2;
    if (end > bytes.length) return null;
    const chunk = bytes.subarray(offset, end);
    switch (type) {
      case "VP8X":
        if (offset !== 12 || size !== 10 || (chunk[8] & 0xc3) !== 0) return null;
        extended = chunk;
        break;
      case "ALPH":
        if (!extended || !(extended[8] & 16) || alpha || picture || size < 2) return null;
        alpha = chunk;
        break;
      case "VP8 ":
      case "VP8L":
        if (picture || size < 10 || (type === "VP8L" && alpha)) return null;
        picture = chunk;
        break;
      case "ICCP":
      case "EXIF":
      case "XMP ":
        break;
      default:
        return null;
    }
    offset = end;
  }
  if (offset !== bytes.length || !picture) return null;

  // Read the pixel dimensions from the image chunk, independently of VP8X.
  const pixelHeader = Buffer.concat([bytes.subarray(0, 12), picture.subarray(0, 18)]);
  const dimensions = validateImageBytes(pixelHeader, "image/webp");
  if (!dimensions.valid) return null;
  const { width, height } = dimensions;
  if (extended && (extended.readUIntLE(12, 3) + 1 !== width || extended.readUIntLE(15, 3) + 1 !== height)) return null;

  // Keep the explicitly encoded alpha pixels, while dropping unrelated metadata.
  const chunks = [picture];
  if (alpha && extended) {
    const cleanExtended = Buffer.from(extended);
    cleanExtended.fill(0, 8, 12);
    cleanExtended[8] = 16;
    chunks.unshift(cleanExtended, alpha);
  }
  const output = Buffer.concat([bytes.subarray(0, 12), ...chunks]);
  output.writeUInt32LE(output.length - 8, 4);
  return { bytes: output, width, height };
}

function staticPng(bytes: Buffer) {
  let offset = 8;
  let hasData = false;
  for (; offset + 12 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const end = offset + 12 + size;
    if (end > bytes.length || type === "acTL" || type === "fcTL" || type === "fdAT") return false;
    if (type === "IDAT") hasData = true;
    if (type === "IEND") return size === 0 && end === bytes.length && hasData;
    offset = end;
  }
  return false;
}

function previewDimensionsAllowed(width: number, height: number) {
  return width === height && width >= 256 && width <= MAX_SIDE;
}

export function scheduledImagePreview(encoded: unknown): Preview | null {
  if (typeof encoded !== "string" || encoded.length > MAX_SCHEDULED_PREVIEW_BASE64 ||
    encoded.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(encoded)) return null;
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 30 || bytes.length > MAX_SCHEDULED_PREVIEW_BYTES || bytes.toString("base64") !== encoded) return null;

  if (bytes.toString("latin1", 0, 4) === "RIFF") {
    const webp = inspectWebp(bytes);
    return webp && previewDimensionsAllowed(webp.width, webp.height) ? { ...webp, imageType: "image/webp" } : null;
  }
  const imageType = bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : "image/png";
  const dimensions = validateImageBytes(bytes, imageType);
  if (!dimensions.valid || !previewDimensionsAllowed(dimensions.width, dimensions.height)) return null;
  if (imageType === "image/png" ? !staticPng(bytes) : !bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9]))) return null;
  return { imageType, bytes, width: dimensions.width, height: dimensions.height };
}
