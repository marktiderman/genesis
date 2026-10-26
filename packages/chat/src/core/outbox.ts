/**
 * @feat:chat
 * The send queue: a message shows at once as pending, its files upload, then it
 * is sent with the clientId made when it was written, so a retry (after a lost
 * connection, a closed app) never posts twice. Messages to one conversation go
 * in the order they were written: the first that can't go (a lost file, a refusal)
 * holds back the ones after it. A refusal (not allowed, bad data) is `permanent`
 * and only sent again by hand. `clear()` (sign-out) stops sends in flight: none
 * posts, or saves anything, afterwards. Storage is the platform's (memory by default;
 * localStorage on web, MMKV or SQLite on native), behind OutboxStore.
 *
 * A hosted video (`LocalFile.hosted`, with `hostedUpload`) doesn't wait for its bytes: the
 * upload is started (the provider's upload id minted), the message is sent in its place in the
 * order with the attachment `pending`, and the bytes carry on going up; the provider's webhook
 * marks it ready. The message stays here (hidden from the thread once the server has it) until
 * its bytes are up, so a relaunch carries the upload on (`resume`) and sends the message again
 * with the same clientId, which posts nothing twice.
 */
import type { ChatClient } from "./client";
import { ChatError } from "./client";
import { attachmentKindFor, randomId } from "./media";
import type { UploadProgress } from "./transfer";
import type { AttachmentInput, ChatMessage, HostedAttachment, PendingFile, PendingMessage, SendInput } from "./types";

/** A file still on the device, uploaded when its message is sent. */
export interface LocalFile {
  /** The bytes, or (native) a file URI the platform reads in `readFile`. */
  data: Blob | ArrayBuffer | string;
  name: string;
  contentType: string;
  /** A preview to show while it uploads (an object URL, a file URI). The outbox owns it from here: see `releasePreview`. */
  previewUrl?: string;
  /** Known up front: a voice note's duration and waveform, a photo's size. */
  meta?: Partial<Omit<AttachmentInput, "path" | "kind">> & { kind?: AttachmentInput["kind"] };
  /**
   * Send it to the hosted video provider (the outbox's `hostedUpload`) instead of storage: the
   * message goes at once, in order, with the attachment pending, while the bytes go up. Without
   * a `hostedUpload` it goes to storage like any file.
   */
  hosted?: boolean;
}

/** A hosted upload as the outbox keeps it (saved with the message), so it can be carried on. */
export interface HostedUploadRecord {
  provider: HostedAttachment["provider"];
  providerId: string;
  /** Where the bytes go, when the hook returned it: what a resume needs. */
  url?: string;
  /** Every byte is there. */
  uploaded?: boolean;
}

/** What `hostedUpload` resolves with as soon as the upload exists (before the bytes are up). */
export interface HostedUploadStart extends HostedAttachment {
  /** Where the bytes go; kept with the message, handed back as `resume.url`. */
  url?: string;
  /** Settles when every byte is there (rejects when the transfer fails). Absent: already there. */
  done?: Promise<void>;
}

export interface HostedUploadOptions {
  /** Aborts when the message is discarded or the outbox cleared. */
  signal?: AbortSignal;
  onProgress?: UploadProgress;
  /**
   * The upload started before (a relaunch, a retry after the transfer failed): carry it on and
   * resolve with the same `providerId`. A message may already be posted with it, so mint a new
   * one only when the old upload is gone; that message's video then stays pending.
   */
  resume?: HostedUploadRecord;
}

/** Starts (or carries on) a hosted upload; resolves once the provider's upload id exists. */
export type HostedUpload = (conversationId: string, file: LocalFile, opts: HostedUploadOptions) => Promise<HostedUploadStart>;

/** Uploads a file to storage and resolves with its path. */
export type StorageUpload = (conversationId: string, file: LocalFile, opts?: { signal?: AbortSignal; onProgress?: UploadProgress }) => Promise<string>;

