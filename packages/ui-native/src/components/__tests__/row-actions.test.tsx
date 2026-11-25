// @feat:row-actions
import { useState } from "react";
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider, type GenesisModules } from "../../native-modules";
import { NativeListItem } from "../list-item";
import { NativeRowActions, toMenuAction } from "../row-actions";
import { NativeSwipeRow, SWIPE_METRICS, SWIPE_PRESS_HOLD_MS, createSwipePressGuard, fullSwipeSide, openWidth, splitSwipeActions } from "../swipe-row";
import { ROW_ACTION_SYSTEM_COLORS, onRowActionColor, useRowActionColors } from "../../tokens/row-action-tones";

afterEach(cleanup);

/** A ReanimatedSwipeable stand-in: draws both sides, and "releases" the row at `dx` on click, naming the direction as gesture-handler 2.21+ does (row-actions-review.test.tsx covers the older naming). */
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
  { id: "read", label: "Read", onPress: vi.fn(), swipe: { side: "leading" as const, full: true }, icon: "mail-open", tone: "info" as const },
  { id: "pin", label: "Pin", onPress: vi.fn(), swipe: { side: "leading" as const }, icon: "pin", accent: "orange" as const },
  { id: "review", label: "Review", onPress: vi.fn(), swipe: false as const },
  { id: "delete", label: "Delete", onPress: vi.fn(), destructive: true, confirms: true, icon: "trash", swipe: { side: "trailing" as const, full: true } },
];

