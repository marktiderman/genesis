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
 * moves by the height they added. The list is a `role="log"` region, so a
 * screen reader hears new messages. Reduce Motion scrolls without animating.
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
  /** The log region's name, for a screen reader. Default "Messages". */
  label?: string;
  className?: string;
  testID?: string;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const nearBottom = (el: HTMLElement) => el.scrollTop + el.clientHeight >= el.scrollHeight - THREAD_AT_BOTTOM_PX;

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
    label = "Messages",
    className,
    testID = "thread-list",
  } = props;
  const scroller = React.useRef<HTMLDivElement | null>(null);
  const topSentinel = React.useRef<HTMLDivElement | null>(null);
  const atBottom = React.useRef(true);
  const latest = React.useRef({ onAtBottomChange, onJumpFailed, data, keyExtractor });
  latest.current = { onAtBottomChange, onJumpFailed, data, keyExtractor };

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
  const before = React.useRef<{ firstId: string | null; lastId: string | null; height: number; top: number }>({ firstId: null, lastId: null, height: 0, top: 0 });
  const jumpingRef = React.useRef(false);
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const prev = before.current;
    if (prev.firstId === null && prev.lastId === null) {
      // First rows: open at the newest.
      el.scrollTop = el.scrollHeight;
    } else if (firstId !== prev.firstId && lastId === prev.lastId) {
      // Earlier rows prepended: move down by what they added.
      el.scrollTop = prev.top + (el.scrollHeight - prev.height);
    } else if (lastId !== prev.lastId && atBottom.current && !jumpingRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    before.current = { firstId, lastId, height: el.scrollHeight, top: el.scrollTop };
  }, [firstId, lastId, data.length]);

  const onScroll = React.useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    before.current = { ...before.current, height: el.scrollHeight, top: el.scrollTop };
    setAtBottom(nearBottom(el));
  }, [setAtBottom]);

  const has = React.useMemo(() => (id: string) => data.some((row) => keyExtractor(row) === id), [data, keyExtractor]);
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
  React.useEffect(() => {
    const target = topSentinel.current;
    const root = scroller.current;
    if (!target || !root || !canLoad || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !atBottom.current) onLoadEarlier?.();
    }, { root, rootMargin: "200px 0px 0px 0px" });
    io.observe(target);
    return () => io.disconnect();
  }, [canLoad, onLoadEarlier]);

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
        <div className="mt-auto flex flex-col">
          {data.map((row, index) => {
            const id = keyExtractor(row);
            return (
              <div key={id} data-row-id={id} tabIndex={-1} className="outline-none">
                {renderItem(row, { index, highlighted: id === highlightedId })}
              </div>
            );
          })}
        </div>
      )}
      {footer}
    </div>
  );
}

/** A conversation's list. See the module docs. */
export const ThreadList = React.forwardRef(ThreadListInner) as <T>(
  props: ThreadListProps<T> & { ref?: React.Ref<ThreadListHandle> },
) => React.ReactElement | null;
