/**
 * NativeThreadList — a conversation's list: oldest first, top to bottom (the
 * order VoiceOver reads), that opens at the newest row, follows new rows only
 * while you're at the bottom, keeps your place while earlier rows load at the
 * top, and can go to one row (a search result, the first unread).
 *
 * The atom under ThreadPage, and the one any app builds its own thread from:
 * it renders the rows it's given and never fetches. Earlier pages come from
 * `onLoadEarlier`, a row out of reach from `onLoadUntil(id)`.
 *
 * FlashList v2 (`GenesisModules.list`) when the app passed it: its chat mode
 * (`startRenderingFromBottom`, `autoscrollToBottomThreshold`, the first
 * visible row held when rows prepend). Without it, FlatList, which keeps its
 * place with `maintainVisibleContentPosition` (anchored past the header) and
 * follows the bottom by hand.
 *
 * Not inverted: in an inverted FlashList a new row at index 0 lands under the
 * composer, and VoiceOver reads each day's heading after its messages.
 *
 * Earlier rows load by themselves near the top, and the explicit "Load
 * earlier" button stays: VoiceOver can't reach rows a virtualized list hasn't
 * rendered. Going to a row waits for `loading`, loads until it's held,
 * scrolls to it (again after FlashList's own placement on open), highlights
 * it for two seconds and announces it. Reduce Motion scrolls without
 * animating.
 *
 * Promoted from genesis-chat's thread and its `useJumpToMessage` (G4); chat
 * moves onto it later.
 *
 * @stability Beta
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type ComponentType, type ReactElement, type ReactNode } from "react";
import { AccessibilityInfo, FlatList, Pressable, View } from "react-native";
import { useGenesisModules } from "../native-modules";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { useThreadJump } from "../hooks/use-thread-jump";
import { NativeSkeleton } from "./skeleton";
import { NativeText } from "./text";

/** The scroll event fields the list reads. */
interface ScrollMetrics {
  contentOffset: { y: number };
  contentSize: { height: number };
  layoutMeasurement: { height: number };
}

const announce = (text: string) => (AccessibilityInfo as { announceForAccessibility?: (t: string) => void }).announceForAccessibility?.(text);

/** Points from the bottom that still count as "at the bottom". */
export const THREAD_AT_BOTTOM_POINTS = 120;

/** After the list scrolls itself (to the newest, to a row), how long its own scroll events don't count. */
const SETTLING_MS = 400;

/** Whether a scroll position is at (or near) the bottom of its content. */
export function threadNearBottom(m: ScrollMetrics, slack = THREAD_AT_BOTTOM_POINTS): boolean {
  return m.contentOffset.y + m.layoutMeasurement.height >= m.contentSize.height - slack;
}

/**
 * How the list is set up. FlashList follows by itself (within a fifth of a
 * screen of the bottom); FlatList keeps its place on prepend, anchored on the
 * first row past the header (index 1: the header is child 0), and the list
 * follows the bottom by hand.
 */
export function threadListMode(flash: boolean, reducedMotion: boolean): { followsByHand: boolean; maintainVisibleContentPosition: Record<string, unknown> } {
  if (flash) {
    return {
      followsByHand: false,
      maintainVisibleContentPosition: { startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2, animateAutoScrollToBottom: !reducedMotion },
    };
  }
  return { followsByHand: true, maintainVisibleContentPosition: { minIndexForVisible: 1 } };
}

export interface NativeThreadListHandle {
  /** Go to the newest row (after a send: what you send is what you look at next). */
  scrollToEnd: (options?: { animated?: boolean }) => void;
}

/** What `renderItem` is told about a row besides the row itself. */
export interface ThreadRowInfo {
  index: number;
  /** The row a jump just landed on, for two seconds. */
  highlighted: boolean;
}