describe("row actions (ADR 0028)", () => {
  it("splits by side, keeps swipe:false off the swipe, and finds each side's full action", () => {
    const { leading, trailing, fullLeading, fullTrailing } = splitSwipeActions(make());
    expect(leading.map((a) => a.id)).toEqual(["read", "pin"]);
    expect(trailing.map((a) => a.id)).toEqual(["delete"]);
    expect(fullLeading?.id).toBe("read");
    expect(fullTrailing?.id).toBe("delete");
  });

  it("colors by tone and accent: danger when destructive, the primary otherwise, a system color by name", () => {
    const { result } = renderHook(() => useRowActionColors());
    const colorOf = result.current;
    const destructive = colorOf({ destructive: true }).background;
    const primary = colorOf({}).background;
    expect(destructive).not.toEqual(primary);
    expect(colorOf({ tone: "danger" }).background).toEqual(destructive);
    expect(colorOf({ accent: "red" }).background).toEqual(destructive);
    // Messages' look: Unread blue (info), Pin orange, Hide Alerts purple, all apart.
    const blue = colorOf({ tone: "info" }).background;
    const orange = colorOf({ accent: "orange" }).background;
    const purple = colorOf({ accent: "purple" }).background;
    expect(colorOf({ accent: "blue" }).background).toEqual(blue);
    expect(colorOf({ tone: "warning" }).background).toEqual(orange);
    expect(new Set([JSON.stringify(blue), JSON.stringify(orange), JSON.stringify(purple), JSON.stringify(destructive)]).size).toBe(4);
  });

  it("opens a side to the width its buttons draw at (one set of metrics)", () => {
    expect(openWidth(0, "fill")).toBe(0);
    expect(openWidth(3, "fill")).toBe(3 * SWIPE_METRICS.fillWidth);
    expect(openWidth(2, "round")).toBe(2 * SWIPE_METRICS.roundSlot + 3 * SWIPE_METRICS.roundGap);
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

  it("draws round buttons without the labels under them with roundLabels={false}, each still named for the screen reader", () => {
    const Swipeable = fakeSwipeable(vi.fn(), () => 0);
    const { rerender } = render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={make()} appearance="round" roundLabels={false} testID="s">
          <i />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    expect(screen.queryByTestId("s-action-pin-label")).toBeNull();
    expect(screen.getByTestId("s-action-pin").getAttribute("aria-label")).toBe("Pin");
    // The default keeps them.
    rerender(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={make()} appearance="round" testID="s">
          <i />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    expect(screen.getByTestId("s-action-pin-label").textContent).toBe("Pin");
    // A labelled button is as it was: no role or label of its own.
    expect(screen.getByTestId("s-action-pin").getAttribute("aria-label")).toBeNull();
  });

  it("draws an indigo accent in systemIndigo", () => {
    expect(ROW_ACTION_SYSTEM_COLORS.indigo.ios).toBe("systemIndigo");
    expect(onRowActionColor("indigo")).toBe("#FFFFFF");
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
    // Starting back keeps the pill (the row is still sliding home); it goes once the row is home.
    fireEvent.doubleClick(screen.getByTestId("s"));
    expect(screen.getByTestId("s-pill").dataset.style).toBeDefined();
    fireEvent.mouseUp(screen.getByTestId("s"));
    expect(screen.getByTestId("s-pill").dataset.style).toBeUndefined();
  });

  it("a full swipe runs its action once, and the pill from the drag stays until the row is home", () => {
    const Swipeable = fakeSwipeable(vi.fn(), () => 1000);
    const onFull = vi.fn();
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={[{ id: "read", label: "Read", swipe: { side: "leading", full: true }, onPress: onFull }]} appearance="round" testID="f">
          <i data-testid="row" />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    layout(screen.getByTestId("f").parentElement!, 400);
    // A real swipe starts with the drag, then is let go past the full-swipe point, then springs home.
    fireEvent.mouseDown(screen.getByTestId("f"));
    expect(screen.getByTestId("f-pill").dataset.style).toBeDefined();
    fireEvent.click(screen.getByTestId("f"));
    expect(onFull).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("f-pill").dataset.style).toBeDefined();
    fireEvent.doubleClick(screen.getByTestId("f"));
    expect(screen.getByTestId("f-pill").dataset.style).toBeDefined();
    fireEvent.mouseUp(screen.getByTestId("f"));
    expect(screen.getByTestId("f-pill").dataset.style).toBeUndefined();
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

  it("with renderMenu, the long press opens the screen's own menu, and neither the sheet nor the system menu is mounted", async () => {
    const Menu: NonNullable<GenesisModules["menu"]> = () => <div data-testid="system-menu" />;
    const seen: { open: boolean; title?: string; ids: string[]; testID: string }[] = [];
    render(
      <GenesisModulesProvider modules={{ menu: Menu }}>
        <NativeRowActions
          actions={make()}
          title="Ada"
          renderMenu={({ open, onClose, actions, title, testID }) => {
            seen.push({ open, title, ids: actions.map((a) => a.id), testID });
            return open ? <button data-testid="own-menu" onClick={onClose} /> : null;
          }}
          testID="ra"
        >
          <NativeListItem title="Ada" onPress={vi.fn()} testID="li" />
        </NativeRowActions>
      </GenesisModulesProvider>,
    );
    expect(screen.queryByTestId("system-menu")).toBeNull();
    const row = screen.getByTestId("li");
    expect(row.getAttribute("data-a11y-actions")).toBe("read,pin,review,delete");
    fireEvent.contextMenu(row);
    expect(await screen.findByTestId("own-menu")).toBeTruthy();
    expect(seen.at(-1)).toMatchObject({ open: true, title: "Ada", ids: ["read", "pin", "review", "delete"], testID: "ra-menu" });
    expect(screen.queryByTestId("ra-sheet")).toBeNull();
    fireEvent.click(screen.getByTestId("own-menu"));
    expect(screen.queryByTestId("own-menu")).toBeNull();
    // VoiceOver's actions are unchanged.
    expect(row.getAttribute("data-a11y-actions")).toBe("read,pin,review,delete");
  });

  it("takes a menu component with hooks as renderMenu, with no hook-order warning", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    function HookedMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
      const [count, setCount] = useState(0);
      return open ? <button data-testid="hooked-menu" data-count={count} onClick={() => (setCount((n) => n + 1), onClose())} /> : null;
    }
    render(
      <NativeRowActions actions={make()} title="Ada" renderMenu={HookedMenu} testID="ra">
        <NativeListItem title="Ada" onPress={vi.fn()} testID="li" />
      </NativeRowActions>,
    );
    fireEvent.contextMenu(screen.getByTestId("li"));
    fireEvent.click(await screen.findByTestId("hooked-menu"));
    fireEvent.contextMenu(screen.getByTestId("li"));
    expect((await screen.findByTestId("hooked-menu")).getAttribute("data-count")).toBe("1");
    expect(errors.mock.calls.some((c) => String(c[0]).includes("order of Hooks") || String(c[0]).includes("Rendered more hooks"))).toBe(false);
    errors.mockRestore();
  });

  it("guards the row's press from the swipe's own callbacks: a pan doesn't press, a tap does, a tap while open closes it", async () => {
    const seen: Record<string, any>[] = [];
    const close = vi.fn();
    const Swipeable = forwardRef<unknown, Record<string, any>>(function Swipeable(props, ref) {
      useImperativeHandle(ref, () => ({ close }));
      seen.push(props);
      return <div data-testid={props.testID}>{props.children}</div>;
    });
    const onPress = vi.fn();
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={make()} testID="s">
          <NativeListItem title="Ada" onPress={onPress} testID="li" />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    const row = () => screen.getByTestId("li");
    // The touch's start, as React Native reports it to the row's wrapper (it takes nothing).
    const touch = () => (seen.at(-1)!.children as { props: { onTouchStart: () => void } }).props.onTouchStart();
    const frame = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
    // A tap presses the row at once, as it always did.
    touch();
    fireEvent.click(row());
    expect(onPress).toHaveBeenCalledTimes(1);
    // A pan: the touch becomes a drag; its release doesn't press.
    touch();
    act(() => seen.at(-1)!.onSwipeableOpenStartDrag());
    fireEvent.click(row());
    await frame();
    expect(onPress).toHaveBeenCalledTimes(1);
    // An earlier touch's drag gesture-handler hasn't reported the end of, then a new tap: the tap
    // isn't that drag's, so it presses, a frame later (in case its own drag is reported late).
    act(() => seen.at(-1)!.onSwipeableClose());
    act(() => seen.at(-1)!.onSwipeableOpenStartDrag());
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    touch();
    fireEvent.click(row());
    expect(onPress).toHaveBeenCalledTimes(1);
    await frame();
    expect(onPress).toHaveBeenCalledTimes(2);
    act(() => seen.at(-1)!.onSwipeableClose());
    // Open: a tap closes it rather than pressing.
    act(() => seen.at(-1)!.onSwipeableOpen());
    touch();
    fireEvent.click(row());
    await frame();
    expect(onPress).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalled();
    // Home again: a tap presses, at once.
    act(() => seen.at(-1)!.onSwipeableClose());
    touch();
    fireEvent.click(row());
    expect(onPress).toHaveBeenCalledTimes(3);
  });

  it("puts the system menu around the swipe, so the swipe holds the row itself from the first frame", () => {
    function Swipeable(props: Record<string, any>) {
      return <div data-testid={props.testID}>{props.children}</div>;
    }
    const Menu: NonNullable<GenesisModules["menu"]> = ({ children, testID }) => <div data-testid={testID}>{children}</div>;
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never, menu: Menu }}>
        <NativeRowActions actions={make()} title="Ada" testID="ra">
          <NativeListItem title="Ada" onPress={vi.fn()} testID="li" />
        </NativeRowActions>
      </GenesisModulesProvider>,
    );
    const menu = screen.getByTestId("ra-menu");
    const swipe = screen.getByTestId("ra-swipe");
    expect(menu.contains(swipe)).toBe(true);
    expect(swipe.contains(screen.getByTestId("li"))).toBe(true);
  });

  it("guards a row inside the system context menu too (the press sits a level down)", async () => {
    const seen: Record<string, any>[] = [];
    function Swipeable(props: Record<string, any>) {
      seen.push(props);
      return <div data-testid={props.testID}>{props.children}</div>;
    }
    const Menu: NonNullable<GenesisModules["menu"]> = ({ children }) => <div data-testid="system-menu">{children}</div>;
    const onPress = vi.fn();
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never, menu: Menu }}>
        <NativeRowActions actions={make()} title="Ada" testID="ra">
          <NativeListItem title="Ada" onPress={onPress} testID="li" />
        </NativeRowActions>
      </GenesisModulesProvider>,
    );
    expect(screen.getByTestId("system-menu")).toBeTruthy();
    act(() => seen.at(-1)!.onSwipeableOpenStartDrag());
    fireEvent.click(screen.getByTestId("li"));
    await act(async () => void (await new Promise((r) => setTimeout(r, 30))));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("leaves a row with nothing to swipe untouched: no actions on a side, or no gesture-handler", () => {
    const onPress = vi.fn();
    const child = <NativeListItem title="Ada" onPress={onPress} testID="li" />;
    render(
      <NativeSwipeRow actions={make()} testID="s">
        {child}
      </NativeSwipeRow>,
    );
    fireEvent.click(screen.getByTestId("li"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("s-touch")).toBeNull();
  });

  it("warns once in development when the row's press is out of its reach", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    function Swipeable(props: Record<string, any>) {
      return <div data-testid={props.testID}>{props.children}</div>;
    }
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={make()} testID="s">
          <i />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    expect(warn.mock.calls.some(([m]) => String(m).includes("no onPress"))).toBe(true);
    delete (globalThis as { __DEV__?: boolean }).__DEV__;
    warn.mockRestore();
  });

  it("never takes the touch: nothing in the row's tree sets a responder-capture handler, so the swipe always gets its gesture", () => {
    const seen: Record<string, any>[] = [];
    function Swipeable(props: Record<string, any>) {
      seen.push(props);
      return <div data-testid={props.testID}>{props.children}</div>;
    }
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={make()} testID="s">
          <NativeListItem title="Ada" onPress={vi.fn()} testID="li" />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    const capture = /^on(Start|Move)ShouldSetResponder(Capture)?$/;
    const walk = (node: unknown): string[] => {
      if (!node || typeof node !== "object" || !("props" in (node as object))) return [];
      const props = (node as { props: Record<string, unknown> }).props;
      return [...Object.keys(props).filter((k) => capture.test(k)), ...[props.children].flat().flatMap(walk)];
    };
    expect(walk({ props: { children: seen.at(-1)!.children } })).toEqual([]);
  });

  it("blocks a press whose touch became a drag, any press while open, and, for a touch it didn't see start, one soon after a drag", () => {
    let t = 0;
    const g = createSwipePressGuard(() => t);
    expect(g.blocks()).toBe(false);
    // A touch, then a drag: blocked, however long it takes.
    g.touchStart();
    t = 10;
    g.dragStart();
    t = SWIPE_PRESS_HOLD_MS * 2;
    expect(g.blocks()).toBe(true);
    // The next touch starts after that drag: a tap.
    t += 10;
    g.touchStart();
    expect(g.blocks()).toBe(false);
    g.opened();
    expect(g.blocks()).toBe(true);
    g.closed();
    expect(g.blocks()).toBe(false);
    // No touch seen: a drag lately counts for SWIPE_PRESS_HOLD_MS.
    const h = createSwipePressGuard(() => t);
    h.dragStart();
    expect(h.blocks()).toBe(true);
    t += SWIPE_PRESS_HOLD_MS;
    expect(h.blocks()).toBe(false);
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
    // Three fill actions (240pt) on a 393pt phone: 0.6 is 235.8, inside the buttons; the threshold is 280.
    expect(fullSwipeSide(-240, 393, 0.6, "left", { left: 0, right: 240 })).toBeUndefined();
    expect(fullSwipeSide(-279, 393, 0.6, "left", { left: 0, right: 240 })).toBeUndefined();
    expect(fullSwipeSide(-281, 393, 0.6, "left", { left: 0, right: 240 })).toBe("right");
  });

  it("doesn't fire when a row already open is nudged further and let go short of clearing its actions", () => {
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
    // Trailing: Delete only (Review is off the swipe), 80pt open; a 393pt row's threshold is 235.8.
    layout(screen.getByTestId("s").parentElement!, 393);
    dx = -80; // opened
    fireEvent.click(screen.getByTestId("s"));
    dx = -200; // dragged again from open, let go short of the threshold
    fireEvent.click(screen.getByTestId("s"));
    expect(actions[3]!.onPress).not.toHaveBeenCalled();
    dx = -240; // clearly past
    fireEvent.click(screen.getByTestId("s"));
    expect(actions[3]!.onPress).toHaveBeenCalledTimes(1);
  });

  it("draws white on fallback tones at 4.5:1 or more, and black on yellow", () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    for (const [tone, { fallback }] of Object.entries(ROW_ACTION_SYSTEM_COLORS)) {
      const on = onRowActionColor(tone as never);
      const [hi, lo] = [lum(fallback), lum(on)].sort((a, b) => b - a) as [number, number];
      expect((hi + 0.05) / (lo + 0.05), tone).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("with three fill actions on a 393pt row, a re-drag to 270 opens and one to 285 runs the full action", () => {
    const three = [
      { id: "a", label: "A", onPress: vi.fn() },
      { id: "b", label: "B", onPress: vi.fn() },
      { id: "del", label: "Delete", destructive: true, confirms: true, swipe: { side: "trailing" as const, full: true }, onPress: vi.fn() },
    ];
    let dx = 0;
    const Swipeable = fakeSwipeable(vi.fn(), () => dx);
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={three} testID="s">
          <i />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    layout(screen.getByTestId("s").parentElement!, 393);
    dx = -240; // opened to its buttons
    fireEvent.click(screen.getByTestId("s"));
    dx = -270; // dragged again, short of 240 + 40
    fireEvent.click(screen.getByTestId("s"));
    expect(three[2]!.onPress).not.toHaveBeenCalled();
    dx = -285;
    fireEvent.click(screen.getByTestId("s"));
    expect(three[2]!.onPress).toHaveBeenCalledTimes(1);
  });
});

