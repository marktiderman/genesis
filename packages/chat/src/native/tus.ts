/**
 * @feat:chat
 * Resumable uploads for the native outbox: Supabase Storage's TUS endpoint
 * (`/storage/v1/upload/resumable`), with the person's own token, so storage's
 * row level security (genesis_chat.can_upload) judges each file as it does a
 * plain upload. A dropped connection resumes from the last chunk the server
 * has (HEAD for the offset), within the session; a retry of the same file
 * reuses its path, so the message's attachment never points at a second copy.
 * A file on the phone is read one chunk at a time when the app gives
 * `openFile` (a 100 MB video never sits whole in memory); without it, it is
 * read whole. A create the server refuses as already there (409) counts as
 * done only when the object is really there.
 *
 *   <ChatProvider upload={createTusUpload({ supabaseUrl, userId, getAccessToken })} …>
 *
 * The path is `<conversation>/<uploader>/<uuid>.<ext>`, as `send_message`
 * expects; the upload finishes before the send (the outbox orders that).
 *
 * What moves the bytes is a port (`transport`): this file's own TUS client by
 * default, or any `TusTransport`, such as genesis-media-library's `/chat`
 * adapter. chat's paths, file checks and errors stay here either way.
 */
import { CHAT_BUCKET, ChatError } from "../core/client";
import { fileExtension, isAllowedExtension, randomId } from "../core/media";
import type { LocalFile } from "../core/outbox";

/** Supabase requires 6 MB chunks for TUS (every chunk but the last). */
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

export interface TusUploadOptions {
  /** The project URL (`https://<ref>.supabase.co`, or the local stack's). */
  supabaseUrl: string;
  /** The signed-in user's id (auth.users), the second folder of the path. */
  userId: string | (() => string);
  /** The signed-in user's access token (`(await supabase.auth.getSession()).data.session?.access_token`). */
  getAccessToken: () => Promise<string | null | undefined>;
  /** The publishable key, sent as `apikey` (the API gateway asks for it on hosted projects). */
  apikey?: string;
  /**
   * Opens a file URI for reading one chunk at a time (expo-file-system's `new File(uri).open()`),
   * so a big video is never read whole into memory. Without it, `readFile` reads the whole file.
   */
  openFile?: (uri: string) => Promise<TusFileHandle> | TusFileHandle;
  /** Reads a file URI into bytes, whole: used without `openFile`. Default `fetch(uri).arrayBuffer()`. */
  readFile?: (uri: string) => Promise<ArrayBuffer>;
  fetch?: typeof fetch;
  chunkBytes?: number;
  /** Network failures retried per chunk before the send fails (it can be retried). Default 3. */
  retries?: number;
  /** A uuid for each file's name. Default core's `randomId` (crypto.randomUUID where there is one, else getRandomValues). */
  newId?: () => string;
  bucket?: string;
  /**
   * What sends the bytes. Default: Supabase Storage's TUS endpoint, built in (with `fetch`,
   * `chunkBytes` and `retries` above). An app opts into another by passing it here.
   */
  transport?: TusTransport;
}

/**
 * Where one file's upload stands: its path and, once the TUS upload is made,
 * where it lives. A transport keeps it current, so a retry of the same file
 * resumes rather than starting again.
 */
export interface TusUploadRecord {
  path: string;
  location?: string | undefined;
  done?: boolean | undefined;
}

/** What a transport reads a file's bytes from: exactly `from` to `to`. */
export interface TusUploadSource {
  size: number;
  read(from: number, to: number): Promise<ArrayBuffer>;
}

/** What a transport is told about the file it sends. */
export interface TusSendInfo {
  bucket: string;
  contentType: string;
  cacheControl: string;
  /** The person's headers (`authorization`, and `apikey` when given). Rejects when they're signed out. */
  headers: () => Promise<Record<string, string>>;
}

/**
 * The upload port: what moves a file's bytes to `record.path` in `info.bucket`.
 * It resolves to the path the object ended at; `renamePath()` gives a fresh
 * one (ask it at most once) when the path is taken by a send that never
 * finished. A rejection whose `failure` is `"forbidden"` or `"invalid"`, or a
 * `ChatError` that isn't transient, is a refusal; anything else is worth
 * trying again.
 */
