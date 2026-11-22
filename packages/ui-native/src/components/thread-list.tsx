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
 * animating. The reader's touch wins: a drag during a jump ends the list's own
 * scrolling and drops the jump, even one still loading, so nothing snaps back.
 *
 * `openAt` opens the list at a row instead of the bottom (the first unread, under a "New" line):
 * once, when the rows first come, with that row at the top. Where it would sit on screen anyway at
 * the bottom, the list clamps there; no highlight, no announcement (that's `jumpTo`).
 *
 * A row is gone when, once `onLoadUntil` has settled, no row answers to its
 * id. The list knows only its rows: a row that's drawn (a deleted message's
 * tombstone) is there, and whatever isn't drawn isn't, whatever a cache holds.
 *
 * Promoted from genesis-chat's thread and its `useJumpToMessage` (G4); chat
 * moves onto it later.
 *
 * @stability Beta
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ComponentType, type ReactElement, type ReactNode } from "react";
import { AccessibilityInfo, FlatList, Platform, Pressable, View } from "react-native";
import { useGenesisModules } from "../native-modules";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { useThreadJump } from "@marktiderman/genesis-core/conversation";
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

/** How long after a try to open at a row, with no failure reported, it counts as landed. */
const OPEN_SETTLED_MS = 300;

/** Whether a scroll position is at (or near) the bottom of its content. */
export function threadNearBottom(m: ScrollMetrics, slack = THREAD_AT_BOTTOM_POINTS): boolean {
  return m.contentOffset.y + m.layoutMeasurement.height >= m.contentSize.height - slack;
}

/**
 * How the list is set up. FlashList follows by itself, within
 * `THREAD_AT_BOTTOM_POINTS` of the bottom (its threshold is a fraction of the
 * viewport: a fifth until the viewport's height is known); FlatList keeps its
 * place on prepend, anchored on the first row past the header (index 1: the
 * header is child 0), and the list follows the bottom by hand.
 */
