/**
 * The conversation contract's shared logic: which message shows the read
 * receipt, and how an inbox row's time reads. Platform-neutral.
 *
 * @stability Beta
 */
import type { ThreadMessage } from "./types";

const toDate = (value: string | Date) => (typeof value === "string" ? new Date(value) : value);

/** Sent and delivered: a read receipt can mark it. */
export const isDelivered = (m: ThreadMessage): boolean => m.status === undefined || m.status === "sent";

/** The newest of my messages the other side has read, or null. Events and undelivered messages never count. */
export function readReceiptFor(messages: readonly ThreadMessage[], readAt: string | Date | null | undefined): string | null {
  if (!readAt) return null;
  const read = toDate(readAt).getTime();
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.kind !== "event" && m.tone !== "internal" && m.mine && isDelivered(m) && toDate(m.timestamp).getTime() <= read) return m.id;
  }
  return null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The default inbox row time: `9:41`, `Yesterday`, `Monday`, then a short date. */
export function formatInboxTime(date: Date, now: Date): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / DAY_MS);
  if (days <= 0) return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

/** The default message time: "Oct 24, 9:41 AM". */
export function formatMessageTime(date: Date): string {
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
