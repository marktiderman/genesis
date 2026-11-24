// @feat:row-actions
// One place builds a row's actions (useRowActions): the same long press, menu, swipe and screen
// reader's actions in NativeRowActions, NativeListItem, InboxPage and NativeResourceView.
import { forwardRef, type ReactNode } from "react";
import { Pressable } from "react-native";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider, type GenesisModules } from "../../native-modules";
import { InboxPage } from "../../layouts/inbox-page";
import { NativeListItem } from "../list-item";
import { NativeRowActions } from "../row-actions";
import { rowAccessibilityActions } from "../swipe-row";

afterEach(cleanup);

/** A stand-in for @expo/ui's MenuView: draws its actions, and runs one on click. */
const Menu = forwardRef<unknown, Record<string, any>>(function Menu(props, _ref) {
  return (
    <div data-testid={props.testID} data-actions={(props.actions as { id: string }[]).map((a) => a.id).join(",")}>
      {(props.actions as { id: string }[]).map((a) => (
        <button key={a.id} type="button" data-testid={`${props.testID}-${a.id}`} onClick={() => props.onPressAction({ nativeEvent: { event: a.id } })} />
      ))}
      {props.children as ReactNode}
    </div>
  );
});
const withMenu = { menu: Menu as unknown as NonNullable<GenesisModules["menu"]> };

const actions = () => [
  { id: "pin", label: "Pin", onPress: vi.fn() },
  { id: "delete", label: "Delete", destructive: true, reason: "The default brand stays.", onPress: vi.fn() },
];

describe("useRowActions", () => {
  it("reads a refusal's reason to screen readers, from the one builder", () => {
    expect(rowAccessibilityActions(actions()).accessibilityActions).toEqual([
      { name: "pin", label: "Pin" },
      { name: "delete", label: "Delete: The default brand stays." },
    ]);
  });

  it("gives InboxPage the system menu when the app has one, with no sheet and no long press of its own", () => {
    const list = actions();
    render(
      <GenesisModulesProvider modules={withMenu}>
        <InboxPage testID="inbox" items={[{ id: "a", title: "Sam", swipeActions: list }]} />
      </GenesisModulesProvider>,
    );
    expect(screen.getByTestId("inbox-row-a-menu").dataset.actions).toBe("pin,delete");
    fireEvent.click(screen.getByTestId("inbox-row-a-menu-pin"));
    expect(list[0]!.onPress).toHaveBeenCalledTimes(1);
    fireEvent.contextMenu(screen.getByTestId("inbox-row-a"));
    expect(screen.queryByTestId("inbox-menu")).toBeNull();
    expect(screen.getByTestId("inbox-row-a").dataset.a11yActions).toBe("pin,delete");
  });

  it("without the system menu, InboxPage's long press opens the sheet it always named <page>-menu", async () => {
    render(<InboxPage testID="inbox" items={[{ id: "a", title: "Sam", swipeActions: actions() }]} />);
    fireEvent.contextMenu(screen.getByTestId("inbox-row-a"));
    expect(await screen.findByTestId("inbox-menu-action-pin")).toBeTruthy();
    expect(screen.getByTestId("inbox-menu-title").textContent).toBe("Sam");
  });

  it("closes the sheet when the row's actions go away, so it doesn't come back with them", async () => {
    const list = actions();
    const view = render(<NativeListItem title="Ada" actions={list} testID="li" />);
    fireEvent.contextMenu(screen.getByTestId("li"));
    expect(await screen.findByTestId("li-actions-sheet-action-delete")).toBeTruthy();
    // The row is disabled (or loses its actions) while the sheet is open, then gets them back.
    view.rerender(<NativeListItem title="Ada" actions={list} testID="li" disabled />);
    expect(screen.queryByTestId("li-actions-sheet-action-delete")).toBeNull();
    view.rerender(<NativeListItem title="Ada" actions={list} testID="li" />);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByTestId("li-actions-sheet-action-delete")).toBeNull();
    view.rerender(<NativeListItem title="Ada" actions={[]} testID="li" />);
    view.rerender(<NativeListItem title="Ada" actions={list} testID="li" />);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(screen.queryByTestId("li-actions-sheet-action-delete")).toBeNull();
    // A long press still opens it.
    fireEvent.contextMenu(screen.getByTestId("li"));
    expect(await screen.findByTestId("li-actions-sheet-action-delete")).toBeTruthy();
  });

  it("behaves the same in NativeRowActions and NativeListItem: the system menu, else the sheet", async () => {
    const view = render(
      <GenesisModulesProvider modules={withMenu}>
        <NativeRowActions actions={actions()} title="Row" testID="ra">
          <Pressable testID="row" />
        </NativeRowActions>
        <NativeListItem title="Ada" actions={actions()} testID="li" />
      </GenesisModulesProvider>,
    );
    expect(screen.getByTestId("ra-menu").dataset.actions).toBe("pin,delete");
    expect(screen.getByTestId("li-actions-menu").dataset.actions).toBe("pin,delete");
    view.unmount();
    render(<NativeListItem title="Ada" actions={actions()} testID="li" />);
    fireEvent.contextMenu(screen.getByTestId("li"));
    expect(await screen.findByTestId("li-actions-sheet-action-delete")).toBeTruthy();
    expect(screen.getByTestId("li").dataset.a11yActions).toBe("pin,delete");
  });

  it("with a preview, opens the sheet even when the app has the system menu (it can't draw a peek)", async () => {
    render(
      <GenesisModulesProvider modules={withMenu}>
        <NativeRowActions actions={actions()} title="Row" preview={() => <i data-testid="peek" />} testID="ra">
          <Pressable testID="row" />
        </NativeRowActions>
      </GenesisModulesProvider>,
    );
    expect(screen.queryByTestId("ra-menu")).toBeNull();
    fireEvent.contextMenu(screen.getByTestId("row"));
    expect(await screen.findByTestId("peek")).toBeTruthy();
  });
});
