/**
 * ThreadList — a conversation's list on the web: oldest first, top to bottom,
 * that opens at the newest row, follows new rows only while you're at the
 * bottom, keeps your place while earlier rows load at the top, and can go to
 * one row (a search result, the first unread).
 *
 * The web twin of ui-native's `NativeThreadList`, with the same props, on the
 * shared conversation contract (`@marktiderman/genesis-core/conversation`):
 * it renders the rows it's given and never fetches. Earlier pages come from
 * `onLoadEarlier` (near the top, and from the "Load earlier" button), a row out
 * of reach from `onLoadUntil(id)` through `useThreadJump`.
 *
 * Holding the place is done by hand rather than with CSS `overflow-anchor`,
 * which Safari doesn't support: when rows arrive above, the scroll position
 * moves by the height they added, and when rows arrive at both ends at once
 * the first row in view stays where it was. While you're at the bottom the
 * list stays there as things change size (a photo loading, the typing line,
 * the composer growing, the pane being shown).
 *
 * A new `conversationId` opens the new conversation at its newest row (or at
 * `openAt`, the first unread), as on first render.
 *
 * The list is a `role="log"` region with live announcements off, so a page of
 * earlier messages isn't read out; `announce(row)` names a new row at the
 * bottom to say politely (someone else's message). ThreadPage passes one.
 * Reduce Motion scrolls without animating.
 *
 * @stability Beta
 */
import * as React from "react";
import { useThreadJump } from "@marktiderman/genesis-core/conversation";
import { cn } from "../../../utils";
import { Button } from "../../ui/button";
import { Skeleton } from "../../ui/skeleton";

/** Pixels from the bottom that still count as "at the bottom". */
export const THREAD_AT_BOTTOM_PX = 120;

export interface ThreadListHandle {
  /** Go to the newest row (after a send: what you send is what you look at next). */
  scrollToEnd: (options?: { animated?: boolean }) => void;
}

/** What `renderItem` is told about a row besides the row itself. */
export interface ThreadRowInfo {
  index: number;
  /** The row a jump just landed on, for two seconds. */
  highlighted: boolean;
}

