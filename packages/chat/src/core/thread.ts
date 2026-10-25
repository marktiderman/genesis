/**
 * @feat:chat
 * Pure thread logic, the same on every platform: merging the server's messages
 * with ones still on their way, grouping a run of messages from one sender,
 * day dividers, the unread line, reactions by emoji, and the typing line.
 */
import type { ChatActivity, ChatMessage, PendingMessage } from "./types";

export type ThreadItem =
  | { type: "message"; message: ChatMessage; pending?: undefined }
  | { type: "pending"; pending: PendingMessage; message?: undefined };

/**
 * The server's messages (by seq), then what is still sending, oldest first. A
 * pending message the server already has (same clientId) is dropped, so a send
 * that landed never shows twice.
 */
export function mergeThread(server: ChatMessage[], pending: PendingMessage[]): ThreadItem[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of server) byId.set(m.id, m);
  const sorted = [...byId.values()].sort((a, b) => a.seq - b.seq);
  const landed = new Set(sorted.map((m) => m.clientId));
  const waiting = pending
    .filter((p) => !landed.has(p.clientId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [
    ...sorted.map((message) => ({ type: "message" as const, message })),
    ...waiting.map((p) => ({ type: "pending" as const, pending: p })),
  ];
}

/** Adds or replaces messages in a page, keeping it sorted and free of duplicates. */
export function upsertMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

export function itemSender(item: ThreadItem): string | null {
  return item.type === "message" ? item.message.senderId : item.pending.senderId;
}

export function itemTime(item: ThreadItem): string {
  return item.type === "message" ? item.message.createdAt : item.pending.createdAt;
}

/** Runs of one sender within five minutes share a header (name, avatar). */
export function startsGroup(items: ThreadItem[], index: number, gapMs = 5 * 60_000): boolean {
  if (index === 0) return true;
  const prev = items[index - 1]!;
  const cur = items[index]!;
  if (cur.type === "message" && cur.message.kind === "system") return true;
  if (prev.type === "message" && prev.message.kind === "system") return true;
  if (itemSender(prev) !== itemSender(cur)) return true;
  return Date.parse(itemTime(cur)) - Date.parse(itemTime(prev)) > gapMs || !sameDay(itemTime(prev), itemTime(cur));
}

export function sameDay(a: string, b: string): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** A day divider goes before this item. */
export function startsDay(items: ThreadItem[], index: number): boolean {
  return index === 0 || !sameDay(itemTime(items[index - 1]!), itemTime(items[index]!));
}

/** "Today", "Yesterday", "Monday", or "12 Mar 2026". */
export function dayLabel(iso: string, now = new Date(), locale?: string): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return d.toLocaleDateString(locale, { weekday: "long" });
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

/** The first message after what you had read, from someone else: where "New" goes. */
export function firstUnreadId(messages: ChatMessage[], lastReadSeq: number, me: string): string | null {
  return messages.find((m) => m.seq > lastReadSeq && m.senderId !== me && !m.deletedAt)?.id ?? null;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  mine: boolean;
  userIds: string[];
}

/** Reactions by emoji, most first, then in first-used order. */
export function summarizeReactions(message: ChatMessage, me: string): ReactionSummary[] {
  const order: string[] = [];
  const by = new Map<string, string[]>();
  for (const r of message.reactions) {
    if (!by.has(r.emoji)) {
      by.set(r.emoji, []);
      order.push(r.emoji);
    }
    by.get(r.emoji)!.push(r.userId);
  }
  return order
    .map((emoji) => ({ emoji, count: by.get(emoji)!.length, mine: by.get(emoji)!.includes(me), userIds: by.get(emoji)! }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.emoji) - order.indexOf(b.emoji));
}

/** Who is doing what now: activity older than six seconds has stopped. */
export function currentActivity(activity: ChatActivity[], now = Date.now(), staleMs = 6000): ChatActivity[] {
  const latest = new Map<string, ChatActivity>();
  for (const a of activity) {
    if (now - a.at > staleMs) continue;
    const prev = latest.get(a.userId);
    if (!prev || prev.at < a.at) latest.set(a.userId, a);
  }
  return [...latest.values()];
}

/** "Sam is typing…", "Sam and Lee are typing…", "Sam is recording a voice message…". */
export function activityLine(activity: ChatActivity[], nameOf: (userId: string) => string): string | null {
  if (activity.length === 0) return null;
  const recording = activity.find((a) => a.activity !== "typing");
  if (recording) {
    return `${nameOf(recording.userId)} is recording ${recording.activity === "recording-video" ? "a video" : "a voice message"}…`;
  }
  const names = activity.map((a) => nameOf(a.userId));
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

/** Sends activity at most once every `everyMs`. */
export function throttle(fn: () => void, everyMs = 3000): () => void {
  let last = 0;
  return () => {
    const now = Date.now();
    if (now - last >= everyMs) {
      last = now;
      fn();
    }
  };
}

/** The ids @mentioned in markdown written as `@[Name](user:<uuid>)`. */
export function parseMentions(body: string): string[] {
  const ids = new Set<string>();
  for (const m of body.matchAll(/@\[[^\]]{1,80}\]\(user:([0-9a-f-]{36})\)/gi)) ids.add(m[1]!.toLowerCase());
  return [...ids];
}

/** A one-line preview: text, or what was attached. */
export function previewText(body: string, attachment: string | null | undefined, deleted = false): string {
  if (deleted) return "Message deleted";
  const text = body.replace(/@\[([^\]]+)\]\(user:[0-9a-f-]{36}\)/gi, "@$1").replace(/[*_`#>~]/g, "").trim();
  if (text) return text.length > 140 ? `${text.slice(0, 139)}…` : text;
  switch (attachment) {
    case "image":
      return "Photo";
    case "voice":
      return "Voice message";
    case "video":
      return "Video";
    case "file":
      return "File";
    case null:
    case undefined:
      return "";
    default:
      return "Attachment";
  }
}
