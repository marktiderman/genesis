/**
 * NativeRowActions — a row's actions offered the three ways iOS offers them, from one list
 * (ADR 0028): behind a swipe (`NativeSwipeRow`), in the long-press menu, and as the screen
 * reader's actions. Wrap any pressable row in it. `NativeListItem`'s `actions`, InboxPage's rows
 * and NativeResourceView's rows and cards build theirs the same way (`useRowActions`), so a row
 * behaves the same everywhere.
 *
 * The long press opens the system context menu (UIContextMenu, the row lifted as its preview)
 * when the app passes `GenesisModules.menu` (`MenuView` from `@expo/ui/community/menu`), and
 * `NativeContextMenu`'s sheet otherwise. Every action shows in the menu, `swipe: false` ones
 * included; a refused one is still listed, and pressing it explains (its `onPress`).
 *
 * @stability Beta
 */
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import type { RowSwipeAction } from "@marktiderman/genesis-core/row-actions";
import { useRowActions } from "./use-row-actions";

export { NativeSystemMenuRow, toMenuAction } from "./use-row-actions";

export interface NativeRowActionsProps {
  actions: readonly RowSwipeAction[];
  /** What the actions act on: the menu's title (the row's title). */
  title?: string;
  /** The row: one pressable element, which gets the long press and the accessibility actions. */
  children: ReactNode;
  /**
   * A peek of the row above its long-press menu (a conversation's latest messages). The system
   * menu from `GenesisModules.menu` can't draw one, so with a preview the long press opens
   * `NativeContextMenu`'s sheet, the peek on top.
   */
  preview?: () => ReactNode;
  /** The swipe's look: `"fill"` or iOS 26's `"round"`. */
  appearance?: "fill" | "round";
  testID?: string;
}

type RowProps = {
  onLongPress?: () => void;
  accessibilityActions?: readonly { name: string; label?: string }[];
  onAccessibilityAction?: (event: { nativeEvent: { actionName: string } }) => void;
};

export function NativeRowActions({ actions, title, children, appearance, preview, testID = "row-actions" }: NativeRowActionsProps) {
  const { rowProps, wrap } = useRowActions(actions, {
    ...(title ? { title } : {}),
    ...(preview ? { preview } : {}),
    ...(appearance ? { appearance } : {}),
    testID,
  });
  let row: ReactNode = children;
  if (actions.length && isValidElement(children)) {
    const child = children as ReactElement<RowProps>;
    const own = child.props.accessibilityActions ?? [];
    const mine = rowProps.accessibilityActions ?? [];
    row = cloneElement(child, {
      // The child's own actions first; ours after, each name once.
      accessibilityActions: [...own, ...mine.filter((a) => !own.some((o) => o.name === a.name))],
      onAccessibilityAction: (event) => {
        if (own.some((o) => o.name === event.nativeEvent.actionName)) child.props.onAccessibilityAction?.(event);
        else rowProps.onAccessibilityAction?.(event);
      },
      // With the system menu, the long press is the menu's own gesture; without it, the child's own
      // long press still runs, then the menu opens.
      ...(rowProps.onLongPress
        ? {
            onLongPress: () => {
              child.props.onLongPress?.();
              rowProps.onLongPress?.();
            },
          }
        : {}),
    });
  }
  return <>{wrap(row)}</>;
}
