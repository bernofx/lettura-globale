export type SupportedImageType = "image/png" | "image/jpeg" | "image/webp";

export type ImageValidation = { valid: true; width: number; height: number } | { valid: false; reason: string };

const MAX_IMAGE_SIDE = 4096;
const MAX_IMAGE_PIXELS = 16_000_000;

function result(width: number, height: number): ImageValidation {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return { valid: false, reason: "invalid_dimensions" };
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) return { valid: false, reason: "image_dimensions_too_large" };
  return { valid: true, width, height };
}

function png(bytes: Uint8Array): ImageValidation {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value) || String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR") return { valid: false, reason: "invalid_png" };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return result(view.getUint32(16), view.getUint32(20));
}

function jpeg(bytes: Uint8Array): ImageValidation {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return { valid: false, reason: "invalid_jpeg" };
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return { valid: false, reason: "invalid_jpeg" };
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      if (length < 7) return { valid: false, reason: "invalid_jpeg" };
      return result((bytes[offset + 5] << 8) | bytes[offset + 6], (bytes[offset + 3] << 8) | bytes[offset + 4]);
    }
    offset += length;
  }
  return { valid: false, reason: "missing_jpeg_dimensions" };
}

function webp(bytes: Uint8Array): ImageValidation {
  if (bytes.length < 30 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP") return { valid: false, reason: "invalid_webp" };
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  if (chunk === "VP8X") {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return result(width, height);
  }
  if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return result((bytes[26] | (bytes[27] << 8)) & 0x3fff, (bytes[28] | (bytes[29] << 8)) & 0x3fff);
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
    const height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10);
    return result(width, height);
  }
  return { valid: false, reason: "unsupported_webp" };
}

export function validateImageBytes(bytes: Uint8Array, contentType: string): ImageValidation {
  if (contentType === "image/png") return png(bytes);
  if (contentType === "image/jpeg") return jpeg(bytes);
  if (contentType === "image/webp") return webp(bytes);
  return { valid: false, reason: "unsupported_image_type" };
}
