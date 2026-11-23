/**
 * NativeSwipeRow — a row with actions behind a swipe, as Mail and Messages have them: leading
 * actions behind a swipe to the right (Read, Pin), trailing behind a swipe to the left (Archive,
 * Delete). Each action's `side` (trailing by default), `icon`, `tone` and `full` come from the
 * one row-action shape (`RowSwipeAction`, ADR 0028), so a view's actions, an inbox row's and an
 * app's own list read the same.
 *
 * - **Full swipe:** the first `full` action on a side runs when the row is dragged past
 *   `fullSwipeRatio` of its width and let go, as Mail's Delete does.
 * - **Appearance:** `"fill"` draws each action as a colored block with its icon and label;
 *   `"round"` draws iOS 26's round icon buttons (50pt, 10pt apart) with the label under them,
 *   and while they're open the row itself becomes a pill (systemGray5, inset 6pt), as Messages does.
 * - **Screen readers:** the buttons behind the row are hidden from VoiceOver (a screen reader
 *   doesn't swipe); the same actions go on the row as `accessibilityActions` instead (and so
 *   Maestro and XCUITest can run them), unless `accessibilityActions={false}` says the row
 *   already has them (InboxPage, NativeResourceView).
 * - An action with `swipe: false` stays off the swipe (the long-press menu and the screen
 *   reader still offer it).
 *
 * The gesture is the app's `GenesisModules.swipeable` (react-native-gesture-handler's
 * `ReanimatedSwipeable`, an optional peer). Without it the row draws as it is and its actions
 * stay reachable as accessibility actions; put them on long press too (`NativeRowActions`, or a
 * `NativeListItem`'s `actions`, does both). A swipe that opens taps `medium` through `useHaptics`.
 *
 * @stability Beta
 */
import { cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { I18nManager, Platform, PlatformColor, Pressable, View, type ColorValue } from "react-native";
import type { RowActionTone, RowSwipeAction } from "@marktiderman/genesis-core/conversation";
import { useHaptics } from "../hooks/use-haptics";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { useGenesisModules, type GenesisReanimatedModule } from "../native-modules";
import type { NativeIconName } from "../icon-names";
import { ROW_ACTION_TONES, ROW_PILL, onRowActionColor } from "../tokens/row-action-tones";
import { NativeIcon } from "./icon";
import { NativeText } from "./text";

export interface NativeSwipeRowProps {
  actions: readonly RowSwipeAction[];
  children?: ReactNode;
  /** `"fill"` (colored blocks, the default) or `"round"` (iOS 26's round icon buttons). */
  appearance?: "fill" | "round";
  /** At most this many actions on a side; the rest stay in the menu and the screen reader's actions. Default 3, as Mail. */
  maxPerSide?: number;
  /** How far across the row (a share of its width) a drag runs the side's `full` action when let go. Default 0.6, as iOS. */
  fullSwipeRatio?: number;
  /**
   * Put the actions on the child as `accessibilityActions` (merged into its own, when it's a
   * single element). Default `true`; pass `false` when the row already has them.
   */
  accessibilityActions?: boolean;
  testID?: string;
}

/** A button's width behind the row: room for a short label. */
const ACTION_WIDTH = 80;

/** The color behind a row action: its tone, red when destructive, else the app's tint. */
export function rowActionColor(action: Pick<RowSwipeAction, "tone" | "destructive">, roles: { tint: ColorValue; destructive: ColorValue }): ColorValue {
  const tone = action.tone ?? (action.destructive ? "red" : "tint");
  if (tone === "tint") return roles.tint;
  if (tone === "red") return roles.destructive;
  const c = ROW_ACTION_TONES[tone];
  return Platform.OS === "ios" ? PlatformColor(c.ios) : c.fallback;
}

/** The actions a swipe shows, by side (an action with `swipe: false` shows on neither), in the row's reading direction. */
export function splitSwipeActions(actions: readonly RowSwipeAction[], maxPerSide = Infinity) {
  const shown = actions.filter((a) => a.swipe !== false);
  const leading = shown.filter((a) => a.side === "leading").slice(0, maxPerSide);
  const trailing = shown.filter((a) => a.side !== "leading").slice(0, maxPerSide);
  return { leading, trailing, fullLeading: leading.find((a) => a.full), fullTrailing: trailing.find((a) => a.full) };
}

/** The row's actions as React Native's `accessibilityActions` and the handler that runs them. */
export function rowAccessibilityActions(actions: readonly RowSwipeAction[]) {
  return {
    accessibilityActions: actions.map((a) => ({ name: a.id, label: a.label })),
    onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) => actions.find((a) => a.id === event.nativeEvent.actionName)?.onPress(),
  };
}

type A11yProps = {
  accessibilityActions?: readonly { name: string; label?: string }[];
  onAccessibilityAction?: (event: { nativeEvent: { actionName: string } }) => void;
};

/** Merges the row's actions into a single child's own accessibility actions. */
function withAccessibilityActions(children: ReactNode, actions: readonly RowSwipeAction[]): ReactNode {
  if (!isValidElement(children) || actions.length === 0) return children;
  const child = children as ReactElement<A11yProps>;
  const own = child.props.accessibilityActions ?? [];
  const ownHandler = child.props.onAccessibilityAction;
  const mine = rowAccessibilityActions(actions.filter((a) => !own.some((o) => o.name === a.id)));
  if (mine.accessibilityActions.length === 0) return children;
  return cloneElement(child, {
    accessibilityActions: [...own, ...mine.accessibilityActions],
    onAccessibilityAction: (event) => {
      if (own.some((o) => o.name === event.nativeEvent.actionName)) ownHandler?.(event);
      else mine.onAccessibilityAction(event);
    },
  });
}

