/**
 * @feat:chat
 * The thread as rows for the list: day separators, the "New messages" line,
 * and each message with where its group of one sender starts and ends (the
 * name goes over the first, the avatar beside the last, in a group
 * conversation). Oldest first, top to bottom: the order the thread's list
 * shows and VoiceOver reads (a day's heading and the "New messages" line
 * before the messages they head).
 * A row is keyed by the message's client id, so a message that lands keeps
 * its row.
 */
import { dayLabel, startsDay, startsGroup, itemSender, itemTime, type ThreadItem } from "../core/thread";

export type ThreadRow =
  | { type: "day"; key: string; label: string }
  | { type: "unread"; key: string }
  | {
      type: "message";
      key: string;
      item: ThreadItem;
      mine: boolean;
      senderId: string | null;
      groupStart: boolean;
      groupEnd: boolean;
      /** Over the first of a run, in a group, for someone else's. */
      showName: boolean;
      /** Beside the last of a run, in a group, for someone else's. */
      showAvatar: boolean;
    };

export interface BuildRowsOptions {
  me: string;
  firstUnreadId?: string | null;
  /** More than two people: names and avatars show. */
  group: boolean;
  now?: Date;
  locale?: string;
}

export function rowKey(item: ThreadItem): string {
  return `c:${item.type === "message" ? item.message.clientId : item.pending.clientId}`;
}

/** Oldest first. */
export function buildThreadRows(items: ThreadItem[], options: BuildRowsOptions): ThreadRow[] {
  const { me, firstUnreadId, group, now = new Date(), locale } = options;
  const rows: ThreadRow[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (startsDay(items, i)) rows.push({ type: "day", key: `d:${rowKey(item)}`, label: dayLabel(itemTime(item), now, locale) });
    if (item.type === "message" && item.message.id === firstUnreadId) rows.push({ type: "unread", key: "unread" });
    const senderId = itemSender(item);
    const mine = item.type === "pending" || senderId === me;
    const system = item.type === "message" && item.message.kind === "system";
    const groupStart = startsGroup(items, i) || (item.type === "message" && item.message.id === firstUnreadId);
    const nextItem = items[i + 1];
    const groupEnd = !nextItem || startsGroup(items, i + 1) || (nextItem.type === "message" && nextItem.message.id === firstUnreadId);
    rows.push({
      type: "message",
      key: rowKey(item),
      item,
      mine,
      senderId,
      groupStart,
      groupEnd,
      showName: group && !mine && !system && groupStart,
      showAvatar: group && !mine && !system && groupEnd,
    });
  }
  return rows;
}

/**
 * Newest first, for an inverted list (its first row sits at the bottom). The
 * thread screen no longer uses it: VoiceOver reads an inverted list's rows
 * newest first, each day's heading after its messages.
 * @deprecated Use `buildThreadRows` in a list that isn't inverted.
 */
export function invertedRows(items: ThreadItem[], options: BuildRowsOptions): ThreadRow[] {
  return buildThreadRows(items, options).reverse();
}
