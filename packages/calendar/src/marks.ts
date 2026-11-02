// Marks a group puts on events it reviews together: star one occurrence, hide one, or hide a whole
// series, each optionally for some of its people ("who it's for"). A mark names its event by key
// (merge.ts): an occurrence key for star and hide, a series key for hide_series.
import { occurrenceKey, seriesKey, type EventKeyFields, type MergedEvent, type PersonEvent } from "./merge";

/** @stability Beta */
export type MarkKind = "star" | "hide" | "hide_series";
/** @stability Beta */
export const MARK_KINDS: readonly MarkKind[] = ["star", "hide", "hide_series"];

/** A note on an occurrence or a series. @stability Beta */
export interface EventMark {
  eventKey: string;
  kind: MarkKind;
  /** The people the mark is for; empty for everyone. */
  forPersonIds: readonly string[];
}

/** The key a mark of this kind stores for the event. @stability Beta */
export function markKey(kind: MarkKind, event: EventKeyFields): string {
  return kind === "hide_series" ? seriesKey(event) : occurrenceKey(event);
}

/** A merged event with its marks applied. @stability Beta */
export interface MarkedEvent<E extends PersonEvent = PersonEvent> extends MergedEvent<E> {
  starred: boolean;
  hidden: boolean;
  /** Who the star is for (empty: everyone, or not starred). */
  starredFor: readonly string[];
}

/**
 * Applies marks to merged events. Hidden events stay in the list, flagged, for the caller to drop
 * or dim.
 *
 * @stability Beta
 */
export function applyMarks<E extends PersonEvent>(events: readonly MergedEvent<E>[], marks: readonly EventMark[]): MarkedEvent<E>[] {
  const stars = new Map<string, EventMark>();
  const hidden = new Set<string>();
  const hiddenSeries = new Set<string>();
  for (const m of marks) {
    if (m.kind === "star") stars.set(m.eventKey, m);
    else if (m.kind === "hide") hidden.add(m.eventKey);
    else hiddenSeries.add(m.eventKey);
  }
  return events.map((e) => {
    const star = stars.get(e.key);
    return {
      ...e,
      starred: Boolean(star),
      hidden: hidden.has(e.key) || hiddenSeries.has(e.seriesKey),
      starredFor: star?.forPersonIds ?? [],
    };
  });
}
