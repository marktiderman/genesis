/**
 * The edge verifier: checks a signed link, then streams the file from
 * storage, with HEAD and single byte ranges.
 */
import { attachment, baseHeaders, forbidden, methodNotAllowed, notFound, pathSegments, plain } from "./http";
import { scopeFilename, type MediaScope } from "./scope";
import type { MediaSigner } from "./signer";
import type { MediaRange, MediaStorage } from "./storage";

/** What a request path opens: the storage key, and the scope its link must be signed for. */
export interface MediaRoute {
  key: string;
  scope: MediaScope;
}

/** What the handler hands the app's `route`. */
export interface MediaRouteContext {
  /** The `d` query value: a download link's filename, or undefined. */
  download: string | undefined;
  url: URL;
}

/** @stability Experimental */
export interface SignedMediaHandlerOptions {
  storage: MediaStorage;
  signer: MediaSigner;
  /**
   * Maps a request path to a storage key and the scope its link must be
   * signed for, or undefined (404). `path` is the decoded path without its
   * leading slash; a path with `.`, `..`, or an encoded slash or backslash in
   * a segment never reaches it. Decide here which files each scope opens: an
   * `item` scope for preview sizes only, a `file` scope for each video
   * rendition, a `download` scope (built from `context.download`) for
   * originals.
   */
  route: (path: string, context: MediaRouteContext) => MediaRoute | undefined | Promise<MediaRoute | undefined>;
  /**
   * The `cache-control` of a file. Default `private, max-age=<seconds until
   * the link expires, at most 3600>`.
   */
  cacheControl?: string | undefined;
  /** The time, in Unix seconds, for the default `cache-control`. Default the clock. */
  now?: (() => number) | undefined;
}

/**
 * The byte range a `Range` header asks for. `undefined`: serve the whole
 * file (no header, a header this doesn't read, or several ranges);
 * `"unsatisfiable"`: answer 416.
 */
export function parseRange(header: string | null, size: number): MediaRange | "unsatisfiable" | undefined {
  if (!header) return undefined;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return undefined;
  if (m[1] === "") {
    // A suffix: the last n bytes.
    const n = Number(m[2]);
    if (n === 0 || size === 0) return "unsatisfiable";
    const length = Math.min(n, size);
    return { offset: size - length, length };
  }
  const start = Number(m[1]);
  if (m[2] !== "" && Number(m[2]) < start) return undefined;
  if (start >= size) return "unsatisfiable";
  const end = m[2] === "" ? size - 1 : Number(m[2]);
  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}

/**
 * A request handler that serves files behind signed links. It checks the
 * link before it touches storage (so an unsigned request can't learn what
 * exists), then streams the file: `GET` and `HEAD`, one byte range (206, or
 * 416 when it can't be met), the stored content type, length and ETag, a
 * download name per RFC 6266 for `download` scopes, and `x-robots-tag:
 * noindex`. A bad or expired signature is 403; an unknown path or a missing
 * file is 404. It never lists anything.
 *
 * ```ts
 * const handle = createSignedMediaHandler({ storage, signer, route });
 * export default { fetch: (request) => handle(request) };
 * ```
 *
 * @stability Experimental
 */
export function createSignedMediaHandler(options: SignedMediaHandlerOptions): (request: Request) => Promise<Response> {
  const { storage, signer, route } = options;
  const now = options.now ?? (() => Date.now() / 1000);
  return async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed();
    const url = new URL(request.url);
    const segments = pathSegments(url);
    if (!segments || segments.length === 0) return notFound();
    const download = url.searchParams.get("d") ?? undefined;
    const target = await route(segments.join("/"), { download, url });
    if (!target) return notFound();

    const e = url.searchParams.get("e");
    const token = { e, s: url.searchParams.get("s"), k: url.searchParams.get("k") };
    if (!(await signer.verify(target.scope, token))) return forbidden();

    const head = request.method === "HEAD";
    const rangeHeader = request.headers.get("range");
    // Without a range, one read gives the size; a range needs the size first.
    const info = head || rangeHeader ? await storage.head(target.key) : null;
    if ((head || rangeHeader) && !info) return notFound();
    const range = info ? parseRange(rangeHeader, info.size) : undefined;
    if (range === "unsatisfiable") return plain(416, "Range not satisfiable.", { "content-range": `bytes */${info!.size}` });

    const object = head ? null : await storage.get(target.key, range ? { range } : undefined);
    if (!head && !object) return notFound();
    const meta = object ?? info!;

    const headers = baseHeaders();
    headers.set("content-type", meta.contentType || "application/octet-stream");
    headers.set("accept-ranges", "bytes");
    if (meta.etag) headers.set("etag", meta.etag);
    if (meta.lastModified) headers.set("last-modified", meta.lastModified.toUTCString());
    const remaining = Math.max(0, Math.floor(Number(e) - now()));
    headers.set("cache-control", options.cacheControl ?? `private, max-age=${Math.min(remaining, 3600)}`);
    const filename = scopeFilename(target.scope);
    if (filename !== undefined) headers.set("content-disposition", attachment(filename));
    if (range) {
      headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`);
      headers.set("content-length", String(range.length));
    } else {
      headers.set("content-length", String(meta.size));
    }
    return new Response(object ? object.body : null, { status: range ? 206 : 200, headers });
  };
}
