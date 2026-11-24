import type { SupportedImageType } from "./image-validation.ts";
import type { ScheduledImageMetadata } from "./scheduled-images.ts";

export const OPENVERSE_CATALOG_URL = "/api/official-catalog/import";
export const OPENVERSE_CATALOG_HEADER = "x-scheduled-images-profile";
export const OPENVERSE_COMMONS_SOURCE = "wikimedia";
export const COMMONS_ORIGIN = "https://commons.wikimedia.org";

export const commonsLicenses = {
  cc0: { name: "CC0 1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  by: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
} as const;

export type CommonsLicense = keyof typeof commonsLicenses;
export type CommonsCredit = { author: string; title: string; sourceUrl: string; license: CommonsLicense; providerId: string };
export type OpenverseResult = { id: string; title: string; thumbnail: string; license: CommonsLicense };
export type OpenversePreview = {
  metadata: ScheduledImageMetadata;
  credit: CommonsCredit;
  image: string;
  imageType: SupportedImageType;
  digest: string;
};

export function commonsFileTitle(value: unknown) {
  if (typeof value !== "string" || value.length > 1700) return null;
  try {
    const url = new URL(value);
    if (url.origin !== COMMONS_ORIGIN || url.username || url.password || url.search || url.hash ||
      !url.pathname.startsWith("/wiki/")) return null;
    const title = decodeURIComponent(url.pathname.slice("/wiki/".length));
    return /^File:[^|#<>[\]\p{C}]{1,256}$/u.test(title) ? title : null;
  } catch {
    return null;
  }
}

export function commonsCreditLinks(sourceUrl: unknown, licenseUrl: unknown) {
  return typeof sourceUrl === "string" && commonsFileTitle(sourceUrl) && typeof licenseUrl === "string" &&
    Object.values(commonsLicenses).some(license => license.url === licenseUrl) ? { sourceUrl, licenseUrl } : null;
}
