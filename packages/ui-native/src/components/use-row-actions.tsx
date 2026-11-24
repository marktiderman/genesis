/**
 * useRowActions — a row's actions, built in one place (ADR 0028): what the row itself takes (its
 * screen reader's actions and its long press) and what goes around it (the system context menu,
 * then the swipe), with the long-press sheet as the fallback. `NativeRowActions`,
 * `NativeListItem`'s `actions`, InboxPage's rows and NativeResourceView's rows and cards all use
 * it, so a row behaves the same wherever it is drawn.
 *
 * - **Long press:** a screen's own menu when it gives `renderMenu` (no sheet or system menu is
 *   mounted then); else the system context menu when the app passes `GenesisModules.menu` (the row
 *   lifted as its preview; the menu owns the gesture, so `rowProps` has no `onLongPress`), else
 *   `NativeContextMenu`'s sheet. A `preview` (a peek above the menu) needs the sheet, which the
 *   system menu can't draw.
 * - **Screen readers:** every action, a refused one with its reason (`rowAccessibilityActions`).
 * - **Swipe:** `NativeSwipeRow` by default, a screen's own through `swipe`, or none with `null`;
 *   the swipe never adds the actions for screen readers again (the row has them).
 *
 * @internal
 */
import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import type { RowSwipeAction } from "@marktiderman/genesis-core/row-actions";
import { SF_SYMBOLS, isNativeIconName } from "../icon-names";
import { useGenesisModules, type GenesisMenuAction, type GenesisMenuComponent } from "../native-modules";
import { NativeContextMenu } from "./context-menu";
import { NativeSwipeRow, rowAccessibilityActions } from "./swipe-row";

/** What a row's swipe wrapper gets: NativeSwipeRow's props, the screen reader's actions already on the row. */
export interface RowActionsSwipeProps {
  actions: readonly RowSwipeAction[];
  testID: string;
  appearance?: "fill" | "round";
  accessibilityActions: false;
  children: ReactNode;
}

/** What a screen's own long-press menu (`renderMenu`) is given. */
export interface RowActionsMenuProps {
  open: boolean;
  /** Closes it: set `open` false. */
  onClose: () => void;
  /** Every action, as the sheet would list them (`swipe: false` ones included). */
  actions: readonly RowSwipeAction[];
  /** What the actions act on (the row's title). */
  title?: string;
  /** The row's peek, when it has one. */
  preview?: () => ReactNode;
  /** `<row testID>-menu`. */
  testID: string;
}

export interface UseRowActionsOptions {
  /** What the actions act on: the menu's title (the row's title). */
  title?: string;
  /** A peek above the long-press menu; with one, the long press opens the sheet, not the system menu. */
  preview?: () => ReactNode;
  /** The swipe's look: `"fill"` or iOS 26's `"round"`. */
  appearance?: "fill" | "round";
  /** The swipe around the row: default `NativeSwipeRow`; a screen's own; `null` for none (the menu and screen reader's actions stay). */
  swipe?: ((props: RowActionsSwipeProps) => ReactNode) | null;
  /**
   * The long-press menu of the screen's own (a glass menu, say), in place of the sheet and the
   * system menu: it gets `RowActionsMenuProps` and is mounted from the first long press. The swipe
   * and the screen reader's actions don't change.
   */
  renderMenu?: (props: RowActionsMenuProps) => ReactNode;
  /** The sheet's Cancel. */
  cancelLabel?: string;
  /** The row's testID; the menu, swipe and sheet are `<testID>-menu`, `-swipe`, `-sheet`. */
  testID: string;
  /** The sheet's own testID, where a page has always named it (InboxPage's `<page>-menu`). */
  sheetTestID?: string;
}

/** What a row spreads onto its pressable: its screen reader's actions and, without the system menu, its long press. */
export interface RowActionProps {
  accessibilityActions?: { name: string; label: string }[];
  onAccessibilityAction?: (event: { nativeEvent: { actionName: string } }) => void;
  onLongPress?: () => void;
}

