import { createContext, useContext } from "react";

/**
 * The video a worksheet is about, as the host app plays it. `timestamp-notes`
 * fields read it: with `currentTime` the add row starts at the current moment
 * ("Add note at 1:23"), with `seek` a note's time plays the video from there.
 * Both are in seconds from the start of the full video.
 */
export interface SubjectTime {
  /** The playhead now, or undefined when it isn't known yet. */
  currentTime?: (() => number | undefined) | undefined;
  /** Move the playhead. */
  seek?: ((seconds: number) => void) | undefined;
}

/** Provide it around `<Form>` to link `timestamp-notes` fields to a player. */
export const SubjectTimeContext = createContext<SubjectTime | null>(null);

/** The enclosing `SubjectTimeContext` value, or null. */
export function useSubjectTime(): SubjectTime | null {
  return useContext(SubjectTimeContext);
}

/**
 * The text a worksheet is about (a verse, a quote). `highlights` fields
 * highlight passages of it; a field's own `props.text` is used when no host
 * provides one. Offsets are UTF-16 indices into this exact string.
 */
export const SubjectTextContext = createContext<string | null>(null);

/** The enclosing `SubjectTextContext` value, or null. */
export function useSubjectText(): string | null {
  return useContext(SubjectTextContext);
}
