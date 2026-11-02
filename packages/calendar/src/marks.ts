// Marks a group puts on events it reviews together: star one occurrence, hide one, or hide a whole
// series, each optionally for some of its people ("who it's for"). A mark names its event by key
// (merge.ts): an occurrence key for star and hide, a series key for hide_series.
import { occurrenceKey, seriesKey, toBusyKey, type EventKeyFields, type MergedEvent, type PersonEvent } from "./merge";

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
  /** Who the stars are for, every star's people together (empty: everyone, or not starred). */
  starredFor: readonly string[];
  /** Who the hides are for, every hide's people together (empty: everyone, or not hidden). */
  hiddenFor: readonly string[];
}

/** People marks are for, merged: null for none yet, an empty set once one is for everyone. */
type Scope = Set<string> | null;
const widen = (scope: Scope | undefined, people: readonly string[]): Scope => {
  if (scope && scope.size === 0) return scope;
  if (!people.length) return new Set();
  return new Set([...(scope ?? []), ...people]);
};

/**
 * Applies marks to merged events. Hidden events stay in the list, flagged, for the caller to drop
 * or dim; `starredFor` and `hiddenFor` say who for, so a caller showing one person checks them.
 *
 * @stability Beta
 */
export function applyMarks<E extends PersonEvent>(events: readonly MergedEvent<E>[], marks: readonly EventMark[]): MarkedEvent<E>[] {
  const stars = new Map<string, Scope>();
  const hidden = new Map<string, Scope>();
  const hiddenSeries = new Map<string, Scope>();
  // Each mark under its key and its busy key, so it applies whether the viewer sees the event or
  // only a busy block (whose keys are toBusyKey's), and whichever of the two it was stored under.
  for (const m of marks) {
    for (const key of [m.eventKey, toBusyKey(m.eventKey)]) {
      const into = m.kind === "star" ? stars : m.kind === "hide" ? hidden : hiddenSeries;
      into.set(key, widen(into.get(key), m.forPersonIds));
    }
  }
  return events.map((e) => {
    const star = stars.get(e.key);
    const hides = [hidden.get(e.key), hiddenSeries.get(e.seriesKey)].filter((s): s is Set<string> => Boolean(s));
    const hide = hides.reduce<Scope>((all, s) => widen(all, s.size ? [...s] : []), null);
    return {
      ...e,
      starred: Boolean(star),
      hidden: Boolean(hide),
      starredFor: star ? [...star] : [],
      hiddenFor: hide ? [...hide] : [],
    };
  });
}
