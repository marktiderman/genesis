/**
 * NativeSwipeRow — a row with actions behind a swipe, as Mail and Messages have them: leading
 * actions behind a swipe to the right (Read, Pin), trailing behind a swipe to the left (Archive,
 * Delete). Each action's `side` (trailing by default), `icon`, `tone` and `full` come from the
 * one row-action shape (`RowSwipeAction`, ADR 0028), so a view's actions, an inbox row's and an
 * app's own list read the same.
 *
 * - **Full swipe:** the first `full` action on a side runs when the row is let go past
 *   `fullSwipeRatio` (0.6) of its width on that side, as Mail's Delete does (`fullSwipeSide`).
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
import { cloneElement, isValidElement, useRef, useState, type ReactElement, type ReactNode } from "react";
import { nativeThemeDark, nativeThemeLight } from "@marktiderman/genesis-design-system/tokens";
import { I18nManager, Platform, PlatformColor, Pressable, View, type ColorValue } from "react-native";
import type { RowActionTone, RowSwipeAction } from "@marktiderman/genesis-core/conversation";
import { useHaptics } from "../hooks/use-haptics";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { useThemeMode } from "../hooks/use-theme-mode";
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

/** How far past a side's open actions a full swipe must go, in points. */
export const FULL_SWIPE_CLEARANCE = 40;

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

/** At most `max` of a side's actions, in order, keeping the destructive ones (Delete stays on the swipe). */
function capSide(list: readonly RowSwipeAction[], max: number): RowSwipeAction[] {
  if (list.length <= max) return [...list];
  const destructive = list.filter((a) => a.destructive).slice(0, max);
  const others = list.filter((a) => !a.destructive).slice(0, max - destructive.length);
  return list.filter((a) => destructive.includes(a) || others.includes(a));
}

/** The actions a swipe shows, by side (an action with `swipe: false` shows on neither), in the row's reading direction. */
export function splitSwipeActions(actions: readonly RowSwipeAction[], maxPerSide = Infinity) {
  const shown = actions.filter((a) => a.swipe !== false);
  const leading = capSide(shown.filter((a) => a.side === "leading"), maxPerSide);
  const trailing = capSide(shown.filter((a) => a.side !== "leading"), maxPerSide);
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

/**
 * Whether a release runs a side's full-swipe action. `dx` is the row's offset as the release is
 * reported (the latest UI-thread value, so the finger's position, not the furthest it went: a drag
 * that backs out, or crosses to the other side, doesn't run it). `direction` is where the row is
 * opening, as gesture-handler 2.21 and later name it: `"right"` when the row moves right and
 * uncovers the left-hand actions (2.20 and earlier named it the other way, so the peer range starts
 * at 2.21). The offset must be on that side (a release flung across to the other side opens that
 * side and runs nothing), and further than the side's open actions (`open`, their width) by
 * `FULL_SWIPE_CLEARANCE`. The report comes a frame or so after the finger lifts, so a release right
 * at the threshold can land either side of it.
 */
export function fullSwipeSide(
  dx: number,
  width: number,
  ratio: number,
  direction?: "left" | "right",
  open: { left: number; right: number } = { left: 0, right: 0 },
): "left" | "right" | undefined {
  const side = dx > 0 ? "left" : "right";
  // Past the ratio and clear of the side's open actions, so a row springing open to its buttons
  // (wider than the ratio on a narrow phone) never counts as a full swipe.
  if (!width || Math.abs(dx) < Math.max(width * ratio, open[side] + FULL_SWIPE_CLEARANCE)) return undefined;
  if (direction && (direction === "right" ? "left" : "right") !== side) return undefined;
  return side;
}

declare const __DEV__: boolean | undefined;
const warnedFull = new Set<string>();

/** In development, once per action id: a destructive full swipe that doesn't say it confirms or can be undone. */
function warnUnconfirmedFull(actions: readonly RowSwipeAction[]) {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  for (const a of actions) {
    if (!a.full || !a.destructive || a.confirms || warnedFull.has(a.id)) continue;
    warnedFull.add(a.id);
    // genesis-allow-console: a development-only hint about an unconfirmed destructive full swipe, not an error to report
    console.warn(
      `[genesis-ui-native] NativeSwipeRow: the destructive action "${a.id}" runs on a full swipe without \`confirms\`. One gesture is easy to make by mistake: ask first (or offer undo) in its onPress and set \`confirms: true\`.`,
    );
  }
}

type GroupStyle = Record<string, unknown>;

/**
 * The buttons behind one side, seen only while the row is off its resting place, so they never show
 * in an inset row's margins at rest. With Reanimated the row's own translation drives it on the UI
 * thread (a drag, a ref's `openLeft()`, a spring back); without it, the swipe's open and close events do.
 */
function ActionGroup({ R, translation, visible, style, children }: { R?: GenesisReanimatedModule; translation?: { value: number }; visible: boolean; style: GroupStyle; children: ReactNode }) {
  if (R && translation) return <AnimatedActionGroup R={R} translation={translation} style={style}>{children}</AnimatedActionGroup>;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ ...style, opacity: visible ? 1 : 0 }}>
      {children}
    </View>
  );
}

