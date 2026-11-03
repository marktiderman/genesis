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
 * place with `maintainVisibleContentPosition` and follows the bottom by hand.
 *
 * Not inverted: in an inverted FlashList a new row at index 0 lands under the
 * composer, and VoiceOver reads each day's heading after its messages.
 *
 * Earlier rows load by themselves near the top, and the explicit "Load
 * earlier" button stays: VoiceOver can't reach rows a virtualized list hasn't
 * rendered. Going to a row announces it. Reduce Motion scrolls without
 * animating.
 *
 * Promoted from genesis-chat's thread (G4), which moves onto it later.
 *
 * @stability Beta
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ComponentType, type ReactElement, type ReactNode } from "react";
import { AccessibilityInfo, FlatList, Pressable, View } from "react-native";

/** The scroll event fields the list reads. */
interface ScrollMetrics {
  contentOffset: { y: number };
  contentSize: { height: number };
  layoutMeasurement: { height: number };
}

const announce = (text: string) => (AccessibilityInfo as { announceForAccessibility?: (t: string) => void }).announceForAccessibility?.(text);
import { useGenesisModules } from "../native-modules";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { NativeSkeleton } from "./skeleton";
import { NativeText } from "./text";

/** Points from the bottom that still count as "at the bottom". */
export const THREAD_AT_BOTTOM_POINTS = 120;

/** Whether a scroll position is at (or near) the bottom of its content. */
export function threadNearBottom(
  m: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } },
  slack = THREAD_AT_BOTTOM_POINTS,
): boolean {
  return m.contentOffset.y + m.layoutMeasurement.height >= m.contentSize.height - slack;
}

/**
 * How the list is set up. FlashList follows by itself (within a fifth of a
 * screen of the bottom); FlatList keeps its place on prepend and the list
 * follows the bottom by hand.
 */
export function threadListMode(flash: boolean, reducedMotion: boolean): { followsByHand: boolean; maintainVisibleContentPosition: Record<string, unknown> } {
  if (flash) {
    return {
      followsByHand: false,
      maintainVisibleContentPosition: { startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2, animateAutoScrollToBottom: !reducedMotion },
    };
  }
  return { followsByHand: true, maintainVisibleContentPosition: { minIndexForVisible: 0 } };
}

export interface NativeThreadListHandle {
  /** Go to the newest row (after a send: what you send is what you look at next). */
  scrollToEnd: (options?: { animated?: boolean }) => void;
}

export interface NativeThreadListProps<T> {
  /** Oldest first. */
  data: readonly T[];
  /** A row's id. It must stay the same across refreshes (from a cache to the server), or rows jump. */
  keyExtractor: (row: T) => string;
  renderItem: (row: T, index: number) => ReactElement | null;
  /** Rows of different shapes recycle apart (FlashList): "mine", "theirs", "event". */
  getItemType?: (row: T) => string;
  /** There are earlier rows: loads them near the top, and shows the "Load earlier" button. */
  hasEarlier?: boolean;
  onLoadEarlier?: () => void;
  loadingEarlier?: boolean;
  earlierLabel?: string;
  /** Replaces the default "Load earlier" button. */
  renderEarlier?: (props: { loading: boolean; onPress: () => void; label: string; testID: string }) => ReactNode;
  /** Go to this row, loading earlier pages with `onLoadUntil` until it's here. A new id starts again. */
  jumpTo?: string | null;
  /** Load earlier pages until the row is held; resolve false when it can't be found. */
  onLoadUntil?: (id: string) => Promise<boolean>;
  /** What VoiceOver says on arriving at `jumpTo`. */
  jumpAnnouncement?: (row: T) => string;
  /** The row couldn't be found (deleted, out of reach). */
  onJumpFailed?: (id: string) => void;
  /** Whether the reader is at the bottom, as it changes (to show a "new messages" pill, say). */
  onAtBottomChange?: (atBottom: boolean) => void;
  /** Under the last row: who is typing, a "Sending…" line. */
  footer?: ReactNode;
  /** Above the first row, after the "Load earlier" button. */
  header?: ReactNode;
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
  onStartReached?: () => void;
  onStartReachedThreshold?: number;
  ListHeaderComponent?: ReactElement | null;
  ListFooterComponent?: ReactElement | null;
  keyboardShouldPersistTaps?: "handled";
  keyboardDismissMode?: "interactive" | "on-drag";
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
  const jumping = useRef(false);
  const dataNow = useRef(data);
  dataNow.current = data;

