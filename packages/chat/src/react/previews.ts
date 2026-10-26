/**
 * @feat:chat
 * One-line previews of a message (the inbox, the long-press sheet) where an app attachment kind
 * reads as its `label`, else its title ("Check-in"), not "Attachment". No React or DOM: web and
 * native both draw from it.
 */
import { previewText } from "../core/thread";
import type { ChatAttachment, ChatMessage } from "../core/types";
import type { ChatAttachmentKind, ChatCardContext } from "./index";

/** Calls a kind's `title`, `subtitle` or `action` with the card context. */
export const callAttachmentKind = <K extends "title" | "subtitle" | "action">(kind: ChatAttachmentKind | undefined, key: K, a: ChatAttachment, ctx: ChatCardContext) =>
  (kind?.[key] as ((this: ChatAttachmentKind, a: ChatAttachment, ctx: ChatCardContext) => unknown) | undefined)?.call(kind!, a, ctx) as
    | ReturnType<NonNullable<ChatAttachmentKind[K]>>
    | undefined;

/** A card's title (the kind's, else the file's name, else the kind); an app kind that throws reads as its name. */
export function cardTitle(kind: ChatAttachmentKind | undefined, a: ChatAttachment, ctx: ChatCardContext = { mine: false }): string {
  try {
    return callAttachmentKind(kind, "title", a, ctx) || a.name || a.kind;
  } catch {
    return a.name || a.kind;
  }
}

/** An attachment with only its kind, for a preview that knows no more (the inbox's last message). */
function bareAttachment(kind: string): ChatAttachment {
  return { id: "", messageId: "", position: 0, kind, ref: {}, provider: "none", path: null, providerId: null, playbackId: null, url: null, status: "ready", name: null, mime: null, bytes: null, width: null, height: null, durationMs: null, waveform: null, posterPath: null, thumbhash: null, transcript: null, transcriptStatus: null };
}

/**
 * A message's one-line preview: its text, else what it carries, where an app kind reads as its
 * title ("Check-in") instead of "Attachment". `attachment` is the kind alone (the inbox) or the
 * attachment itself.
 */
export function attachmentPreview(body: string, attachment: string | ChatAttachment | null | undefined, kinds: Record<string, ChatAttachmentKind> | undefined, deleted = false): string {
  const kind = typeof attachment === "string" ? attachment : attachment?.kind;
  const text = previewText(body, kind, deleted);
  // Text that reads as something (not only markdown marks) is the preview, as previewText has it.
  if (deleted || !kind || !kinds || !Object.prototype.hasOwnProperty.call(kinds, kind) || previewText(body, null)) return text;
  const a = typeof attachment === "string" ? bareAttachment(attachment) : attachment!;
  const k = kinds[kind];
  const title = typeof k?.label === "string" && k.label.trim() ? k.label.trim() : cardTitle(k, a);
  return title && title !== kind ? title : text;
}

/** The long-press sheet's caption for a message. */
export function messagePreview(message: ChatMessage, kinds: Record<string, ChatAttachmentKind> | undefined): string {
  return attachmentPreview(message.body, message.attachments[0], kinds, Boolean(message.deletedAt));
}

