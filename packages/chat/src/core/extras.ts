/**
 * @feat:chat
 * Small pure helpers for migration 0002's features, shared by every platform: the links a
 * message's text carries (the same rule the database uses to queue previews), https checks
 * for preview images, search snippets split at their « » marks, scheduling quick picks, and
 * topic keys.
 */

/** The https links in a message's text, at most three, as genesis_chat.message_effects_0002 finds them. */
export function extractLinks(body: string, max = 3): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/(https:\/\/[^\s<>()"']{4,})/g)) {
    const url = m[1]!;
    if (url.length <= 2000 && !out.includes(url)) out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

/** An absolute https URL with a host: the only kind a preview image may load from. */
export function isHttpsUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && Boolean(u.hostname);
  } catch {
    return false;
  }
}

export interface SnippetPart {
  text: string;
  match: boolean;
}

/** "a «word» here" → [{a }, {word, match}, { here}]. Unbalanced marks are kept as text. */
export function snippetParts(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let rest = snippet;
  for (;;) {
    const open = rest.indexOf("«");
    const close = open >= 0 ? rest.indexOf("»", open + 1) : -1;
    if (open < 0 || close < 0) break;
    if (open > 0) parts.push({ text: rest.slice(0, open), match: false });
    parts.push({ text: rest.slice(open + 1, close), match: true });
    rest = rest.slice(close + 1);
  }
  if (rest) parts.push({ text: rest, match: false });
  return parts;
}

export interface QuickPick {
  label: string;
  at: Date;
}

/** At 09:00 local on the day `days` after `from`. */
function nineAm(from: Date, days: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days, 9, 0, 0, 0);
  return d;
}

/** "Tomorrow, 9:00 AM" and "Monday, 9:00 AM" (the next Monday after tomorrow; one pick when they're the same day). */
export function scheduleQuickPicks(now: Date = new Date(), locale?: string): QuickPick[] {
  const time = (d: Date) => d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const tomorrow = nineAm(now, 1);
  const picks: QuickPick[] = [{ label: `Tomorrow, ${time(tomorrow)}`, at: tomorrow }];
  const toMonday = ((8 - now.getDay()) % 7) || 7;
  const monday = nineAm(now, toMonday);
  if (monday.getTime() !== tomorrow.getTime()) {
    picks.push({ label: `${monday.toLocaleDateString(locale, { weekday: "long" })}, ${time(monday)}`, at: monday });
  }
  return picks;
}

/** When a scheduled message goes: "Tomorrow, 9:00 AM", "Mon 12 Oct, 9:00 AM". */
export function scheduleLabel(iso: string | Date, now: Date = new Date(), locale?: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const time = d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(d) - start(now)) / 86_400_000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

/** The send time the database accepts: at least a minute and at most a year ahead. */
export function isSchedulable(at: Date, now: Date = new Date()): boolean {
  const t = at.getTime();
  return Number.isFinite(t) && t >= now.getTime() + 60_000 && t <= now.getTime() + 365 * 86_400_000;
}

/** A topic's key from its title: "Week 1: Habits" → "week-1-habits" (at most 120 characters). */
export function topicKey(title: string): string {
  const key = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return key || title.trim().slice(0, 120);
}