export interface NativeThreadListProps<T> {
  /** Oldest first. */
  data: readonly T[];
  /** A row's id. It must stay the same across refreshes (from a cache to the server), or rows jump. */
  keyExtractor: (row: T) => string;
  renderItem: (row: T, info: ThreadRowInfo) => ReactElement | null;
  /** Rows of different shapes recycle apart (FlashList): "mine", "theirs", "event". */
  getItemType?: (row: T) => string;
  /** The first page is loading: shows `loadingView` (a skeleton by default), and a jump waits. */
  loading?: boolean;
  loadingView?: ReactNode;
  /** There are earlier rows: loads them near the top, and shows the "Load earlier" button. */
  hasEarlier?: boolean;
  onLoadEarlier?: () => void;
  loadingEarlier?: boolean;
  earlierLabel?: string;
  /** Replaces the default "Load earlier" button. */
  renderEarlier?: (props: { loading: boolean; onPress: () => void; label: string; testID: string }) => ReactNode;
  /** Go to this row, loading earlier pages with `onLoadUntil` until it's here. A new id, or the same one after `null`, goes again. */
  jumpTo?: string | null;
  /** Load earlier pages until the row is held; resolve false when it can't be found. */
  onLoadUntil?: (id: string) => Promise<boolean>;
  /** What VoiceOver says on arriving at `jumpTo`. */
  jumpAnnouncement?: (row: T) => string;
  /** The row couldn't be found (deleted, out of reach). The list goes back to the newest row first. */
  onJumpFailed?: (id: string) => void;
  /** Whether the reader is at the bottom, as it changes (to show a "new messages" pill, say). */
  onAtBottomChange?: (atBottom: boolean) => void;
  /** Above the first row, before the "Load earlier" button: what the thread is about. */
  header?: ReactNode;
  /** Under the last row: who is typing, a "Sending…" line. */
  footer?: ReactNode;
  /** Shown instead of the rows when there are none. */
  empty?: ReactNode;
  testID?: string;
}

/** The FlatList and FlashList v2 props the thread passes. */
interface ThreadListComponentProps {
  ref?: unknown;
  data: readonly unknown[];
  renderItem: (info: { item: unknown; index: number }) => ReactElement | null;
  keyExtractor: (row: unknown) => string;
  getItemType?: (row: unknown) => string;
  extraData?: unknown;
  onStartReached?: () => void;
  onStartReachedThreshold?: number;
  ListHeaderComponent?: ReactElement | null;
  ListFooterComponent?: ReactElement | null;
  keyboardShouldPersistTaps?: "handled";
  keyboardDismissMode?: "interactive" | "on-drag";
  contentInsetAdjustmentBehavior?: "automatic";
  contentContainerStyle?: Record<string, unknown>;
  maintainVisibleContentPosition?: Record<string, unknown>;
  onScroll?: (e: { nativeEvent: ScrollMetrics }) => void;
  scrollEventThrottle?: number;
  onContentSizeChange?: () => void;
  onLayout?: () => void;
  onScrollToIndexFailed?: (info: { index: number; averageItemLength: number }) => void;
  accessibilityRole?: "list";
  testID?: string;
}

interface ListRef {
  scrollToEnd?: (o?: { animated?: boolean }) => void;
  scrollToIndex?: (o: { index: number; animated?: boolean; viewPosition?: number }) => void;
  scrollToOffset?: (o: { offset: number; animated?: boolean }) => void;
}

