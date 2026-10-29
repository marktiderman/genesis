/**
 * @marktiderman/genesis-sites/import: moving a site in. Server only (Node).
 *
 * `importAssets(store, siteId, urls)` re-hosts the images and files an old
 * site points at: it fetches each URL, checks what came back by its bytes
 * (images and PDF only; never SVG or HTML) and its size, stores it under
 * `sites/<site_id>/...` through the store's `putAsset` (which writes the
 * `site_assets` row, with the image's dimensions), and returns a map from
 * each old URL to its new one. `rewriteUrls(doc, map)` then points the
 * imported pages and posts at the copies.
 *
 * Every fetch is guarded against server-side request forgery: http(s)
 * only, ports 80 and 443, no credentials in the URL, no address that isn't
 * public (checked on every address a name resolves to, when the connection
 * is made, so DNS rebinding doesn't get past it), at most three redirects,
 * each checked the same way, a size cap and a time limit.
 *
 * Posts come in through the store's own `importPosts`.
 *
 * @packageDocumentation
 */
import { FetchRefusedError, createGuardedTransport, fetchGuarded, type Transport } from "@marktiderman/genesis-media/server";
import { sniff, type Sniffed } from "@marktiderman/genesis-media";
import type { SiteStore } from "../core/store";
import { MAX_URL_LENGTH } from "../core/urls";

// The guard, the fetch and the sniffer live in genesis-media; these names stay here for importers.
export { BlockedAddressError, guardedLookup, isPublicAddress, urlProblems, type FetchedResponse, type Transport } from "@marktiderman/genesis-media/server";
export { sniff, type Sniffed } from "@marktiderman/genesis-media";

/**
 * The default transport: Node's http(s) with `guardedLookup` as the
 * socket's DNS lookup and a fresh agent (no pooled sockets, no proxy from
 * the environment), so the address connected to is the address checked.
 */
export const guardedTransport: Transport = createGuardedTransport({ userAgent: "genesis-sites-import/1" });

export interface ImportAssetsOptions {
  /** The largest file, in bytes (default 15 MiB). */
  maxBytes?: number;
  /** The time one URL may take, redirects included, in ms (default 20 s). */
  timeoutMs?: number;
  /** At most this many redirects per URL (default 3). */
  maxRedirects?: number;
  /** The ports fetched from (default 80 and 443). */
  allowedPorts?: readonly number[];
  /** Alt text for an image, when the importer knows it (the old page's `alt`). */
  alt?: (url: string) => string | undefined;
  /** Replaces the guarded Node transport (tests, another runtime). It must keep the address guard. */
  transport?: Transport;
}

export interface ImportedAsset {
  /** Where the site loads it now. */
  url: string;
  assetId: string;
  /** The storage key, under `sites/<site_id>/` (`files/` for a PDF). */
  path: string;
  mime: Sniffed["mime"];
  width: number | null;
  height: number | null;
  bytes: number;
  /** An image with no alt text yet: an editor writes it before the page publishes. */
  needsAlt: boolean;
}

export interface ImportAssetsResult {
  /** Old URL → new URL, for `rewriteUrls`. */
  map: Record<string, string>;
  assets: Record<string, ImportedAsset>;
  failed: { url: string; reason: string }[];
}

/** The most URLs one `importAssets` call fetches (one at a time, each with its own time limit). */
export const MAX_IMPORT_URLS = 500;
const MAX_DIMENSION = 20000;
/** And at most this many pixels in all: a bigger header is a decompression bomb waiting for a resizer. */
const MAX_PIXELS = 50_000_000;

/** Refused after the fetch (not a type a site stores, too many pixels): reported like the guard's refusals. */
class ImportRefused extends Error {}

