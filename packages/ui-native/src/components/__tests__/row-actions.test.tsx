// @feat:row-actions
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider, type GenesisModules } from "../../native-modules";
import { NativeListItem } from "../list-item";
import { NativeRowActions, toMenuAction } from "../row-actions";
import { NativeSwipeRow, fullSwipeSide, rowActionColor, splitSwipeActions } from "../swipe-row";
import { ROW_ACTION_TONES, onRowActionColor } from "../../tokens/row-action-tones";

afterEach(cleanup);

/** A ReanimatedSwipeable stand-in: draws both sides, and "releases" the row at `dx` on click. */
function fakeSwipeable(close: () => void, dx: () => number) {
  return forwardRef<unknown, Record<string, any>>(function Swipeable(props, ref) {
    useImperativeHandle(ref, () => ({ close }));
    const translation = { get value() { return dx(); } };
    return (
      <div data-testid={props.testID} data-overshoot-left={String(props.overshootLeft)} data-overshoot-right={String(props.overshootRight)} data-overshoot-friction={String(props.overshootFriction)} onClick={() => props.onSwipeableWillOpen?.(dx() > 0 ? "right" : "left")} onDoubleClick={() => props.onSwipeableWillClose?.()} onMouseDown={() => props.onSwipeableOpenStartDrag?.()} onMouseUp={() => props.onSwipeableClose?.()}>
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
    // Short of 0.6 of the width it only opens; the row tracks the finger past its actions on a full side.
    expect(row.dataset.overshootFriction).toBe("1");
    dx = 220;
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
    // In the menu from the first render, so it never remounts; laid out, it gets its width.
    const before = screen.getByTestId("li");
    layout(screen.getByTestId("row-actions-menu-host"), 390);
    expect(screen.getByTestId("li")).toBe(before);
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
    expect(JSON.parse(button.dataset.style!)).toMatchObject({ backgroundColor: "transparent", width: 56 });
  });

  it("turns the row into a pill while its round actions are open, without remounting it", () => {
    const Swipeable = fakeSwipeable(vi.fn(), () => 10);
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={make()} appearance="round" testID="s">
          <i data-testid="row" />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    const row = screen.getByTestId("row");
    expect(screen.getByTestId("s-pill").dataset.style).toBeUndefined();
    fireEvent.click(screen.getByTestId("s"));
    expect(JSON.parse(screen.getByTestId("s-pill").dataset.style!)).toMatchObject({ borderRadius: 26, marginHorizontal: 6 });
    expect(screen.getByTestId("row")).toBe(row);
    fireEvent.doubleClick(screen.getByTestId("s"));
    expect(screen.getByTestId("s-pill").dataset.style).toBeUndefined();
  });

  it("with a preview, the long press opens the sheet with the peek on top, even with the system menu", async () => {
    const Menu: NonNullable<GenesisModules["menu"]> = () => <div data-testid="menu" />;
    render(
      <GenesisModulesProvider modules={{ menu: Menu }}>
        <NativeRowActions actions={make()} title="Ada" preview={() => <i data-testid="peek" />} testID="ra">
          <NativeListItem title="Ada" onPress={vi.fn()} testID="li" />
        </NativeRowActions>
      </GenesisModulesProvider>,
    );
    expect(screen.queryByTestId("menu")).toBeNull();
    fireEvent.contextMenu(screen.getByTestId("li"));
    expect(await screen.findByTestId("peek")).toBeTruthy();
    expect(screen.getByTestId("ra-sheet-preview")).toBeTruthy();
  });

  it("keeps the actions unseen until a drag starts, so they never show in an inset row's margins", () => {
    const Swipeable = fakeSwipeable(vi.fn(), () => 0);
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={make()} testID="s">
          <i />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    const panel = () => JSON.parse((screen.getByTestId("s-action-pin").parentElement as HTMLElement).dataset.style!);
    expect(panel().opacity).toBe(0);
    fireEvent.mouseDown(screen.getByTestId("s"));
    expect(panel().opacity).toBe(1);
    fireEvent.mouseUp(screen.getByTestId("s"));
    expect(panel().opacity).toBe(0);
  });

  it("shows at most three a side; the rest stay in the menu and the screen reader's actions", () => {
    const many = ["a", "b", "c", "d"].map((id) => ({ id, label: id.toUpperCase(), onPress: vi.fn() }));
    expect(splitSwipeActions(many, 3).trailing.map((a) => a.id)).toEqual(["a", "b", "c"]);
    const Swipeable = fakeSwipeable(vi.fn(), () => 0);
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={many} testID="s">
          <i />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    expect(screen.queryByTestId("s-action-d")).toBeNull();
  });

  it("decides the full swipe where the finger lets go, on the side the row opens: backing out or crossing sides doesn't run it", () => {
    expect(fullSwipeSide(-300, 400, 0.6, "left")).toBe("right");
    expect(fullSwipeSide(300, 400, 0.6, "right")).toBe("left");
    // Dragged past 0.6, then backed out to -100 before letting go.
    expect(fullSwipeSide(-100, 400, 0.6, "left")).toBeUndefined();
    // Dragged right to +300, then across to -100: the trailing side opens, nothing runs.
    expect(fullSwipeSide(-100, 400, 0.6, "left")).toBeUndefined();
    // The offset and the opening side disagree: nothing runs.
    expect(fullSwipeSide(300, 400, 0.6, "left")).toBeUndefined();
    expect(fullSwipeSide(300, 0, 0.6, "right")).toBeUndefined();

    const actions = make();
    let dx = 0;
    const Swipeable = fakeSwipeable(vi.fn(), () => dx);
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={actions} testID="s">
          <i />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    layout(screen.getByTestId("s").parentElement!, 400);
    // Back out: released at -100 after passing the threshold.
    dx = -100;
    fireEvent.click(screen.getByTestId("s"));
    // Cross sides: released at -100 after +300.
    fireEvent.click(screen.getByTestId("s"));
    expect(actions[0]!.onPress).not.toHaveBeenCalled();
    expect(actions[3]!.onPress).not.toHaveBeenCalled();
  });

  it("keeps a side's destructive action when it caps the side", () => {
    const list = ["a", "b", "c"].map((id) => ({ id, label: id, onPress: vi.fn() }));
    const del = { id: "delete", label: "Delete", destructive: true, onPress: vi.fn() };
    expect(splitSwipeActions([...list, del], 3).trailing.map((a) => a.id)).toEqual(["a", "b", "delete"]);
  });

  it("gives a row with actions but no onPress no button role", () => {
    render(<NativeListItem title="Ada" actions={make()} testID="li" />);
    expect(screen.getByTestId("li").getAttribute("role")).toBe("none");
  });

  it("makes a NativeListItem with actions pressable, so its long press reaches the menu; a disabled one offers none", () => {
    const actions = make();
    const view = render(<NativeListItem title="Ada" actions={actions} testID="li" />);
    fireEvent.contextMenu(screen.getByTestId("li"));
    expect(screen.getByTestId("li").dataset.a11yActions).toBe("read,pin,review,delete");
    view.rerender(<NativeListItem title="Ada" actions={actions} disabled testID="li" />);
    expect(screen.getByTestId("li").dataset.a11yActions).toBeUndefined();
  });

  it("never counts a row springing open to its buttons as a full swipe, even when they're wider than the ratio", () => {
    // A 320pt phone with three 80pt actions opens to 240, past 0.6 (192): the full swipe needs 240 + 40.
    expect(fullSwipeSide(-240, 320, 0.6, "left", { left: 0, right: 240 })).toBeUndefined();
    expect(fullSwipeSide(-279, 320, 0.6, "left", { left: 0, right: 240 })).toBeUndefined();
    expect(fullSwipeSide(-280, 320, 0.6, "left", { left: 0, right: 240 })).toBe("right");
  });

  it("draws white on fallback tones at 4.5:1 or more, and black on yellow", () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    for (const [tone, { fallback }] of Object.entries(ROW_ACTION_TONES)) {
      const on = onRowActionColor(tone as never);
      const [hi, lo] = [lum(fallback), lum(on)].sort((a, b) => b - a) as [number, number];
      expect((hi + 0.05) / (lo + 0.05), tone).toBeGreaterThanOrEqual(4.5);
    }
  });
});

