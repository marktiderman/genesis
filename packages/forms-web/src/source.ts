import { createContext, useContext } from "react";

/**
 * The video or audio a form is about, as the host app plays it. `media-notes`
 * fields read it: with `currentTime` the add row starts at the current moment
 * ("Add note at 1:23"), with `seek` a note's time plays the media from there.
 * Both are in seconds from the start of the full recording.
 */
export interface MediaTime {
  /** The playhead now, or undefined when it isn't known yet. */
  currentTime?: (() => number | undefined) | undefined;
  /** Move the playhead. */
  seek?: ((seconds: number) => void) | undefined;
}

/** Provide it around `<Form>` to link `media-notes` fields to a media player. */
export const MediaTimeContext = createContext<MediaTime | null>(null);

/** The enclosing `MediaTimeContext` value, or null. */
export function useMediaTime(): MediaTime | null {
  return useContext(MediaTimeContext);
}

/**
 * The text a form is about (an article, a policy, a contract). `text-highlights`
 * fields highlight passages of it; a field's own `props.text` is used when no
 * host provides one. Offsets are UTF-16 indices into this exact string.
 */
export const SourceTextContext = createContext<string | null>(null);

/** The enclosing `SourceTextContext` value, or null. */
export function useSourceText(): string | null {
  return useContext(SourceTextContext);
}
