/**
 * @feat:chat
 * Sending a recorded video. With `ChatProvider videoUpload` (Mux direct uploads) the
 * recording goes to the URL the server mints, in chunks, resumably: each chunk is a PUT with
 * `Content-Range`, the server answers 308 with how much it has, and after a dropped
 * connection the next attempt asks (`Content-Range: bytes * /total`) and carries on from there.
 * That is the resumable protocol Mux direct uploads speak (Google Cloud Storage's, the one
 * Mux's UpChunk uses); it is not TUS, so `createTusUpload` doesn't apply. Once the bytes are
 * there, the message is sent through the outbox with `{ kind: "video", provider, providerId,
 * status: "pending" }` (the server minted the passthrough; the client sends no attachment id),
 * and Mux's webhook marks it ready. Without `videoUpload`, the recording goes through the
 * outbox as a file, to storage, like a picked video.
 *
 * The upload is minted when recording starts (`prepare`), so the bytes can go the moment the
 * recording stops: expo-camera hands over the file only then, so it can't stream while it
 * records. Uploads in flight live here, outside any screen, keyed by conversation: leaving the
 * thread doesn't stop one, and coming back shows it.
 */
import { useSyncExternalStore } from "react";
import { ChatError } from "../core/client";
import type { LocalFile } from "../core/outbox";
import type { AttachmentInput, SendInput } from "../core/types";
import type { ChatVideoUpload } from "../react/index";
import type { ChunkFileLike } from "./modules";

/** 8 MiB: a multiple of 256 KiB, as resumable uploads require for every chunk but the last. */
export const VIDEO_CHUNK_BYTES = 8 * 1024 * 1024;

/** What an upload reads: a file a chunk at a time, or bytes in memory. */
export interface ByteSource {
  size: number;
  read(from: number, to: number): Promise<ArrayBuffer>;
  close(): void;
}