function NativeThreadListInner<T>(props: NativeThreadListProps<T>, ref: React.ForwardedRef<NativeThreadListHandle>) {
  const {
    data,
    keyExtractor,
    renderItem,
    getItemType,
    loading = false,
    loadingView,
    hasEarlier = false,
    onLoadEarlier,
    loadingEarlier = false,
    earlierLabel = "Load earlier messages",
    renderEarlier,
    jumpTo,
    onLoadUntil,
    jumpAnnouncement,
    onJumpFailed,
    onAtBottomChange,
    footer,
    header,
    empty,
    testID = "thread-list",
  } = props;
  const genesis = useGenesisModules();
  const reducedMotion = useReducedMotion();
  const List = (genesis.list ?? FlatList) as unknown as ComponentType<ThreadListComponentProps>;
  const mode = threadListMode(Boolean(genesis.list), reducedMotion);
  const listRef = useRef<ListRef | null>(null);
  // At the bottom (or not yet scrolled): new rows and a shorter list keep it there.
  const atBottom = useRef(true);
  // FlatList opens at the top and is moved down a frame later: until then the top isn't "reached".
  const placed = useRef(!mode.followsByHand);
  // While the list scrolls itself, its own scroll events don't move "at the bottom".
  const settlingUntil = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  const latest = useRef({ data, keyExtractor, jumpAnnouncement, onJumpFailed, onAtBottomChange });
  latest.current = { data, keyExtractor, jumpAnnouncement, onJumpFailed, onAtBottomChange };
  const indexOf = useCallback((id: string) => latest.current.data.findIndex((row) => latest.current.keyExtractor(row) === id), []);

  const setAtBottom = useCallback((v: boolean) => {
    if (atBottom.current === v) return;
    atBottom.current = v;
    latest.current.onAtBottomChange?.(v);
  }, []);

  const toBottom = useCallback(
    (animated: boolean) => {
      settlingUntil.current = Date.now() + SETTLING_MS;
      const go = (a: boolean) => listRef.current?.scrollToEnd?.({ animated: a && !reducedMotion });
      requestAnimationFrame(() => {
        go(animated);
        placed.current = true;
      });
      // Once more after a new row has its size (FlashList measures it after the first pass).
      if (animated) later(() => go(true), 180);
    },
    [later, reducedMotion],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToEnd: (options) => {
        setAtBottom(true);
        toBottom(options?.animated ?? true);
      },
    }),
    [setAtBottom, toBottom],
  );

  // Going to a row: by id, so a page loading in between can't send it to the wrong row.
  const jumpTries = useRef<{ id: string; tries: number } | null>(null);
  const scrollToRow = useCallback(
    (id: string) => {
      const scroll = () => {
        const at = indexOf(id);
        if (at >= 0) listRef.current?.scrollToIndex?.({ index: at, animated: !reducedMotion, viewPosition: 0.5 });
      };
      jumpTries.current = { id, tries: 0 };
      settlingUntil.current = Date.now() + SETTLING_MS;
      requestAnimationFrame(scroll);
      // Once more after the first layout: on open, FlashList's start-at-the-bottom placement comes after
      // the first frame and would win, leaving the thread at the bottom.
      later(scroll, 250);
    },
    [indexOf, later, reducedMotion],
  );
  const has = useCallback((id: string) => indexOf(id) >= 0, [indexOf]);
  // `has` must change when the rows do, so the jump looks again.
  const hasNow = useMemo(() => (id: string) => has(id), [has, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const { highlightedId, jumping } = useThreadJump({
    target: jumpTo,
    has: hasNow,
    loading,
    loadUntil: onLoadUntil,
    scrollTo: scrollToRow,
    onStart: () => {
      setAtBottom(false);
      placed.current = true;
    },
    onLanded: (id) => {
      const at = indexOf(id);
      const said = at >= 0 ? latest.current.jumpAnnouncement?.(latest.current.data[at]!) : undefined;
      if (said) announce(said);
    },
    onGone: (id) => {
      // Back to where the thread opens: the newest rows.
      setAtBottom(true);
      toBottom(false);
      latest.current.onJumpFailed?.(id);
    },
  });

  const loadEarlier = useCallback(() => {
    if (placed.current && !jumping && hasEarlier && !loadingEarlier) onLoadEarlier?.();
  }, [hasEarlier, jumping, loadingEarlier, onLoadEarlier]);

  const earlierProps = { loading: loadingEarlier, onPress: () => onLoadEarlier?.(), label: earlierLabel, testID: `${testID}-earlier` };
  const listHeader = (
    <View>
      {header}
      {hasEarlier && onLoadEarlier ? (renderEarlier ? renderEarlier(earlierProps) : <DefaultEarlier {...earlierProps} />) : null}
    </View>
  );

  const renderListItem = useCallback(
    ({ item, index }: { item: unknown; index: number }) => renderItem(item as T, { index, highlighted: highlightedId !== null && keyExtractor(item as T) === highlightedId }),
    [highlightedId, keyExtractor, renderItem],
  );
  const listKey = useCallback((row: unknown) => keyExtractor(row as T), [keyExtractor]);
  const listItemType = useMemo(() => (getItemType ? (row: unknown) => getItemType(row as T) : undefined), [getItemType]);
  const onScroll = useCallback(
    (e: { nativeEvent: ScrollMetrics }) => {
      const near = threadNearBottom(e.nativeEvent);
      // The list's own scroll (to the newest, to a row) passes through "not at the bottom": ignore that.
      if (!near && Date.now() < settlingUntil.current) return;
      setAtBottom(near);
    },
    [setAtBottom],
  );
  const onScrollToIndexFailed = useCallback(
    ({ index, averageItemLength }: { index: number; averageItemLength: number }) => {
      // FlatList hasn't measured that far up yet: get near it, then try again by id (three times at most).
      listRef.current?.scrollToOffset?.({ offset: Math.max(0, index * averageItemLength - 200), animated: false });
      const target = jumpTries.current;
      if (!target || target.tries >= 3) return;
      target.tries += 1;
      later(() => {
        const at = indexOf(target.id);
        if (at >= 0) listRef.current?.scrollToIndex?.({ index: at, animated: !reducedMotion, viewPosition: 0.5 });
      }, 250);
    },
    [indexOf, later, reducedMotion],
  );
  const follow = useCallback(() => {
    if (atBottom.current && !jumping) toBottom(false);
  }, [jumping, toBottom]);

  if (loading && data.length === 0) {
    return (
      <View testID={`${testID}-loading`} accessible accessibilityLabel="Loading" style={{ flex: 1, justifyContent: "flex-end", padding: 16, gap: 10 }}>
        {loadingView ?? <DefaultLoading />}
      </View>
    );
  }

  if (data.length === 0 && empty) {
    return (
      <View testID={testID} style={{ flex: 1, justifyContent: "center" }}>
        {listHeader}
        {empty}
      </View>
    );
  }

  return (
    <List
      ref={listRef}
      testID={testID}
      accessibilityRole="list"
      data={data as readonly unknown[]}
      renderItem={renderListItem}
      keyExtractor={listKey}
      getItemType={listItemType}
      extraData={highlightedId}
      onStartReached={loadEarlier}
      onStartReachedThreshold={0.5}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 12 }}
      maintainVisibleContentPosition={mode.maintainVisibleContentPosition}
      scrollEventThrottle={32}
      onScroll={onScroll}
      onScrollToIndexFailed={onScrollToIndexFailed}
      {...(mode.followsByHand ? { onContentSizeChange: follow, onLayout: follow } : {})}
      ListHeaderComponent={listHeader}
      ListFooterComponent={footer ? <View>{footer}</View> : null}
    />
  );
}

