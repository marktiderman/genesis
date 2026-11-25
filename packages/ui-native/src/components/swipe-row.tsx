/**
 * NativeSwipeRow — a row with actions behind a swipe, as Mail and Messages have them: leading
 * actions behind a swipe to the right (Read, Pin), trailing behind a swipe to the left (Archive,
 * Delete). Each action's `swipe` (`{ side, full }`, trailing by default), `icon`, `tone` and
 * `accent` come from the one row-action shape (`RowSwipeAction` in `genesis-core/row-actions`,
 * ADR 0028), so a view's actions, an inbox row's and an app's own list read the same.
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
import { I18nManager, Platform, PlatformColor, Pressable, View } from "react-native";
import { rowActionLabel, rowActionSwipe, type RowSwipeAction } from "@marktiderman/genesis-core/row-actions";
import { useHaptics } from "../hooks/use-haptics";
import { useThemeRoles } from "../hooks/use-theme-roles";
import { useGenesisModules, type GenesisReanimatedModule } from "../native-modules";
import { isNativeIconName } from "../icon-names";
import { ROW_PILL, useRowActionColors } from "../tokens/row-action-tones";
import { NativeIcon } from "./icon";
import { NativeText } from "./text";

export interface NativeSwipeRowProps {
  actions: readonly RowSwipeAction[];
  children?: ReactNode;
  /** `"fill"` (colored blocks, the default) or `"round"` (iOS 26's round icon buttons). */
  appearance?: "fill" | "round";
  /**
   * Round buttons: the label under each circle. Default `true`; `false` draws the circles alone, as
   * Messages does, and each button keeps its label as its accessibility label.
   */
  roundLabels?: boolean;
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

/** How long a drag that started counts as swiping when gesture-handler reports no end, in ms. */
export const SWIPE_PRESS_HOLD_MS = 2000;

/**
 * Tells NativeSwipeRow's row whether its press is a real one. Not while the row is open; not when a
 * drag started after the touch did (gesture-handler's start of a drag, which can come just after the
 * release); and, for a touch it didn't see start, not within `SWIPE_PRESS_HOLD_MS` of a drag that
 * reported no end. It reads the Swipeable's own callbacks and a touch's start, and never takes the
 * touch, so the swipe always gets its gesture.
 */
export function createSwipePressGuard(now: () => number = () => Date.now()) {
  let open = false;
  let dragAt: number | null = null;
  let touchAt: number | null = null;
  return {
    touchStart() {
      touchAt = now();
    },
    dragStart() {
      dragAt = now();
    },
    opened() {
      open = true;
      dragAt = null;
    },
    closed() {
      open = false;
      dragAt = null;
    },
    blocks() {
      if (open) return true;
      if (dragAt === null) return false;
      // This touch became a drag.
      if (touchAt !== null && dragAt >= touchAt) return true;
      // A touch it didn't see start: a drag lately, with no end reported.
      return touchAt === null && now() - dragAt < SWIPE_PRESS_HOLD_MS;
    },
  };
}

type Pressish = { onPress?: (...args: unknown[]) => void; children?: ReactNode };

/** How deep the guard looks for the row's press: a system menu or another wrapper can sit around the row. */
const PRESS_SEARCH_DEPTH = 4;

/** One frame later: gesture-handler can report a drag's start just after the release that ends it. */
const nextFrame = (run: () => void) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => run()) : setTimeout(run, 16));

/**
 * The row with its press guarded: the first element with an `onPress` (the row, or the row inside a
 * menu wrapper) gets it wrapped. A press the guard blocks does nothing but `onBlocked`; one it lets
 * through runs a frame later, unless a drag has started by then.
 */
function withPressGuard(children: ReactNode, guard: ReturnType<typeof createSwipePressGuard>, onBlocked: () => void, depth = 0): ReactNode {
  if (!isValidElement(children) || depth > PRESS_SEARCH_DEPTH) return children;
  const child = children as ReactElement<Pressish>;
  const onPress = child.props.onPress;
  if (typeof onPress === "function") {
    return cloneElement(child, {
      onPress: (...args: unknown[]) => {
        if (guard.blocks()) return onBlocked();
        nextFrame(() => {
          if (guard.blocks()) return;
          onPress(...args);
        });
      },
    });
  }
  const inner = child.props.children;
  if (!isValidElement(inner)) return children;
  const guarded = withPressGuard(inner, guard, onBlocked, depth + 1);
  return guarded === inner ? children : cloneElement(child, { children: guarded });
}

