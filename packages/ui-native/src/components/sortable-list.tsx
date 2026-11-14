/**
 * SortableList — a vertical list the person rearranges (course steps, form fields): the twin of
 * genesis-ui's SortableList, with the same `items`, `getKey`, `getItemLabel`, `renderItem` and
 * `onReorder(from, to, { key })`.
 *
 * Every way to move an item does the same thing, so dragging is never the only one:
 * - drag the row's handle (`context.handle`, render it in the row). Once a drag starts it keeps
 *   the gesture (a parent ScrollView can't take it over); `onDragChange` tells the screen, so it
 *   can also stop its scroll view (`scrollEnabled={!dragging}`), which iOS needs for a native one;
 * - long press the row for a Move menu (up, down, to top, to bottom; `moveMenu`, on by default);
 * - a screen reader's actions on the row (swipe up or down on it: the same four moves);
 * - `moveUp` / `moveDown` / `moveTo` from the render context, for buttons of your own.
 *
 * The list shows the new order at once and keeps it until `onReorder`'s promise settles; a
 * rejected promise puts the old order back and says the move failed. Moves are announced. The
 * order arithmetic is genesis-core's (`moveItem`, `dropIndex`, `movedAnnouncement`), as on the web.
 *
 * The rows are plain views, not a virtualized list: for tens of items, not thousands.
 *
 * @stability Beta
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, PanResponder, Pressable, Text, View } from "react-native";
import { dropIndex, moveItem, movedAnnouncement } from "@marktiderman/genesis-core/headless";
import { NativeContextMenu } from "./context-menu";
import { cn } from "../utils";

export interface NativeSortableListItemContext {
  /** The item's position as shown, from 0. */
  index: number;
  /** The drag handle: render it somewhere in the row. */
  handle: ReactNode;
  /** True while this item is being dragged. */
  isDragging: boolean;
  moveUp: () => void;
  moveDown: () => void;
  moveTo: (index: number) => void;
}

export interface NativeSortableListLabels {
  /** `{name}`: the handle's label. Default "Reorder {name}". */
  reorder?: string;
  moveUp?: string;
  moveDown?: string;
  moveToTop?: string;
  moveToBottom?: string;
  /** `{name}`, `{n}`, `{total}`. Default "{name} moved to position {n} of {total}." */
  moved?: string;
  /** `{name}`. Default "Couldn’t move {name}." */
  moveFailed?: string;
  cancel?: string;
}

export interface NativeSortableListProps<T> {
  items: readonly T[];
  getKey: (item: T) => string;
  getItemLabel: (item: T) => string;
  renderItem: (item: T, context: NativeSortableListItemContext) => ReactNode;
  /** Move the item at `from` to `to`; by the time a returned promise settles, `items` is in the new order. */
  onReorder: (from: number, to: number, move: { key: string }) => void | Promise<void>;
  /** The list's accessible name ("Course steps"). */
  label: string;
  disabled?: boolean;
  /** The Move menu on a long press. Default true. */
  moveMenu?: boolean;
  /** A drag started (`true`) or ended (`false`): stop the screen's ScrollView while it runs. */
  onDragChange?: (dragging: boolean) => void;
  labels?: NativeSortableListLabels;
  className?: string;
  itemClassName?: string;
  testID?: string;
}

const DEFAULT_LABELS: Required<NativeSortableListLabels> = {
  reorder: "Reorder {name}",
  moveUp: "Move up",
  moveDown: "Move down",
  moveToTop: "Move to top",
  moveToBottom: "Move to bottom",
  moved: "{name} moved to position {n} of {total}.",
  moveFailed: "Couldn’t move {name}.",
  cancel: "Cancel",
};

const announce = (text: string) => AccessibilityInfo.announceForAccessibility?.(text);

