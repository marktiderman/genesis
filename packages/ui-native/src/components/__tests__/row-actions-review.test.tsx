// @feat:row-actions
// The second adversarial review of the row actions (ADR 0028): buttons seen whenever the row is
// off its resting place, the text color on the app's own colors, gesture-handler's direction
// convention, the long press a row already had, InboxPage's screen reader actions, and a warning
// for a destructive full swipe that doesn't confirm.
import swipeableSource from "react-native-gesture-handler/src/components/ReanimatedSwipeable/ReanimatedSwipeable.tsx?raw";
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Pressable } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisThemeProvider, brandRoleVariables, genesisBrand, type CanonicalBrand } from "@marktiderman/genesis-design-system";
import { tripletToHsl } from "../../tokens/brand-primary";
import { GenesisModulesProvider } from "../../native-modules";
import { InboxPage, type InboxPageSlotMap } from "../../layouts/inbox-page";
import { NativeRowActions } from "../row-actions";
import { NativeSwipeRow, fullSwipeSide } from "../swipe-row";
import { ON_ROW_ACTION, ON_ROW_ACTION_LIGHT_TONE, onRowActionColor, readableOn } from "../../tokens/row-action-tones";
import uiNativePackage from "../../../package.json";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (globalThis as { __DEV__?: boolean }).__DEV__;
});

/**
 * A ReanimatedSwipeable stand-in that reports the open direction the way a given gesture-handler
 * names it: `modern` (2.21 and later) says `"right"` when the row moves right; `legacy` (2.20 and
 * earlier) said `"left"`. A click releases at `dx`; `openLeft` opens from code, as a ref does.
 */
function fakeSwipeable(dx: () => number, naming: "modern" | "legacy" = "modern") {
  return forwardRef<unknown, Record<string, any>>(function Swipeable(props, ref) {
    const willOpen = () => {
      const movesRight = dx() > 0;
      props.onSwipeableWillOpen?.(naming === "modern" ? (movesRight ? "right" : "left") : movesRight ? "left" : "right");
    };
    useImperativeHandle(ref, () => ({ close: () => props.onSwipeableClose?.() }));
    return (
      <div data-testid={props.testID} onClick={willOpen} onKeyDown={() => { props.onSwipeableWillOpen?.("right"); props.onSwipeableOpen?.("right"); }} onMouseUp={() => props.onSwipeableClose?.()}>
        <div data-testid="left">{props.renderLeftActions?.(undefined, { value: dx() })}</div>
        <div data-testid="right">{props.renderRightActions?.(undefined, { value: dx() })}</div>
        {props.children as ReactNode}
      </div>
    );
  });
}

const layout = (el: HTMLElement, width: number) => act(() => void el.dispatchEvent(new CustomEvent("layout", { detail: { width, height: 60 } })));
const style = (el: HTMLElement | null) => JSON.parse(el!.dataset.style!) as Record<string, unknown> | Record<string, unknown>[];

