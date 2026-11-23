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
import { View } from "react-native";
import { useGenesisModules, type GenesisMenuAction, type GenesisMenuComponent } from "../native-modules";
import { NativeContextMenu } from "./context-menu";
import { NativeSwipeRow, rowAccessibilityActions } from "./swipe-row";

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

/**
 * A row inside the system context menu (`GenesisModules.menu`). The menu's host sizes itself to
 * its content, which would shrink a row that only stretches: so the row is given its measured
 * width once laid out (the same tree throughout, so it never remounts).
 */
export function NativeSystemMenuRow({
  Menu,
  actions,
  title,
  testID,
  children,
}: {
  Menu: GenesisMenuComponent;
  actions: readonly RowSwipeAction[];
  title?: string;
  testID: string;
  children: ReactNode;
}) {
  const [width, setWidth] = useState(0);
  // One tree from the first render (the row never remounts); the width is filled in once measured.
  return (
    <View testID={`${testID}-host`} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))} style={{ alignSelf: "stretch" }}>
      <Menu
        testID={testID}
        {...(title ? { title } : {})}
        actions={actions.map(toMenuAction)}
        shouldOpenOnLongPress
        style={width ? { width } : { alignSelf: "stretch" }}
        onPressAction={({ nativeEvent }) => actions.find((a) => a.id === nativeEvent.event)?.onPress()}
      >
        <View style={width ? { width } : undefined}>{children}</View>
      </Menu>
    </View>
  );
}

export function NativeRowActions({ actions, title, children, appearance, preview, testID = "row-actions" }: NativeRowActionsProps) {
  const { menu } = useGenesisModules();
  const Menu = preview ? undefined : menu;
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
      <NativeSystemMenuRow Menu={Menu} actions={actions} {...(title ? { title } : {})} testID={`${testID}-menu`}>
        {row}
      </NativeSystemMenuRow>
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
          {...(preview && open ? { preview: preview() } : {})}
          actions={actions.map((a) => ({ id: a.id, label: a.label, onPress: a.onPress, ...(a.destructive ? { destructive: true } : {}) }))}
          testID={`${testID}-sheet`}
        />
      )}
    </>
  );
}
