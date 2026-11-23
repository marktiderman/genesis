/**
 * NativeRowActions — a row's actions offered the three ways iOS offers them, from one list
 * (ADR 0028): behind a swipe (`NativeSwipeRow`), in the long-press menu, and as the screen
 * reader's actions. Wrap any pressable row in it; `NativeListItem`'s `actions` does it for you,
 * and InboxPage and NativeResourceView wire the same pieces themselves.
 *
 * The long press opens the system context menu (UIContextMenu, the row lifted as its preview)
 * when the app passes `GenesisModules.menu` (`MenuView` from `@expo/ui/community/menu`), and
 * `NativeContextMenu`'s sheet otherwise. Every action shows in the menu, `swipe: false` ones
 * included; a refused one is still listed, and pressing it explains (its `onPress`).
 *
 * @stability Beta
 */
import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import type { RowSwipeAction } from "@marktiderman/genesis-core/conversation";
import { SF_SYMBOLS, type NativeIconName } from "../icon-names";
import { useGenesisModules, type GenesisMenuAction } from "../native-modules";
import { NativeContextMenu } from "./context-menu";
import { NativeSwipeRow, rowAccessibilityActions } from "./swipe-row";

export interface NativeRowActionsProps {
  actions: readonly RowSwipeAction[];
  /** What the actions act on: the menu's title (the row's title). */
  title?: string;
  /** The row: one pressable element, which gets the long press and the accessibility actions. */
  children: ReactNode;
  /** The swipe's look: `"fill"` or iOS 26's `"round"`. */
  appearance?: "fill" | "round";
  testID?: string;
}

/** A row action as the system menu takes it: its SF Symbol, and destructive in red. */
export function toMenuAction(action: RowSwipeAction): GenesisMenuAction {
  const symbol = action.icon ? SF_SYMBOLS[action.icon as NativeIconName] : undefined;
  return {
    id: action.id,
    title: action.label,
    ...(symbol ? { image: symbol } : {}),
    ...(action.destructive ? { attributes: { destructive: true } } : {}),
  };
}

type RowProps = {
  onLongPress?: () => void;
  accessibilityActions?: readonly { name: string; label?: string }[];
  onAccessibilityAction?: (event: { nativeEvent: { actionName: string } }) => void;
};

export function NativeRowActions({ actions, title, children, appearance, testID = "row-actions" }: NativeRowActionsProps) {
  const { menu: Menu } = useGenesisModules();
  const [open, setOpen] = useState(false);
  if (actions.length === 0) return <>{children}</>;

  const a11y = rowAccessibilityActions(actions);
  let row: ReactNode = children;
  if (isValidElement(children)) {
    const child = children as ReactElement<RowProps>;
    row = cloneElement(child, {
      accessibilityActions: [...(child.props.accessibilityActions ?? []), ...a11y.accessibilityActions],
      onAccessibilityAction: (event) => {
        if (actions.some((a) => a.id === event.nativeEvent.actionName)) a11y.onAccessibilityAction(event);
        else child.props.onAccessibilityAction?.(event);
      },
      // With the system menu, the long press is the menu's own gesture.
      ...(Menu ? {} : { onLongPress: () => setOpen(true) }),
    });
  }
  if (Menu) {
    row = (
      <Menu
        testID={`${testID}-menu`}
        {...(title ? { title } : {})}
        actions={actions.map(toMenuAction)}
        shouldOpenOnLongPress
        onPressAction={({ nativeEvent }) => actions.find((a) => a.id === nativeEvent.event)?.onPress()}
      >
        {row}
      </Menu>
    );
  }
  return (
    <>
      <NativeSwipeRow actions={actions} accessibilityActions={false} {...(appearance ? { appearance } : {})} testID={`${testID}-swipe`}>
        {row}
      </NativeSwipeRow>
      {Menu ? null : (
        <NativeContextMenu
          open={open}
          onOpenChange={setOpen}
          {...(title ? { title } : {})}
          actions={actions.map((a) => ({ id: a.id, label: a.label, onPress: a.onPress, ...(a.destructive ? { destructive: true } : {}) }))}
          testID={`${testID}-sheet`}
        />
      )}
    </>
  );
}