describe("row actions: second review", () => {
  it("shows the buttons when the row opens from code, with no drag (a ref's openLeft)", () => {
    const Swipeable = fakeSwipeable(() => 0);
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={[{ id: "pin", label: "Pin", side: "leading", onPress: vi.fn() }]} testID="s">
          <i />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    const panel = () => style(screen.getByTestId("s-action-pin").parentElement) as Record<string, unknown>;
    expect(panel().opacity).toBe(0);
    fireEvent.keyDown(screen.getByTestId("s"));
    expect(panel().opacity).toBe(1);
    fireEvent.mouseUp(screen.getByTestId("s"));
    expect(panel().opacity).toBe(0);
  });

  it("with Reanimated, the row's own translation shows the buttons, on the UI thread", () => {
    let dx = 0;
    const Swipeable = fakeSwipeable(() => dx);
    const View = ({ style: s, children, ...rest }: { style?: unknown; children?: ReactNode }) => (
      <div data-testid="animated-group" data-style={JSON.stringify(s)} {...rest}>
        {children}
      </div>
    );
    const R = { default: { View }, useAnimatedStyle: (fn: () => Record<string, unknown>) => fn() };
    const modules = { swipeable: Swipeable as never, reanimated: R as never };
    const actions = [{ id: "pin", label: "Pin", side: "leading" as const, onPress: vi.fn() }];
    const tree = () => (
      <GenesisModulesProvider modules={modules}>
        <NativeSwipeRow actions={actions} testID="s">
          <i />
        </NativeSwipeRow>
      </GenesisModulesProvider>
    );
    const view = render(tree());
    const opacity = () => (style(screen.getAllByTestId("animated-group")[0]!) as Record<string, unknown>[])[1]!.opacity;
    expect(opacity()).toBe(0);
    dx = 120;
    view.rerender(tree());
    expect(opacity()).toBe(1);
  });

  it("decides the side with gesture-handler 2.21+'s naming, which the peer range requires", () => {
    expect(uiNativePackage.peerDependencies["react-native-gesture-handler"]).toBe(">=2.21.0");
    // The installed gesture-handler names a row moving right (toValue > 0) "right".
    expect(swipeableSource).toMatch(/onSwipeableWillOpen,\s*toValue > 0 \? SwipeDirection\.RIGHT : SwipeDirection\.LEFT/);
    expect(fullSwipeSide(300, 400, 0.6, "right")).toBe("left");
    expect(fullSwipeSide(-300, 400, 0.6, "left")).toBe("right");
  });

  it("runs a full swipe on both sides with the modern naming; a fling across to the other side runs nothing", () => {
    for (const [dx, id] of [[300, "read"], [-300, "delete"]] as const) {
      const actions = [
        { id: "read", label: "Read", side: "leading" as const, full: true, onPress: vi.fn() },
        { id: "delete", label: "Delete", destructive: true, confirms: true, full: true, onPress: vi.fn() },
      ];
      const Swipeable = fakeSwipeable(() => dx);
      const view = render(
        <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
          <NativeSwipeRow actions={actions} testID="s">
            <i />
          </NativeSwipeRow>
        </GenesisModulesProvider>,
      );
      layout(screen.getByTestId("s").parentElement!, 400);
      fireEvent.click(screen.getByTestId("s"));
      expect(actions.find((a) => a.id === id)!.onPress).toHaveBeenCalledTimes(1);
      view.unmount();
    }
    // Released at +300 but flung left: gesture-handler opens the trailing side ("left"), so nothing runs.
    expect(fullSwipeSide(300, 400, 0.6, "left")).toBeUndefined();
  });

  it("documents why the floor is 2.21: with the older naming no full swipe would ever run", () => {
    const read = vi.fn();
    const Swipeable = fakeSwipeable(() => 300, "legacy");
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={[{ id: "read", label: "Read", side: "leading", full: true, onPress: read }]} testID="s">
          <i />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    layout(screen.getByTestId("s").parentElement!, 400);
    fireEvent.click(screen.getByTestId("s"));
    expect(read).not.toHaveBeenCalled();
  });

  it("puts readable text on the app's own colors: black on a light tint, white on a dark one, the theme's foreground on a system color", () => {
    expect(readableOn("#FAFAFA")).toBe(ON_ROW_ACTION_LIGHT_TONE);
    expect(readableOn("#18181b")).toBe(ON_ROW_ACTION);
    expect(readableOn("#ca2121")).toBe(ON_ROW_ACTION);
    expect(readableOn({ semantic: ["systemRed"] })).toBeUndefined();
    // A light brand tint gets black, not white.
    expect(onRowActionColor("tint", "#FDE68A", "#ffffff")).toBe(ON_ROW_ACTION_LIGHT_TONE);
    expect(onRowActionColor(undefined, "#FDE68A")).toBe(ON_ROW_ACTION_LIGHT_TONE);
    // A PlatformColor (iOS's systemRed, a dynamic tint) takes the theme's foreground the caller passes.
    expect(onRowActionColor("red", { semantic: ["systemRed"] }, "#fafafa")).toBe("#fafafa");
    expect(onRowActionColor("tint", { semantic: ["tint"] }, "#09090b")).toBe("#09090b");
    // System tones keep iOS's look.
    expect(onRowActionColor("green", "#ffffff")).toBe(ON_ROW_ACTION);
    expect(onRowActionColor("yellow")).toBe(ON_ROW_ACTION_LIGHT_TONE);
  });

  it("draws a fill action's label in the color that reads on its background", () => {
    const Swipeable = fakeSwipeable(() => 0);
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={[{ id: "ok", label: "OK", tone: "yellow", onPress: vi.fn() }, { id: "go", label: "Go", tone: "green", onPress: vi.fn() }]} testID="s">
          <i />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    const color = (id: string) => (style(screen.getByText(id)) as Record<string, unknown>).color;
    expect(color("OK")).toBe(ON_ROW_ACTION_LIGHT_TONE);
    expect(color("Go")).toBe(ON_ROW_ACTION);
  });

  it("keeps the long press a row already had, then opens the menu", async () => {
    const own = vi.fn();
    render(
      <NativeRowActions actions={[{ id: "pin", label: "Pin", onPress: vi.fn() }]} testID="ra">
        <Pressable testID="row" onLongPress={own} />
      </NativeRowActions>,
    );
    fireEvent.contextMenu(screen.getByTestId("row"));
    expect(own).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("ra-sheet-action-pin")).toBeTruthy();
  });

  it("tells InboxPage's swipe its row already has the screen reader actions", () => {
    const seen: InboxPageSlotMap["swipeable"][] = [];
    const Swipe = (props: InboxPageSlotMap["swipeable"]) => {
      seen.push(props);
      return <>{props.children}</>;
    };
    render(
      <InboxPage
        testID="inbox"
        items={[{ id: "a", title: "Sam", swipeActions: [{ id: "pin", label: "Pin", onPress: vi.fn() }] }]}
        slots={{ swipeable: Swipe }}
      />,
    );
    expect(seen.at(-1)?.accessibilityActions).toBe(false);
    // The row itself carries the action once.
    expect(screen.getByTestId("inbox-row-a").dataset.a11yActions).toBe("pin");
  });

  it("warns once in development about a destructive full swipe that doesn't confirm", () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const Swipeable = fakeSwipeable(() => 0);
    const row = (confirms: boolean, id: string) => (
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={[{ id, label: "Delete", destructive: true, full: true, ...(confirms ? { confirms: true } : {}), onPress: vi.fn() }]} testID={id}>
          <i />
        </NativeSwipeRow>
      </GenesisModulesProvider>
    );
    const view = render(row(false, "review-delete"));
    view.rerender(row(false, "review-delete"));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("review-delete");
    render(row(true, "review-delete-confirmed"));
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("runs the action before closing the row, so a confirm it asks shows over the open row", () => {
    const order: string[] = [];
    const Swipeable = forwardRef<unknown, Record<string, any>>(function Swipeable(props, ref) {
      useImperativeHandle(ref, () => ({ close: () => order.push("close") }));
      return <div data-testid={props.testID}>{props.renderRightActions?.(undefined, { value: -80 })}{props.children as ReactNode}</div>;
    });
    render(
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={[{ id: "delete", label: "Delete", destructive: true, onPress: () => order.push("press") }]} testID="s">
          <i />
        </NativeSwipeRow>
      </GenesisModulesProvider>,
    );
    fireEvent.click(screen.getByTestId("s-action-delete"));
    expect(order).toEqual(["press", "close"]);
  });

  // `hsl(h, s%, l%)` → relative luminance, for the contrast the text must reach on the tint.
  const lum = (hsl: string) => {
    const [h, sat, l] = /hsl\((-?[\d.]+), ([\d.]+)%, ([\d.]+)%\)/.exec(hsl)!.slice(1).map(Number) as [number, number, number];
    const a = (sat / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    };
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(f(0)) + 0.7152 * lin(f(8)) + 0.0722 * lin(f(4));
  };
  const contrast = (x: string, y: string) => {
    const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };

  const tintRow = (brand: CanonicalBrand | null, mode: "light" | "dark" = "light") => {
    const Swipeable = fakeSwipeable(() => 0);
    const swipe = (
      <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
        <NativeSwipeRow actions={[{ id: "flag", label: "Flag", onPress: vi.fn() }]} testID="s">
          <i />
        </NativeSwipeRow>
      </GenesisModulesProvider>
    );
    return brand ? (
      <GenesisThemeProvider brand={brand} mode={mode}>
        {swipe}
      </GenesisThemeProvider>
    ) : (
      swipe
    );
  };
  const look = () => ({
    background: String((style(screen.getByTestId("s-action-flag")) as Record<string, unknown>).backgroundColor),
    text: String((style(screen.getByText("Flag")) as Record<string, unknown>).color),
  });

  it("draws a tint action as the app's own bg-primary / text-primary-foreground: the native brand roles for the mode", () => {
    expect(tripletToHsl("243.4 75.4% 58.6%")).toBe("hsl(243.4, 75.4%, 58.6%)");
    expect(tripletToHsl("oklch(0.7 0.1 250)")).toBeUndefined();
    for (const mode of ["light", "dark"] as const) {
      const view = render(tintRow(genesisBrand, mode));
      const roles = brandRoleVariables(genesisBrand, { platform: "native" })[mode];
      expect(look()).toEqual({ background: tripletToHsl(roles["--primary"]), text: tripletToHsl(roles["--primary-foreground"]) });
      view.unmount();
    }
  });

  it("in dark mode takes the brand's dark accent, with text that reads on it (dark text on a light blue)", () => {
    const brand: CanonicalBrand = { ...genesisBrand, name: "acme-dark", accent: { DEFAULT: "#1d4ed8" }, dark: { ...genesisBrand.dark, accent: { DEFAULT: "#93c5fd" } } };
    render(tintRow(brand, "dark"));
    const { background, text } = look();
    expect(background).toBe(tripletToHsl(brandRoleVariables(brand, { platform: "native" }).dark["--primary"]));
    expect(lum(background)).toBeGreaterThan(0.4);
    expect(contrast(background, text)).toBeGreaterThanOrEqual(4.5);
  });

  it("uses the brand's native override, never a web color React Native can't paint", () => {
    const brand: CanonicalBrand = { ...genesisBrand, name: "acme-oklch", accent: { DEFAULT: "oklch(0.62 0.19 260)" }, platformOverrides: { native: { accent: { DEFAULT: "#0f766e" } } } };
    render(tintRow(brand, "light"));
    const { background, text } = look();
    expect(background).not.toContain("oklch");
    expect(background).toBe(tripletToHsl(brandRoleVariables(brand, { platform: "native" }).light["--primary"]));
    expect(contrast(background, text)).toBeGreaterThanOrEqual(4.5);
  });

  it("puts dark text on a light brand primary", () => {
    const brand: CanonicalBrand = { ...genesisBrand, name: "acme-light", accent: { DEFAULT: "#FDE68A" } };
    render(tintRow(brand, "light"));
    const { background, text } = look();
    expect(lum(text)).toBeLessThan(0.2);
    expect(contrast(background, text)).toBeGreaterThanOrEqual(4.5);
    cleanup();
    // Without a provider: the theme's tint role, not the brand.
    render(tintRow(null));
    expect(look().background).not.toBe(background);
  });

  it("gives InboxPage and NativeRowActions the brand's native primary too", () => {
    const brand: CanonicalBrand = { ...genesisBrand, name: "acme-light", accent: { DEFAULT: "#FDE68A" } };
    const roles = brandRoleVariables(brand, { platform: "native" }).light;
    const Swipeable = fakeSwipeable(() => 0);
    render(
      <GenesisThemeProvider brand={brand} mode="light">
        <GenesisModulesProvider modules={{ swipeable: Swipeable as never }}>
          <InboxPage testID="inbox" items={[{ id: "a", title: "Sam", swipeActions: [{ id: "pin", label: "Pin", onPress: vi.fn() }] }]} />
          <NativeRowActions actions={[{ id: "mark", label: "Mark", onPress: vi.fn() }]} testID="ra">
            <Pressable testID="row" />
          </NativeRowActions>
        </GenesisModulesProvider>
      </GenesisThemeProvider>,
    );
    for (const [id, label] of [["inbox-row-a-swipe-action-pin", "Pin"], ["ra-swipe-action-mark", "Mark"]] as const) {
      expect((style(screen.getByTestId(id)) as Record<string, unknown>).backgroundColor).toBe(tripletToHsl(roles["--primary"]));
      expect((style(screen.getByText(label)) as Record<string, unknown>).color).toBe(tripletToHsl(roles["--primary-foreground"]));
    }
  });
});