/** A conversation's list. See the module docs. */
export const NativeThreadList = forwardRef(NativeThreadListInner) as <T>(
  props: NativeThreadListProps<T> & { ref?: React.Ref<NativeThreadListHandle> },
) => ReactElement | null;

function DefaultEarlier({ loading, label, onPress, testID }: { loading: boolean; label: string; onPress: () => void; testID: string }) {
  const colors = useThemeRoles();
  return (
    <View style={{ alignItems: "center", paddingVertical: 12 }}>
      {loading ? (
        <View testID={`${testID}-loading`} accessible accessibilityLabel={label} accessibilityState={{ busy: true }} style={{ gap: 8, alignItems: "center" }}>
          <NativeSkeleton width={180} height={14} />
          <NativeSkeleton width={120} height={14} />
        </View>
      ) : (
        <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16 }}>
          <NativeText preset="label" style={{ color: colors.tint }}>
            {label}
          </NativeText>
        </Pressable>
      )}
    </View>
  );
}

function DefaultLoading() {
  return (
    <>
      <NativeSkeleton width={200} height={36} className="rounded-2xl" />
      <View style={{ alignItems: "flex-end" }}>
        <NativeSkeleton width={160} height={36} className="rounded-2xl" />
      </View>
      <NativeSkeleton width={240} height={36} className="rounded-2xl" />
    </>
  );
}
