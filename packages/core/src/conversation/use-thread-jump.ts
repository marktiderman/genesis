/**
 * useThreadJump — going to one row of a thread (a search result, a pinned
 * message, the first unread): load earlier pages until the row is held, then
 * scroll to it and highlight it for two seconds. A row that can't be found
 * says so: a row is gone when, once `loadUntil` has settled (or failed), no
 * row answers to its id. What counts is what's drawn, not what a cache holds.
 *
 * Promoted from genesis-chat's `useJumpToMessage` (G4), generalised from
 * chat's sequence numbers to row ids. It's a state machine driven by the
 * rows, not a one-shot: a target set before the first page has loaded waits
 * for `loading` to end, a row that arrives a render or two after `loadUntil`
 * resolves is still found, and going to the same id again (after `null`)
 * goes again.
 *
 * @stability Beta
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseThreadJumpOptions {
  /** The row to go to; `null` clears it, and a new id (or the same one after `null`) starts again. */
  target: string | null | undefined;
  /** Whether the row is held now. */
  has: (id: string) => boolean;
  /** The first page is still loading: don't start until it's in. */
  loading?: boolean | undefined;
  /** Load earlier pages until the row is held; resolve false when it can't be. Without it, a row not held is gone. */
  loadUntil?: ((id: string) => Promise<boolean>) | undefined;
  /** Scroll to the row. */
  scrollTo: (id: string) => void;
  /** Before loading or scrolling (stop following the bottom). */
  onStart?: (() => void) | undefined;
  /** Scrolled to it (say so to VoiceOver). */
  onLanded?: ((id: string) => void) | undefined;
  /** No row answers to it once `loadUntil` has settled, or `loadUntil` failed (go back to where the thread was). */
  onGone?: ((id: string) => void) | undefined;
}

type Pending = { id: string; phase: "new" | "loading" | "loaded" };

/** After `loadUntil` resolves, how long the rows have to arrive before the row counts as gone. */
export const JUMP_SETTLE_MS = 400;

export function useThreadJump({ target, has, loading = false, loadUntil, scrollTo, onStart, onLanded, onGone }: UseThreadJumpOptions) {
  const [pending, setPending] = useState<Pending | null>(target ? { id: target, phase: "new" } : null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const armed = useRef<Pending | null>(null);
  const goneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (target) setPending({ id: target, phase: "new" });
    else {
      // null cancels a jump in progress.
      if (goneTimerRef.current) clearTimeout(goneTimerRef.current);
      armed.current = null;
      setPending(null);
    }
  }, [target]);

  const latest = useRef({ scrollTo, onStart, onLanded, onGone, loadUntil });
  latest.current = { scrollTo, onStart, onLanded, onGone, loadUntil };
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goneTimer = goneTimerRef;
  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      if (goneTimer.current) clearTimeout(goneTimer.current);
    },
    [],
  );

  const go = useCallback((id: string) => {
    latest.current.onStart?.();
    latest.current.scrollTo(id);
    latest.current.onLanded?.(id);
    setHighlightedId(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightedId((h) => (h === id ? null : h)), 2000);
  }, []);

  useEffect(() => {
    if (!pending || loading) return;
    const { id, phase } = pending;
    if (has(id)) {
      if (goneTimer.current) clearTimeout(goneTimer.current);
      setPending(null);
      go(id);
      return;
    }
    if (phase === "loading") return;
    if (phase === "loaded" || !latest.current.loadUntil) {
      // The rows may reach the list a render or two after the load resolved: give them a moment,
      // once per pending jump (new rows arriving in a busy thread don't restart it).
      if (armed.current === pending) return;
      armed.current = pending;
      if (goneTimer.current) clearTimeout(goneTimer.current);
      goneTimer.current = setTimeout(
        () => {
          setPending((p) => (p && p.id === id ? null : p));
          latest.current.onGone?.(id);
        },
        phase === "loaded" ? JUMP_SETTLE_MS : 0,
      );
      return;
    }
    latest.current.onStart?.();
    setPending({ id, phase: "loading" });
    const settle = () => setPending((p) => (p && p.id === id ? { ...p, phase: "loaded" } : p));
    void latest.current.loadUntil(id).then(settle, settle);
  }, [pending, loading, has, go]);

  return { highlightedId, jumping: pending !== null };
}
