import { Buffer } from "node:buffer";
import { COMMONS_ORIGIN, OPENVERSE_COMMONS_SOURCE, commonsFileTitle, commonsPageId, type CatalogSearchReply, type CatalogSearchSource, type CommonsCredit, type CommonsLicense, type OpenverseResult } from "../domain/openverse-catalog";
import { MAX_SCHEDULED_PREVIEW_BYTES, inspectScheduledImage, publishedImageBytes } from "../domain/scheduled-image-preview";
import { scheduledId } from "../domain/scheduled-images";
import { hashText } from "../domain/sha256";
import { readBoundedJson } from "./bounded-json";

const openverse = "https://api.openverse.org/v1/images/";
const userAgent = "LetturaGlobale/1.0 (https://github.com/bernofx/lettura-globale)";
const pageSize = 12;

export class CatalogSourceError extends Error {
  readonly status: number;
  readonly upstreamStatus?: number;
  constructor(code: string, status: number, upstreamStatus?: number) {
    super(code);
    this.status = status;
    this.upstreamStatus = upstreamStatus;
  }
}

async function fetchSource(url: URL, accept = "application/json") {
  const result = await fetch(url, {
    headers: { accept, "user-agent": userAgent, "api-user-agent": userAgent },
    redirect: "manual", signal: AbortSignal.timeout(7_000),
  });
  if (result.status === 429) throw new CatalogSourceError("source_rate_limited", 429, result.status);
  if (result.status === 404) throw new CatalogSourceError("image_unavailable", 422, result.status);
  if (!result.ok) throw new CatalogSourceError("source_unavailable", 502, result.status);
  return result;
}

function licenseOf(result: Record<string, unknown>): CommonsLicense | null {
  if (result.license === "cc0") return "cc0";
  if (result.license === "by" && result.license_version === "4.0") return "by";
  return null;
}

function openverseResult(input: unknown): OpenverseResult | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;
  const license = licenseOf(row);
  const title = commonsFileTitle(row.foreign_landing_url);
  if (row.source !== OPENVERSE_COMMONS_SOURCE || row.mature === true || !license ||
    !title || typeof row.id !== "string" || !scheduledId.test(row.id)) return null;
  return { id: row.id, title: typeof row.title === "string" && row.title ? row.title.slice(0, 200) : title.slice(5),
    thumbnail: openverse + row.id + "/thumb/", license };
}

async function searchOpenverse(query: string, page: number): Promise<CatalogSearchReply> {
  const url = new URL(openverse);
  url.search = new URLSearchParams({
    q: query, source: OPENVERSE_COMMONS_SOURCE, license: "cc0,by",
    page: String(page), page_size: String(pageSize),
  }).toString();
  const data = await readBoundedJson(await fetchSource(url), 500_000);
  if (!Array.isArray(data.results)) throw new CatalogSourceError("source_unavailable", 502);
  const results = data.results.slice(0, pageSize).flatMap(item => openverseResult(item) ?? []);
  return { source: "openverse", page, results, more: page < 5 && (typeof data.page_count === "number" ? page < data.page_count : data.results.length === pageSize) };
}

function metadataText(value: unknown) {
  if (typeof value !== "string" || value.length > 10_000) return "";
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/<[^>]*>/g, " ").replace(/&(amp|lt|gt|quot|apos|nbsp|#x[0-9a-f]{1,6}|#\d{1,7});/giu, (entity, name: string) => {
    if (!name.startsWith("#")) return entities[name.toLowerCase()] ?? entity;
    const hex = name[1].toLowerCase() === "x";
    const point = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : "";
  }).replace(/[\p{C}\s]+/gu, " ").trim();
}

function verifyLicense(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.startsWith("//") ? "https:" + value : value);
    if (!["http:", "https:"].includes(url.protocol) || url.host !== "creativecommons.org" || url.username || url.password || url.search || url.hash) return null;
    const path = url.pathname.replace(/\/(?:deed(?:\.[a-z-]+)?|legalcode(?:\.[a-z-]+)?)\/?$/i, "/").replace(/\/?$/, "/");
    if (path === "/publicdomain/zero/1.0/") return "cc0";
    if (path === "/licenses/by/4.0/") return "by";
  } catch {
    return null;
  }
  return null;
}

function commonsRasterUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.origin === "https://upload.wikimedia.org" && !url.username && !url.password &&
      !url.search && !url.hash && url.pathname.startsWith("/wikipedia/commons/") &&
      /\.(?:png|jpe?g|webp)$/i.test(url.pathname) ? url : null;
  } catch {
    return null;
  }
}