function AnimatedActionGroup({ R, translation, style, children }: { R: GenesisReanimatedModule; translation: { value: number }; style: GroupStyle; children: ReactNode }) {
  const shown = R.useAnimatedStyle(() => {
    "worklet";
    return { opacity: translation.value === 0 ? 0 : 1 };
  });
  const AnimatedView = R.default.View;
  return (
    <AnimatedView accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[style, shown]}>
      {children}
    </AnimatedView>
  );
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
  const tokens = useThemeMode() === "dark" ? nativeThemeDark : nativeThemeLight;
  const play = useHaptics();
  const swipe = useRef<{ close?: () => void } | null>(null);
  const offset = useRef<{ value: number } | null>(null);
  const [width, setWidth] = useState(0);
  const [open, setOpen] = useState(false);
  // The actions stay mounted (the swipe measures them) but unseen at rest: an inset row doesn't
  // cover the whole width, and they would show in its margins. Without Reanimated this is what shows
  // them: a drag starting, or the row opening by any means (a ref's openLeft, say).
  const [moving, setMoving] = useState(false);
  const content = accessibilityActions ? withAccessibilityActions(children, actions) : children;
  const { leading, trailing, fullLeading, fullTrailing } = splitSwipeActions(actions, maxPerSide);
  if (!Swipeable || leading.length + trailing.length === 0) return <>{content}</>;
  warnUnconfirmedFull([...leading, ...trailing]);

  // The action first (an alert it asks shows over the row), then the row closes behind it.
  const run = (action: RowSwipeAction) => {
    action.onPress();
    swipe.current?.close?.();
  };
  const round = appearance === "round";
  // The width a side's actions open to: fill buttons side by side, or round ones with their gaps.
  const openWidth = (n: number) => (n === 0 ? 0 : round ? n * 56 + (n + 1) * 10 : n * ACTION_WIDTH);
  const group = (list: readonly RowSwipeAction[]) => (_progress?: unknown, translation?: { value: number }) => {
    if (translation) offset.current = translation;
    return (
      <ActionGroup
        {...(reanimated ? { R: reanimated } : {})}
        {...(translation ? { translation } : {})}
        visible={moving}
        style={{ flexDirection: "row", alignItems: round ? "center" : "stretch", gap: round ? 10 : 0, paddingHorizontal: round ? 10 : 0 }}
      >
        {list.map((action) => {
          const color = rowActionColor(action, colors);
          const tone = action.tone ?? (action.destructive ? "red" : "tint");
          const on = onRowActionColor(tone, color, tone === "red" ? tokens.destructiveForeground : tokens.primaryForeground);
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
      </ActionGroup>
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
        onSwipeableWillOpen={(direction) => {
          // Called on release: a row let go past the ratio of its width, on the side it's opening, runs that side's full action.
          const side = fullSwipeSide(offset.current?.value ?? 0, width, fullSwipeRatio, direction, { left: openWidth(left.length), right: openWidth(right.length) });
          const action = side === "left" ? fullLeft : side === "right" ? fullRight : undefined;
          if (action) {
            // A refused action explains itself instead of running: no success tap before it.
            if (!(action as { reason?: string }).reason) play("success");
            run(action);
          } else {
            play("medium");
            setOpen(true);
          }
          setMoving(true);
        }}
        onSwipeableWillClose={() => setOpen(false)}
        onSwipeableOpenStartDrag={() => setMoving(true)}
        onSwipeableOpen={() => setMoving(true)}
        onSwipeableClose={() => setMoving(false)}
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
