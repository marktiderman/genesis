/**
 * @feat:chat
 * The composer as plain state, so it is the same in every screen and tested
 * without a phone: the text, the files waiting to go, what it replies to, why
 * it can't post, what a send hands the outbox, and the draft kept per thread.
 */
import { CHAT_LIMITS, attachmentKindFor, fileExtension, isAllowedExtension } from "../core/media";
import { parseMentions } from "../core/thread";
import type { LocalFile } from "../core/outbox";
import type { ChatConversation, ChatMessage, ChatRole } from "../core/types";
import { fill, type ChatNativeCopy } from "./copy";
import type { DraftStorageLike, PickedAssetLike } from "./modules";

/** A file in the composer, shown as a thumbnail until it is sent. */
export interface ComposerAttachment {
  /** Stable for keys and removal. */
  key: string;
  file: LocalFile;
}

export interface ReplyTarget {
  messageId: string;
  /** Who wrote it, as shown ("Sam", "You"). */
  name: string;
  /** A one-line preview. */
  preview: string;
}

export interface ComposerState {
  text: string;
  attachments: ComposerAttachment[];
  replyTo: ReplyTarget | null;
  /** The last thing that couldn't be added ("x.svg can't be sent"). Cleared by the next change. */
  notice: string | null;
}

export const emptyComposer: ComposerState = { text: "", attachments: [], replyTo: null, notice: null };

export type ComposerAction =
  | { type: "text"; text: string }
  /** `tooMany` is what to say when the files don't all fit (copy.tooMany). */
  | { type: "add"; attachments: ComposerAttachment[]; notice?: string | null; tooMany?: string }
  | { type: "remove"; key: string }
  | { type: "reply"; to: ReplyTarget | null }
  | { type: "restore"; draft: ComposerDraft }
  /** Another conversation (or thread) opened in the same composer: start empty. */
  | { type: "reset" }
  | { type: "sent" };

export function composerReducer(state: ComposerState, action: ComposerAction): ComposerState {
  switch (action.type) {
    case "text":
      return { ...state, text: action.text.slice(0, CHAT_LIMITS.bodyChars), notice: null };
    case "add": {
      const room = CHAT_LIMITS.attachmentsPerMessage - state.attachments.length;
      const added = action.attachments.slice(0, Math.max(0, room));
      const overflow = action.attachments.length > added.length;
      return {
        ...state,
        attachments: [...state.attachments, ...added],
        notice: overflow ? (action.tooMany ?? action.notice ?? null) : (action.notice ?? null),
      };
    }
    case "remove":
      return { ...state, attachments: state.attachments.filter((a) => a.key !== action.key), notice: null };
    case "reply":
      return { ...state, replyTo: action.to };
    case "restore":
      // A draft never replaces what was typed meanwhile.
      if (state.text || state.attachments.length) return state;
      return { ...state, text: action.draft.text, replyTo: action.draft.replyTo ?? null };
    case "reset":
    case "sent":
      return emptyComposer;
  }
}

/** Something to send: text that isn't blank, or a file. */
export function canSend(state: ComposerState, canPost: boolean): boolean {
  return canPost && (state.text.trim().length > 0 || state.attachments.length > 0);
}

/**
 * Why this person can't post here, for the disabled composer; null when they can.
 * `canPost` is the server's answer (null while it loads, which disables quietly).
 */
export function composerDisabledReason(
  canPost: boolean | null,
  conversation: Pick<ChatConversation, "settings" | "status" | "archivedAt"> | null,
  role: ChatRole | null,
  copy: Pick<ChatNativeCopy, "cantPost" | "cantPostAdmins" | "cantPostClosed">,
): string | null {
  if (canPost !== false) return null;
  if (conversation?.status === "closed" || conversation?.status === "solved" || conversation?.archivedAt) return copy.cantPostClosed;
  if (conversation?.settings?.who_posts === "admins" && role !== "owner" && role !== "admin") return copy.cantPostAdmins;
  return copy.cantPost;
}

/** What `useConversation().send` takes: the input and the files. */
export function toSend(state: ComposerState): { input: { body: string; replyToId: string | null; mentions: string[] }; files: LocalFile[] } {
  const body = state.text.trim();
  return {
    input: { body, replyToId: state.replyTo?.messageId ?? null, mentions: parseMentions(body) },
    files: state.attachments.map((a) => a.file),
  };
}

/** A reply target from a message. */
export function replyTargetFor(message: ChatMessage, name: string, preview: string): ReplyTarget {
  return { messageId: message.id, name, preview };
}