/** How far past a side's open actions a full swipe must go, in points. */
export const FULL_SWIPE_CLEARANCE = 40;

/**
 * The swipe's measurements, in points: what a side opens to (`openWidth`) and what the buttons
 * draw with come from here, so the two never disagree.
 */
export const SWIPE_METRICS = {
  /** A fill button's width: room for a short label. */
  fillWidth: 80,
  /** A round button's slot (its circle and label) and the circle inside it (iOS 26's 50pt). */
  roundSlot: 56,
  roundCircle: 50,
  /** The space between round buttons, and at the side's edges. */
  roundGap: 10,
  /** The open row as a pill: its inset from the row's edges and its corner radius. */
  pillInset: 6,
  pillRadius: 26,
} as const;

/** The width a side's `n` actions open to: fill buttons side by side, or round ones with their gaps. */
export function openWidth(n: number, appearance: "fill" | "round"): number {
  if (n === 0) return 0;
  return appearance === "round" ? n * SWIPE_METRICS.roundSlot + (n + 1) * SWIPE_METRICS.roundGap : n * SWIPE_METRICS.fillWidth;
}

/** At most `max` of a side's actions, in order, keeping the destructive ones (Delete stays on the swipe). */
function capSide(list: readonly RowSwipeAction[], max: number): RowSwipeAction[] {
  if (list.length <= max) return [...list];
  const destructive = list.filter((a) => a.destructive).slice(0, max);
  const others = list.filter((a) => !a.destructive).slice(0, max - destructive.length);
  return list.filter((a) => destructive.includes(a) || others.includes(a));
}

/** Whether a full swipe runs it, from its placement. */
const isFull = (a: RowSwipeAction) => {
  const place = rowActionSwipe(a);
  return place !== false && place.full === true;
};

/** The actions a swipe shows, by side (an action with `swipe: false` shows on neither), in the row's reading direction. */
export function splitSwipeActions(actions: readonly RowSwipeAction[], maxPerSide = Infinity) {
  const side = (a: RowSwipeAction) => {
    const place = rowActionSwipe(a);
    return place === false ? null : place.side;
  };
  const leading = capSide(actions.filter((a) => side(a) === "leading"), maxPerSide);
  const trailing = capSide(actions.filter((a) => side(a) === "trailing"), maxPerSide);
  return { leading, trailing, fullLeading: leading.find(isFull), fullTrailing: trailing.find(isFull) };
}

/**
 * The row's actions as React Native's `accessibilityActions` and the handler that runs them: the
 * one place they're built (`useRowActions` and NativeSwipeRow use it). A refused action's label
 * carries its reason, so a screen reader hears why before pressing it.
 */