async function readImage(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new CatalogSourceError("image_unavailable", 422);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_SCHEDULED_PREVIEW_BYTES) {
        await reader.cancel();
        throw new CatalogSourceError("image_unavailable", 422);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

type CommonsPage = { pageid?: number; index?: number; title?: string; imageinfo?: Array<{
  thumburl?: unknown; url?: unknown; mime?: unknown; mediatype?: unknown; extmetadata?: Record<string, { value?: unknown }>;
}> };

async function commonsImages(params: Record<string, string>, width: number) {
  const url = new URL("/w/api.php", COMMONS_ORIGIN);
  url.search = new URLSearchParams({
    action: "query", format: "json", formatversion: "2", prop: "imageinfo", iilimit: "1",
    iiprop: "url|mime|mediatype|extmetadata", iiurlwidth: String(width), iiextmetadatafilter: "Artist|Attribution|LicenseUrl|Restrictions",
    ...params,
  }).toString();
  const response = await readBoundedJson(await fetchSource(url), 450_000) as {
    query?: { pages?: CommonsPage[] }; continue?: { gsroffset?: number }; error?: unknown;
  };
  if (response.error) throw new CatalogSourceError("source_unavailable", 502);
  return response;
}

function commonsArtwork(page: CommonsPage | undefined, id: string) {
  const info = page?.imageinfo?.[0];
  const meta = info?.extmetadata;
  const license = verifyLicense(meta?.LicenseUrl?.value);
  const author = [...new Set([metadataText(meta?.Artist?.value), metadataText(meta?.Attribution?.value)].filter(Boolean))].join(" · ");
  if (!license || !author || author.length > 280 || metadataText(meta?.Restrictions?.value) ||
    typeof page?.title !== "string" || !page.title.startsWith("File:") || info?.mediatype !== "BITMAP" ||
    !["image/jpeg", "image/png", "image/webp"].includes(String(info?.mime))) return null;

  const sourceUrl = COMMONS_ORIGIN + "/wiki/File:" + encodeURIComponent(page.title.slice(5).replaceAll(" ", "_"));
  if (!commonsFileTitle(sourceUrl)) return null;
  const credit: CommonsCredit = { author, title: page.title.slice(5).replaceAll("_", " ").slice(0, 200), sourceUrl, license, providerId: id };
  return { credit, mediaUrl: commonsRasterUrl(info?.thumburl ?? info?.url) };
}

async function searchWikimedia(query: string, page: number): Promise<CatalogSearchReply> {
  const response = await commonsImages({
    generator: "search", gsrnamespace: "6", gsrsearch: query, gsrlimit: String(pageSize), gsroffset: String((page - 1) * pageSize),
  }, 320);
  const pages = (response.query?.pages ?? []).slice(0, pageSize).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const results = pages.flatMap(file => {
    const id = `commons-${file.pageid}`;
    const artwork = commonsPageId(id) && commonsArtwork(file, id);
    return artwork && artwork.mediaUrl ? [{ id, title: artwork.credit.title, thumbnail: artwork.mediaUrl.href, license: artwork.credit.license }] : [];
  });
  return { source: "wikimedia", page, results, more: page < 5 && typeof response.continue?.gsroffset === "number" };
}

function logSearchFailure(source: CatalogSearchSource, error: unknown) {
  console.warn("Catalog image search failed", {
    source,
    reason: error instanceof CatalogSourceError ? error.message : "response_or_network",
    upstreamStatus: error instanceof CatalogSourceError ? error.upstreamStatus : undefined,
  });
}

export async function searchCommonsImages(query: string, page: number, source?: CatalogSearchSource) {
  if (source !== "wikimedia") {
    try {
      const indexed = await searchOpenverse(query, page);
      if (indexed.results.length || page > 1) return indexed;
    } catch (error) {
      logSearchFailure("openverse", error);
    }
  }
  try {
    return await searchWikimedia(query, source === "wikimedia" ? page : 1);
  } catch (error) {
    logSearchFailure("wikimedia", error);
    if (error instanceof CatalogSourceError && error.status === 429) throw error;
    throw new CatalogSourceError("search_unavailable", 502);
  }
}

/** Resolve the selected result and recheck the file, rights and pixels directly with Wikimedia Commons. */
export async function prepareCommonsImage(id: string, word: string) {
  const pageId = commonsPageId(id);
  let fileParams: Record<string, string>;
  if (pageId) {
    fileParams = { pageids: pageId };
  } else {
    const indexed = await readBoundedJson(await fetchSource(new URL(openverse + id + "/")), 100_000);
    const file = commonsFileTitle(indexed.foreign_landing_url);
    if (!file || openverseResult(indexed)?.id !== id) throw new CatalogSourceError("license_unverified", 422);
    fileParams = { titles: file };
  }
  const response = await commonsImages(fileParams, 640);
  const page = response.query?.pages?.[0];
  if (pageId && String(page?.pageid) !== pageId) throw new CatalogSourceError("image_unavailable", 422);
  const artwork = commonsArtwork(page, id);
  if (!artwork) throw new CatalogSourceError("license_unverified", 422);
  const { credit, mediaUrl } = artwork;
  if (!mediaUrl) throw new CatalogSourceError("image_unavailable", 422);
  const validated = inspectScheduledImage((await readImage(await fetchSource(mediaUrl, "image/jpeg,image/png,image/webp"))).toString("base64"), { square: false });
  const bytes = "reason" in validated ? null : publishedImageBytes(validated);
  if (!bytes || "reason" in validated) throw new CatalogSourceError("image_unavailable", 422);

  const image = bytes.toString("base64");
  const digest = await hashText(JSON.stringify([word, credit, image]));
  return { credit, bytes, image, imageType: validated.imageType, digest };
}