export interface ThreadListProps<T> {
  /** Oldest first. */
  data: readonly T[];
  /** A row's id. It must stay the same across refreshes (from a cache to the server). */
  keyExtractor: (row: T) => string;
  renderItem: (row: T, info: ThreadRowInfo) => React.ReactNode;
  /** The first page is loading: shows `loadingView` (a skeleton by default), and a jump waits. */
  loading?: boolean;
  loadingView?: React.ReactNode;
  /** There are earlier rows: loads them near the top, and shows the "Load earlier" button. */
  hasEarlier?: boolean;
  onLoadEarlier?: () => void;
  loadingEarlier?: boolean;
  earlierLabel?: string;
  /** Replaces the default "Load earlier" button. */
  renderEarlier?: (props: { loading: boolean; onPress: () => void; label: string; testID: string }) => React.ReactNode;
  /** Go to this row, loading earlier pages with `onLoadUntil` until it's here. A new id, or the same one after `null`, goes again. */
  jumpTo?: string | null;
  /** Load earlier pages until the row is held; resolve false when it can't be found. */
  onLoadUntil?: (id: string) => Promise<boolean>;
  /** The row couldn't be found. The list goes back to the newest row first. */
  onJumpFailed?: (id: string) => void;
  /** Whether the reader is at the bottom, as it changes (to show a "new messages" pill, say). */
  onAtBottomChange?: (atBottom: boolean) => void;
  /** Above the first row, before the "Load earlier" button: what the thread is about. */
  header?: React.ReactNode;
  /** Under the last row: who is typing. */
  footer?: React.ReactNode;
  /** Shown instead of the rows when there are none. */
  empty?: React.ReactNode;
  /** Which conversation this is. A new one opens at its newest row (or `openAt`), and the held place is forgotten. */
  conversationId?: string | null;
  /** Open here instead of the newest row (the first unread), on first render and for each new `conversationId`. */
  openAt?: string | null;
  /** What a screen reader says when this row arrives at the bottom; null says nothing (your own message). */
  announce?: (row: T) => string | null;
  /** The log region's name, for a screen reader. Default "Messages". */
  label?: string;
  className?: string;
  testID?: string;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const nearBottom = (el: HTMLElement) => el.scrollTop + el.clientHeight >= el.scrollHeight - THREAD_AT_BOTTOM_PX;

type Before = { conversationId: string | null; firstId: string | null; lastId: string | null; height: number; top: number; anchorId: string | null; anchorOffset: number };
const EMPTY_BEFORE: Before = { conversationId: null, firstId: null, lastId: null, height: 0, top: 0, anchorId: null, anchorOffset: 0 };

function ThreadListInner<T>(props: ThreadListProps<T>, ref: React.ForwardedRef<ThreadListHandle>) {
  const {
    data,
    keyExtractor,
    renderItem,
    loading = false,
    loadingView,
    hasEarlier = false,
    onLoadEarlier,
    loadingEarlier = false,
    earlierLabel = "Load earlier messages",
    renderEarlier,
    jumpTo,
    onLoadUntil,
    onJumpFailed,
    onAtBottomChange,
    header,
    footer,
    empty,
    conversationId = null,
    openAt = null,
    announce,
    label = "Messages",
    className,
    testID = "thread-list",
  } = props;
  const scroller = React.useRef<HTMLDivElement | null>(null);
  const content = React.useRef<HTMLDivElement | null>(null);
  const topSentinel = React.useRef<HTMLDivElement | null>(null);
  const atBottom = React.useRef(true);
  const [announcement, setAnnouncement] = React.useState("");
  const latest = React.useRef({ onAtBottomChange, onJumpFailed, onLoadEarlier, announce, data, keyExtractor });
  latest.current = { onAtBottomChange, onJumpFailed, onLoadEarlier, announce, data, keyExtractor };

  const setAtBottom = React.useCallback((v: boolean) => {
    if (atBottom.current === v) return;
    atBottom.current = v;
    latest.current.onAtBottomChange?.(v);
  }, []);

  const toBottom = React.useCallback((animated: boolean) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: animated && !prefersReducedMotion() ? "smooth" : "auto" });
  }, []);

  React.useImperativeHandle(
    ref,
    () => ({
      scrollToEnd: (options) => {
        setAtBottom(true);
        toBottom(options?.animated ?? true);
      },
    }),
    [setAtBottom, toBottom],
  );

  // Rows arriving: earlier ones above keep the place; a newer one at the bottom is followed only when at the bottom.
  const firstId = data.length ? keyExtractor(data[0]!) : null;
  const lastId = data.length ? keyExtractor(data[data.length - 1]!) : null;
  const before = React.useRef<Before>(EMPTY_BEFORE);
  const jumpingRef = React.useRef(false);

  const rowEl = (id: string) => scroller.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`) ?? null;
  // Remember where things are now, so the next change is measured against it.
  const record = React.useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    let anchorId: string | null = null;
    let anchorOffset = 0;
    for (const row of el.querySelectorAll<HTMLElement>("[data-row-id]")) {
      const r = row.getBoundingClientRect();
      if (r.bottom > top) {
        anchorId = row.dataset.rowId ?? null;
        anchorOffset = r.top - top;
        break;
      }
    }
    before.current = { ...before.current, height: el.scrollHeight, top: el.scrollTop, anchorId, anchorOffset };
  }, []);

  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const prev = before.current;
    const opening = (prev.firstId === null && prev.lastId === null) || prev.conversationId !== conversationId;
    if (opening) {
      if (data.length === 0) {
        before.current = { ...EMPTY_BEFORE, conversationId };
        return;
      }
      // A conversation opening: at the first unread, or the newest.
      const at = openAt ? rowEl(openAt) : null;
      if (at) at.scrollIntoView?.({ block: "center" });
      else el.scrollTop = el.scrollHeight;
      setAtBottom(!at);
      setAnnouncement("");
    } else if (firstId !== prev.firstId && lastId === prev.lastId) {
      // Earlier rows prepended: move down by what they added.
      el.scrollTop = prev.top + (el.scrollHeight - prev.height);
    } else {
      if (firstId !== prev.firstId && prev.anchorId) {
        // Rows at both ends at once: keep the first row in view where it was.
        const anchor = rowEl(prev.anchorId);
        if (anchor) el.scrollTop += anchor.getBoundingClientRect().top - el.getBoundingClientRect().top - prev.anchorOffset;
      }
      if (lastId !== prev.lastId) {
        if (atBottom.current && !jumpingRef.current) el.scrollTop = el.scrollHeight;
        const row = data[data.length - 1];
        const said = row !== undefined ? latest.current.announce?.(row) : null;
        if (said) setAnnouncement(said);
      }
    }
    before.current = { ...before.current, conversationId, firstId, lastId };
    record();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the rows or the conversation change
  }, [firstId, lastId, data.length, conversationId]);

  // The scroller unmounts while the first page loads: the rows after it open the conversation afresh.
  const showingLoading = loading && data.length === 0;
  React.useLayoutEffect(() => {
    if (showingLoading) before.current = { ...EMPTY_BEFORE, conversationId: before.current.conversationId };
  }, [showingLoading]);

  // At the bottom, stay there as things change size: a photo loading, the typing line, the composer growing, the pane shown.
  const hasRows = data.length > 0;
  React.useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current && !jumpingRef.current) el.scrollTop = el.scrollHeight;
      record();
    });
    ro.observe(el);
    if (inner) ro.observe(inner);
    return () => ro.disconnect();
  }, [hasRows, showingLoading, record]);

  // Built from the rows only, so a parent re-rendering (typing in the composer) doesn't restart a jump's wait.
  const has = React.useMemo(() => {
    const ids = new Set(data.map((row) => latest.current.keyExtractor(row)));
    return (id: string) => ids.has(id);
  }, [data]);
  const { highlightedId, jumping } = useThreadJump({
    target: jumpTo,
    has,
    loading,
    loadUntil: onLoadUntil,
    scrollTo: (id) => {
      const el = scroller.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`);
      el?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      el?.focus({ preventScroll: true });
    },
    onStart: () => setAtBottom(false),
    onGone: (id) => {
      setAtBottom(true);
      toBottom(false);
      latest.current.onJumpFailed?.(id);
    },
  });
  jumpingRef.current = jumping;

  // Near the top: load earlier rows (not while jumping: its own pages are loading).
  const canLoad = hasEarlier && !loadingEarlier && !jumping && Boolean(onLoadEarlier);
  const canLoadRef = React.useRef(canLoad);
  canLoadRef.current = canLoad;
  // One ask per page: cleared once the page starts loading or there's nothing more.
  const asked = React.useRef(false);
  if (loadingEarlier || !hasEarlier) asked.current = false;
  const loadEarlierNow = React.useCallback(() => {
    if (!canLoadRef.current || asked.current || atBottom.current) return;
    asked.current = true;
    latest.current.onLoadEarlier?.();
  }, []);
  React.useEffect(() => {
    const target = topSentinel.current;
    const root = scroller.current;
    if (!target || !root || !canLoad || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadEarlierNow();
    }, { root, rootMargin: "200px 0px 0px 0px" });
    io.observe(target);
    return () => io.disconnect();
  }, [canLoad, loadEarlierNow]);

  const onScroll = React.useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    record();
    setAtBottom(nearBottom(el));
    // The observer speaks only when the top crosses into reach; in a short thread it's already there.
    if (el.scrollTop < 200) loadEarlierNow();
  }, [setAtBottom, record, loadEarlierNow]);

  const earlierProps = { loading: loadingEarlier, onPress: () => onLoadEarlier?.(), label: earlierLabel, testID: `${testID}-earlier` };

  if (loading && data.length === 0) {
    return (
      <div data-testid={`${testID}-loading`} role="status" aria-label="Loading" className={cn("flex flex-1 flex-col justify-end gap-3 p-4", className)}>
        {loadingView ?? (
          <>
            <Skeleton className="h-9 w-52 rounded-2xl" />
            <Skeleton className="h-9 w-40 self-end rounded-2xl" />
            <Skeleton className="h-9 w-60 rounded-2xl" />
          </>
        )}
      </div>
    );
  }

  return (
    <div
      ref={scroller}
      data-testid={testID}
      role="log"
      aria-live="off"
      aria-label={label}
      aria-busy={loadingEarlier || undefined}
      onScroll={onScroll}
      className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2", className)}
    >
      {header}
      <div ref={topSentinel} aria-hidden />
      {hasEarlier && onLoadEarlier ? (
        renderEarlier ? (
          renderEarlier(earlierProps)
        ) : (
          <div className="flex justify-center py-2">
            <Button variant="ghost" size="sm" onClick={earlierProps.onPress} disabled={loadingEarlier} aria-busy={loadingEarlier} data-testid={earlierProps.testID}>
              {earlierLabel}
            </Button>
          </div>
        )
      ) : null}
      {data.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">{empty}</div>
      ) : (
        // Rows sit at the bottom when there are few of them.
        <div ref={content} className="mt-auto flex flex-col">
          {data.map((row, index) => {
            const id = keyExtractor(row);
            return (
              <div key={id} data-row-id={id} tabIndex={-1} className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {renderItem(row, { index, highlighted: id === highlightedId })}
              </div>
            );
          })}
        </div>
      )}
      {footer}
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid={`${testID}-announcer`}>
        {announcement}
      </div>
    </div>
  );
}

/** A conversation's list. See the module docs. */
export const ThreadList = React.forwardRef(ThreadListInner) as <T>(
  props: ThreadListProps<T> & { ref?: React.Ref<ThreadListHandle> },
) => React.ReactElement | null;
