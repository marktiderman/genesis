/**
 * ZIP bundles: a manifest the app stores (which files, under which paths),
 * and a handler that streams them as one store-only ZIP, built on the fly
 * with `client-zip` (ZIP64 past 4 GB). It reads one file at a time as the
 * download is read, so memory stays flat however big the set. A bundle
 * holds at most 65,535 files.
 */
import { makeZip, predictLength } from "client-zip";
import { attachment, baseHeaders, forbidden, methodNotAllowed, notFound, pathSegments, plain } from "./http";
import { mediaScope } from "./scope";
import type { MediaSigner } from "./signer";
import type { MediaStorage } from "./storage";

/** One file in a bundle. */
export interface ZipManifestEntry {
  /** The storage key. */
  key: string;
  /**
   * Its path inside the ZIP (`photos/a1.jpg`), safe to unzip on any system:
   * relative; no `.`, `..` or empty segments; none of `\ : < > | ? * "`, no
   * control character or DEL; no segment ending in a dot or a space, or named
   * like a Windows device (`CON`, `nul.txt`, `COM1`…). Unique ignoring case
   * (after NFC), and never both a file and a folder (`a` and `a/b`).
   */
  path: string;
  /** Its size in bytes. When every entry has one, the ZIP is sent with a `content-length`. */
  size?: number;
}

/**
 * A bundle as the app stores it (JSON, format version 1), beside the media.
 * Sign its link with `mediaScope.bundle(manifest.id)`.
 *
 * @stability Experimental
 */
export interface ZipManifest {
  version: 1;
  /** Random and unguessable (128 bits, base64url). */
  id: string;
  /** The ZIP's download filename; `.zip` is added when missing. */
  filename: string;
  /** At most `MAX_ZIP_ENTRIES`. */
  entries: ZipManifestEntry[];
  /** When the bundle stops downloading, in Unix seconds, whatever its links say. */
  expiresAt: number;
}

/** @stability Experimental */
export interface CreateZipManifestInput {
  filename: string;
  entries: ZipManifestEntry[];
  /** A Date, or Unix seconds. */
  expiresAt: Date | number;
}

/**
 * The most files a bundle holds. `client-zip` 2.5.1 writes the entry count
 * into 16 bits without a ZIP64 count, so more would make a broken ZIP.
 */
export const MAX_ZIP_ENTRIES = 65_535;