/** Keeps the furthest point of a drag on the UI thread, for the full swipe's check on release. */
function PeakTracker({ R, translation, onReady }: { R: GenesisReanimatedModule; translation: { value: number }; onReady: (peak: { value: number }) => void }) {
  const peak = R.useSharedValue(0);
  useEffect(() => {
    onReady(peak);
  }, [peak, onReady]);
  R.useAnimatedReaction!(
    () => {
      "worklet";
      return translation.value;
    },
    (current) => {
      "worklet";
      if (Math.abs(current) > Math.abs(peak.value)) peak.value = current;
    },
  );
  return null;
}

export function NativeSwipeRow({
  actions,
  children,
  appearance = "fill",
  fullSwipeRatio = 0.6,
  maxPerSide = 3,
  accessibilityActions = true,
  testID = "swipe-row",
}: NativeSwipeRowProps) {
  const { swipeable: Swipeable, reanimated } = useGenesisModules();
  const colors = useThemeRoles();
  const play = useHaptics();
  const swipe = useRef<{ close?: () => void } | null>(null);
  const offset = useRef<{ value: number } | null>(null);
  // The furthest a drag went, kept on the UI thread (PeakTracker): by the time the JS side hears of
  // the release, the row has already started to spring back.
  const peak = useRef<{ value: number } | null>(null);
  const [width, setWidth] = useState(0);
  const [open, setOpen] = useState(false);
  // The actions stay mounted (the swipe measures them) but unseen until a drag starts: an inset row
  // doesn't cover the whole width, and they would show in its margins at rest.
  const [dragging, setDragging] = useState(false);
  const content = accessibilityActions ? withAccessibilityActions(children, actions) : children;
  const { leading, trailing, fullLeading, fullTrailing } = splitSwipeActions(actions, maxPerSide);
  if (!Swipeable || leading.length + trailing.length === 0) return <>{content}</>;

  const run = (action: RowSwipeAction) => {
    swipe.current?.close?.();
    action.onPress();
  };
  const round = appearance === "round";
  const group = (list: readonly RowSwipeAction[]) => (_progress?: unknown, translation?: { value: number }) => {
    if (translation) offset.current = translation;
    const track = reanimated?.useAnimatedReaction && translation ? <PeakTracker R={reanimated} translation={translation} onReady={(p) => (peak.current = p)} /> : null;
    return (
      <>
      {track}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ opacity: dragging ? 1 : 0, flexDirection: "row", alignItems: round ? "center" : "stretch", gap: round ? 10 : 0, paddingHorizontal: round ? 10 : 0 }}>
        {list.map((action) => {
          const color = rowActionColor(action, colors);
          const on = onRowActionColor(action.tone);
          const icon = action.icon ? <NativeIcon name={action.icon as NativeIconName} size={round ? 20 : 22} color={on} /> : null;
          return (
            <Pressable
              key={action.id}
              testID={`${testID}-action-${action.id}`}
              onPress={() => run(action)}
              style={{ width: round ? 56 : ACTION_WIDTH, alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: round ? "transparent" : color }}
            >
              {round ? (
                <View style={{ width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: color }}>{icon}</View>
              ) : (
                icon
              )}
              <NativeText preset="label" style={{ color: round ? colors.label : on, fontSize: round ? 12 : 14 }} numberOfLines={1}>
                {action.label}
              </NativeText>
            </Pressable>
          );
        })}
      </View>
      </>
    );
  };
  // In a right-to-left language, leading is the right edge.
  const [left, right, fullLeft, fullRight] = I18nManager.isRTL ? [trailing, leading, fullTrailing, fullLeading] : [leading, trailing, fullLeading, fullTrailing];

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Swipeable
        ref={swipe}
        testID={testID}
        // 1:1 with the finger, as iOS rows track it (and so a full swipe can reach 0.6 of the row).
        friction={1}
        // Past its actions a side with a full action keeps tracking the finger, so a long drag reaches
        // the full-swipe point; a side without one stops at its actions.
        overshootLeft={!!fullLeft}
        overshootRight={!!fullRight}
        overshootFriction={1}
        onSwipeableWillOpen={() => {
          // Called on release: a drag that went past the ratio of the row's width runs the side's full-swipe action.
          const dx = peak.current ? peak.current.value : (offset.current?.value ?? 0);
          if (peak.current) peak.current.value = 0;
          const action = width && Math.abs(dx) >= width * fullSwipeRatio ? (dx > 0 ? fullLeft : fullRight) : undefined;
          if (action) {
            // A refused action explains itself instead of running: no success tap before it.
            if (!(action as { reason?: string }).reason) play("success");
            run(action);
          } else {
            play("medium");
            setOpen(true);
          }
        }}
        onSwipeableWillClose={() => setOpen(false)}
        onSwipeableOpenStartDrag={() => {
          if (peak.current) peak.current.value = 0;
          setDragging(true);
        }}
        onSwipeableClose={() => setDragging(false)}
        renderLeftActions={left.length ? group(left) : undefined}
        renderRightActions={right.length ? group(right) : undefined}
      >
        {round ? (
          // Always the same wrapper, so opening never remounts the row; only its style changes.
          <View testID={`${testID}-pill`} style={open ? { marginHorizontal: 6, borderRadius: 26, overflow: "hidden", backgroundColor: Platform.OS === "ios" ? PlatformColor(ROW_PILL.ios) : ROW_PILL.fallback } : undefined}>
            {content}
          </View>
        ) : (
          content
        )}
      </Swipeable>
    </View>
  );
}
