/**
 * @feat:chat
 * The emoji picker's logic, without React: the bundled emoji by category
 * (`emoji-data.ts`, generated, never fetched), search over their labels and
 * tags, and the person's recent emoji, kept with their drafts (so signing out
 * clears them with the drafts, through `clearDrafts`).
 */
import { draftKey } from "./composer-state";
import { EMOJI_GROUP_DATA } from "./emoji-data";
import type { DraftStorageLike } from "./modules";

export type EmojiCategoryId = keyof typeof EMOJI_GROUP_DATA;

export interface EmojiEntry {
  emoji: string;
  label: string;
  /** Search words beyond the label. */
  tags: string;
}

/** The categories in the order the picker shows them, each with the emoji its tab shows. */
export const EMOJI_CATEGORIES: readonly { id: EmojiCategoryId; icon: string }[] = [
  { id: "smileys", icon: "😀" },
  { id: "people", icon: "👋" },
  { id: "nature", icon: "🐻" },
  { id: "food", icon: "🍔" },
  { id: "travel", icon: "🚗" },
  { id: "activities", icon: "⚽" },
  { id: "objects", icon: "💡" },
  { id: "symbols", icon: "❤️" },
  { id: "flags", icon: "🏳️" },
];

const parsed = new Map<EmojiCategoryId, EmojiEntry[]>();

/** One category's emoji, parsed the first time it's asked for. */
export function emojiInCategory(id: EmojiCategoryId): readonly EmojiEntry[] {
  let list = parsed.get(id);
  if (!list) {
    list = EMOJI_GROUP_DATA[id].split("\n").map((line) => {
      const [emoji = "", label = "", tags = ""] = line.split("\t");
      return { emoji, label, tags };
    });
    parsed.set(id, list);
  }
  return list;
}

let index: Map<string, EmojiEntry> | null = null;
function byEmoji(): Map<string, EmojiEntry> {
  if (!index) {
    index = new Map();
    for (const c of EMOJI_CATEGORIES) for (const e of emojiInCategory(c.id)) index.set(e.emoji, e);
  }
  return index;
}

/** An emoji's entry (its label for screen readers), or a bare one for an emoji the data doesn't have. */
export function emojiEntry(emoji: string): EmojiEntry {
  return byEmoji().get(emoji) ?? { emoji, label: emoji, tags: "" };
}

/**
 * Emoji whose label or tags have a word starting with every word of the query, those whose
 * label starts with the query first. "thumbs up" finds 👍, "heart" every heart, "gri" 😀.
 */
export function searchEmoji(query: string, limit = 120): EmojiEntry[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const whole = words.join(" ");
  const first: EmojiEntry[] = [];
  const rest: EmojiEntry[] = [];
  for (const e of byEmoji().values()) {
    const label = e.label.toLowerCase();
    const hay = `${label} ${e.tags.toLowerCase()}`.split(/[^\p{L}\p{N}]+/u);
    if (!words.every((w) => hay.some((h) => h.startsWith(w)))) continue;
    (label.startsWith(whole) ? first : rest).push(e);
  }
  return [...first, ...rest].slice(0, limit);
}

/** How many recent emoji the picker keeps. */
export const RECENT_EMOJI_MAX = 24;

/** `emoji` first, once, the oldest dropped past `max`. */
export function pushRecentEmoji(recents: readonly string[], emoji: string, max = RECENT_EMOJI_MAX): string[] {
  return [emoji, ...recents.filter((e) => e !== emoji)].slice(0, max);
}

/** Where a person's recent emoji are kept: under their drafts' prefix, so `clearDrafts` removes them too. */
export function recentEmojiKey(userId: string): string {
  return draftKey(userId, "~recent-emoji");
}

export async function loadRecentEmoji(storage: DraftStorageLike, userId: string): Promise<string[]> {
  try {
    const raw = await storage.getItem(recentEmojiKey(userId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((e): e is string => typeof e === "string" && e.length > 0).slice(0, RECENT_EMOJI_MAX) : [];
  } catch {
    return [];
  }
}

export async function saveRecentEmoji(storage: DraftStorageLike, userId: string, recents: readonly string[]): Promise<void> {
  try {
    await storage.setItem(recentEmojiKey(userId), JSON.stringify(recents.slice(0, RECENT_EMOJI_MAX)));
  } catch {
    // Recents are a convenience: losing them is not worth an error.
  }
}

/** Puts `insert` in place of the selected text (or at the cursor), and where the cursor goes after it. */
export function insertAtSelection(text: string, selection: { start: number; end: number } | null, insert: string): { text: string; cursor: number } {
  const start = Math.max(0, Math.min(selection?.start ?? text.length, text.length));
  const end = Math.max(start, Math.min(selection?.end ?? start, text.length));
  return { text: text.slice(0, start) + insert + text.slice(end), cursor: start + insert.length };
}