export interface UseRowActionsReturn {
  /** Spread onto the row's pressable. Empty when there are no actions. */
  rowProps: RowActionProps;
  /** The row inside the system menu (when the app has one), inside the swipe, beside the sheet. */
  wrap: (row: ReactNode) => ReactNode;
  /** Opens the sheet of actions, as a long press does without the system menu (`card.showActions`). */
  openMenu: () => void;
}

/** A row action as the system menu takes it: its SF Symbol, and destructive in red. */
export function toMenuAction(action: RowSwipeAction): GenesisMenuAction {
  const symbol = action.icon && isNativeIconName(action.icon) ? SF_SYMBOLS[action.icon] : undefined;
  return {
    id: action.id,
    title: action.label,
    ...(symbol ? { image: symbol } : {}),
    ...(action.destructive ? { attributes: { destructive: true } } : {}),
  };
}

/**
 * A row inside the system context menu (`GenesisModules.menu`). The menu's host sizes itself to
 * its content, which would shrink a row that only stretches: so the row is given its measured
 * width once it's known.
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

const defaultSwipe = (props: RowActionsSwipeProps) => <NativeSwipeRow {...props} />;

export function useRowActions(actions: readonly RowSwipeAction[], options: UseRowActionsOptions): UseRowActionsReturn {
  const { menu } = useGenesisModules();
  const { title, preview, appearance, swipe = defaultSwipe, renderMenu, cancelLabel, testID, sheetTestID } = options;
  const Menu = preview || renderMenu ? undefined : menu;
  const [open, setOpen] = useState(false);
  // The sheet mounts on the first long press and stays, so its words don't vanish while it closes.
  const [sheetShown, setSheetShown] = useState(false);
  const has = actions.length > 0;
  // A row whose actions go away (disabled, or none left) closes its sheet, so it doesn't open
  // again by itself when they come back. Reset while rendering, so the sheet never draws open.
  if (!has && (open || sheetShown)) {
    setOpen(false);
    setSheetShown(false);
  }
  const rowProps = useMemo<RowActionProps>(() => {
    if (!has) return {};
    const a11y = rowAccessibilityActions(actions);
    return Menu
      ? a11y
      : {
          ...a11y,
          onLongPress: () => {
            setSheetShown(true);
            setOpen(true);
          },
        };
  }, [actions, has, Menu]);
  const openMenu = () => {
    if (!has) return;
    setSheetShown(true);
    setOpen(true);
  };
  const wrap = (row: ReactNode): ReactNode => {
    if (!has) return row;
    const menuRow = Menu ? (
      <NativeSystemMenuRow Menu={Menu} actions={actions} {...(title ? { title } : {})} testID={`${testID}-menu`}>
        {row}
      </NativeSystemMenuRow>
    ) : (
      row
    );
    const swiped = swipe === null ? menuRow : swipe({ actions, testID: `${testID}-swipe`, accessibilityActions: false, ...(appearance ? { appearance } : {}), children: menuRow });
    return (
      <>
        {swiped}
        {sheetShown && renderMenu ? (
          renderMenu({ open, onClose: () => setOpen(false), actions, ...(title ? { title } : {}), ...(preview ? { preview } : {}), testID: `${testID}-menu` })
        ) : sheetShown ? (
          <NativeContextMenu
            open={open}
            onOpenChange={setOpen}
            {...(title ? { title } : {})}
            {...(preview && open ? { preview: preview() } : {})}
            {...(cancelLabel ? { cancelLabel } : {})}
            actions={actions.map((a) => ({ id: a.id, label: a.label, onPress: a.onPress, ...(a.destructive ? { destructive: true } : {}) }))}
            testID={sheetTestID ?? `${testID}-sheet`}
          />
        ) : null}
      </>
    );
  };
  return { rowProps, wrap, openMenu };
}