let seq = 0;
const nextKey = () => `a${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Picked photos and videos as files to send, with what was refused and why:
 * a type the bucket won't take, a file over the limit.
 */
export function filesFromAssets(
  assets: readonly PickedAssetLike[],
  copy: Pick<ChatNativeCopy, "tooLarge" | "notAllowedType" | "photo" | "video">,
): { attachments: ComposerAttachment[]; notice: string | null } {
  const attachments: ComposerAttachment[] = [];
  let notice: string | null = null;
  for (const asset of assets) {
    const video = asset.type === "video" || (asset.mimeType ?? "").startsWith("video/");
    const contentType = asset.mimeType ?? (video ? "video/mp4" : "image/jpeg");
    const fallbackName = `${video ? "video" : "photo"}.${video ? "mp4" : "jpg"}`;
    const name = asset.fileName ?? (asset.uri.split("/").pop() || fallbackName);
    const ext = fileExtension(name, contentType);
    if (!isAllowedExtension(ext)) {
      notice = fill(copy.notAllowedType, { name });
      continue;
    }
    const limit = video ? CHAT_LIMITS.videoBytes : CHAT_LIMITS.fileBytes;
    if (asset.fileSize != null && asset.fileSize > limit) {
      notice = fill(copy.tooLarge, { name });
      continue;
    }
    attachments.push({
      key: nextKey(),
      file: {
        data: asset.uri,
        name,
        contentType,
        previewUrl: asset.uri,
        meta: {
          kind: attachmentKindFor(contentType),
          width: asset.width || undefined,
          height: asset.height || undefined,
          bytes: asset.fileSize ?? undefined,
          durationMs: video && asset.duration ? Math.round(asset.duration) : undefined,
        },
      },
    });
  }
  return { attachments, notice };
}

/** A pasted picture (a data URI from the clipboard) as a file to send. */
export function fileFromDataUri(dataUri: string, size?: { width: number; height: number }): ComposerAttachment | null {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUri);
  if (!m) return null;
  const contentType = m[1]!.toLowerCase();
  const ext = fileExtension("", contentType);
  if (!contentType.startsWith("image/") || !isAllowedExtension(ext)) return null;
  const bytes = base64ToBytes(m[2]!);
  return {
    key: nextKey(),
    file: {
      data: bytes.buffer as ArrayBuffer,
      name: `pasted.${ext}`,
      contentType,
      previewUrl: dataUri,
      meta: { kind: "image", width: size?.width, height: size?.height, bytes: bytes.byteLength },
    },
  };
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 to bytes without `atob` (not on every Hermes build). */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]!) << 18) |
      (B64.indexOf(clean[i + 1] ?? "A") << 12) |
      ((i + 2 < clean.length ? B64.indexOf(clean[i + 2]!) : 0) << 6) |
      (i + 3 < clean.length ? B64.indexOf(clean[i + 3]!) : 0);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length && o < out.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length && o < out.length) out[o++] = n & 255;
  }
  return out;
}

// ---- Drafts ---------------------------------------------------------------

/** What a draft keeps: the text and what it replies to (never the files, which may be gone by then). */
export interface ComposerDraft {
  text: string;
  replyTo?: ReplyTarget | null;
}

const DRAFT_PREFIX = "genesis-chat:draft:";

/**
 * One draft per signed-in person, per conversation, and per thread within it.
 * The person comes first, so `clearDrafts` can find all of theirs on sign-out,
 * and a second login on the phone never sees the first one's drafts.
 */
export function draftKey(userId: string, conversationId: string, threadRootId?: string | null): string {
  return `${DRAFT_PREFIX}${userId}:${conversationId}${threadRootId ? `:${threadRootId}` : ""}`;
}

/**
 * Removes every draft this person left on the phone (call it on sign-out).
 * Needs the storage's `getAllKeys` (AsyncStorage has it); without it, it
 * reports that through `onError` and removes nothing. Never throws.
 */
export async function clearDrafts(storage: DraftStorageLike, userId: string, onError?: (error: unknown) => void): Promise<number> {
  try {
    if (typeof storage.getAllKeys !== "function") {
      onError?.(new Error("chat drafts: the draft storage has no getAllKeys, so drafts weren't cleared"));
      return 0;
    }
    const mine = (await storage.getAllKeys()).filter((k) => k.startsWith(`${DRAFT_PREFIX}${userId}:`));
    if (mine.length === 0) return 0;
    if (typeof storage.multiRemove === "function") await storage.multiRemove(mine);
    else await Promise.all(mine.map((k) => storage.removeItem(k)));
    return mine.length;
  } catch (error) {
    onError?.(error);
    return 0;
  }
}

export function memoryDraftStorage(): DraftStorageLike {
  const map = new Map<string, string>();
  return {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
    getAllKeys: async () => [...map.keys()],
  };
}

export async function loadDraft(storage: DraftStorageLike, key: string): Promise<ComposerDraft | null> {
  try {
    const raw = await storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ComposerDraft;
    return typeof parsed?.text === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Saves the draft a moment after typing stops (and at once on `flush`); an
 * empty composer removes it. Storage errors are swallowed: a draft is a nicety.
 */
export function createDraftSaver(storage: DraftStorageLike, key: string, delayMs = 400) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: ComposerDraft | null = null;
  const write = () => {
    timer = null;
    const d = latest;
    if (!d) return;
    const p = d.text.trim() || d.replyTo ? storage.setItem(key, JSON.stringify(d)) : storage.removeItem(key);
    void p.catch(() => undefined);
  };
  return {
    save(draft: ComposerDraft) {
      latest = draft;
      if (timer) clearTimeout(timer);
      timer = setTimeout(write, delayMs);
    },
    flush() {
      if (timer) clearTimeout(timer);
      write();
    },
    clear() {
      if (timer) clearTimeout(timer);
      timer = null;
      latest = null;
      void storage.removeItem(key).catch(() => undefined);
    },
  };
}
