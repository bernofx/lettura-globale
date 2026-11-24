import { Buffer } from "node:buffer";
import { validateImageBytes, type SupportedImageType } from "./image-validation.ts";

// D1 allows 2 MB per row. The base64 image uses at most 1.8 MB, leaving
// room for the other fields and SQLite row overhead.
export const MAX_SCHEDULED_PREVIEW_BYTES = 1_350_000;
export const MAX_SCHEDULED_PREVIEW_BASE64 = Math.ceil(MAX_SCHEDULED_PREVIEW_BYTES / 3) * 4;
const MAX_SIDE = 2048;

type Preview = { imageType: SupportedImageType; bytes: Buffer; width: number; height: number };
/** Why a provider image cannot be previewed, kept short and free of image content for logs and messages. */
export type PreviewRejection = {
  reason: "encoding" | "format" | "structure" | "animated" | "not_square" | "dimensions";
  imageType?: SupportedImageType;
  width?: number;
  height?: number;
};
type Inspection = { bytes: Buffer; width: number; height: number } | PreviewRejection;

function inspectWebp(bytes: Buffer): Inspection {
  const structure = { reason: "structure", imageType: "image/webp" } as const;
  if (bytes.length < 30 || bytes.toString("latin1", 0, 4) !== "RIFF" ||
    bytes.toString("latin1", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) + 8 !== bytes.length) return structure;

  let extended: Buffer | undefined;
  let alpha: Buffer | undefined;
  let picture: Buffer | undefined;
  let offset = 12;
  for (; offset + 8 <= bytes.length;) {
    const type = bytes.toString("latin1", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + size + size % 2;
    if (end > bytes.length || !/^[\x20-\x7e]{4}$/.test(type)) return structure;
    const chunk = bytes.subarray(offset, end);
    switch (type) {
      case "VP8X":
        if (offset !== 12 || size !== 10 || (chunk[8] & 0xc1) !== 0) return structure;
        if (chunk[8] & 2) return { reason: "animated", imageType: "image/webp" };
        extended = chunk;
        break;
      case "ANIM":
      case "ANMF":
        return { reason: "animated", imageType: "image/webp" };
      case "ALPH":
        if (!extended || !(extended[8] & 16) || alpha || picture || size < 2) return structure;
        alpha = chunk;
        break;
      case "VP8 ":
      case "VP8L":
        if (picture || size < 10 || (type === "VP8L" && alpha)) return structure;
        picture = chunk;
        break;
      default:
        // Metadata such as ICCP, EXIF, XMP and the C2PA provenance that OpenAI adds: dropped below.
        break;
    }
    offset = end;
  }
  if (offset !== bytes.length || !picture) return structure;

  // Read the pixel dimensions from the image chunk, independently of VP8X.
  const pixelHeader = Buffer.concat([bytes.subarray(0, 12), picture.subarray(0, 18)]);
  const dimensions = validateImageBytes(pixelHeader, "image/webp");
  if (!dimensions.valid) return structure;
  const { width, height } = dimensions;
  if (extended && (extended.readUIntLE(12, 3) + 1 !== width || extended.readUIntLE(15, 3) + 1 !== height)) return structure;

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

function pngAnimated(bytes: Buffer) {
  return bytes.includes(Buffer.from("acTL", "latin1"));
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

function checkDimensions(imageType: SupportedImageType, width: number, height: number): PreviewRejection | null {
  if (width !== height) return { reason: "not_square", imageType, width, height };
  return width >= 256 && width <= MAX_SIDE ? null : { reason: "dimensions", imageType, width, height };
}

/** Validate a provider image for the private preview, or say why it cannot be used. */
export function inspectScheduledImage(encoded: unknown): Preview | PreviewRejection {
  if (typeof encoded !== "string" || encoded.length > MAX_SCHEDULED_PREVIEW_BASE64 ||
    encoded.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(encoded)) return { reason: "encoding" };
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 30 || bytes.length > MAX_SCHEDULED_PREVIEW_BYTES || bytes.toString("base64") !== encoded) return { reason: "encoding" };

  if (bytes.toString("latin1", 0, 4) === "RIFF") {
    const webp = inspectWebp(bytes);
    if ("reason" in webp) return webp;
    return checkDimensions("image/webp", webp.width, webp.height) ?? { ...webp, imageType: "image/webp" };
  }
  const imageType = bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg"
    : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png" : null;
  if (!imageType) return { reason: "format" };
  const dimensions = validateImageBytes(bytes, imageType);
  if (!dimensions.valid) return { reason: "structure", imageType };
  const rejected = checkDimensions(imageType, dimensions.width, dimensions.height);
  if (rejected) return rejected;
  if (imageType === "image/png" ? !staticPng(bytes) : !bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9]))) {
    return { reason: imageType === "image/png" && pngAnimated(bytes) ? "animated" : "structure", imageType };
  }
  return { imageType, bytes, width: dimensions.width, height: dimensions.height };
}

export function scheduledImagePreview(encoded: unknown): Preview | null {
  const result = inspectScheduledImage(encoded);
  return "reason" in result ? null : result;
}