export function threadListMode(
  flash: boolean,
  reducedMotion: boolean,
  viewportHeight = 0,
): { followsByHand: boolean; maintainVisibleContentPosition: Record<string, unknown> } {
  if (flash) {
    const threshold = viewportHeight > 0 ? Math.min(1, THREAD_AT_BOTTOM_POINTS / viewportHeight) : 0.2;
    return {
      followsByHand: false,
      maintainVisibleContentPosition: { startRenderingFromBottom: true, autoscrollToBottomThreshold: threshold, animateAutoScrollToBottom: !reducedMotion },
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
  /**
   * The id `jumpTo` names a row by, when it isn't the row's key: a message keyed by the id the
   * phone gave it (so it keeps its row when the server's copy lands) and gone to by the server's
   * id. `null` for a row that can't be gone to (a day heading). `keyExtractor` by default.
   * Pass a stable function (module scope, or `useCallback`): a new one each render re-renders every row.
   */
  jumpId?: (row: T) => string | null | undefined;
  /** Load earlier pages until the row is held; resolve false when it can't be found. */
  onLoadUntil?: (id: string) => Promise<boolean>;
  /** What VoiceOver says on arriving at `jumpTo`. */
  jumpAnnouncement?: (row: T) => string;
  /** No row answers to this id once `onLoadUntil` has settled, or it failed. The list goes back to the newest row first. */
  onJumpFailed?: (id: string) => void;
  /** Whether the reader is at the bottom, as it changes (to show a "new messages" pill, say). */
  onAtBottomChange?: (atBottom: boolean) => void;
  /**
   * Open at this row (by `jumpId`), at the top of the screen, instead of the bottom: the first
   * unread, when the "New" line would be above the screen. Once, when the rows and it are first
   * known: `undefined` means not known yet (it waits), `null` means open at the bottom. Ignored
   * while `jumpTo` is set, and once the reader has scrolled. If the row goes before the list
   * reaches it, the list opens at the newest rows.
   *
   * "Once the reader has scrolled" is a drag, or a scroll away from the bottom outside the list's
   * own moves. Inside the 400 ms after the list moves itself, a reader's scroll counts only when it
   * goes up while the list is going down: the very first scroll event in that window can't be told
   * apart from the list's own placement, so one that comes before any other is taken as the list's.
   */
  openAt?: string | null;
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
  onScrollBeginDrag?: () => void;
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
    jumpId,
    onLoadUntil,
    jumpAnnouncement,
    onJumpFailed,
    onAtBottomChange,
    openAt,
    footer,
    header,
    empty,
    testID = "thread-list",
  } = props;
  const genesis = useGenesisModules();
  const reducedMotion = useReducedMotion();
  const List = (genesis.list ?? FlatList) as unknown as ComponentType<ThreadListComponentProps>;
  const [viewport, setViewport] = useState(0);
  const mode = threadListMode(Boolean(genesis.list), reducedMotion, viewport);
  // The last position the list reported, to re-check "at the bottom" after it moves itself.
  const metrics = useRef<ScrollMetrics | null>(null);
  const recheck = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (recheck.current) clearTimeout(recheck.current);
  }, []);
  const listRef = useRef<ListRef | null>(null);
  // At the bottom (or not yet scrolled): new rows and a shorter list keep it there.
  const atBottom = useRef(true);
  // FlatList opens at the top and is moved down a frame later: until then the top isn't "reached".
  const placed = useRef(!mode.followsByHand);
  // While the list scrolls itself, its own scroll events don't move "at the bottom".
  const settlingUntil = useRef(0);
  // Whether the list's own move is to the bottom (it only moves down), so a move up meanwhile is the reader's.
  const towardBottom = useRef(false);
  // Bumped by each move the list starts and by the reader's touch: a queued try from an older move doesn't run.
  const moveId = useRef(0);
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
  const idOf = jumpId ?? keyExtractor;
  const latest = useRef({ data, idOf, jumpAnnouncement, onJumpFailed, onAtBottomChange });
  latest.current = { data, idOf, jumpAnnouncement, onJumpFailed, onAtBottomChange };
  // The row a jump names, by `jumpId` (the key by default).
  const indexOf = useCallback((id: string) => latest.current.data.findIndex((row) => latest.current.idOf(row) === id), []);

  const setAtBottom = useCallback((v: boolean) => {
    if (atBottom.current === v) return;
    atBottom.current = v;
    latest.current.onAtBottomChange?.(v);
  }, []);

  const toBottom = useCallback(
    (animated: boolean) => {
      settlingUntil.current = Date.now() + SETTLING_MS;
      towardBottom.current = true;
      // A newer move: any opening or jump retry still queued is dropped, so it can't pull the list back.
      jumpTries.current = null;
      const move = ++moveId.current;
      const go = (a: boolean) => listRef.current?.scrollToEnd?.({ animated: a && !reducedMotion });
      requestAnimationFrame(() => {
        go(animated);
        placed.current = true;
      });
      // FlatList: once more after a new row has its size. FlashList's bottom anchoring follows the
      // new row itself (autoscrollToBottomThreshold) once the list is at the end.
      if (animated && mode.followsByHand) later(() => move === moveId.current && go(true), 180);
    },
    [later, reducedMotion, mode.followsByHand],
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
  // Opening at a row (`openAt`) goes through the same retries, at the top of the screen, and falls back
  // to the bottom if the row can't be reached, so the reader is never left at the top of the page.
  const jumpTries = useRef<{ id: string; tries: number; viewPosition: number; opening?: boolean } | null>(null);
  const scrollToRow = useCallback(
    (id: string) => {
      const move = ++moveId.current;
      const scroll = () => {
        if (move !== moveId.current) return;
        const at = indexOf(id);
        if (at < 0) return;
        // Each try moves the list again: its events don't count until this one settles.
        settlingUntil.current = Date.now() + SETTLING_MS;
        towardBottom.current = false;
        listRef.current?.scrollToIndex?.({ index: at, animated: !reducedMotion, viewPosition: 0.5 });
      };
      jumpTries.current = { id, tries: 0, viewPosition: 0.5 };
      settlingUntil.current = Date.now() + SETTLING_MS;
      towardBottom.current = false;
      requestAnimationFrame(scroll);
      // Once more after the first layout: on open, FlashList's start-at-the-bottom placement comes after
      // the first frame and would win, leaving the thread at the bottom.
      later(scroll, 250);
    },
    [indexOf, later, reducedMotion],
  );
  // A jump to a row already in view moves nothing, so no scroll event says where the list is: look
  // once its own scrolling has settled (a second try extends that; mid-way it can still read as the
  // bottom). No scroll event yet means the list hasn't moved from where it opens, the bottom.
  const lookForBottom = useCallback(() => {
    if (recheck.current) clearTimeout(recheck.current);
    const look = () => {
      const wait = settlingUntil.current - Date.now();
      if (wait > 0) {
        recheck.current = setTimeout(look, wait + 50);
        return;
      }
      if (!metrics.current || threadNearBottom(metrics.current)) setAtBottom(true);
    };
    recheck.current = setTimeout(look, SETTLING_MS + 50);
  }, [setAtBottom]);
  const has = useCallback((id: string) => indexOf(id) >= 0, [indexOf]);
  // `has` must change when the rows do, so the jump looks again.
  const hasNow = useMemo(() => (id: string) => has(id), [has, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const { highlightedId, jumping, cancel: cancelJump } = useThreadJump({
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
      lookForBottom();
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

  // Opening at a row (the first unread): once, when the rows first come, unless a jump is asked for.
  const opened = useRef(false);
  // The opening row can't be reached (it went, or the retries ran out): open at the newest rows,
  // following them again.
  const openAtNewest = useCallback(
    (target: object) => {
      if (jumpTries.current !== target) return;
      jumpTries.current = null;
      setAtBottom(true);
      toBottom(false);
    },
    [setAtBottom, toBottom],
  );
  // An opening whose last try reported no failure has landed: drop its retry target.
  const clearOpened = useCallback((target: { tries: number }, tries: number) => {
    if (jumpTries.current === target && target.tries === tries) jumpTries.current = null;
  }, []);
  useEffect(() => {
    if (opened.current || loading || data.length === 0 || openAt === undefined) return;
    opened.current = true;
    if (!openAt || jumpTo) return;
    const at = indexOf(openAt);
    if (at < 0) return;
    setAtBottom(false);
    placed.current = true;
    const move = ++moveId.current;
    const target = { id: openAt, tries: 0, viewPosition: 0, opening: true };
    jumpTries.current = target;
    const go = () => {
      if (move !== moveId.current || jumpTries.current !== target) return;
      const i = indexOf(openAt);
      if (i < 0) return openAtNewest(target);
      settlingUntil.current = Date.now() + SETTLING_MS;
      towardBottom.current = false;
      listRef.current?.scrollToIndex?.({ index: i, animated: false, viewPosition: 0 });
    };
    settlingUntil.current = Date.now() + SETTLING_MS;
    towardBottom.current = false;
    requestAnimationFrame(go);
    // Again after FlashList's own start-at-the-bottom placement, which comes after the first frame.
    later(go, 250);
    // Landed (no failure reported since): the opening is done, and a later failure isn't its to recover.
    later(() => clearOpened(target, 0), 250 + OPEN_SETTLED_MS);
    lookForBottom();
  }, [loading, data.length, openAt, jumpTo, indexOf, setAtBottom, later, lookForBottom, clearOpened, openAtNewest]);

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
    ({ item, index }: { item: unknown; index: number }) => renderItem(item as T, { index, highlighted: highlightedId !== null && idOf(item as T) === highlightedId }),
    [highlightedId, idOf, renderItem],
  );
  const listKey = useCallback((row: unknown) => keyExtractor(row as T), [keyExtractor]);
  const listItemType = useMemo(() => (getItemType ? (row: unknown) => getItemType(row as T) : undefined), [getItemType]);
  const onScroll = useCallback(
    (e: { nativeEvent: ScrollMetrics }) => {
      const before = metrics.current?.contentOffset.y;
      metrics.current = { contentOffset: { y: e.nativeEvent.contentOffset.y }, contentSize: { height: e.nativeEvent.contentSize.height }, layoutMeasurement: { height: e.nativeEvent.layoutMeasurement.height } };
      const height = e.nativeEvent.layoutMeasurement.height;
      setViewport((v) => (Math.abs(v - height) < 1 ? v : height));
      // The list's own scroll (to the newest, to a row) isn't the reader moving. Going to a row starts
      // at the bottom, so its first events say "at the bottom": taken, that turned following back on,
      // and FlatList's next layout scrolled to the end, away from the row. After a jump, onLanded
      // looks again once it has settled.
      if (Date.now() < settlingUntil.current) {
        // On its way to the bottom the list only moves down: a move up away from it is the reader
        // (VoiceOver's scroll, a wheel), and a first unread known later must not move them.
        if (towardBottom.current && before !== undefined && e.nativeEvent.contentOffset.y < before - 1 && !threadNearBottom(e.nativeEvent)) opened.current = true;
        return;
      }
      const near = threadNearBottom(e.nativeEvent);
      // Moved away from where the list opens (the bottom) by the reader, without a drag (VoiceOver's
      // scroll, a wheel): a first unread known later must not move them.
      if (placed.current && !near) opened.current = true;
      setAtBottom(near);
    },
    [setAtBottom],
  );
  // The reader's touch ends the list's own scroll: from here their scrolling counts, even mid-jump,
  // the tries still queued don't snap them back, and a jump still loading doesn't land. Only a drag:
  // a fling follows one, and onMomentumScrollBegin isn't promised to be the reader's alone (Android
  // may report a programmatic smooth scroll), which would cancel the list's own retry. VoiceOver's
  // three-finger scroll and a wheel send no drag, so those count once the settling window (400ms) ends.
  const readerTookOver = useCallback(() => {
    opened.current = true;
    settlingUntil.current = 0;
    moveId.current += 1;
    jumpTries.current = null;
    cancelJump();
  }, [cancelJump]);
  const onScrollToIndexFailed = useCallback(
    ({ index, averageItemLength }: { index: number; averageItemLength: number }) => {
      const target = jumpTries.current;
      // The reader took over.
      if (!target) return;
      // FlatList hasn't measured that far up yet: get near it, then try again by id (three times at most).
      listRef.current?.scrollToOffset?.({ offset: Math.max(0, index * averageItemLength - 200), animated: false });
      if (target.tries >= 3) {
        // Opening at the first unread couldn't reach it: open at the newest instead, following again.
        if (target.opening) openAtNewest(target);
        return;
      }
      target.tries += 1;
      later(() => {
        if (jumpTries.current !== target) return;
        const at = indexOf(target.id);
        if (at < 0) {
          if (target.opening) openAtNewest(target);
          return;
        }
        settlingUntil.current = Date.now() + SETTLING_MS;
        towardBottom.current = false;
        listRef.current?.scrollToIndex?.({ index: at, animated: !reducedMotion && !target.opening, viewPosition: target.viewPosition });
        if (target.opening) {
          const tries = target.tries;
          later(() => clearOpened(target, tries), OPEN_SETTLED_MS);
        }
        lookForBottom();
      }, 250);
    },
    [indexOf, later, lookForBottom, reducedMotion, openAtNewest],
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
      keyboardDismissMode={Platform.select({ ios: "interactive" as const, default: "on-drag" as const })}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 12 }}
      maintainVisibleContentPosition={mode.maintainVisibleContentPosition}
      scrollEventThrottle={32}
      onScroll={onScroll}
      onScrollBeginDrag={readerTookOver}
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
