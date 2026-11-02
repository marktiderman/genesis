// One event per (iCalendar UID, start) across everyone's calendars: an event three people are on
// shows once, listing all three. Events without a UID stay one per copy. What a viewer sees of it
// is decided per viewer, from only the copies that viewer may see.
import { isDay, type EventOccurrence } from "@marktiderman/genesis-core/dates";
import { toTimeKey, toTimeValue, type CalendarEvent } from "./types";

/** The fields that name an occurrence. @stability Beta */
export type EventKeyFields = Pick<CalendarEvent, "sourceId" | "externalRef" | "icalUid" | "seriesRef" | "start">;

/**
 * The key of one occurrence, the same for every person's copy:
 * `<icalUid or sourceId:externalRef>|<start>`, the start normalised (`toTimeKey`): a timed start
 * as its UTC instant, so copies written in different zones merge, and an all-day start as its
 * day. An all-day copy and a timed copy of the same UID keep different keys and show as two
 * events: they are different occurrences (one copy was changed), and showing both is safer than
 * hiding one. An app's database that stores keys builds the same string.
 *
 * @stability Beta
 */
export function occurrenceKey(e: EventKeyFields): string {
  return `${e.icalUid ?? `${e.sourceId}:${e.externalRef}`}|${toTimeKey(e.start)}`;
}

/** The key of the whole series an occurrence belongs to (its UID; a one-off event is its own series). @stability Beta */
export function seriesKey(e: EventKeyFields): string {
  return e.icalUid ?? e.seriesRef ?? `${e.sourceId}:${e.externalRef}`;
}

/**
 * The key a busy block carries in place of an occurrence or series key, so a viewer who may not
 * see an event never receives its UID (or its source's ids) through `key` or `seriesKey`.
 * `busy:` and 16 hex characters: a stable, non-cryptographic 64-bit hash (two FNV-1a passes).
 * It hides the UID from display and logs; it is not a secret, since someone who already knows a
 * UID can hash it and compare. Marks stored under the real key still apply (`applyMarks`).
 *
 * @stability Beta
 */
export function toBusyKey(key: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 15);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `busy:${hex(a)}${hex(b)}`;
}

/** A copy of an event on one person's calendar. @stability Beta */
export interface PersonEvent extends EventKeyFields, Pick<EventOccurrence, "end" | "title" | "visibility"> {
  personId: string;
  /** Default: true when `start` is a day. */
  allDay?: boolean;
}

/** One event as one viewer sees it, merged from everyone's copies. @stability Beta */
export interface MergedEvent<E extends PersonEvent = PersonEvent> {
  /** `occurrenceKey`, or for a busy block its `toBusyKey`. */
  key: string;
  /** `seriesKey`, or for a busy block its `toBusyKey`. */
  seriesKey: string;
  /** When it is, from the first copy: the time is never private, so a busy block can be drawn. */
  start: EventOccurrence["start"];
  end: EventOccurrence["end"];
  allDay: boolean;
  /** The first copy whose details this viewer may see, or null when they may see none. */
  event: E | null;
  /** The viewer may see no copy's details: show it as busy, with no title or place. */
  busy: boolean;
  /** Everyone with a copy, in first-seen order: shown for busy blocks too (who is busy is the point). */
  people: string[];
}

/** What `mergeEvents` takes. @stability Beta */
export interface MergeOptions<E extends PersonEvent = PersonEvent> {
  /** Who is looking (a person id). Without one, only public copies show details. */
  viewer?: string | null;
  /** Whether `viewer` may see this copy's details. Default: the copy is public, or it is the viewer's own. */
  canSee?: (copy: E, viewer: string | null) => boolean;
}

const defaultCanSee = (copy: PersonEvent, viewer: string | null) => copy.visibility === "public" || (viewer !== null && copy.personId === viewer);

/**
 * Merges people's copies, in start order. Each merged event shows the details of a copy the
 * viewer may see; when every copy is one they may not (someone else's private event), it is
 * busy, `event` is null and its keys are `toBusyKey`s, so a private title or UID never reaches
 * a viewer who can't see it. Who has a copy (`people`) and when it is are still shown.
 *
 * @stability Beta
 */
export function mergeEvents<E extends PersonEvent>(rows: readonly E[], options: MergeOptions<E> = {}): MergedEvent<E>[] {
  const viewer = options.viewer ?? null;
  const canSee = options.canSee ?? defaultCanSee;
  const byKey = new Map<string, MergedEvent<E>>();
  for (const row of rows) {
    const key = occurrenceKey(row);
    const visible = canSee(row, viewer);
    const found = byKey.get(key);
    if (!found) {
      byKey.set(key, {
        key,
        seriesKey: seriesKey(row),
        start: row.start,
        end: row.end,
        allDay: row.allDay ?? (typeof row.start === "string" && isDay(row.start)),
        event: visible ? row : null,
        busy: !visible,
        people: [row.personId],
      });
      continue;
    }
    if (!found.people.includes(row.personId)) found.people.push(row.personId);
    if (found.busy && visible) {
      found.event = row;
      found.busy = false;
    }
  }
  const merged = [...byKey.values()].map((m) => (m.busy ? { ...m, key: toBusyKey(m.key), seriesKey: toBusyKey(m.seriesKey) } : m));
  return merged.sort((a, b) => toTimeValue(a.start) - toTimeValue(b.start) || a.key.localeCompare(b.key));
}
