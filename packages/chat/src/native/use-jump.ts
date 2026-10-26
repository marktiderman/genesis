/**
 * @feat:chat
 * Going to one message in a thread (a search result, a pinned message): earlier pages load until
 * it is held (`useConversation().loadUntil(seq)`), then the list scrolls to it and it is
 * highlighted for two seconds. A message that can't be found (deleted, or out of reach) says so.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ThreadRow } from "./rows";

export interface JumpTarget {
  messageId: string;
  seq?: number;
}

/** The row a message is drawn in, or -1. */
export function rowIndexOf(rows: readonly ThreadRow[], messageId: string): number {
  return rows.findIndex((r) => r.type === "message" && r.item.type === "message" && r.item.message.id === messageId);
}

export interface UseJumpOptions {
  /** What to go to; a new target (another id or seq) starts again. */
  target: JumpTarget | null | undefined;
  rows: readonly ThreadRow[];
  /** The thread's first page is still loading. */
  loading: boolean;
  has: (messageId: string) => boolean;
  loadUntil: (seq: number) => Promise<boolean>;
  /** Scroll the list to this row (centred); the message id, for a retry once rows have moved. */
  scrollTo: (index: number, messageId: string) => void;
  /** Called before loading or scrolling (stop following the bottom). */
  onStart?: () => void;
  /** It was scrolled to (say so to VoiceOver). */
  onLanded?: (messageId: string) => void;
  /** It isn't there any more (go back to where the thread was). */
  onGone: () => void;
  onError: (e: unknown) => void;
}

type Pending = JumpTarget & { phase: "new" | "loading" | "loaded" };

export function useJumpToMessage({ target, rows, loading, has, loadUntil, scrollTo, onStart, onLanded, onGone, onError }: UseJumpOptions) {
  const [pending, setPending] = useState<Pending | null>(target ? { ...target, phase: "new" } : null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  useEffect(() => {
    if (target) setPending({ ...target, phase: "new" });
  }, [target?.messageId, target?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const latest = useRef({ rows, scrollTo, onStart, onLanded, onGone, onError });
  latest.current = { rows, scrollTo, onStart, onLanded, onGone, onError };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const go = useCallback((messageId: string) => {
    const index = rowIndexOf(latest.current.rows, messageId);
    if (index < 0) return;
    latest.current.onStart?.();
    latest.current.scrollTo(index, messageId);
    latest.current.onLanded?.(messageId);
    setHighlightedId(messageId);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHighlightedId((h) => (h === messageId ? null : h)), 2000);
  }, []);

  useEffect(() => {
    if (!pending || loading) return;
    const { messageId, seq, phase } = pending;
    if (has(messageId)) {
      setPending(null);
      go(messageId);
      return;
    }
    if (phase === "loading") return;
    if (phase === "loaded" || seq == null) {
      setPending(null);
      latest.current.onGone();
      return;
    }
    latest.current.onStart?.();
    setPending({ messageId, seq, phase: "loading" });
    const settle = () => setPending((p) => (p && p.messageId === messageId ? { ...p, phase: "loaded" } : p));
    void loadUntil(seq).then(settle, (e) => {
      latest.current.onError(e);
      // Not found after all: the "loaded" step says so and puts the thread back.
      settle();
    });
  }, [pending, loading, has, loadUntil, go]);

  return { highlightedId, jumping: pending !== null };
}