export interface TusTransport {
  send(record: TusUploadRecord, source: TusUploadSource, info: TusSendInfo, renamePath: () => string): Promise<string>;
}

/** An open file, read a chunk at a time. */
export interface TusFileHandle {
  /** Bytes in the file. */
  size: number;
  /** Up to `length` bytes from `offset`. */
  read(offset: number, length: number): Promise<ArrayBuffer | Uint8Array>;
  close?(): void;
}

/** What upload reads its bytes from: the file in chunks, or bytes already in memory. */
interface Source {
  size: number;
  read(from: number, to: number): Promise<ArrayBuffer>;
  close(): void;
}

const exact = (bytes: ArrayBuffer | Uint8Array): ArrayBuffer =>
  bytes instanceof ArrayBuffer ? bytes : (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

const inMemory = (buffer: ArrayBuffer): Source => ({ size: buffer.byteLength, read: async (from, to) => buffer.slice(from, to), close: () => undefined });

type UploadRecord = TusUploadRecord;

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

export function createTusUpload(options: TusUploadOptions): (conversationId: string, file: LocalFile) => Promise<string> {
  const doFetch = options.fetch ?? fetch;
  const chunk = options.chunkBytes ?? TUS_CHUNK_BYTES;
  const retries = options.retries ?? 3;
  const bucket = options.bucket ?? CHAT_BUCKET;
  const endpoint = `${options.supabaseUrl.replace(/\/+$/, "")}/storage/v1/upload/resumable`;
  const newId = options.newId ?? randomId;
  const readFile = options.readFile ?? (async (uri: string) => (await doFetch(uri)).arrayBuffer());
  // By file object: a retry of the same message in this session resumes it. Two messages never
  // share an object, so deleting one never breaks the other.
  const byFile = new WeakMap<LocalFile, UploadRecord>();

  async function auth(): Promise<Record<string, string>> {
    const token = await options.getAccessToken();
    if (!token) throw new ChatError("Sign in to send files", "42501", "upload");
    return {
      authorization: `Bearer ${token}`,
      ...(options.apikey ? { apikey: options.apikey } : {}),
    };
  }

  async function headers(extra: Record<string, string> = {}) {
    return { ...(await auth()), "tus-resumable": "1.0.0", ...extra };
  }

  const renamePath = (rec: UploadRecord) => `${rec.path.slice(0, rec.path.lastIndexOf("/") + 1)}${newId()}.${rec.path.slice(rec.path.lastIndexOf(".") + 1)}`;

  /** Sends through the app's own transport, with chat's errors whatever it throws. */
  async function sendThrough(transport: TusTransport, file: LocalFile, rec: UploadRecord, source: Source): Promise<string> {
    try {
      const path = await transport.send(rec, source, { bucket, contentType: file.contentType, cacheControl: "3600", headers: auth }, () => renamePath(rec));
      rec.path = path;
      rec.done = true;
      return path;
    } catch (e) {
      if (e instanceof ChatError) throw e;
      const failure = typeof e === "object" && e !== null ? (e as { failure?: unknown }).failure : undefined;
      // A refusal keeps its kind; anything else (the network) is transient, so the outbox retries it.
      throw new ChatError(e instanceof Error ? e.message : String(e), failure === "forbidden" ? "42501" : failure === "invalid" ? "22023" : undefined, "upload");
    }
  }

  async function sourceOf(file: LocalFile): Promise<Source> {
    const data = file.data;
    if (typeof data === "string") {
      if (!options.openFile) return inMemory(await readFile(data));
      const handle = await options.openFile(data);
      if (!Number.isFinite(handle.size) || handle.size <= 0) {
        try {
          handle.close?.();
        } catch {
          // Already closed.
        }
        throw new ChatError(`${file.name} can't be read on this device`, "22023", "upload");
      }
      return {
        size: handle.size,
        read: async (from, to) => {
          const bytes = await handle.read(from, to - from).catch((e: unknown) => {
            throw new ChatError(`${file.name} can't be read on this device${e instanceof Error ? `: ${e.message}` : ""}`, "22023", "upload");
          });
          // A short read would send a hole in the file: fail instead.
          if (bytes.byteLength !== to - from) throw new ChatError(`${file.name} changed while it was sent`, "22023", "upload");
          return exact(bytes);
        },
        close: () => {
          try {
            handle.close?.();
          } catch {
            // Already closed.
          }
        },
      };
    }
    if (data instanceof ArrayBuffer) return inMemory(data);
    return { size: data.size, read: (from, to) => data.slice(from, to).arrayBuffer(), close: () => undefined };
  }

  /**
   * Whether the object is really in the bucket (a 409 on create says so, and may be wrong).
   * Storage answers a missing object with 400 (or 404); a refusal is a refusal, anything else is
   * asked again.
   */
  async function objectExists(path: string): Promise<boolean> {
    const base = options.supabaseUrl.replace(/\/+$/, "");
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const res = await doFetch(`${base}/storage/v1/object/authenticated/${bucket}/${encoded}`, { method: "HEAD", headers: await headers() });
    if (res.ok) return true;
    if (res.status === 400 || res.status === 404) return false;
    return refuse(res, "upload");
  }

  async function withRetry<T>(op: string, run: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await run();
      } catch (e) {
        last = e;
        if (e instanceof ChatError && !e.transient) throw e;
        await new Promise((r) => setTimeout(r, Math.min(4000, 250 * 2 ** attempt)));
      }
    }
    throw last instanceof ChatError ? last : new ChatError(last instanceof Error ? last.message : String(last), undefined, op);
  }

  const refuse = async (res: Response, op: string): Promise<never> => {
    const text = await res.text().catch(() => "");
    // A network-ish status is transient (no code); the rest are refusals.
    throw new ChatError(text || `Upload failed (${res.status})`, transientStatus(res.status) ? undefined : res.status === 403 || res.status === 401 ? "42501" : "22023", op);
  };

  async function upload(conversationId: string, file: LocalFile): Promise<string> {
    const ext = fileExtension(file.name, file.contentType);
    if (!isAllowedExtension(ext)) throw new ChatError(`Files of type .${ext} can't be sent`, "22023", "upload");
    let record = byFile.get(file);
    if (!record) {
      const userId = typeof options.userId === "function" ? options.userId() : options.userId;
      record = { path: `${conversationId}/${userId}/${newId()}.${ext}` };
    }
    byFile.set(file, record);
    if (record.done) return record.path;

    const source = await sourceOf(file);
    try {
      return await (options.transport ? sendThrough(options.transport, file, record, source) : send(file, record, source));
    } finally {
      source.close();
    }
  };

  async function send(file: LocalFile, rec: UploadRecord, source: Source): Promise<string> {
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
    // A 409 at a path whose object isn't there (another upload of it never finished): one new path.
    let fresh = false;
    while (!rec.location) {
      const metadata = [
        `bucketName ${base64Utf8(bucket)}`,
        `objectName ${base64Utf8(rec.path)}`,
        `contentType ${base64Utf8(file.contentType)}`,
        `cacheControl ${base64Utf8("3600")}`,
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
        if (!location) throw new ChatError("The upload server gave no location", "22023", "upload");
        return new URL(location, endpoint).toString();
      });
      if (created === "done") {
        rec.done = true;
        return rec.path;
      }
      if (created === "conflict") {
        if (fresh) throw new ChatError("The upload is out of step", undefined, "upload");
        fresh = true;
        rec.path = renamePath(rec);
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
          if (!head.ok || !Number.isFinite(at) || at === from) throw new ChatError("The upload is out of step", undefined, "upload");
          return at;
        }
        if (res.status !== 204 && !res.ok) return refuse(res, "upload");
        return Number(res.headers.get("upload-offset") ?? from + body.byteLength);
      });
    }
    rec.done = true;
    return rec.path;
  }

  return upload;
}