export function NativeSortableList<T>({
  items,
  getKey,
  getItemLabel,
  renderItem,
  onReorder,
  label,
  disabled = false,
  moveMenu = true,
  onDragChange,
  labels: labelsProp,
  className,
  itemClassName,
  testID = "native-sortable-list",
}: NativeSortableListProps<T>) {
  const t = { ...DEFAULT_LABELS, ...labelsProp };
  const itemKeys = items.map(getKey);
  const byKey = new Map(items.map((item) => [getKey(item), item] as const));
  // The order shown until a committed move settles.
  const [preview, setPreview] = useState<string[] | null>(null);
  const pending = useRef(false);
  const [drag, setDrag] = useState<{ key: string; from: number; dy: number } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const rowHeight = useRef(56);

  const baseKeys = preview && preview.length === itemKeys.length && preview.every((k) => byKey.has(k)) ? preview : itemKeys;
  const total = baseKeys.length;
  const nameOf = (key: string) => {
    const item = byKey.get(key);
    return item === undefined ? key : getItemLabel(item);
  };
  const target = drag ? dropIndex(drag.from, drag.dy, rowHeight.current, total) : null;
  const keys = drag && target !== null ? moveItem(baseKeys, drag.from, target) : baseKeys;

  const move = (key: string, to: number) => {
    if (disabled || pending.current) return;
    const from = itemKeys.indexOf(key);
    const dest = Math.max(0, Math.min(total - 1, Math.round(to)));
    if (from < 0 || dest === from) return;
    pending.current = true;
    setPreview(moveItem(itemKeys, from, dest));
    let result: void | Promise<void>;
    try {
      result = onReorder(from, dest, { key });
    } catch (error) {
      result = Promise.reject(error);
    }
    Promise.resolve(result)
      .then(
        () => announce(movedAnnouncement(nameOf(key), dest, total, t.moved)),
        () => announce(t.moveFailed.replace("{name}", nameOf(key))),
      )
      .finally(() => {
        pending.current = false;
        setPreview(null);
      });
  };

  // The responders are built once per order; what they call is read at release time, so a screen's
  // `onReorder` that closes over newer state (a mutation's latest value) is the one that runs.
  const latest = useRef({ move, onDragChange });
  latest.current = { move, onDragChange };

  const responders = useMemo(() => {
    const map = new Map<string, ReturnType<typeof PanResponder.create>>();
    for (const [i, key] of baseKeys.entries()) {
      map.set(
        key,
        PanResponder.create({
          onStartShouldSetPanResponder: () => !disabled && !pending.current,
          onMoveShouldSetPanResponder: () => !disabled && !pending.current,
          // A drag in progress keeps the gesture: a parent ScrollView asking for it is refused, and
          // on Android the native scroll is blocked while the handle holds it.
          onPanResponderTerminationRequest: () => false,
          onShouldBlockNativeResponder: () => true,
          onPanResponderGrant: () => {
            setDrag({ key, from: i, dy: 0 });
            latest.current.onDragChange?.(true);
          },
          onPanResponderMove: (_e, g) => setDrag({ key, from: i, dy: g.dy }),
          onPanResponderRelease: (_e, g) => {
            setDrag(null);
            latest.current.onDragChange?.(false);
            latest.current.move(key, dropIndex(i, g.dy, rowHeight.current, baseKeys.length));
          },
          onPanResponderTerminate: () => {
            setDrag(null);
            latest.current.onDragChange?.(false);
          },
        }),
      );
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt when the order or state changes
  }, [baseKeys.join("\u0000"), disabled]);

  const menuIndex = menuFor ? baseKeys.indexOf(menuFor) : -1;

  return (
    <View testID={testID} accessibilityRole="list" accessibilityLabel={label} className={cn("gap-2", className)}>
      {keys.map((key, index) => {
        const item = byKey.get(key);
        if (item === undefined) return null;
        const from = baseKeys.indexOf(key);
        const isDragging = drag?.key === key;
        const name = nameOf(key);
        const handle = (
          <View
            testID={`${testID}-handle-${key}`}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            className={cn("h-11 w-8 items-center justify-center", disabled && "opacity-40")}
            {...(responders.get(key)?.panHandlers ?? {})}
          >
            <Text className="text-lg text-muted-foreground">⋮⋮</Text>
          </View>
        );
        const actions = [
          ...(from > 0 ? [{ name: "moveToTop", label: t.moveToTop }, { name: "moveUp", label: t.moveUp }] : []),
          ...(from < total - 1 ? [{ name: "moveDown", label: t.moveDown }, { name: "moveToBottom", label: t.moveToBottom }] : []),
        ];
        return (
          <View
            key={key}
            testID={`${testID}-item-${key}`}
            accessible
            accessibilityLabel={`${name}, ${index + 1} of ${total}`}
            accessibilityHint={disabled ? undefined : t.reorder.replace("{name}", name)}
            accessibilityActions={disabled ? [] : [...actions, ...(moveMenu ? [{ name: "longpress", label: t.reorder.replace("{name}", name) }] : [])]}
            onAccessibilityAction={(e: { nativeEvent: { actionName: string } }) => {
              const a = e.nativeEvent.actionName;
              if (a === "moveUp") move(key, from - 1);
              else if (a === "moveDown") move(key, from + 1);
              else if (a === "moveToTop") move(key, 0);
              else if (a === "moveToBottom") move(key, total - 1);
              else if (a === "longpress" && moveMenu) setMenuFor(key);
            }}
            onLayout={
              index === 0
                ? (e: { nativeEvent?: { layout?: { height?: number } } }) => {
                    const h = e.nativeEvent?.layout?.height;
                    if (h) rowHeight.current = h + 8;
                  }
                : undefined
            }
            className={cn(isDragging && "z-10 opacity-90 shadow-lg", itemClassName)}
            style={isDragging && target !== null ? { transform: [{ translateY: drag!.dy - (target - drag!.from) * rowHeight.current }] } : undefined}
          >
            <LongPress enabled={moveMenu && !disabled} onLongPress={() => setMenuFor(key)} testID={`${testID}-row-${key}`}>
              {renderItem(item, {
                index,
                handle,
                isDragging,
                moveUp: () => move(key, from - 1),
                moveDown: () => move(key, from + 1),
                moveTo: (to) => move(key, to),
              })}
            </LongPress>
          </View>
        );
      })}
      {moveMenu ? (
        <NativeContextMenu
          testID={`${testID}-menu`}
          open={menuFor !== null}
          onOpenChange={(open) => (open ? undefined : setMenuFor(null))}
          title={menuFor ? nameOf(menuFor) : undefined}
          cancelLabel={t.cancel}
          actions={
            menuFor === null
              ? []
              : [
                  ...(menuIndex > 0
                    ? [
                        { id: "top", label: t.moveToTop, onPress: () => move(menuFor, 0) },
                        { id: "up", label: t.moveUp, onPress: () => move(menuFor, menuIndex - 1) },
                      ]
                    : []),
                  ...(menuIndex < total - 1
                    ? [
                        { id: "down", label: t.moveDown, onPress: () => move(menuFor, menuIndex + 1) },
                        { id: "bottom", label: t.moveToBottom, onPress: () => move(menuFor, total - 1) },
                      ]
                    : []),
                ]
          }
        />
      ) : null}
    </View>
  );
}

/** A long press on the row's background opens the Move menu; presses inside the row stay the row's. */
function LongPress({ enabled, onLongPress, children, testID }: { enabled: boolean; onLongPress: () => void; children: ReactNode; testID: string }) {
  if (!enabled) return <>{children}</>;
  return (
    <Pressable testID={testID} accessible={false} onLongPress={onLongPress} delayLongPress={350}>
      {children}
    </Pressable>
  );
}