export function rowAccessibilityActions(actions: readonly RowSwipeAction[]) {
  return {
    accessibilityActions: actions.map((a) => ({ name: a.id, label: rowActionLabel(a) })),
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
    if (!isFull(a) || !a.destructive || a.confirms || warnedFull.has(a.id)) continue;
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
 * thread (a drag, a ref's `openLeft()`, a spring back); without it, the row's one `open` state does.
 */
function ActionGroup({ R, translation, open, style, children }: { R?: GenesisReanimatedModule; translation?: { value: number }; open: boolean; style: GroupStyle; children: ReactNode }) {
  if (R && translation) return <AnimatedActionGroup R={R} translation={translation} style={style}>{children}</AnimatedActionGroup>;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ ...style, opacity: open ? 1 : 0 }}>
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
  roundLabels = true,
  fullSwipeRatio = 0.6,
  maxPerSide = 3,
  accessibilityActions = true,
  testID = "swipe-row",
}: NativeSwipeRowProps) {
  const { swipeable: Swipeable, reanimated } = useGenesisModules();
  const colors = useThemeRoles();
  const colorsOf = useRowActionColors();
  const play = useHaptics();
  const swipe = useRef<{ close?: () => void } | null>(null);
  const guard = useRef(createSwipePressGuard()).current;
  const offset = useRef<{ value: number } | null>(null);
  const [width, setWidth] = useState(0);
  // The row off its resting place: from a drag starting (or a ref opening it) until it is back home.
  // It makes the open row a pill (round) and, without Reanimated, shows the buttons, which stay
  // mounted (the swipe measures them) but unseen at rest, so they never show in an inset row's margins.
  const [open, setOpen] = useState(false);
  // A touch's start, without taking it (no responder): the guard tells a press that became a drag.
  const touchStart = { onTouchStart: () => guard.touchStart() } as Record<string, unknown>;
  // A tap on a swiped-open row closes it instead of pressing it.
  const content = withPressGuard(accessibilityActions ? withAccessibilityActions(children, actions) : children, guard, () => swipe.current?.close?.());
  const { leading, trailing, fullLeading, fullTrailing } = splitSwipeActions(actions, maxPerSide);
  if (!Swipeable || leading.length + trailing.length === 0) return <>{content}</>;
  warnUnconfirmedFull([...leading, ...trailing]);

  // The action first (an alert it asks shows over the row), then the row closes behind it.
  const run = (action: RowSwipeAction) => {
    action.onPress();
    swipe.current?.close?.();
  };
  const round = appearance === "round";
  const m = SWIPE_METRICS;
  const group = (list: readonly RowSwipeAction[]) => (_progress?: unknown, translation?: { value: number }) => {
    if (translation) offset.current = translation;
    return (
      <ActionGroup
        {...(reanimated ? { R: reanimated } : {})}
        {...(translation ? { translation } : {})}
        open={open}
        style={{ flexDirection: "row", alignItems: round ? "center" : "stretch", gap: round ? m.roundGap : 0, paddingHorizontal: round ? m.roundGap : 0 }}
      >
        {list.map((action) => {
          const { background, foreground } = colorsOf(action);
          const icon = action.icon && isNativeIconName(action.icon) ? <NativeIcon name={action.icon} size={round ? 20 : 22} color={foreground} /> : null;
          return (
            <Pressable
              key={action.id}
              testID={`${testID}-action-${action.id}`}
              // A round button drawn without its label is still named (the rest are as they were).
              {...(round && !roundLabels ? { accessibilityRole: "button" as const, accessibilityLabel: action.label } : {})}
              onPress={() => run(action)}
              style={{ width: round ? m.roundSlot : m.fillWidth, alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: round ? "transparent" : background }}
            >
              {round ? (
                <View style={{ width: m.roundCircle, height: m.roundCircle, borderRadius: m.roundCircle / 2, alignItems: "center", justifyContent: "center", backgroundColor: background }}>{icon}</View>
              ) : (
                icon
              )}
              {round && !roundLabels ? null : (
                <NativeText testID={`${testID}-action-${action.id}-label`} preset="label" style={{ color: round ? colors.label : foreground, fontSize: round ? 12 : 14 }} numberOfLines={1}>
                  {action.label}
                </NativeText>
              )}
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
          const side = fullSwipeSide(offset.current?.value ?? 0, width, fullSwipeRatio, direction, { left: openWidth(left.length, appearance), right: openWidth(right.length, appearance) });
          const action = side === "left" ? fullLeft : side === "right" ? fullRight : undefined;
          if (action) {
            // A refused action explains itself instead of running: no success tap before it.
            if (!(action as { reason?: string }).reason) play("success");
            run(action);
          } else {
            play("medium");
            // A row opening onto its buttons (a drag already set this; a ref's openLeft() didn't).
            setOpen(true);
          }
        }}
        onSwipeableOpenStartDrag={() => {
          guard.dragStart();
          setOpen(true);
        }}
        onSwipeableOpen={() => {
          guard.opened();
          setOpen(true);
        }}
        // Cleared once the row is home, not as it starts back: the buttons stay seen while it slides.
        onSwipeableClose={() => {
          guard.closed();
          setOpen(false);
        }}
        renderLeftActions={left.length ? group(left) : undefined}
        renderRightActions={right.length ? group(right) : undefined}
      >
        <View testID={`${testID}-touch`} {...touchStart}>
          {round ? (
            // Always the same wrapper, so opening never remounts the row; only its style changes.
            <View testID={`${testID}-pill`} style={open && round ? { marginHorizontal: m.pillInset, borderRadius: m.pillRadius, overflow: "hidden", backgroundColor: Platform.OS === "ios" ? PlatformColor(ROW_PILL.ios) : ROW_PILL.fallback } : undefined}>
              {content}
            </View>
          ) : (
            content
          )}
        </View>
      </Swipeable>
    </View>
  );
}
