/**
 * @feat:chat
 * The send queue: a message shows at once as pending, its files upload, then it
 * is sent with the clientId made when it was written, so a retry (after a lost
 * connection, a closed app) never posts twice. Messages to one conversation go
 * in the order they were written. Storage is the platform's (memory by default;
 * localStorage on web, MMKV or SQLite on native), behind OutboxStore.
 */
import type { ChatClient } from "./client";
import { ChatError } from "./client";
import { attachmentKindFor } from "./media";
import type { AttachmentInput, ChatMessage, PendingMessage, SendInput } from "./types";

/** A file still on the device, uploaded when its message is sent. */
export interface LocalFile {
  /** The bytes, or (native) a file URI the platform reads in `readFile`. */
  data: Blob | ArrayBuffer | string;
  name: string;
  contentType: string;
  /** A preview to show while it uploads (an object URL, a file URI). */
  previewUrl?: string;
  /** Known up front: a voice note's duration and waveform, a photo's size. */
  meta?: Partial<Omit<AttachmentInput, "path" | "kind">> & { kind?: AttachmentInput["kind"] };
}

export interface QueuedMessage extends PendingMessage {
  files: LocalFile[];
  attempts: number;
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
  /** Upload hook, e.g. resumable uploads on native. Defaults to client.upload. */
  upload?: (conversationId: string, file: LocalFile) => Promise<string>;
  /** Called with every change, for the UI. */
  onChange?: (queue: QueuedMessage[]) => void;
  /** Called when a message lands. */
  onSent?: (message: ChatMessage, clientId: string) => void;
}

const newId = () => crypto.randomUUID();

export function createOutbox(opts: OutboxOptions) {
  const store = opts.store ?? memoryOutboxStore();
  let queue: QueuedMessage[] = [];
  let loaded = false;
  const running = new Set<string>();
  const uploaded = new Map<string, string>(); // clientId:index -> path

  const emit = () => {
    opts.onChange?.([...queue]);
    void store.save(queue.map((q) => ({ ...q, files: q.files.filter((f) => typeof f.data === "string") })));
  };

  async function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    const saved = await store.load();
    // Files held as bytes don't survive a reload; their messages fail and can be retried or discarded.
    queue = saved.map((q) => ({ ...q, status: q.status === "sending" ? "failed" : q.status, error: q.error ?? "Not sent" }));
    if (queue.length) opts.onChange?.([...queue]);
  }

  async function uploadFile(conversationId: string, file: LocalFile): Promise<string> {
    if (opts.upload) return opts.upload(conversationId, file);
    const data = typeof file.data === "string" ? await (opts.readFile ?? notReadable)(file.data) : file.data;
    return opts.client.upload(conversationId, opts.userId, data, { name: file.name, contentType: file.contentType });
  }

  async function run(conversationId: string) {
    if (running.has(conversationId)) return;
    running.add(conversationId);
    try {
      for (;;) {
        const next = queue.find((q) => q.input.conversationId === conversationId && q.status === "sending");
        if (!next) break;
        try {
          const attachments: AttachmentInput[] = [...(next.input.attachments ?? [])];
          for (let i = 0; i < next.files.length; i++) {
            const file = next.files[i]!;
            const key = `${next.clientId}:${i}`;
            let path = uploaded.get(key);
            if (!path) {
              path = await uploadFile(conversationId, file);
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
          const message = await opts.client.send({ ...next.input, attachments });
          queue = queue.filter((q) => q.clientId !== next.clientId);
          for (let i = 0; i < next.files.length; i++) uploaded.delete(`${next.clientId}:${i}`);
          emit();
          opts.onSent?.(message, next.clientId);
        } catch (e) {
          const err = e instanceof ChatError ? e : new ChatError(e instanceof Error ? e.message : String(e), undefined, "send");
          next.attempts += 1;
          next.status = "failed";
          next.error = err.forbidden ? "You can't post here" : err.transient ? "Not sent. Check your connection." : err.message;
          emit();
          // Later messages to this conversation wait behind a failed one, so order holds.
          break;
        }
      }
    } finally {
      running.delete(conversationId);
    }
  }

  return {
    /** Queues a message; it shows at once and sends in order. Returns its clientId. */
    async send(input: Omit<SendInput, "clientId"> & { clientId?: string }, files: LocalFile[] = []): Promise<string> {
      await ensureLoaded();
      const clientId = input.clientId ?? newId();
      const previews: Record<number, string> = {};
      files.forEach((f, i) => {
        if (f.previewUrl) previews[i] = f.previewUrl;
      });
      queue.push({
        clientId,
        input: { ...input, clientId },
        senderId: opts.userId,
        createdAt: new Date().toISOString(),
        status: "sending",
        previews,
        files,
        attempts: 0,
      });
      emit();
      void run(input.conversationId);
      return clientId;
    },

    async retry(clientId: string) {
      await ensureLoaded();
      const q = queue.find((x) => x.clientId === clientId);
      if (!q) return;
      // Retrying one retries everything behind it in that conversation.
      for (const x of queue) if (x.input.conversationId === q.input.conversationId && x.status === "failed") x.status = "sending";
      emit();
      void run(q.input.conversationId);
    },

    /** Retries every failed message (after the connection comes back). */
    async retryAll() {
      await ensureLoaded();
      const conversations = new Set<string>();
      for (const x of queue) {
        if (x.status === "failed" && x.files.every((f) => typeof f.data !== "string" || opts.readFile)) {
          x.status = "sending";
          conversations.add(x.input.conversationId);
        }
      }
      emit();
      for (const c of conversations) void run(c);
    },

    async discard(clientId: string) {
      await ensureLoaded();
      queue = queue.filter((q) => q.clientId !== clientId);
      emit();
    },

    pending(conversationId?: string): PendingMessage[] {
      return queue.filter((q) => !conversationId || q.input.conversationId === conversationId);
    },

    load: ensureLoaded,
  };
}

export type Outbox = ReturnType<typeof createOutbox>;

async function notReadable(): Promise<never> {
  throw new ChatError("This file can't be read on this device", "22023", "upload");
}
