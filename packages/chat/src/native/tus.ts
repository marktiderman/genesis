/**
 * @feat:chat
 * Resumable uploads for the native outbox: Supabase Storage's TUS endpoint
 * (`/storage/v1/upload/resumable`), with the person's own token, so storage's
 * row level security (genesis_chat.can_upload) judges each file as it does a
 * plain upload. A dropped connection resumes from the last chunk the server
 * has (HEAD for the offset), within the session; a retry of the same file
 * reuses its path, so the message's attachment never points at a second copy.
 *
 *   <ChatProvider upload={createTusUpload({ supabaseUrl, userId, getAccessToken })} …>
 *
 * The path is `<conversation>/<uploader>/<uuid>.<ext>`, as `send_message`
 * expects; the upload finishes before the send (the outbox orders that).
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
  /** Reads a file URI into bytes. Default `fetch(uri).arrayBuffer()`. */
  readFile?: (uri: string) => Promise<ArrayBuffer>;
  fetch?: typeof fetch;
  chunkBytes?: number;
  /** Network failures retried per chunk before the send fails (it can be retried). Default 3. */
  retries?: number;
  /** A uuid for each file's name. Default core's `randomId` (crypto.randomUUID where there is one, else getRandomValues). */
  newId?: () => string;
  bucket?: string;
}

interface UploadRecord {
  path: string;
  location?: string;
  done?: boolean;
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

  async function headers(extra: Record<string, string> = {}) {
    const token = await options.getAccessToken();
    if (!token) throw new ChatError("Sign in to send files", "42501", "upload");
    return {
      authorization: `Bearer ${token}`,
      ...(options.apikey ? { apikey: options.apikey } : {}),
      "tus-resumable": "1.0.0",
      ...extra,
    };
  }

  async function bytesOf(file: LocalFile): Promise<ArrayBuffer> {
    if (typeof file.data === "string") return readFile(file.data);
    if (file.data instanceof ArrayBuffer) return file.data;
    return file.data.arrayBuffer();
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

  return async function upload(conversationId: string, file: LocalFile): Promise<string> {
    const ext = fileExtension(file.name, file.contentType);
    if (!isAllowedExtension(ext)) throw new ChatError(`Files of type .${ext} can't be sent`, "22023", "upload");
    let record = byFile.get(file);
    if (!record) {
      const userId = typeof options.userId === "function" ? options.userId() : options.userId;
      record = { path: `${conversationId}/${userId}/${newId()}.${ext}` };
    }
    byFile.set(file, record);
    if (record.done) return record.path;

    const bytes = new Uint8Array(await bytesOf(file));
    const rec = record;

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
    if (!rec.location) {
      const metadata = [
        `bucketName ${base64Utf8(bucket)}`,
        `objectName ${base64Utf8(rec.path)}`,
        `contentType ${base64Utf8(file.contentType)}`,
        `cacheControl ${base64Utf8("3600")}`,
      ].join(",");
      const created = await withRetry("upload", async () => {
        const res = await doFetch(endpoint, {
          method: "POST",
          headers: await headers({ "upload-length": String(bytes.byteLength), "upload-metadata": metadata, "x-upsert": "false" }),
        });
        // Already there: an earlier attempt finished but its answer was lost.
        if (res.status === 409) return null;
        if (res.status !== 201) return refuse(res, "upload");
        const location = res.headers.get("location");
        if (!location) throw new ChatError("The upload server gave no location", "22023", "upload");
        return new URL(location, endpoint).toString();
      });
      if (created === null) {
        rec.done = true;
        return rec.path;
      }
      rec.location = created;
      offset = 0;
    }

    while (offset < bytes.byteLength) {
      const from = offset;
      offset = await withRetry("upload", async () => {
        const res = await doFetch(rec.location!, {
          method: "PATCH",
          headers: await headers({ "upload-offset": String(from), "content-type": "application/offset+octet-stream" }),
          body: bytes.slice(from, Math.min(bytes.byteLength, from + chunk)).buffer as ArrayBuffer,
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
        return Number(res.headers.get("upload-offset") ?? from + chunk);
      });
    }
    rec.done = true;
    return rec.path;
  };
}