/** A storage-friendly name from the URL's last segment, with the extension of what the bytes are. */
function fileName(url: URL, ext: string): string {
  const segment = url.pathname.split("/").pop() ?? "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // A malformed escape (`%zz`, a lone `%`): the name falls back to "file", the import goes on.
    decoded = "";
  }
  const last = decoded.replace(/\.[a-z0-9]{1,5}$/i, "");
  const base = last.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
  return `${base}.${ext}`;
}

/**
 * Re-host remote images and files on a site: fetch, check, store, and map
 * each old URL to its new one. A URL that fails (refused by the guard, not
 * an image or PDF, too big, a server error) is listed in `failed` and the
 * rest go on.
 *
 * @stability Beta
 */
export async function importAssets(store: Pick<SiteStore, "putAsset">, siteId: string, urls: readonly string[], options: ImportAssetsOptions = {}): Promise<ImportAssetsResult> {
  if (!store.putAsset) throw new Error("importAssets: the store can't store files (no putAsset).");
  if (urls.length > MAX_IMPORT_URLS) throw new Error(`importAssets: at most ${MAX_IMPORT_URLS} URLs a call (got ${urls.length}).`);
  const o = {
    maxBytes: options.maxBytes ?? 15 * 1024 * 1024,
    timeoutMs: options.timeoutMs ?? 20_000,
    maxRedirects: options.maxRedirects ?? 3,
    allowedPorts: options.allowedPorts ?? [80, 443],
    transport: options.transport ?? guardedTransport,
  };
  const result: ImportAssetsResult = { map: {}, assets: {}, failed: [] };
  for (const url of [...new Set(urls)]) {
    try {
      const { bytes, finalUrl } = await fetchGuarded(url, { ...o, maxUrlLength: MAX_URL_LENGTH });
      const kind = sniff(bytes);
      if (!kind) throw new ImportRefused("it isn't a PNG, JPEG, GIF, WebP, AVIF or PDF (by its bytes).");
      // AVIF (and an odd JPEG or WebP) gives no size here; the byte cap still bounds it.
      if ((kind.width ?? 0) > MAX_DIMENSION || (kind.height ?? 0) > MAX_DIMENSION) throw new ImportRefused(`it is ${kind.width}×${kind.height} pixels; the limit is ${MAX_DIMENSION} a side.`);
      if ((kind.width ?? 0) * (kind.height ?? 0) > MAX_PIXELS) throw new ImportRefused(`it is ${kind.width}×${kind.height} pixels; the limit is ${MAX_PIXELS / 1_000_000} million in all.`);
      const alt = kind.mime === "application/pdf" ? undefined : options.alt?.(url)?.trim().slice(0, 300) || undefined;
      const blob = new Blob([bytes as BlobPart], { type: kind.mime });
      const asset = await store.putAsset(siteId, blob, {
        name: fileName(finalUrl, kind.ext),
        ...(alt ? { alt } : {}),
        ...(kind.width ? { width: kind.width } : {}),
        ...(kind.height ? { height: kind.height } : {}),
      });
      result.map[url] = asset.url;
      result.assets[url] = {
        url: asset.url,
        assetId: asset.id,
        path: asset.path,
        mime: kind.mime,
        width: kind.width,
        height: kind.height,
        bytes: bytes.byteLength,
        needsAlt: kind.mime !== "application/pdf" && !alt,
      };
    } catch (err) {
      const reason = err instanceof ImportRefused || err instanceof FetchRefusedError ? err.message : `${(err as Error)?.message ?? String(err)}`;
      if (err && typeof err === "object" && "address" in err) console.warn(`[genesis-sites] import refused ${url}: it resolves to ${(err as { address: string }).address}.`);
      result.failed.push({ url, reason });
    }
  }
  return result;
}

/**
 * A copy of a document (a page, a post, a site) with every string that is
 * exactly an old URL in `map` replaced by its new one: image sources, file
 * links, rich text links. Nothing else changes.
 */
export function rewriteUrls<T>(value: T, map: Readonly<Record<string, string>>): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return Object.prototype.hasOwnProperty.call(map, v) ? map[v] : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}
