/**
 * @feat:chat
 * Small formatting helpers for the web renderers: times, sizes, and the
 * one-line description of a message a screen reader hears.
 */
import { relativeTime as uiRelativeTime } from "@marktiderman/genesis-ui/utils";
import { previewText } from "../core/thread";
import type { ChatMessage } from "../core/types";

/** A person as the app names them. The package knows no people tables: the app supplies this. */
export interface ChatUser {
  name: string;
  avatarUrl?: string | null;
}

export type ResolveUser = (userId: string) => ChatUser;

/** 10:42 (in the reader's locale). */
export function clockTime(iso: string, locale?: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

/**
 * The inbox's time: "now", "5m", "10:42" today, "Yesterday", "Mon", or "12 Mar". Genesis UI's
 * `relativeTime` in its compact style, in the reader's locale (`locale`, default the runtime's).
 */
export function relativeTime(iso: string | null | undefined, now = new Date(), locale?: string): string {
  if (!iso) return "";
  return uiRelativeTime(iso, now, { style: "compact", locale: locale ?? new Intl.DateTimeFormat().resolvedOptions().locale });
}

/** 12 KB, 3.4 MB. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** What a screen reader hears for one bubble: "Sam, 10:42: See you then". */
export function messageLabel(message: Pick<ChatMessage, "body" | "createdAt" | "deletedAt" | "attachments" | "editedAt" | "visibility">, sender: string, locale?: string): string {
  const what = previewText(message.body, message.attachments[0]?.kind ?? null, Boolean(message.deletedAt)) || "Message";
  const extra = [message.visibility === "observers" ? "internal note" : null, message.editedAt && !message.deletedAt ? "edited" : null].filter(Boolean);
  return `${sender}, ${clockTime(message.createdAt, locale)}: ${what}${extra.length ? ` (${extra.join(", ")})` : ""}`;
}
