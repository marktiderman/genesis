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
import { Agent as HttpAgent, request as httpRequest, type IncomingMessage } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import type { SiteStore } from "../core/store";
import { MAX_URL_LENGTH } from "../core/urls";
import { guardedLookup, urlProblems } from "./guard";
import { sniff, type Sniffed } from "./sniff";

export { BlockedAddressError, guardedLookup, isPublicAddress, urlProblems } from "./guard";
export { sniff, type Sniffed } from "./sniff";

/** One HTTP response, unfollowed. */
export interface FetchedResponse {
  status: number;
  /** Lowercase header names. */
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Uint8Array>;
  /** Stop reading (the size cap was hit). */
  cancel(): void;
}

/** Makes one GET request and doesn't follow redirects. The default is the guarded Node transport. */
export type Transport = (url: URL, signal: AbortSignal) => Promise<FetchedResponse>;

/**
 * The default transport: Node's http(s) with `guardedLookup` as the
 * socket's DNS lookup and a fresh agent (no pooled sockets, no proxy from
 * the environment), so the address connected to is the address checked.
 */
export const guardedTransport: Transport = (url, signal) =>
  new Promise((resolve, reject) => {
    const secure = url.protocol === "https:";
    const req = (secure ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        lookup: guardedLookup as never,
        agent: secure ? new HttpsAgent({ keepAlive: false }) : new HttpAgent({ keepAlive: false }),
        headers: { accept: "image/*,application/pdf;q=0.9,*/*;q=0.1", "user-agent": "genesis-sites-import/1" },
        signal,
      },
      (res: IncomingMessage) => {
        const headers: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(res.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
        resolve({ status: res.statusCode ?? 0, headers, body: res, cancel: () => res.destroy() });
      },
    );
    req.on("error", reject);
    req.end();
  });

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

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
/** The most URLs one `importAssets` call fetches (one at a time, each with its own time limit). */
export const MAX_IMPORT_URLS = 500;
const MAX_DIMENSION = 20000;
/** And at most this many pixels in all: a bigger header is a decompression bomb waiting for a resizer. */
const MAX_PIXELS = 50_000_000;

class ImportRefused extends Error {}

async function readCapped(res: FetchedResponse, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    res.cancel();
    throw new ImportRefused(`it is ${declared} bytes; the limit is ${maxBytes}.`);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      res.cancel();
      throw new ImportRefused(`it is over the ${maxBytes}-byte limit.`);
    }
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Fetch one URL through the guard, following at most `maxRedirects` checked redirects. */
async function fetchGuarded(start: string, o: Required<Pick<ImportAssetsOptions, "maxBytes" | "timeoutMs" | "maxRedirects" | "allowedPorts">> & { transport: Transport }): Promise<{ bytes: Uint8Array; finalUrl: URL }> {
  if (start.length > MAX_URL_LENGTH) throw new ImportRefused("the URL is too long.");
  let url: URL;
  try {
    url = new URL(start);
  } catch {
    throw new ImportRefused("it isn't a URL.");
  }
  const signal = AbortSignal.timeout(o.timeoutMs);
  for (let hop = 0; ; hop++) {
    const problems = urlProblems(url, o.allowedPorts);
    if (problems.length) throw new ImportRefused(hop ? `it redirects to ${url.host}: ${problems.join(" ")}` : problems.join(" "));
    const res = await o.transport(url, signal);
    if (REDIRECTS.has(res.status)) {
      res.cancel();
      const location = res.headers.location;
      if (!location) throw new ImportRefused(`a ${res.status} with no Location.`);
      if (hop >= o.maxRedirects) throw new ImportRefused(`more than ${o.maxRedirects} redirects.`);
      const next = new URL(location, url);
      // Never from https down to http: the copy would come over a connection anyone on the path can change.
      if (url.protocol === "https:" && next.protocol === "http:") throw new ImportRefused(`it redirects from https to http (${next.host}).`);
      url = next;
      continue;
    }
    if (res.status !== 200) {
      res.cancel();
      throw new ImportRefused(`the server answered ${res.status}.`);
    }
    return { bytes: await readCapped(res, o.maxBytes), finalUrl: url };
  }
}

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
      const { bytes, finalUrl } = await fetchGuarded(url, o);
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
      const reason = err instanceof ImportRefused ? err.message : `${(err as Error)?.message ?? String(err)}`;
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