const exact = (bytes: ArrayBuffer | Uint8Array): ArrayBuffer =>
  bytes instanceof ArrayBuffer ? bytes : (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

/** Opens a file URI for upload: in chunks with `openFile` (expo-file-system), else read whole through fetch. */
export async function fileSource(uri: string, openFile?: (uri: string) => Promise<ChunkFileLike> | ChunkFileLike, doFetch: typeof fetch = fetch): Promise<ByteSource> {
  if (openFile) {
    const handle = await openFile(uri);
    if (!Number.isFinite(handle.size) || handle.size <= 0) {
      try {
        handle.close?.();
      } catch {
        // Already closed.
      }
      throw new ChatError("The recording is empty", "22023", "upload");
    }
    return {
      size: handle.size,
      read: async (from, to) => {
        const bytes = exact(await handle.read(from, to - from));
        if (bytes.byteLength !== to - from) throw new ChatError("The recording changed while it was sent", "22023", "upload");
        return bytes;
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
  const buffer = await (await doFetch(uri)).arrayBuffer();
  if (buffer.byteLength === 0) throw new ChatError("The recording is empty", "22023", "upload");
  return { size: buffer.byteLength, read: async (from, to) => buffer.slice(from, to), close: () => undefined };
}

export interface ChunkedPutOptions {
  url: string;
  contentType: string;
  source: ByteSource;
  fetch?: typeof fetch;
  chunkBytes?: number;
  /** Network failures retried per chunk before it fails (the person can Retry). Default 4. */
  retries?: number;
  /** Bytes the server has, after each chunk. */
  onProgress?: (sent: number, total: number) => void;
  /** Stops between requests (Cancel). */
  isCancelled?: () => boolean;
  /** Ask the server where it is before sending anything (a Retry of an upload that got partway). */
  resume?: boolean;
  /** For tests. */
  sleep?: (ms: number) => Promise<void>;
}

const DONE = new Set([200, 201, 202, 204]);
const transient = (status: number) => status === 0 || status === 408 || status === 429 || status >= 500;

/** The next byte the server wants, from a 308's `Range: bytes=0-N` (none: it has nothing yet). */
export function nextOffset(range: string | null | undefined): number {
  const m = /bytes=(\d+)-(\d+)/.exec(range ?? "");
  return m ? Number(m[2]) + 1 : 0;
}

/** Uploads `source` to a resumable upload URL, a chunk at a time. Resolves once the server has every byte. */
export async function chunkedPut(options: ChunkedPutOptions): Promise<void> {
  const doFetch = options.fetch ?? fetch;
  const chunk = options.chunkBytes ?? VIDEO_CHUNK_BYTES;
  const retries = options.retries ?? 4;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const total = options.source.size;
  if (chunk % (256 * 1024) !== 0 && chunk < total) throw new ChatError("Chunks must be a multiple of 256 KiB", "22023", "upload");
  const cancelled = () => {
    if (options.isCancelled?.()) throw new ChatError("Cancelled", "57014", "upload");
  };

  /** Where the server is: a status query (an empty PUT). null when it has everything. */
  const ask = async (): Promise<number | null> => {
    const res = await doFetch(options.url, { method: "PUT", headers: { "content-range": `bytes */${total}` } });
    if (DONE.has(res.status)) return null;
    if (res.status === 308) return nextOffset(res.headers.get("range"));
    return refuse(res);
  };

  let offset = 0;
  if (options.resume) {
    const at = await withRetry(ask);
    if (at === null) return void options.onProgress?.(total, total);
    offset = at;
  }
  options.onProgress?.(offset, total);
  while (offset < total) {
    cancelled();
    const from = offset;
    const to = Math.min(total, from + chunk);
    const body = await options.source.read(from, to);
    let failures = 0;
    for (;;) {
      cancelled();
      let res: Response | null = null;
      try {
        res = await doFetch(options.url, {
          method: "PUT",
          headers: { "content-type": options.contentType, "content-range": `bytes ${from}-${to - 1}/${total}` },
          body,
        });
      } catch {
        res = null;
      }
      if (res && DONE.has(res.status)) {
        offset = total;
        break;
      }
      if (res?.status === 308) {
        const next = nextOffset(res.headers.get("range"));
        // The server kept less than this chunk: send the rest of it again from where it is.
        offset = next > from ? next : from;
        if (next <= from) failures++;
        if (failures > retries) throw new ChatError("The video upload is out of step", undefined, "upload");
        break;
      }
      if (res && !transient(res.status)) return refuse(res);
      // A dropped connection or a server hiccup: wait, ask where it is, and go on from there.
      failures++;
      if (failures > retries) throw new ChatError("Not sent. Check your connection.", undefined, "upload");
      await sleep(Math.min(8000, 500 * 2 ** (failures - 1)));
      cancelled();
      try {
        const at = await ask();
        if (at === null) {
          offset = total;
          break;
        }
        if (at !== from) {
          offset = at;
          break;
        }
      } catch (e) {
        if (e instanceof ChatError && !e.transient) throw e;
      }
    }
    options.onProgress?.(offset, total);
  }

  async function withRetry<T>(run: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await run();
      } catch (e) {
        last = e;
        if (e instanceof ChatError && !e.transient) throw e;
        await sleep(Math.min(8000, 500 * 2 ** attempt));
      }
    }
    throw last instanceof ChatError ? last : new ChatError("Not sent. Check your connection.", undefined, "upload");
  }
}

async function refuse(res: Response): Promise<never> {
  const text = await res.text().catch(() => "");
  // 404 / 410: the upload URL expired or was used up; a new one is minted on Retry.
  const code = res.status === 404 || res.status === 410 ? "P0002" : res.status === 401 || res.status === 403 ? "42501" : transient(res.status) ? undefined : "22023";
  throw new ChatError(text.slice(0, 200) || `The video didn't upload (${res.status})`, code, "upload");
}

// ── Uploads in flight ─────────────────────────────────────────────────────────

/** A recording as the recorder hands it over. */
export interface RecordedVideo {
  uri: string;
  name: string;
  contentType: string;
  durationMs: number;
}

export type VideoUploadStatus = "uploading" | "failed";

/** One video on its way, shown in the thread above the composer until its message is queued. */
export interface VideoUploadTask {
  id: string;
  conversationId: string;
  video: RecordedVideo;
  status: VideoUploadStatus;
  /** 0 to 1. */
  progress: number;
  error: string | null;
}

/** The outbox's send (`useChat().outbox.send`): the message goes in the conversation's order. */
export type OutboxSend = (input: Omit<SendInput, "clientId"> & { clientId?: string }, files?: LocalFile[]) => Promise<string>;

export interface StartVideoInput {
  conversationId: string;
  video: RecordedVideo;
  /** What goes with it: a reply, a thread, a topic. */
  extra?: Omit<SendInput, "conversationId" | "clientId" | "attachments" | "body">;
  send: OutboxSend;
  videoUpload?: ChatVideoUpload;
  /** The upload minted when recording started (`prepare`). */
  prepared?: Promise<{ url: string; providerId: string; provider: "mux" }> | null;
  openFile?: (uri: string) => Promise<ChunkFileLike> | ChunkFileLike;
  fetch?: typeof fetch;
  chunkBytes?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** The video as a file the outbox uploads to storage (without `videoUpload`). */
export function recordedVideoFile(video: RecordedVideo): LocalFile {
  return { data: video.uri, name: video.name, contentType: video.contentType, previewUrl: video.uri, meta: { kind: "video", durationMs: video.durationMs } };
}

interface Internal {
  task: VideoUploadTask;
  input: StartVideoInput;
  upload: { url: string; providerId: string; provider: "mux" } | null;
  bytes: number | null;
  started: boolean;
  cancelled: boolean;
}

export function createVideoUploads(newId: () => string = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`) {
  const tasks = new Map<string, Internal>();
  const listeners = new Set<() => void>();
  let snapshot: VideoUploadTask[] = [];
  const emit = () => {
    snapshot = [...tasks.values()].map((t) => t.task);
    listeners.forEach((l) => l());
  };
  const update = (t: Internal, patch: Partial<VideoUploadTask>) => {
    t.task = { ...t.task, ...patch };
    emit();
  };

  async function run(t: Internal) {
    const { input } = t;
    const { video } = input;
    if (!input.videoUpload) {
      // To storage, through the outbox (its pending bubble shows the upload).
      tasks.delete(t.task.id);
      emit();
      await input.send({ ...input.extra, conversationId: input.conversationId, body: "" }, [recordedVideoFile(video)]);
      return;
    }
    const source = await fileSource(video.uri, input.openFile, input.fetch);
    try {
      t.bytes = source.size;
      const resume = t.started && t.upload !== null;
      if (!t.upload) t.upload = await (input.prepared ?? input.videoUpload.create(input.conversationId));
      t.started = true;
      await chunkedPut({
        url: t.upload.url,
        contentType: video.contentType,
        source,
        fetch: input.fetch,
        chunkBytes: input.chunkBytes,
        sleep: input.sleep,
        resume,
        isCancelled: () => t.cancelled,
        onProgress: (sent, total) => update(t, { progress: total ? sent / total : 0 }),
      });
    } finally {
      source.close();
    }
    if (t.cancelled) return;
    const attachment: AttachmentInput = {
      kind: "video",
      provider: t.upload.provider,
      providerId: t.upload.providerId,
      status: "pending",
      name: video.name,
      mime: video.contentType,
      bytes: t.bytes ?? undefined,
      durationMs: Math.round(video.durationMs),
    };
    tasks.delete(t.task.id);
    emit();
    await input.send({ ...input.extra, conversationId: input.conversationId, body: "", attachments: [attachment] });
  }

  function go(t: Internal) {
    update(t, { status: "uploading", error: null });
    run(t).catch((e: unknown) => {
      if (t.cancelled || !tasks.has(t.task.id)) return;
      const err = e instanceof ChatError ? e : null;
      // An expired or used-up upload URL: Retry mints a new one and starts over.
      if (err?.code === "P0002") {
        t.upload = null;
        t.started = false;
        t.input = { ...t.input, prepared: null };
      }
      // A minted upload that was never used stays; one that failed partway resumes.
      if (t.input.prepared && !t.upload) t.input = { ...t.input, prepared: null };
      update(t, { status: "failed", error: err?.forbidden ? "You can't post here" : (e instanceof Error ? e.message : String(e)) || null });
    });
  }

  return {
    /** Starts sending a recording. Returns the task's id. */
    start(input: StartVideoInput): string {
      const id = newId();
      const t: Internal = {
        task: { id, conversationId: input.conversationId, video: input.video, status: "uploading", progress: 0, error: null },
        input,
        upload: null,
        bytes: null,
        started: false,
        cancelled: false,
      };
      tasks.set(id, t);
      go(t);
      return id;
    },
    retry(id: string) {
      const t = tasks.get(id);
      if (t && t.task.status === "failed") go(t);
    },
    /** Stops it and forgets it (an upload Mux never receives expires on its own). */
    cancel(id: string) {
      const t = tasks.get(id);
      if (!t) return;
      t.cancelled = true;
      tasks.delete(id);
      emit();
    },
    list(conversationId?: string): VideoUploadTask[] {
      return conversationId ? snapshot.filter((t) => t.conversationId === conversationId) : snapshot;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    snapshot: () => snapshot,
  };
}

export type VideoUploads = ReturnType<typeof createVideoUploads>;

/** The app's uploads in flight (one for the app; the thread screen reads it). */
export const videoUploads: VideoUploads = createVideoUploads();

const EMPTY: VideoUploadTask[] = [];

/** The videos on their way to this conversation, live. */
export function useVideoUploads(conversationId: string, store: VideoUploads = videoUploads): VideoUploadTask[] {
  const all = useSyncExternalStore(store.subscribe, store.snapshot, () => EMPTY);
  return all.some((t) => t.conversationId === conversationId) ? all.filter((t) => t.conversationId === conversationId) : EMPTY;
}
