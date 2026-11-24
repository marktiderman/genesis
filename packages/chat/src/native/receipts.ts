/**
 * @feat:chat
 * Message status, the way iMessage shows it: under the last message you sent, "Sending…",
 * "Sent", "Delivered", then "Read 9:41" in a direct conversation or "Read by 2" / "Read by
 * everyone" in a group. A send that failed shows nothing here: its bubble keeps the failure,
 * Retry and Delete.
 *
 * - Sending: still in the outbox, not yet posted.
 * - Sent: posted, but the outbox still holds it (a video's bytes are still going up).
 * - Delivered: the server has it (it has a seq) and nobody else has read that far.
 * - Read: the other member's `lastReadSeq` has reached its seq, with their `lastReadAt` (chat
 *   migration 0006) as the time; without it, "Read" with no time.
 * - Read by N: in a group, the other members whose `lastReadSeq` has reached it.
 */
import { dayLabel, sameDay, type ThreadItem } from "../core/thread";
import type { ChatMember } from "../core/types";
import { fill, type ChatNativeCopy } from "./copy";
import { rowKey } from "./rows";

/** Whether the thread shows message status (`ChatThreadScreen receipts`). */
export type ChatReceiptsMode = "show" | "hide";

export type MessageReceipt =
  | { state: "sending" }
  | { state: "sent" }
  | { state: "delivered" }
  | { state: "read"; at: string | null }
  | { state: "read-by"; readers: string[]; everyone: boolean };

export interface MessageReceiptFor {
  /** The row it goes under (`rowKey`). */
  key: string;
  receipt: MessageReceipt;
}

export interface ReceiptOptions {
  me: string;
  /** The conversation's members (observers aren't counted). */
  members: readonly ChatMember[];
  /** More than two people: "Read by N" instead of "Read". */
  group: boolean;
  /** Client ids the outbox still holds. */
  queued?: ReadonlySet<string>;
  receipts?: ChatReceiptsMode;
}

/** The status of the last message you sent, and the row it goes under; null when there is none to show. */
export function lastSentReceipt(items: readonly ThreadItem[], options: ReceiptOptions): MessageReceiptFor | null {
  const { me, members, group, queued, receipts = "show" } = options;
  if (receipts === "hide") return null;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.type === "pending") {
      if (item.pending.senderId !== me) continue;
      if (item.pending.status === "failed") return null;
      const posted = Boolean((item.pending as { sentMessageId?: string }).sentMessageId);
      return { key: rowKey(item), receipt: { state: posted ? "sent" : "sending" } };
    }
    const m = item.message;
    if (m.senderId !== me || m.kind === "system" || m.deletedAt) continue;
    // Seen by only some (observers), or hidden by moderation: the others' read places say nothing
    // about it, so it carries no status.
    if (m.visibility === "observers" || m.moderation === "hidden") return null;
    return { key: rowKey(item), receipt: receiptFor(m.seq, m.clientId) };
  }
  return null;

  function receiptFor(seq: number, clientId: string): MessageReceipt {
    if (queued?.has(clientId)) return { state: "sent" };
    const others = members.filter((x) => x.userId !== me && x.role !== "observer");
    const readers = others.filter((x) => x.lastReadSeq >= seq);
    if (!group) {
      const other = readers[0];
      return other ? { state: "read", at: other.lastReadAt ?? null } : { state: "delivered" };
    }
    if (readers.length === 0) return { state: "delivered" };
    return { state: "read-by", readers: readers.map((x) => x.userId), everyone: readers.length === others.length };
  }
}

/** When it was read: the time today, else the day ("Yesterday", "Monday", "12 Mar"). */
export function readWhen(at: string, now = new Date(), locale?: string): string {
  return sameDay(at, now.toISOString()) ? new Date(at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }) : dayLabel(at, now, locale);
}

export type ReceiptCopy = Pick<ChatNativeCopy, "receiptSending" | "receiptSent" | "receiptDelivered" | "receiptRead" | "receiptReadAt" | "receiptReadBy" | "receiptReadByEveryone">;

/** What the line under the message says. */
export function receiptText(receipt: MessageReceipt, copy: ReceiptCopy, now = new Date(), locale?: string): string {
  switch (receipt.state) {
    case "sending":
      return copy.receiptSending;
    case "sent":
      return copy.receiptSent;
    case "delivered":
      return copy.receiptDelivered;
    case "read":
      return receipt.at ? fill(copy.receiptReadAt, { time: readWhen(receipt.at, now, locale) }) : copy.receiptRead;
    case "read-by":
      return receipt.everyone ? copy.receiptReadByEveryone : fill(copy.receiptReadBy, { count: receipt.readers.length });
  }
}
