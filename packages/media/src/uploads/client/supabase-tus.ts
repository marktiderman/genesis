/**
 * Supabase Storage's resumable endpoint (TUS) as an upload transport, with
 * the person's own token, so storage's row level security judges each file
 * as it does a plain upload. TUS is its own transport, not a target that
 * speaks the part protocol: offsets are sequential (one PATCH at a time, in
 * order), chunks are a fixed 6 MiB (every one but the last), there is no
 * part list and no fan-out, and Supabase's upload URL lapses after 24 hours,
 * after which a send starts again. genesis-chat keeps its own copy of this
 * client in `createTusUpload` (chat never depends on genesis-media), so a fix
 * to one belongs in both; an app may pass this one as chat's `transport`.
 */

/** Supabase requires 6 MiB chunks for TUS (every chunk but the last). */
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

/** How a failure counts: retried (`transient`), or a refusal (`forbidden`, `invalid`). */
export type TusFailure = "transient" | "forbidden" | "invalid";

/** What a TUS send reads its bytes from. */
export interface TusSource {
  size: number;
  /** Bytes `from` to `to`, exactly. */
  read(from: number, to: number): Promise<ArrayBuffer>;
}

/** One object's send: its path, and where its TUS upload lives once made. Keep it to resume. */
export interface TusRecord {
  path: string;
  location?: string | undefined;
  done?: boolean | undefined;
}

/** @stability Experimental */
export interface SupabaseTusOptions {
  /** The project URL (`https://<ref>.supabase.co`, or the local stack's). */
  supabaseUrl: string;
  bucket: string;
  /** Headers for every request: the person's `authorization` (and `apikey`). May throw a refusal (signed out). */
  headers: () => Promise<Record<string, string>>;
  fetch?: typeof fetch;
  chunkBytes?: number;
  /** Network failures retried per request before the send fails. Default 3. */
  retries?: number;
  /** Makes the errors this throws (genesis-chat makes `ChatError`s). Default `TusError`. */
  error?: (message: string, failure: TusFailure, op: string) => Error;
  /** Whether an error (yours or this transport's) must not be retried. Default: a `TusError` that isn't transient. */
  isPermanent?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

/** A TUS failure: `failure` says whether it is worth trying again. */
export class TusError extends Error {
  readonly failure: TusFailure;
  constructor(message: string, failure: TusFailure) {
    super(message);
    this.name = "TusError";
    this.failure = failure;
  }
}

/** Base64 of a UTF-8 string, for TUS's Upload-Metadata (no `btoa`, which isn't on every Hermes build). */
export function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += A[(n >> 18) & 63]! + A[(n >> 12) & 63]! + (i + 1 < bytes.length ? A[(n >> 6) & 63]! : "=") + (i + 2 < bytes.length ? A[n & 63]! : "=");
  }
  return out;
}

const transientStatus = (status: number) => status === 0 || status === 408 || status === 429 || status >= 500;