export interface QueuedMessage extends Omit<PendingMessage, "files"> {
  files: LocalFile[];
  /** What each file is, kept with the saved copy (PendingMessage.files). */
  pendingFiles?: PendingFile[];
  /** Files lost on a relaunch (bytes that weren't persisted). */
  lostFiles?: number;
  attempts: number;
  /** Hosted uploads started, by file slot. */
  hosted?: Record<number, HostedUploadRecord>;
  /** Posted (this message's id): it waits here only for its hosted bytes to finish. */
  sentMessageId?: string;
}

function describe(f: LocalFile): PendingFile {
  return {
    name: f.name,
    contentType: f.contentType,
    kind: f.meta?.kind ?? attachmentKindFor(f.contentType),
    meta: f.meta,
    ...(f.hosted ? { hosted: true } : {}),
  };
}

export interface OutboxStore {
  load(): Promise<QueuedMessage[]>;
  save(queue: QueuedMessage[]): Promise<void>;
}

export const memoryOutboxStore = (): OutboxStore => {
  let saved: QueuedMessage[] = [];
  return { load: async () => saved, save: async (q) => void (saved = q) };
};

export interface OutboxOptions {
  client: ChatClient;
  userId: string;
  store?: OutboxStore;
  /** Reads a native file URI into bytes for upload. */
  readFile?: (uri: string) => Promise<Blob | ArrayBuffer>;
  /**
   * Upload hook, e.g. resumable uploads on native. Defaults to client.upload. `signal` aborts
   * when the message is discarded or the outbox cleared; call `onProgress(sent, total)` as bytes
   * go, and the pending bubble shows it (`PendingMessage.files[i].progress`).
   */
  upload?: StorageUpload;
  /**
   * Starts a hosted video upload for a file marked `hosted` and resolves once the provider's
   * upload id exists, with `done` for the bytes. See HostedUpload; without it, hosted files go
   * to storage.
   */
  hostedUpload?: HostedUpload;
  /** Called with every change, for the UI. */
  onChange?: (queue: QueuedMessage[]) => void;
  /** Called when a message lands. */
  onSent?: (message: ChatMessage, clientId: string) => void;
  /** Makes client ids. Default: a random UUID (works where crypto.randomUUID is missing). */
  newId?: () => string;
  /**
   * Keeps a file held as bytes (a pasted image, a recording) between launches: write it
   * somewhere and return a URI `readFile` can read (native: the app's cache directory).
   * Without it, such a file isn't saved, and after a relaunch its message asks for it again.
   */
  persistFile?: (file: LocalFile) => Promise<string>;
  /**
   * Lets go of a file's `previewUrl` once its message has landed, been discarded or cleared.
   * Default: revokes `blob:` object URLs (the web's), and leaves everything else alone.
   */
  releasePreview?: (url: string) => void;
}

/** Revokes a `blob:` object URL; anything else (a native file URI) is left alone. */
export function releaseObjectUrl(url: string) {
  if (!url.startsWith("blob:") || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Already gone, or a runtime without object URLs.
  }
}