const ID = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** What is wrong with an entry path, or undefined. Unsafe paths would write outside the folder they're unzipped into, or fail to unzip on Windows. */
function pathProblem(path: unknown): string | undefined {
  if (typeof path !== "string" || path === "") return "is empty";
  if (path.length > 1024) return "is longer than 1024 characters";
  if (/[\x00-\x1f\x7f]/.test(path)) return "holds a control character";
  if (/[\\:<>|?*"]/.test(path)) return 'holds one of \\ : < > | ? * "';
  if (path.startsWith("/")) return "is absolute";
  for (const segment of path.split("/")) {
    if (segment === "" || segment === "." || segment === "..") return "has an empty, . or .. segment";
    if (/[. ]$/.test(segment)) return "has a segment ending in a dot or a space";
    if (DEVICE.test(segment)) return `has a segment named like a Windows device (${segment})`;
  }
  return undefined;
}

/** The manifest, checked, or a TypeError saying what is wrong. Manifests read back from storage go through it too. */
function checkManifest(value: unknown): ZipManifest {
  const m = value as Partial<ZipManifest> | null;
  const fail = (why: string): never => {
    throw new TypeError(`ZIP manifest: ${why}.`);
  };
  if (!m || typeof m !== "object") fail("not an object");
  if (m!.version !== 1) fail("unknown version");
  if (typeof m!.id !== "string" || !ID.test(m!.id)) fail("the id must be 16 to 128 base64url characters");
  if (typeof m!.filename !== "string" || !m!.filename.trim()) fail("the filename is empty");
  if (typeof m!.expiresAt !== "number" || !Number.isFinite(m!.expiresAt)) fail("expiresAt must be Unix seconds");
  if (!Array.isArray(m!.entries) || m!.entries.length === 0) fail("there are no entries");
  if (m!.entries!.length > MAX_ZIP_ENTRIES) fail(`there are ${m!.entries!.length} entries; a bundle holds at most ${MAX_ZIP_ENTRIES}`);
  // Folded as an unzip tool on a case-insensitive disk would see them.
  const fold = (p: string) => p.normalize("NFC").toLowerCase();
  const files = new Set<string>();
  const folders = new Set<string>();
  for (const [i, entry] of m!.entries!.entries()) {
    if (!entry || typeof entry.key !== "string" || entry.key === "") fail(`entry ${i} has no key`);
    const problem = pathProblem(entry.path);
    if (problem) fail(`entry ${i}'s path ${problem}`);
    const folded = fold(entry.path);
    if (files.has(folded)) fail(`two entries have the path ${JSON.stringify(entry.path)} (ignoring case)`);
    if (folders.has(folded)) fail(`${JSON.stringify(entry.path)} is both a file and a folder`);
    const parts = folded.split("/");
    for (let n = 1; n < parts.length; n++) {
      const folder = parts.slice(0, n).join("/");
      if (files.has(folder)) fail(`${JSON.stringify(folder)} is both a file and a folder`);
      folders.add(folder);
    }
    files.add(folded);
    if (entry.size !== undefined && (!Number.isSafeInteger(entry.size) || entry.size < 0)) fail(`entry ${i}'s size isn't a whole number of bytes`);
  }
  return m as ZipManifest;
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A new bundle manifest with a random id. Store it as JSON where
 * `readManifest` finds it, then sign `mediaScope.bundle(manifest.id)`.
 * Throws a TypeError for an unsafe or duplicate entry path, or more than
 * `MAX_ZIP_ENTRIES` entries.
 *
 * @stability Experimental
 */
export function createZipManifest(input: CreateZipManifestInput): ZipManifest {
  const expiresAt = input.expiresAt instanceof Date ? Math.floor(input.expiresAt.getTime() / 1000) : input.expiresAt;
  return checkManifest({
    version: 1,
    id: randomId(),
    filename: input.filename,
    entries: input.entries.map((e) => (e.size === undefined ? { key: e.key, path: e.path } : { key: e.key, path: e.path, size: e.size })),
    expiresAt,
  });
}

/** @stability Experimental */
export interface BundleHandlerOptions {
  storage: MediaStorage;
  signer: MediaSigner;
  /** The stored manifest for an id (parsed JSON), or null. */
  readManifest: (id: string) => Promise<unknown>;
  /** The time, in Unix seconds. Default the clock. */
  now?: (() => number) | undefined;
}

/**
 * A request handler that streams a bundle as a ZIP. The manifest id is the
 * `id` argument, or else the path's last segment; the link must be signed
 * for `mediaScope.bundle(id)` (403 otherwise, a malformed id included), and the manifest must exist
 * and not have expired (404). A file that has gone missing, or whose size
 * no longer matches the manifest, ends the stream with an error, so the
 * download fails rather than arriving incomplete.
 *
 * ```ts
 * const bundles = createBundleHandler({ storage, signer,
 *   readManifest: async (id) => (await env.BUCKET.get(`bundles/${id}.json`))?.json() ?? null });
 * ```
 *
 * @stability Experimental
 */
export function createBundleHandler(options: BundleHandlerOptions): (request: Request, id?: string) => Promise<Response> {
  const { storage, signer, readManifest } = options;
  const now = options.now ?? (() => Date.now() / 1000);
  return async (request, given) => {
    if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed();
    const url = new URL(request.url);
    const id = given ?? pathSegments(url)?.at(-1);
    if (!id || !ID.test(id)) return forbidden();
    const token = { e: url.searchParams.get("e"), s: url.searchParams.get("s"), k: url.searchParams.get("k") };
    if (!(await signer.verify(mediaScope.bundle(id), token))) return forbidden();

    const stored = await readManifest(id);
    if (stored === null || stored === undefined) return notFound();
    let manifest: ZipManifest;
    try {
      manifest = checkManifest(stored);
    } catch {
      return plain(500, "This bundle can't be read.");
    }
    if (manifest.id !== id || manifest.expiresAt <= now()) return notFound();

    const headers = baseHeaders();
    headers.set("content-type", "application/zip");
    headers.set("content-disposition", attachment(/\.zip$/i.test(manifest.filename) ? manifest.filename : `${manifest.filename}.zip`));
    headers.set("cache-control", "no-store");
    headers.set("accept-ranges", "none");
    // The exact length, when every size is known. It holds only while predictLength and makeZip agree
    // byte for byte on the same input (same names, sizes and options), which is why client-zip is pinned
    // to one version and both are given the same `path` strings; the bundle test compares the two.
    const sized = manifest.entries.every((e) => e.size !== undefined);
    if (sized) headers.set("content-length", String(predictLength(manifest.entries.map((e) => ({ name: e.path, size: e.size! })))));
    if (request.method === "HEAD") return new Response(null, { headers });

    // The file being read, so a cancelled download also cancels its read from storage.
    let reading: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const handOver = (body: ReadableStream<Uint8Array>) => {
      const reader = body.getReader();
      reading = reader;
      return new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            const { done, value } = await reader.read();
            if (done) {
              if (reading === reader) reading = undefined;
              controller.close();
            } else controller.enqueue(value);
          },
          cancel: (reason) => reader.cancel(reason),
        },
        { highWaterMark: 0 },
      );
    };
    async function* files() {
      for (const entry of manifest.entries) {
        const object = await storage.get(entry.key);
        if (!object) throw new Error(`bundle ${id}: ${entry.key} is missing.`);
        if (entry.size !== undefined && object.size !== entry.size) {
          await object.body.cancel();
          throw new Error(`bundle ${id}: ${entry.key} is ${object.size} bytes, not ${entry.size}.`);
        }
        yield { name: entry.path, input: handOver(object.body), size: object.size, lastModified: object.lastModified ?? new Date(manifest.expiresAt * 1000) };
      }
    }
    // client-zip passes a cancel (the download was abandoned) into the source with `throw`. Cancel the
    // read in progress, then end the source quietly, so cancelling resolves and no further file is opened.
    const source = files();
    const quiet = {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: () => source.next(),
      throw: async (reason?: unknown) => {
        const current = reading;
        reading = undefined;
        await current?.cancel(reason).catch(() => {});
        return source.return(undefined);
      },
    };
    return new Response(makeZip(quiet, { buffersAreUTF8: true }), { headers });
  };
}
