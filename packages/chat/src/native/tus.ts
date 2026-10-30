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
 * The TUS protocol itself now lives in genesis-media-library
 * (`createSupabaseTusTransport`); this keeps chat's paths, file checks and
 * errors on top of it, with exactly the guarantees it had.
 */
import { createSupabaseTusTransport, TUS_CHUNK_BYTES as MEDIA_TUS_CHUNK_BYTES, base64Utf8 as mediaBase64Utf8, type TusRecord } from "@marktiderman/genesis-media-library/tus";
import { CHAT_BUCKET, ChatError } from "../core/client";
import { fileExtension, isAllowedExtension, randomId } from "../core/media";
import type { LocalFile } from "../core/outbox";

/**
 * Supabase requires 6 MB chunks for TUS (every chunk but the last).
 *
 * @deprecated Use `TUS_CHUNK_BYTES` from `@marktiderman/genesis-media-library/client`.
 */
export const TUS_CHUNK_BYTES = MEDIA_TUS_CHUNK_BYTES;

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

type UploadRecord = TusRecord;

/**
 * Base64 of a UTF-8 string, for TUS's Upload-Metadata (no `btoa`, which isn't on every Hermes build).
 *
 * @deprecated Use `base64Utf8` from `@marktiderman/genesis-media-library/client`.
 */
export const base64Utf8 = mediaBase64Utf8;

/**
 * @deprecated For new uploads, use genesis-media-library: `createUploader` (the resumable
 * protocol, through the app's upload route) or `createSupabaseTusTransport` from `/tus` (straight to
 * Supabase Storage). This stays, unchanged in behaviour, until the next major.
 */
export function createTusUpload(options: TusUploadOptions): (conversationId: string, file: LocalFile) => Promise<string> {
  const doFetch = options.fetch ?? fetch;
  const bucket = options.bucket ?? CHAT_BUCKET;
  const newId = options.newId ?? randomId;
  const readFile = options.readFile ?? (async (uri: string) => (await doFetch(uri)).arrayBuffer());
  // By file object: a retry of the same message in this session resumes it. Two messages never
  // share an object, so deleting one never breaks the other.
  const byFile = new WeakMap<LocalFile, UploadRecord>();

  async function headers(): Promise<Record<string, string>> {
    const token = await options.getAccessToken();
    if (!token) throw new ChatError("Sign in to send files", "42501", "upload");
    return {
      authorization: `Bearer ${token}`,
      ...(options.apikey ? { apikey: options.apikey } : {}),
    };
  }

  const transport = createSupabaseTusTransport({
    supabaseUrl: options.supabaseUrl,
    bucket,
    headers,
    fetch: doFetch,
    ...(options.chunkBytes ? { chunkBytes: options.chunkBytes } : {}),
    retries: options.retries ?? 3,
    // A network-ish failure is transient (no code); the rest are refusals, as chat has always told them.
    error: (message, failure, op) => new ChatError(message, failure === "transient" ? undefined : failure === "forbidden" ? "42501" : "22023", op),
    isPermanent: (e) => e instanceof ChatError && !e.transient,
  });

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
      return await send(file, record, source);
    } finally {
      source.close();
    }
  };

  async function send(file: LocalFile, rec: UploadRecord, source: Source): Promise<string> {
    // A 409 at a path whose object isn't there (another upload of it never finished): one new path.
    const renamePath = () => `${rec.path.slice(0, rec.path.lastIndexOf("/") + 1)}${newId()}.${rec.path.slice(rec.path.lastIndexOf(".") + 1)}`;
    return transport.send(rec, source, { contentType: file.contentType, cacheControl: "3600" }, renamePath);
  }

  return upload;
}
