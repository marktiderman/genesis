/**
 * ZIP bundles: a manifest the app stores (which files, under which names),
 * and a handler that streams them as one store-only ZIP, built on the fly
 * with `client-zip` (ZIP64 past 4 GB or 65,535 files). It reads one file at
 * a time as the download is read, so memory stays flat however big the set.
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
  /** Its path inside the ZIP (`photos/a1.jpg`): relative, no `.` or `..` segments, no backslash. */
  name: string;
  /** Its size in bytes. When every entry has one, the ZIP is sent with a `content-length`. */
  size?: number;
}

/**
 * A bundle as the app stores it (JSON), beside the media. Sign its link
 * with `mediaScope.bundle(manifest.id)`.
 *
 * @stability Experimental
 */
export interface ZipManifest {
  version: 1;
  /** Random and unguessable (128 bits, base64url). */
  id: string;
  /** The ZIP's download name; `.zip` is added when missing. */
  name: string;
  entries: ZipManifestEntry[];
  /** When the bundle stops downloading, in Unix seconds, whatever its links say. */
  expiresAt: number;
}

/** @stability Experimental */
export interface CreateZipManifestInput {
  name: string;
  entries: ZipManifestEntry[];
  /** A Date, or Unix seconds. */
  expiresAt: Date | number;
}

const ID = /^[A-Za-z0-9_-]{16,128}$/;

/** What is wrong with an entry name, or undefined. Unsafe names would write outside the folder they're unzipped into. */
function nameProblem(name: unknown): string | undefined {
  if (typeof name !== "string" || name === "") return "is empty";
  if (name.length > 1024) return "is longer than 1024 characters";
  if (/[\\\0]/.test(name) || /[\x00-\x1f]/.test(name)) return "holds a backslash or a control character";
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return "is absolute";
  if (name.split("/").some((s) => s === "" || s === "." || s === "..")) return "has an empty, . or .. segment";
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
  if (typeof m!.name !== "string" || !m!.name.trim()) fail("the name is empty");
  if (typeof m!.expiresAt !== "number" || !Number.isFinite(m!.expiresAt)) fail("expiresAt must be Unix seconds");
  if (!Array.isArray(m!.entries) || m!.entries.length === 0) fail("there are no entries");
  const seen = new Set<string>();
  for (const [i, entry] of m!.entries!.entries()) {
    if (!entry || typeof entry.key !== "string" || entry.key === "") fail(`entry ${i} has no key`);
    const problem = nameProblem(entry.name);
    if (problem) fail(`entry ${i}'s name ${problem}`);
    if (seen.has(entry.name)) fail(`two entries are named ${JSON.stringify(entry.name)}`);
    seen.add(entry.name);
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
 * Throws a TypeError for an unsafe or duplicate entry name.
 *
 * @stability Experimental
 */
export function createZipManifest(input: CreateZipManifestInput): ZipManifest {
  const expiresAt = input.expiresAt instanceof Date ? Math.floor(input.expiresAt.getTime() / 1000) : input.expiresAt;
  return checkManifest({
    version: 1,
    id: randomId(),
    name: input.name,
    entries: input.entries.map((e) => (e.size === undefined ? { key: e.key, name: e.name } : { key: e.key, name: e.name, size: e.size })),
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
 * for `mediaScope.bundle(id)` (403 otherwise), and the manifest must exist
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
    if (!id || !ID.test(id)) return notFound();
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
    headers.set("content-disposition", attachment(/\.zip$/i.test(manifest.name) ? manifest.name : `${manifest.name}.zip`));
    headers.set("cache-control", "no-store");
    const sized = manifest.entries.every((e) => e.size !== undefined);
    if (sized) headers.set("content-length", String(predictLength(manifest.entries.map((e) => ({ name: e.name, size: e.size! })))));
    if (request.method === "HEAD") return new Response(null, { headers });

    async function* files() {
      for (const entry of manifest.entries) {
        const object = await storage.get(entry.key);
        if (!object) throw new Error(`bundle ${id}: ${entry.key} is missing.`);
        if (entry.size !== undefined && object.size !== entry.size) {
          await object.body.cancel();
          throw new Error(`bundle ${id}: ${entry.key} is ${object.size} bytes, not ${entry.size}.`);
        }
        yield { name: entry.name, input: object.body, size: object.size, lastModified: object.lastModified ?? new Date(manifest.expiresAt * 1000) };
      }
    }
    // client-zip passes a cancel (the download was abandoned) into the source with `throw`; end the
    // source quietly instead, so cancelling resolves and no further file is opened.
    const source = files();
    const quiet = {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: () => source.next(),
      throw: () => source.return(undefined),
    };
    return new Response(makeZip(quiet, { buffersAreUTF8: true }), { headers });
  };
}
