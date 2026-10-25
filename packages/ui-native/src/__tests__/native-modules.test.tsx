// @feat:native-modules
/**
 * Every optional native module, both ways: what a component draws when the
 * app passed the module (the opt-in path) and what it falls back to when it
 * didn't (or the device can't use it).
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AccessibilityInfo, PanResponder, Platform } from "react-native";
import { GenesisModulesProvider, useGenesisModules, type GenesisModules } from "../native-modules";
import { NATIVE_ICON_NAMES, SF_SYMBOLS } from "../icon-names";
import { __resetReducedMotion, useReducedMotion } from "../hooks/use-reduced-motion";
import { NativeToastProvider, useToast } from "../components/toast";
import { NativeSkeleton } from "../components/skeleton";
import { NativeDrawer } from "../components/drawer";
import { NativeAvatar } from "../components/avatar";
import { NativeImage } from "../components/image";
import { NativeIcon } from "../components/icon";
import { NativeListItem } from "../components/list-item";
import { NativeDatePicker } from "../components/date-time-picker";
import { NativeGlassSurface, __resetReduceTransparency } from "../components/glass-surface";
import { NotificationsPage, __test as notificationsTest } from "../layouts/notifications-page";
import { fakeDatePicker, fakeFlashList, fakeGlass, fakeIcon, fakeImage, fakeReanimated, fakeSymbolView } from "./fake-modules";

const originalOS = Platform.OS;
afterEach(() => {
  Platform.OS = originalOS;
  vi.restoreAllMocks();
  __resetReducedMotion();
  __resetReduceTransparency();
});

function withModules(modules: GenesisModules, ui: ReactNode) {
  return render(<GenesisModulesProvider modules={modules}>{ui}</GenesisModulesProvider>);
}

describe("GenesisModulesProvider", () => {
  function Probe() {
    return <span data-testid="probe">{Object.keys(useGenesisModules()).sort().join(",")}</span>;
  }

  it("gives {} without a provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("");
  });

  it("merges nested providers, the inner one winning", () => {
    const outerImage = fakeImage();
    const innerImage = fakeImage();
    function Which() {
      return <span data-testid="which">{useGenesisModules().image === innerImage ? "inner" : "outer"}</span>;
    }
    render(
      <GenesisModulesProvider modules={{ image: outerImage, list: fakeFlashList() }}>
        <GenesisModulesProvider modules={{ image: innerImage }}>
          <Probe />
          <Which />
        </GenesisModulesProvider>
      </GenesisModulesProvider>,
    );
    expect(screen.getByTestId("probe").textContent).toBe("image,list");
    expect(screen.getByTestId("which").textContent).toBe("inner");
  });
});

function ShowToast({ variant }: { variant?: "default" | "success" | "destructive" }) {
  const toast = useToast();
  return (
    <button type="button" data-testid="trigger" onClick={() => toast.show({ title: "Saved", variant })}>
      show
    </button>
  );
}

describe("NativeToast", () => {
  it("falls back to React Native's Animated without reanimated", () => {
    render(
      <NativeToastProvider>
        <ShowToast />
      </NativeToastProvider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.getByTestId("native-toast")).toBeTruthy();
    expect(document.querySelector("[data-reanimated]")).toBeNull();
  });

  it("animates in with Reanimated when it is passed", () => {
    const R = fakeReanimated();
    withModules(
      { reanimated: R },
      <NativeToastProvider>
        <ShowToast />
      </NativeToastProvider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    expect(document.querySelector("[data-reanimated]")).not.toBeNull();
    expect(screen.getByLabelText("Saved")).toBeTruthy();
    expect(R.withTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 180 }));
    expect(R.withTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: 180 }));
  });

  it("starts in place, with no timing, when animation is off", () => {
    const R = fakeReanimated();
    withModules(
      { reanimated: R },
      <NativeToastProvider disableAnimation>
        <ShowToast />
      </NativeToastProvider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    expect(R.withTiming).not.toHaveBeenCalled();
    const style = JSON.parse((document.querySelector("[data-reanimated]") as HTMLElement).dataset.style!);
    expect(style).toEqual({ opacity: 1, transform: [{ translateY: 0 }] });
  });

  it("starts in place under Reduce Motion", async () => {
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const R = fakeReanimated();
    withModules(
      { reanimated: R },
      <NativeToastProvider>
        <ShowToast />
      </NativeToastProvider>,
    );
    await act(async () => {});
    fireEvent.click(screen.getByTestId("trigger"));
    expect(R.withTiming).not.toHaveBeenCalled();
  });

  it("is Liquid Glass on iOS when both availability checks pass", () => {
    Platform.OS = "ios";
    const glass = fakeGlass();
    withModules(
      { glass },
      <NativeToastProvider disableAnimation>
        <ShowToast />
      </NativeToastProvider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.getByTestId("native-toast-glass")).toBeTruthy();
    expect(screen.getByText("Saved").className).toContain("text-foreground");
  });

  it.each([
    ["the glass API is missing at run time", { api: false }],
    ["the build can't draw Liquid Glass", { liquid: false }],
    ["the availability check throws", { throws: true }],
  ])("stays solid when %s", (_why, options) => {
    Platform.OS = "ios";
    withModules(
      { glass: fakeGlass(options) },
      <NativeToastProvider disableAnimation>
        <ShowToast />
      </NativeToastProvider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.queryByTestId("native-toast-glass")).toBeNull();
    expect(screen.getByTestId("native-toast").className).toContain("bg-foreground");
  });

  it("stays solid on Android, and for success and destructive toasts", () => {
    Platform.OS = "android";
    const { unmount } = withModules(
      { glass: fakeGlass() },
      <NativeToastProvider disableAnimation>
        <ShowToast />
      </NativeToastProvider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.queryByTestId("native-toast-glass")).toBeNull();
    unmount();
    Platform.OS = "ios";
    withModules(
      { glass: fakeGlass() },
      <NativeToastProvider disableAnimation>
        <ShowToast variant="destructive" />
      </NativeToastProvider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.queryByTestId("native-toast-glass")).toBeNull();
    expect(screen.getByTestId("native-toast").className).toContain("bg-destructive");
  });

  it("stays solid while Reduce Transparency is on", async () => {
    Platform.OS = "ios";
    (AccessibilityInfo as unknown as { isReduceTransparencyEnabled: () => Promise<boolean> }).isReduceTransparencyEnabled = () => Promise.resolve(true);
    try {
      withModules(
        { glass: fakeGlass() },
        <NativeToastProvider disableAnimation>
          <ShowToast />
        </NativeToastProvider>,
      );
      fireEvent.click(screen.getByTestId("trigger"));
      await act(async () => {});
      expect(screen.queryByTestId("native-toast-glass")).toBeNull();
    } finally {
      delete (AccessibilityInfo as unknown as { isReduceTransparencyEnabled?: unknown }).isReduceTransparencyEnabled;
    }
  });
});

describe("NativeToast on glass", () => {
  it("slides in without fading, since glass doesn't draw under a translucent parent", () => {
    Platform.OS = "ios";
    const R = fakeReanimated();
    withModules(
      { reanimated: R, glass: fakeGlass() },
      <NativeToastProvider>
        <ShowToast />
      </NativeToastProvider>,
    );
    fireEvent.click(screen.getByTestId("trigger"));
    const style = JSON.parse((document.querySelector("[data-reanimated]") as HTMLElement).dataset.style!);
    expect(style.opacity).toBe(1);
    expect(R.withTiming).toHaveBeenCalledTimes(1);
    expect(R.withTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: 180 }));
  });

  it("stays solid, and says so in development, when expo-glass-effect lacks a check", () => {
    Platform.OS = "ios";
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const glass = { ...fakeGlass(), isGlassEffectAPIAvailable: undefined } as unknown as GenesisModules["glass"];
      withModules(
        { glass },
        <NativeToastProvider disableAnimation>
          <ShowToast />
        </NativeToastProvider>,
      );
      fireEvent.click(screen.getByTestId("trigger"));
      expect(screen.queryByTestId("native-toast-glass")).toBeNull();
      expect(warn.mock.calls.some(([m]) => String(m).includes("modules.glass"))).toBe(true);
    } finally {
      delete (globalThis as { __DEV__?: boolean }).__DEV__;
    }
  });
});

describe("useReducedMotion", () => {
  it("starts a later component from the last known answer", async () => {
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    function Probe({ id }: { id: string }) {
      return <span data-testid={id}>{String(useReducedMotion())}</span>;
    }
    const first = render(<Probe id="first" />);
    await act(async () => {});
    expect(screen.getByTestId("first").textContent).toBe("true");
    first.unmount();
    // The second one's first render, before its own query answers.
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockReturnValue(new Promise(() => {}));
    render(<Probe id="second" />);
    expect(screen.getByTestId("second").textContent).toBe("true");
  });
});

describe("Reduce Transparency, before it is known", () => {
  it("keeps surfaces solid until the setting answers off, then draws glass", async () => {
    Platform.OS = "ios";
    let answer: (v: boolean) => void = () => {};
    const info = AccessibilityInfo as unknown as { isReduceTransparencyEnabled?: () => Promise<boolean> };
    info.isReduceTransparencyEnabled = () => new Promise((resolve) => (answer = resolve));
    try {
      withModules({ glass: fakeGlass() }, <NativeGlassSurface testID="surface" fallbackClassName="bg-secondary" />);
      expect(screen.getByTestId("surface").dataset.glass).toBeUndefined();
      await act(async () => answer(false));
      expect(screen.getByTestId("surface").dataset.glass).toBe("true");
    } finally {
      delete info.isReduceTransparencyEnabled;
    }
  });
});

describe("NativeGlassSurface", () => {
  it("draws the fallback classes without expo-glass-effect", () => {
    render(<NativeGlassSurface testID="surface" fallbackClassName="bg-secondary" className="p-2" />);
    expect(screen.getByTestId("surface").className).toBe("bg-secondary p-2");
  });

  it("draws GlassView, without the fallback classes, when glass is available", () => {
    Platform.OS = "ios";
    const glass = fakeGlass();
    withModules(
      { glass },
      <NativeGlassSurface testID="surface" fallbackClassName="bg-secondary" className="p-2" radius={20}>
        <span>inside</span>
      </NativeGlassSurface>,
    );
    const surface = screen.getByTestId("surface");
    expect(surface.dataset.glass).toBe("true");
    expect(surface.textContent).toBe("inside");
    expect(surface.querySelector(".bg-secondary")).toBeNull();
    expect(glass.calls.mock.calls[0]![0]).toMatchObject({ style: { borderRadius: 20, overflow: "hidden" }, glassEffectStyle: "regular" });
  });
});

describe("NativeSkeleton", () => {
  it("pulses with React Native's Animated without reanimated", () => {
    render(<NativeSkeleton testID="sk" className="h-4 w-24" />);
    expect(screen.getByTestId("sk").className).toContain("bg-muted");
    expect(document.querySelector("[data-reanimated]")).toBeNull();
  });

  it("pulses forever with Reanimated, and keeps the className", () => {
    const R = fakeReanimated();
    withModules({ reanimated: R }, <NativeSkeleton testID="sk" className="h-4 w-24" size={10} />);
    const el = screen.getByTestId("sk");
    expect(el.dataset.reanimated).toBe("true");
    expect(el.className).toContain("w-24");
    expect(R.withRepeat).toHaveBeenCalledWith(1, -1, true);
    expect(JSON.parse(el.dataset.style!)).toEqual([{ opacity: 0.3 }, { width: 10 }, { height: 10 }]);
  });

  it("holds still with Reanimated under Reduce Motion", async () => {
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const R = fakeReanimated();
    withModules({ reanimated: R }, <NativeSkeleton testID="sk" />);
    await act(async () => {});
    expect(R.cancelAnimation).toHaveBeenCalled();
    expect(R.withRepeat).toHaveBeenCalledTimes(1); // the first, pre-preference render only
  });
});

describe("NativeDrawer", () => {
  it("slides its panel with Reanimated when passed", () => {
    const R = fakeReanimated();
    withModules(
      { reanimated: R },
      <NativeDrawer open onOpenChange={() => {}}>
        <span>menu</span>
      </NativeDrawer>,
    );
    const panel = screen.getByTestId("native-drawer");
    expect(panel.dataset.reanimated).toBe("true");
    expect(R.withTiming).toHaveBeenCalledWith(0, { duration: 220 });
  });

  it("settles back open when another responder takes the swipe", () => {
    const configs: Array<{ onPanResponderTerminate?: () => void }> = [];
    vi.spyOn(PanResponder, "create").mockImplementation((cfg) => {
      configs.push(cfg as never);
      return { panHandlers: {} } as never;
    });
    const R = fakeReanimated();
    const onOpenChange = vi.fn();
    withModules(
      { reanimated: R },
      <NativeDrawer open onOpenChange={onOpenChange}>
        <span>menu</span>
      </NativeDrawer>,
    );
    R.withTiming.mockClear();
    configs[configs.length - 1]!.onPanResponderTerminate!();
    expect(R.withTiming).toHaveBeenCalledWith(0, { duration: 180 });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("closes on a backdrop tap, not on a panel tap", () => {
    const onOpenChange = vi.fn();
    render(
      <NativeDrawer open onOpenChange={onOpenChange}>
        <span>menu</span>
      </NativeDrawer>,
    );
    fireEvent.click(screen.getByText("menu"));
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Close drawer"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // The panel isn't inside the backdrop button.
    expect(screen.getByLabelText("Close drawer").contains(screen.getByText("menu"))).toBe(false);
  });

  it("falls back to React Native's Animated", () => {
    render(
      <NativeDrawer open onOpenChange={() => {}}>
        <span>menu</span>
      </NativeDrawer>,
    );
    expect(screen.getByTestId("native-drawer").dataset.reanimated).toBeUndefined();
    expect(screen.getByText("menu")).toBeTruthy();
  });
});

describe("NativeAvatar and NativeImage", () => {
  it("use expo-image with a memory and disk cache and the URL as the recycling key", () => {
    const Image = fakeImage();
    withModules({ image: Image }, <NativeAvatar testID="av" src="https://example.com/a.png" fallback="AB" alt="Ada" />);
    const img = screen.getByTestId("av-image");
    expect(img.dataset.expoImage).toBe("true");
    expect(img.dataset.cachePolicy).toBe("memory-disk");
    expect(img.dataset.recyclingKey).toBe("https://example.com/a.png");
    expect(img.dataset.transition).toBe("150");
    // The initials show until the picture loads.
    expect(screen.getByText("AB")).toBeTruthy();
    expect(screen.getByTestId("av").getAttribute("aria-label")).toBe("Ada");
  });

  it("take an explicit recycling key, and drop the cross-fade under Reduce Motion", async () => {
    vi.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    const Image = fakeImage();
    withModules({ image: Image }, <NativeImage testID="img" src="https://example.com/b.png" recyclingKey="row-7" />);
    await act(async () => {});
    expect(screen.getByTestId("img-image").dataset.recyclingKey).toBe("row-7");
    expect(screen.getByTestId("img-image").dataset.transition).toBe("null");
    expect(screen.getByTestId("img").getAttribute("aria-hidden")).toBe("true");
  });

  it("fall back to React Native's Image", () => {
    render(<NativeAvatar testID="av" src="https://example.com/a.png" fallback="AB" />);
    expect(screen.getByTestId("av-image").dataset.expoImage).toBeUndefined();
  });

  it("hide the initials once the picture loads, show them again if it fails or the URL changes", () => {
    const Image = fakeImage();
    const ui = (src: string) => (
      <GenesisModulesProvider modules={{ image: Image }}>
        <NativeAvatar testID="av" src={src} fallback="AB" />
      </GenesisModulesProvider>
    );
    const { rerender } = render(ui("https://example.com/a.png"));
    expect(screen.getByText("AB")).toBeTruthy();
    fireEvent.load(screen.getByTestId("av-image"));
    expect(screen.queryByText("AB")).toBeNull();
    rerender(ui("https://example.com/b.png"));
    expect(screen.getByText("AB")).toBeTruthy(); // b.png hasn't loaded yet
    fireEvent.error(screen.getByTestId("av-image"));
    expect(screen.getByText("AB")).toBeTruthy();
    expect(screen.queryByTestId("av-image")).toBeNull();
  });

  it("give a recycled row the new person's state on its first frame", () => {
    const Image = vi.fn((props: { testID?: string; onError?: () => void }) => (
      <img data-testid={props.testID} alt="" onClick={() => props.onError?.()} />
    ));
    const { rerender } = withModules({ image: Image as never }, <NativeAvatar testID="av" src="https://example.com/a.png" fallback="AB" />);
    fireEvent.click(screen.getByTestId("av-image")); // a.png fails
    expect(screen.queryByTestId("av-image")).toBeNull();
    rerender(
      <GenesisModulesProvider modules={{ image: Image as never }}>
        <NativeAvatar testID="av" src="https://example.com/b.png" fallback="CD" />
      </GenesisModulesProvider>,
    );
    // b.png is tried at once, not after an effect resets the failure.
    expect(screen.getByTestId("av-image")).toBeTruthy();
    expect(screen.getByText("CD")).toBeTruthy();
  });

  it("show the initials when there is no picture", () => {
    withModules({ image: fakeImage() }, <NativeAvatar testID="av" fallback="CD" />);
    expect(screen.queryByTestId("av-image")).toBeNull();
    expect(screen.getByText("CD")).toBeTruthy();
  });
});

describe("NativeIcon", () => {
  it("draws the SF Symbol on iOS, with the icon set as its fallback", () => {
    Platform.OS = "ios";
    const SymbolView = fakeSymbolView();
    withModules({ symbol: SymbolView, icons: { settings: fakeIcon("Settings") } }, <NativeIcon name="settings" size={22} />);
    const symbol = document.querySelector("[data-symbol]") as HTMLElement;
    expect(symbol.dataset.symbol).toBe("gearshape");
    expect(symbol.dataset.size).toBe("22");
    expect(symbol.querySelector("[data-lucide=Settings]")).not.toBeNull();
  });

  it("draws the icon set on Android, never the SF Symbol", () => {
    Platform.OS = "android";
    withModules({ symbol: fakeSymbolView(), icons: { bell: fakeIcon("Bell") } }, <NativeIcon name="bell" />);
    expect(document.querySelector("[data-symbol]")).toBeNull();
    expect(document.querySelector("[data-lucide=Bell]")).not.toBeNull();
  });

  it("is decorative unless labelled", () => {
    withModules({ icons: { bell: fakeIcon("Bell") } }, <NativeIcon name="bell" testID="i" />);
    expect(screen.getByTestId("i").getAttribute("aria-hidden")).toBe("true");
  });

  it("is an image with a label when given one", () => {
    withModules({ icons: { bell: fakeIcon("Bell") } }, <NativeIcon name="bell" label="Notifications" testID="i" />);
    expect(screen.getByTestId("i").getAttribute("role")).toBe("image");
    expect(screen.getByLabelText("Notifications")).toBeTruthy();
  });

  it("keeps its space and warns once when there is nothing to draw with", () => {
    Platform.OS = "android";
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      render(
        <>
          <NativeIcon name="trash" testID="i" size={18} />
          <NativeIcon name="trash" />
        </>,
      );
      expect(JSON.parse(screen.getByTestId("i").dataset.style!)).toMatchObject({ width: 18, height: 18 });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toContain('NativeIcon "trash"');
    } finally {
      delete (globalThis as { __DEV__?: boolean }).__DEV__;
    }
  });

  it("maps every semantic name to an SF Symbol", () => {
    for (const name of NATIVE_ICON_NAMES) expect(SF_SYMBOLS[name]).toMatch(/^[a-z0-9.]+$/);
  });
});

describe("NativeListItem chevron", () => {
  it('is a text "›" without icons', () => {
    render(<NativeListItem title="Row" showChevron />);
    expect(screen.getByText("›")).toBeTruthy();
  });

  it("is the chevron icon when the app gave an icon set", () => {
    Platform.OS = "android";
    withModules({ icons: { "chevron-right": fakeIcon("ChevronRight") } }, <NativeListItem title="Row" showChevron />);
    expect(screen.queryByText("›")).toBeNull();
    expect(document.querySelector("[data-lucide=ChevronRight]")).not.toBeNull();
  });
});

describe("NativeDatePicker with @expo/ui", () => {
  it("is the compact picker on iOS and reports the chosen date", () => {
    Platform.OS = "ios";
    const Picker = fakeDatePicker();
    const onChange = vi.fn();
    withModules({ datePicker: Picker }, <NativeDatePicker value={new Date(2030, 0, 1)} onChange={onChange} testID="dp" />);
    const picker = screen.getByTestId("dp");
    expect(picker.dataset.expoUiPicker).toBe("true");
    expect(picker.dataset.display).toBe("compact");
    fireEvent.click(screen.getByTestId("fake-picker-choose"));
    expect(onChange).toHaveBeenCalledWith(new Date(2030, 0, 2));
  });

  it("opens as a dialog on Android and closes on cancel without a change", () => {
    Platform.OS = "android";
    const onChange = vi.fn();
    withModules({ datePicker: fakeDatePicker() }, <NativeDatePicker value={new Date(2030, 0, 1)} onChange={onChange} testID="dp" />);
    expect(screen.queryByTestId("dp-picker")).toBeNull();
    fireEvent.click(screen.getByTestId("dp"));
    expect(screen.getByTestId("dp-picker").dataset.presentation).toBe("dialog");
    fireEvent.click(screen.getByTestId("fake-picker-cancel"));
    expect(screen.queryByTestId("dp-picker")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("falls back to the community picker, or a label without one", () => {
    render(<NativeDatePicker value={new Date(2030, 0, 1)} onChange={() => {}} testID="dp" />);
    expect(screen.getByTestId("dp").textContent).toContain("picker module not installed");
  });
});

describe("NotificationsPage with FlashList", () => {
  const now = new Date();
  const items = [
    { id: "a", title: "One", timestamp: now },
    { id: "b", title: "Two", timestamp: now },
    { id: "c", title: "Old", timestamp: new Date(2000, 0, 1) },
  ];

  it("flattens sections into one list with sticky headers", () => {
    const FlashList = fakeFlashList();
    withModules({ list: FlashList }, <NotificationsPage items={items} />);
    const list = screen.getByTestId("notifications-page-list");
    expect(list.dataset.flashList).toBe("true");
    expect(JSON.parse(list.dataset.sticky!)).toEqual([0, 3]);
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByTestId("notifications-page-row-c")).toBeTruthy();
    const types = [...list.querySelectorAll("[data-item-type]")].map((el) => (el as HTMLElement).dataset.itemType);
    expect(types).toEqual(["header", "item", "item-last", "header", "item-last"]);
  });

  it("separates rows inside a section only", () => {
    const flat = notificationsTest.flattenSections(notificationsTest.groupByDate(items, now));
    expect(flat.rows.map((r) => (r.kind === "item" ? `${r.item.id}${r.last ? "!" : ""}` : r.title))).toEqual(["Today", "a", "b!", "Earlier", "c!"]);
  });

  it("falls back to SectionList", () => {
    render(<NotificationsPage items={items} />);
    expect(screen.getByTestId("notifications-page-list").dataset.flashList).toBeUndefined();
  });
});

beforeEach(() => {
  Platform.OS = "ios";
});