  const setAtBottom = useCallback(
    (v: boolean) => {
      if (atBottom.current === v) return;
      atBottom.current = v;
      onAtBottomChange?.(v);
    },
    [onAtBottomChange],
  );

  const toBottom = useCallback(
    (animated: boolean) => {
      const go = (a: boolean) => listRef.current?.scrollToEnd?.({ animated: a && !reducedMotion });
      requestAnimationFrame(() => {
        go(animated);
        placed.current = true;
      });
      // Once more after a new row has its size (FlashList measures it after the first pass).
      if (animated) setTimeout(() => go(true), 180);
    },
    [reducedMotion],
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

  const loadEarlier = useCallback(() => {
    if (placed.current && !jumping.current && hasEarlier && !loadingEarlier) onLoadEarlier?.();
  }, [hasEarlier, loadingEarlier, onLoadEarlier]);

  // Going to a row: load until it's held, then scroll to it, centred, and say where you are.
  const [jumped, setJumped] = useState<string | null>(null);
  useEffect(() => {
    if (!jumpTo || jumpTo === jumped) return;
    let cancelled = false;
    const indexOf = () => dataNow.current.findIndex((row) => keyExtractor(row) === jumpTo);
    const land = () => {
      const at = indexOf();
      if (at < 0) return false;
      setAtBottom(false);
      placed.current = true;
      requestAnimationFrame(() => listRef.current?.scrollToIndex?.({ index: at, animated: !reducedMotion, viewPosition: 0.5 }));
      const row = dataNow.current[at]!;
      const said = jumpAnnouncement?.(row);
      if (said) announce(said);
      return true;
    };
    jumping.current = true;
    void (async () => {
      let found = land();
      if (!found && onLoadUntil) {
        const held = await onLoadUntil(jumpTo).catch(() => false);
        // The rows arrive on the next render: wait a frame before looking.
        await new Promise((r) => setTimeout(r, 0));
        found = !cancelled && held && land();
      }
      if (cancelled) return;
      jumping.current = false;
      setJumped(jumpTo);
      if (!found) onJumpFailed?.(jumpTo);
    })();
    return () => {
      cancelled = true;
      jumping.current = false;
    };
    // keyExtractor, announcement and callbacks are read at jump time only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo, jumped]);

  const earlierProps = { loading: loadingEarlier, onPress: () => onLoadEarlier?.(), label: earlierLabel, testID: `${testID}-earlier` };
  const listHeader = (
    <View>
      {hasEarlier && onLoadEarlier ? (renderEarlier ? renderEarlier(earlierProps) : <DefaultEarlier {...earlierProps} />) : null}
      {header}
    </View>
  );

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
      renderItem={({ item, index }) => renderItem(item as T, index)}
      keyExtractor={(row) => keyExtractor(row as T)}
      getItemType={getItemType ? (row) => getItemType(row as T) : undefined}
      onStartReached={loadEarlier}
      onStartReachedThreshold={0.5}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 12 }}
      maintainVisibleContentPosition={mode.maintainVisibleContentPosition}
      scrollEventThrottle={32}
      onScroll={(e) => setAtBottom(threadNearBottom(e.nativeEvent))}
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        // FlatList hasn't measured that far up yet: get near it, then try once more.
        listRef.current?.scrollToOffset?.({ offset: Math.max(0, index * averageItemLength - 200), animated: false });
        setTimeout(() => listRef.current?.scrollToIndex?.({ index, animated: !reducedMotion, viewPosition: 0.5 }), 250);
      }}
      {...(mode.followsByHand
        ? {
            onContentSizeChange: () => {
              if (atBottom.current && !jumping.current) toBottom(false);
            },
            onLayout: () => {
              if (atBottom.current && !jumping.current) toBottom(false);
            },
          }
        : {})}
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
        <View testID={`${testID}-loading`} accessibilityLabel={label} style={{ gap: 8, alignItems: "center" }}>
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