/** @stability Experimental */
export function createSupabaseTusTransport(options: SupabaseTusOptions) {
  const doFetch = options.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const chunk = options.chunkBytes ?? TUS_CHUNK_BYTES;
  const retries = options.retries ?? 3;
  const base = options.supabaseUrl.replace(/\/+$/, "");
  const endpoint = `${base}/storage/v1/upload/resumable`;
  const made = new WeakSet<object>();
  const makeError = (message: string, failure: TusFailure, op: string) => {
    const e = options.error ? options.error(message, failure, op) : new TusError(message, failure);
    made.add(e);
    return e;
  };
  const isPermanent = options.isPermanent ?? ((e: unknown) => e instanceof TusError && e.failure !== "transient");
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const headers = async (extra: Record<string, string> = {}) => ({ ...(await options.headers()), "tus-resumable": "1.0.0", ...extra });

  const refuse = async (res: Response, op: string): Promise<never> => {
    const text = await res.text().catch(() => "");
    // A network-ish status is transient; the rest are refusals.
    throw makeError(text || `Upload failed (${res.status})`, transientStatus(res.status) ? "transient" : res.status === 403 || res.status === 401 ? "forbidden" : "invalid", op);
  };

  async function withRetry<T>(op: string, run: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await run();
      } catch (e) {
        last = e;
        if (isPermanent(e)) throw e;
        await sleep(Math.min(4000, 250 * 2 ** attempt));
      }
    }
    // Out of tries: this transport's own error as it is; anything else (the network) as a transient one.
    throw typeof last === "object" && last !== null && made.has(last) ? last : makeError(last instanceof Error ? last.message : String(last), "transient", op);
  }

  /**
   * Whether the object is really in the bucket (a 409 on create says so, and may be wrong).
   * Storage answers a missing object with 400 (or 404); a refusal is a refusal, anything else is
   * asked again.
   */
  async function objectExists(path: string): Promise<boolean> {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const res = await doFetch(`${base}/storage/v1/object/authenticated/${options.bucket}/${encoded}`, { method: "HEAD", headers: await options.headers() });
    if (res.ok) return true;
    if (res.status === 400 || res.status === 404) return false;
    return refuse(res, "upload");
  }

  /**
   * Sends `source` to `record.path`, creating the TUS upload once and
   * resuming from the server's offset after a failure. `renamePath` gives a
   * fresh path when the server says the path is taken but no object is there
   * (another send of it never finished); it is asked at most once. Returns
   * the path the object ended at.
   */
  async function send(record: TusRecord, source: TusSource, meta: { contentType: string; cacheControl?: string }, renamePath: () => string): Promise<string> {
    const rec = record;
    const length = source.size;
    // Create the upload (once), or find how far an earlier attempt got.
    let offset = 0;
    if (rec.location) {
      offset = await withRetry("upload", async () => {
        const res = await doFetch(rec.location!, { method: "HEAD", headers: await headers() });
        if (res.status === 404 || res.status === 410) {
          rec.location = undefined;
          return 0;
        }
        if (!res.ok) return refuse(res, "upload");
        return Number(res.headers.get("upload-offset") ?? 0);
      });
    }
    let fresh = false;
    while (!rec.location) {
      const metadata = [
        `bucketName ${base64Utf8(options.bucket)}`,
        `objectName ${base64Utf8(rec.path)}`,
        `contentType ${base64Utf8(meta.contentType)}`,
        `cacheControl ${base64Utf8(meta.cacheControl ?? "3600")}`,
      ].join(",");
      const created = await withRetry("upload", async () => {
        const res = await doFetch(endpoint, {
          method: "POST",
          headers: await headers({ "upload-length": String(length), "upload-metadata": metadata, "x-upsert": "false" }),
        });
        // Already there, says the server: an earlier attempt finished but its answer was lost, or
        // another upload of this path is under way. Only the object itself settles which.
        if (res.status === 409) return (await objectExists(rec.path)) ? "done" : "conflict";
        if (res.status !== 201) return refuse(res, "upload");
        const location = res.headers.get("location");
        if (!location) throw makeError("The upload server gave no location", "invalid", "upload");
        return new URL(location, endpoint).toString();
      });
      if (created === "done") {
        rec.done = true;
        return rec.path;
      }
      if (created === "conflict") {
        if (fresh) throw makeError("The upload is out of step", "transient", "upload");
        fresh = true;
        rec.path = renamePath();
        continue;
      }
      rec.location = created;
      offset = 0;
    }

    while (offset < length) {
      const from = offset;
      const body = await source.read(from, Math.min(length, from + chunk));
      offset = await withRetry("upload", async () => {
        const res = await doFetch(rec.location!, {
          method: "PATCH",
          headers: await headers({ "upload-offset": String(from), "content-type": "application/offset+octet-stream" }),
          body,
        });
        if (res.status === 409) {
          // Out of step (an earlier chunk did land): ask where the server is.
          const head = await doFetch(rec.location!, { method: "HEAD", headers: await headers() });
          const at = Number(head.headers.get("upload-offset"));
          // No answer: a transient failure, so the backoff applies before the next try.
          if (!head.ok || !Number.isFinite(at) || at === from) throw makeError("The upload is out of step", "transient", "upload");
          return at;
        }
        if (res.status !== 204 && !res.ok) return refuse(res, "upload");
        return Number(res.headers.get("upload-offset") ?? from + body.byteLength);
      });
    }
    rec.done = true;
    return rec.path;
  }

  return { send, objectExists };
}
