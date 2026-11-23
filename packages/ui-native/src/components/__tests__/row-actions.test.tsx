// @feat:row-actions
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider, type GenesisModules } from "../../native-modules";
import { NativeListItem } from "../list-item";
import { NativeRowActions, toMenuAction } from "../row-actions";
import { NativeSwipeRow, rowActionColor, splitSwipeActions } from "../swipe-row";

afterEach(cleanup);

/** A ReanimatedSwipeable stand-in: draws both sides, and "releases" the row at `dx` on click. */
function fakeSwipeable(close: () => void, dx: () => number) {
  return forwardRef<unknown, Record<string, any>>(function Swipeable(props, ref) {
    useImperativeHandle(ref, () => ({ close }));
    const translation = { get value() { return dx(); } };
    return (
      <div data-testid={props.testID} data-overshoot-left={String(props.overshootLeft)} data-overshoot-right={String(props.overshootRight)} onClick={() => props.onSwipeableWillOpen?.()}>
        <div data-testid="left">{props.renderLeftActions?.(undefined, translation)}</div>
        <div data-testid="right">{props.renderRightActions?.(undefined, translation)}</div>
        {props.children as ReactNode}
      </div>
    );
  });
}

const layout = (el: HTMLElement, width: number) => act(() => void el.dispatchEvent(new CustomEvent("layout", { detail: { width, height: 60 } })));

const make = () => [
  { id: "read", label: "Read", onPress: vi.fn(), side: "leading" as const, icon: "mail-open", tone: "blue" as const, full: true },
  { id: "pin", label: "Pin", onPress: vi.fn(), side: "leading" as const, icon: "pin", tone: "orange" as const },
  { id: "review", label: "Review", onPress: vi.fn(), swipe: false },
  { id: "delete", label: "Delete", onPress: vi.fn(), destructive: true, icon: "trash", full: true },
];

describe("row actions (ADR 0028)", () => {
  it("splits by side, keeps swipe:false off the swipe, and finds each side's full action", () => {
    const { leading, trailing, fullLeading, fullTrailing } = splitSwipeActions(make());
    expect(leading.map((a) => a.id)).toEqual(["read", "pin"]);
    expect(trailing.map((a) => a.id)).toEqual(["delete"]);
    expect(fullLeading?.id).toBe("read");
    expect(fullTrailing?.id).toBe("delete");
  });

  it("colors by tone, red when destructive, the tint otherwise", () => {
    const roles = { tint: "T", destructive: "D" };
    expect(rowActionColor({ destructive: true }, roles)).toBe("D");
    expect(rowActionColor({}, roles)).toBe("T");
    expect(rowActionColor({ tone: "blue" }, roles)).toBeTruthy();
    expect(rowActionColor({ tone: "blue" }, roles)).not.toBe("T");
  });

  it("runs a side's full action when the row is let go past the ratio, and only opens it short of it", () => {
    const actions = make();
    let dx = 0;
    const close = vi.fn();
    const Swipeable = fakeSwipeable(close, () => dx);
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={actions} testID="s">
          <i data-testid="row" />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    const row = screen.getByTestId("s");
    expect(row.dataset.overshootLeft).toBe("true");
    expect(screen.queryByTestId("s-action-review")).toBeNull();
    layout(row.parentElement!, 400);
    dx = 100;
    fireEvent.click(row);
    expect(actions[0]!.onPress).not.toHaveBeenCalled();
    dx = 300;
    fireEvent.click(row);
    expect(actions[0]!.onPress).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalled();
    dx = -300;
    fireEvent.click(row);
    expect(actions[3]!.onPress).toHaveBeenCalledTimes(1);
  });

  it("gives a NativeListItem its actions: VoiceOver, long press to the sheet, and the swipe", async () => {
    const actions = make();
    render(
      <NativeListItem title="Ada" onPress={vi.fn()} actions={actions} testID="li" />,
    );
    const row = screen.getByTestId("li");
    expect(row.dataset.a11yActions).toBe("read,pin,review,delete");
    act(() => void row.dispatchEvent(new CustomEvent("accessibilityaction", { detail: "review" })));
    expect(actions[2]!.onPress).toHaveBeenCalledTimes(1);
    fireEvent.contextMenu(row);
    expect(await screen.findByTestId("li-actions-sheet-action-delete")).toBeTruthy();
  });

  it("opens the system menu on long press when the app passes the menu module", () => {
    const actions = make();
    const seen: { actions?: unknown; title?: string; longPress?: boolean } = {};
    const Menu: NonNullable<GenesisModules["menu"]> = (props) => {
      Object.assign(seen, { actions: props.actions, title: props.title, longPress: props.shouldOpenOnLongPress });
      return (
        <div data-testid="menu" onClick={() => props.onPressAction?.({ nativeEvent: { event: "pin" } })}>
          {props.children}
        </div>
      );
    };
    render(
      <GenesisModulesProvider modules={{ menu: Menu }}>
        <NativeRowActions actions={actions} title="Ada">
          <NativeListItem title="Ada" onPress={vi.fn()} testID="li" />
        </NativeRowActions>
      </GenesisModulesProvider>,
    );
    expect(seen.longPress).toBe(true);
    expect(seen.title).toBe("Ada");
    expect(seen.actions).toEqual([
      { id: "read", title: "Read", image: "envelope.open" },
      { id: "pin", title: "Pin", image: "pin" },
      { id: "review", title: "Review" },
      { id: "delete", title: "Delete", image: "trash", attributes: { destructive: true } },
    ]);
    fireEvent.click(screen.getByTestId("menu"));
    expect(actions[1]!.onPress).toHaveBeenCalledTimes(1);
    // The menu owns the long press; the row keeps its accessibility actions.
    expect(screen.getByTestId("li").dataset.a11yActions).toBe("read,pin,review,delete");
  });

  it("maps an action's icon to its SF Symbol for the system menu", () => {
    expect(toMenuAction({ id: "a", label: "Archive", icon: "archive", onPress: () => {} })).toEqual({ id: "a", title: "Archive", image: "archivebox" });
    expect(toMenuAction({ id: "x", label: "X", icon: "not-an-icon", onPress: () => {} })).toEqual({ id: "x", title: "X" });
  });

  it("draws iOS 26's round buttons", () => {
    const Swipeable = fakeSwipeable(vi.fn(), () => 0);
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={make()} appearance="round" testID="s">
          <i />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    const button = screen.getByTestId("s-action-pin");
    expect(JSON.parse(button.dataset.style!)).toMatchObject({ backgroundColor: "transparent", width: 64 });
  });
});