export function createOutbox(opts: OutboxOptions) {
  const store = opts.store ?? memoryOutboxStore();
  let queue: QueuedMessage[] = [];
  // Bumped by clear(): work begun under an older generation stops at its next await.
  let generation = 0;
  const running = new Map<string, number>(); // conversationId -> the generation running it
  const aborts = new Map<string, AbortController>(); // clientId -> its uploads' controller
  const uploaded = new Map<string, string>(); // clientId:index -> path
  // Hosted bytes still going up, by clientId:index, and the controller that stops them.
  const transfers = new Map<string, Promise<void>>();
  const hostedAborts = new Map<string, AbortController>();

  const release = opts.releasePreview ?? releaseObjectUrl;
  const releasePreviews = (q: QueuedMessage) => {
    for (const url of new Set([...Object.values(q.previews ?? {}), ...q.files.map((f) => f.previewUrl)])) {
      if (typeof url === "string" && url) release(url);
    }
  };

  const newId = opts.newId ?? randomId;

  // Saved copies: a file held as bytes is kept only as a URI (persistFile) or marked lost.
  // `files` holds the files still here, in slot order; `pendingFiles` holds every slot.
  const saveable = (q: QueuedMessage): QueuedMessage => {
    const slots = q.pendingFiles?.length ? q.pendingFiles : q.files.map(describe);
    const here = [...q.files];
    const files: LocalFile[] = [];
    const pendingFiles = slots.map((slot) => {
      if (slot.lost) return slot;
      const f = here.shift();
      if (f && typeof f.data === "string") {
        files.push(f);
        return { ...slot, lost: false };
      }
      return { ...slot, lost: true };
    });
    return { ...q, files, pendingFiles };
  };

  const emit = () => {
    opts.onChange?.([...queue]);
    void store.save(queue.map(saveable));
  };

  /** A file's upload progress, for the UI only (not saved). */
  const setProgress = (q: QueuedMessage, index: number, sent: number, total: number) => {
    const slots = q.pendingFiles;
    if (!slots?.[index] || !queue.includes(q)) return;
    const progress = total > 0 ? Math.min(1, Math.max(0, sent / total)) : 0;
    if (slots[index]!.progress === progress) return;
    q.pendingFiles = slots.map((slot, j) => (j === index ? { ...slot, progress } : slot));
    opts.onChange?.([...queue]);
  };

  const stopHosted = (clientId: string) => {
    hostedAborts.get(clientId)?.abort();
    hostedAborts.delete(clientId);
    for (const k of [...transfers.keys()]) if (k.startsWith(`${clientId}:`)) transfers.delete(k);
  };

  /** Swaps a byte file for a saved URI, so it survives a relaunch. */
  async function persist(q: QueuedMessage) {
    if (!opts.persistFile) return;
    for (let i = 0; i < q.files.length; i++) {
      const f = q.files[i]!;
      if (typeof f.data === "string") continue;
      try {
        q.files[i] = { ...f, data: await opts.persistFile(f) };
      } catch {
        // Kept in memory only; a relaunch asks for it again.
      }
    }
  }

  /**
   * One load for the outbox's life, which every method awaits. What was saved is merged into
   * the live queue (a send made while the load was in flight stays), deduped by clientId.
   */
  let loading: Promise<void> | null = null;
  function ensureLoaded(): Promise<void> {
    loading ??= (async () => {
      const gen = generation;
      let saved: QueuedMessage[] = [];
      try {
        saved = (await store.load()) ?? [];
      } catch {
        saved = [];
      }
      // Cleared (signed out) while it loaded: what was saved belonged to that session.
      if (gen !== generation) return;
      // A file held as bytes that wasn't persisted doesn't survive a relaunch: its message waits,
      // failed, for the file to be attached again (never sent without it) or discarded.
      const live = new Set(queue.map((q) => q.clientId));
      const restored: QueuedMessage[] = saved
        .filter((q) => !live.has(q.clientId))
        .map((q) => {
          const lost = (q.pendingFiles ?? []).filter((f) => f.lost).length;
          // Posted, its hosted bytes still going up when the app closed: it is sent again (the
          // same clientId posts nothing twice) after its upload is carried on.
          const rest: QueuedMessage = { ...q };
          delete rest.sentMessageId;
          return {
            ...rest,
            status: q.status === "sending" || lost > 0 ? "failed" : q.status,
            error: lost > 0 ? "Attach the file again to send" : (q.error ?? "Not sent"),
            files: q.files ?? [],
            attempts: q.attempts ?? 0,
            lostFiles: lost,
          };
        });
      if (restored.length) {
        queue = [...restored, ...queue];
        opts.onChange?.([...queue]);
      }
    })();
    return loading;
  }

  async function uploadFile(conversationId: string, file: LocalFile, signal?: AbortSignal, onProgress?: UploadProgress): Promise<string> {
    if (opts.upload) return opts.upload(conversationId, file, { signal, onProgress });
    const data = typeof file.data === "string" ? await (opts.readFile ?? notReadable)(file.data) : file.data;
    return opts.client.upload(conversationId, opts.userId, data, { name: file.name, contentType: file.contentType, onProgress, signal });
  }

  const isHosted = (f: LocalFile) => Boolean(f.hosted && opts.hostedUpload);

  /**
   * The hosted upload for one file slot: the one going up, or a new (or carried-on) one. Resolves
   * once the provider's upload id exists; its bytes go on in `transfers`.
   */
  async function startHosted(q: QueuedMessage, index: number, file: LocalFile): Promise<HostedUploadRecord> {
    const key = `${q.clientId}:${index}`;
    const known = q.hosted?.[index];
    if (known && (known.uploaded || transfers.has(key))) return known;
    let controller = hostedAborts.get(q.clientId);
    if (!controller && typeof AbortController !== "undefined") {
      controller = new AbortController();
      hostedAborts.set(q.clientId, controller);
    }
    const started = await opts.hostedUpload!(q.input.conversationId, file, {
      signal: controller?.signal,
      onProgress: (sent, total) => setProgress(q, index, sent, total),
      ...(known ? { resume: known } : {}),
    });
    const record: HostedUploadRecord = { provider: started.provider, providerId: started.providerId, ...(started.url ? { url: started.url } : {}) };
    q.hosted = { ...q.hosted, [index]: record };
    // Saved at once: a relaunch before the message goes carries this upload on, not a new one.
    if (queue.includes(q)) emit();
    const transfer = Promise.resolve(started.done).then(
      () => {
        record.uploaded = true;
        if (transfers.get(key) === transfer) transfers.delete(key);
        setProgress(q, index, 1, 1);
      },
      (e: unknown) => {
        if (transfers.get(key) === transfer) transfers.delete(key);
        throw e;
      },
    );
    transfer.catch(() => undefined);
    transfers.set(key, transfer);
    return record;
  }

  /** A posted message's hosted bytes: once they are all up, it leaves; a failed transfer marks it failed (Retry carries it on). */
  async function settleHosted(q: QueuedMessage, gen: number) {
    const waiting = Object.entries(q.hosted ?? {})
      .filter(([, r]) => !r.uploaded)
      .map(([i]) => transfers.get(`${q.clientId}:${i}`) ?? Promise.reject(new ChatError("The upload stopped", undefined, "upload")));
    try {
      await Promise.all(waiting);
    } catch (e) {
      if (gen !== generation || !queue.includes(q) || q.status !== "sending") return;
      q.attempts += 1;
      q.status = "failed";
      q.error = e instanceof ChatError && e.code === "GSABORT" ? "The upload was cancelled" : "The video didn't finish uploading";
      emit();
      return;
    }
    if (gen !== generation || !queue.includes(q)) return;
    // A retry may have started more meanwhile: wait for those too.
    if (Object.values(q.hosted ?? {}).some((r) => !r.uploaded)) return void settleHosted(q, gen);
    queue = queue.filter((x) => x !== q);
    hostedAborts.delete(q.clientId);
    emit();
    releasePreviews(q);
  }

  async function run(conversationId: string) {
    const gen = generation;
    if (running.get(conversationId) === gen) return;
    running.set(conversationId, gen);
    // Cleared (signed out) or discarded while we waited: stop, sending and saving nothing.
    const stale = (q: QueuedMessage) => gen !== generation || !queue.includes(q);
    try {
      for (;;) {
        if (gen !== generation) return;
        // In the order written: the first message still here decides. One that failed (a lost
        // file, a refusal, no connection) holds back the ones after it until it is retried.
        // A posted message waiting only for its hosted bytes holds nothing back.
        const next = queue.find((q) => q.input.conversationId === conversationId && !q.sentMessageId);
        if (!next || next.status !== "sending") break;
        if ((next.lostFiles ?? 0) > 0) {
          next.status = "failed";
          next.error = "Attach the file again to send";
          emit();
          break;
        }
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        if (controller) aborts.set(next.clientId, controller);
        try {
          const attachments: AttachmentInput[] = [...(next.input.attachments ?? [])];
          for (let i = 0; i < next.files.length; i++) {
            const file = next.files[i]!;
            if (isHosted(file)) {
              const hosted = await startHosted(next, i, file);
              if (stale(next)) return;
              attachments.push({
                ...file.meta,
                kind: file.meta?.kind ?? attachmentKindFor(file.contentType),
                provider: hosted.provider,
                providerId: hosted.providerId,
                status: "pending",
                name: file.meta?.name ?? file.name,
                mime: file.contentType,
              });
              continue;
            }
            const key = `${next.clientId}:${i}`;
            let path = uploaded.get(key);
            if (!path) {
              const index = i;
              path = await uploadFile(conversationId, file, controller?.signal, (sent, total) => setProgress(next, index, sent, total));
              if (stale(next)) return;
              uploaded.set(key, path);
            }
            attachments.push({
              ...file.meta,
              kind: file.meta?.kind ?? attachmentKindFor(file.contentType),
              path,
              name: file.meta?.name ?? file.name,
              mime: file.contentType,
            });
          }
          if (stale(next)) return;
          const message = await opts.client.send({ ...next.input, attachments });
          // Posted, but the person signed out meanwhile: the next session must not hear of it.
          if (gen !== generation) return;
          for (let i = 0; i < next.files.length; i++) uploaded.delete(`${next.clientId}:${i}`);
          if (Object.values(next.hosted ?? {}).some((r) => !r.uploaded)) {
            // Posted with its video pending: it stays (out of the thread, which has the server's
            // copy) until the bytes are up, so a relaunch can carry the upload on.
            next.sentMessageId = message.id;
            emit();
            opts.onSent?.(message, next.clientId);
            void settleHosted(next, gen);
            continue;
          }
          queue = queue.filter((q) => q.clientId !== next.clientId);
          hostedAborts.delete(next.clientId);
          emit();
          opts.onSent?.(message, next.clientId);
          // The bubble now draws the stored copy: the local preview can go.
          releasePreviews(next);
        } catch (e) {
          if (stale(next)) return;
          const err = e instanceof ChatError ? e : new ChatError(e instanceof Error ? e.message : String(e), undefined, "send");
          next.attempts += 1;
          next.status = "failed";
          next.permanent = err.permanent;
          next.error = err.forbidden ? "You can't post here" : err.transient ? "Not sent. Check your connection." : err.message;
          emit();
          // Later messages to this conversation wait behind a failed one, so order holds.
          break;
        } finally {
          if (controller && aborts.get(next.clientId) === controller) aborts.delete(next.clientId);
        }
      }
    } finally {
      if (running.get(conversationId) === gen) running.delete(conversationId);
    }
  }

  /** Can this failed message go without the person's help (retryAll, coming back online)? */
  const canAutoRetry = (x: QueuedMessage) =>
    !x.permanent &&
    !(x.lostFiles ?? 0) &&
    x.files.every((f) => typeof f.data !== "string" || Boolean(isHosted(f) ? opts.hostedUpload : opts.readFile || opts.upload));

  /** A failed message goes again: a posted one (its transfer failed) re-sends, idempotently, after carrying its upload on. */
  const requeue = (x: QueuedMessage) => {
    x.status = "sending";
    delete x.sentMessageId;
  };

  return {
    /** Queues a message; it shows at once and sends in order. Returns its clientId. */
    async send(input: Omit<SendInput, "clientId"> & { clientId?: string }, files: LocalFile[] = []): Promise<string> {
      await ensureLoaded();
      const gen = generation;
      const clientId = input.clientId ?? newId();
      const previews: Record<number, string> = {};
      files.forEach((f, i) => {
        if (f.previewUrl) previews[i] = f.previewUrl;
      });
      const queued: QueuedMessage = {
        clientId,
        input: { ...input, clientId },
        senderId: opts.userId,
        createdAt: new Date().toISOString(),
        status: "sending",
        previews,
        files: [...files],
        pendingFiles: files.map(describe),
        attempts: 0,
      };
      queue.push(queued);
      opts.onChange?.([...queue]);
      await persist(queued);
      // Cleared or discarded while its files were saved: it goes nowhere.
      if (gen !== generation || !queue.includes(queued)) return clientId;
      emit();
      void run(input.conversationId);
      return clientId;
    },

    async retry(clientId: string) {
      await ensureLoaded();
      const q = queue.find((x) => x.clientId === clientId);
      if (!q) return;
      // Retrying one retries everything failed in that conversation, in order, refusals too
      // (a person asked), up to one still waiting for a file.
      for (const x of queue) {
        if (x.input.conversationId !== q.input.conversationId || x.status !== "failed") continue;
        if ((x.lostFiles ?? 0) > 0) break;
        requeue(x);
        x.permanent = false;
      }
      emit();
      void run(q.input.conversationId);
    },

    /**
     * Gives a message the files it lost on a relaunch and sends it. `files` fill the lost
     * slots in order (`PendingMessage.files[i].lost`); the files that were kept stay. Pass
     * one per lost slot; with fewer, the message keeps waiting for the rest.
     */
    async reattach(clientId: string, files: LocalFile[]) {
      await ensureLoaded();
      const q = queue.find((x) => x.clientId === clientId);
      if (!q) return;
      const slots = q.pendingFiles ?? [];
      const kept = [...q.files];
      const given = [...files];
      const merged: LocalFile[] = [];
      const described: PendingFile[] = [];
      for (const slot of slots) {
        if (slot.lost) {
          const f = given.shift();
          if (f) {
            merged.push(f);
            described.push(describe(f));
          } else {
            described.push(slot);
          }
        } else {
          const f = kept.shift();
          if (f) {
            merged.push(f);
            described.push(slot);
          }
        }
      }
      // A message saved before slots were recorded: the given files are all of them.
      if (slots.length === 0) {
        merged.push(...given);
        described.push(...given.map(describe));
      }
      q.files = merged;
      q.pendingFiles = described;
      q.lostFiles = described.filter((d) => d.lost).length;
      if (q.lostFiles > 0) {
        emit();
        return;
      }
      const gen = generation;
      await persist(q);
      if (gen !== generation || !queue.includes(q)) return;
      requeue(q);
      emit();
      void run(q.input.conversationId);
    },

    /**
     * Retries failed messages (after the connection comes back), in order per conversation,
     * stopping at the first that can't go on its own: one waiting for a lost file, or one the
     * server refused (`permanent`, retried only by hand). The ones after it keep waiting.
     */
    async retryAll() {
      await ensureLoaded();
      const conversations = new Set<string>();
      const held = new Set<string>();
      for (const x of queue) {
        const c = x.input.conversationId;
        if (held.has(c) || x.status !== "failed") continue;
        if (!canAutoRetry(x)) {
          // A posted one (only its upload failed) holds nothing back.
          if (!x.sentMessageId) held.add(c);
          continue;
        }
        requeue(x);
        conversations.add(c);
      }
      emit();
      for (const c of conversations) void run(c);
    },

    /** Forgets every queued message, here and in the store (call it on sign-out). */
    async clear() {
      // At once, before any await: a send in flight stops at its next step and posts nothing.
      generation += 1;
      for (const c of aborts.values()) c.abort();
      aborts.clear();
      for (const c of hostedAborts.values()) c.abort();
      hostedAborts.clear();
      transfers.clear();
      running.clear();
      const gone = queue;
      queue = [];
      uploaded.clear();
      gone.forEach(releasePreviews);
      opts.onChange?.([]);
      await ensureLoaded();
      await store.save([]);
    },

    async discard(clientId: string) {
      await ensureLoaded();
      const gone = queue.find((q) => q.clientId === clientId);
      queue = queue.filter((q) => q.clientId !== clientId);
      aborts.get(clientId)?.abort();
      aborts.delete(clientId);
      stopHosted(clientId);
      if (gone) releasePreviews(gone);
      emit();
    },

    /**
     * Uploads one file to storage the way the outbox does (the `upload` hook, or `readFile` then
     * the client's upload) and resolves with its path: for files sent outside the queue, such as
     * a scheduled message's.
     */
    uploadFile(conversationId: string, file: LocalFile, o: { signal?: AbortSignal; onProgress?: UploadProgress } = {}): Promise<string> {
      return uploadFile(conversationId, file, o.signal, o.onProgress);
    },

    pending(conversationId?: string): PendingMessage[] {
      return queue
        .filter((q) => !conversationId || q.input.conversationId === conversationId)
        .map((q) => ({ ...q, files: q.pendingFiles }));
    },

    /** A new client id, made the way this outbox makes them. */
    newId,

    load: ensureLoaded,
  };
}

export type Outbox = ReturnType<typeof createOutbox>;

async function notReadable(): Promise<never> {
  // This device's set-up (no readFile), not a refusal: a relaunch that can read it sends it.
  throw new ChatError("This file can't be read on this device", "GSFILE", "upload");
}
