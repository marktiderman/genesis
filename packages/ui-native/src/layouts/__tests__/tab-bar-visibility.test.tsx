// @feat:tab-bar-visibility
import { StrictMode, useEffect, useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider } from "../../native-modules";
import { NativeTabBar } from "../../components/tab-bar";
import { ScreenContainer, composeHeaderOptions } from "../screen-container";
import { TabBarVisibilityProvider, createPlaceExit, useHideTabBar, useTabBarHidden } from "../tab-bar-visibility";

afterEach(cleanup);

function Bar() {
  return <i data-testid="bar" data-hidden={String(useTabBarHidden())} />;
}

function Hider({ enabled = true }: { enabled?: boolean }) {
  useHideTabBar(enabled);
  return null;
}

const hidden = () => screen.getByTestId("state").dataset.hidden;

/** A focus hook that holds while mounted: a screen that is always focused. */
function useAlwaysFocused(effect: () => void | (() => void)) {
  useEffect(effect, [effect]);
}

function Tabs({ children, router = { useFocusEffect: useAlwaysFocused } }: { children: React.ReactNode; router?: { useFocusEffect?: (e: () => void | (() => void)) => void } | null }) {
  return (
    <GenesisModulesProvider modules={router ? { router } : {}}>
    <TabBarVisibilityProvider>
      {(h) => (
        <>
          <i data-testid="state" data-hidden={String(h)} />
          <Bar />
          {children}
        </>
      )}
    </TabBarVisibilityProvider>
    </GenesisModulesProvider>
  );
}

describe("tab bar visibility per screen", () => {
  it("hides while a hiding screen is mounted, and shows again when it goes", () => {
    const view = render(<Tabs>{null}</Tabs>);
    expect(hidden()).toBe("false");
    view.rerender(<Tabs><Hider /></Tabs>);
    expect(hidden()).toBe("true");
    expect(screen.getByTestId("bar").dataset.hidden).toBe("true");
    view.rerender(<Tabs>{null}</Tabs>);
    expect(hidden()).toBe("false");
  });

  it("counts, so one hiding screen pushed over another keeps it hidden", () => {
    const view = render(<Tabs><Hider /><Hider /></Tabs>);
    expect(hidden()).toBe("true");
    view.rerender(<Tabs><Hider /></Tabs>);
    expect(hidden()).toBe("true");
    view.rerender(<Tabs>{null}</Tabs>);
    expect(hidden()).toBe("false");
  });

  it("follows focus through the router module's useFocusEffect", () => {
    let focus: (focused: boolean) => void = () => {};
    // A stand-in for expo-router's useFocusEffect: runs the effect while "focused".
    function useFocusEffect(effect: () => void | (() => void)) {
      const [focused, setFocused] = useState(true);
      focus = (f) => act(() => setFocused(f));
      useEffect(() => (focused ? effect() : undefined), [focused, effect]);
    }
    render(
      <Tabs router={{ useFocusEffect }}><Hider /></Tabs>,
    );
    expect(hidden()).toBe("true");
    focus(false);
    expect(hidden()).toBe("false");
    focus(true);
    expect(hidden()).toBe("true");
  });

  it("never hides without the router's focus hook (a tab keeps its stack mounted), and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    render(<Tabs router={null}><Hider /></Tabs>);
    expect(hidden()).toBe("false");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("needs GenesisModules.router.useFocusEffect"));
    delete (globalThis as { __DEV__?: boolean }).__DEV__;
    warn.mockRestore();
  });

  it("does nothing when disabled or outside a provider", () => {
    render(<Tabs><Hider enabled={false} /></Tabs>);
    expect(hidden()).toBe("false");
    expect(() => render(<Hider />)).not.toThrow();
  });

  it("ScreenContainer tabBar=hidden hides it", () => {
    render(<Tabs><ScreenContainer tabBar="hidden"><i /></ScreenContainer></Tabs>);
    expect(hidden()).toBe("true");
  });

  it("ScreenContainer reads focus only when it hides the bar (it also draws sheets, outside any navigator)", () => {
    const useFocusEffect = vi.fn(() => {
      throw new Error("Couldn't find a navigation object.");
    });
    expect(() =>
      render(
        <GenesisModulesProvider modules={{ router: { useFocusEffect } }}>
          <ScreenContainer><i /></ScreenContainer>
        </GenesisModulesProvider>,
      ),
    ).not.toThrow();
    expect(useFocusEffect).not.toHaveBeenCalled();
  });

  it("NativeTabBar draws nothing when hidden", () => {
    const items = [{ key: "a", label: "A", icon: null }];
    const view = render(<NativeTabBar items={items} value="a" onChange={vi.fn()} hidden testID="tb" />);
    expect(screen.queryByTestId("tb")).toBeNull();
    view.rerender(<NativeTabBar items={items} value="a" onChange={vi.fn()} testID="tb" />);
    expect(screen.getByTestId("tb")).toBeTruthy();
  });
});

describe("the native header", () => {
  it("composes native search and header items", () => {
    const items = () => [{ type: "button", label: "Add" }];
    const opts = composeHeaderOptions({ headerTitle: "Mail", large: true, search: { placeholder: "Search", placement: "integrated" }, headerRightItems: items });
    expect(opts).toMatchObject({
      title: "Mail",
      headerLargeTitle: true,
      headerSearchBarOptions: { placeholder: "Search", placement: "integrated" },
      unstable_headerRightItems: items,
    });
  });

  it("ScreenContainer header sets the stack's options, a large title by default", () => {
    const search = { placeholder: "Search" };
    const seen: Record<string, unknown>[] = [];
    const StackScreen = ({ options }: { options?: Record<string, unknown> }) => {
      seen.push(options ?? {});
      return null;
    };
    const view = render(
      <GenesisModulesProvider modules={{ router: { StackScreen } }}>
        <ScreenContainer header={{ headerTitle: "Inbox", search }}><i /></ScreenContainer>
      </GenesisModulesProvider>,
    );
    expect(seen.at(-1)).toMatchObject({ title: "Inbox", headerLargeTitle: true, headerSearchBarOptions: { placeholder: "Search" } });
    view.rerender(
      <GenesisModulesProvider modules={{ router: { StackScreen } }}>
        <ScreenContainer header={{ headerTitle: "Ada", large: false }}><i /></ScreenContainer>
      </GenesisModulesProvider>,
    );
    // What the render before set and this one leaves out is reset: the search goes, the title isn't large.
    const merged = Object.assign({}, ...seen) as Record<string, unknown>;
    expect(merged).toMatchObject({ title: "Ada", headerLargeTitle: false });
    expect(seen.some((o) => "headerSearchBarOptions" in o && o.headerSearchBarOptions === undefined)).toBe(true);
    expect(merged.headerSearchBarOptions).toBeUndefined();
    // What it never set isn't sent, so the layout's own options stay.
    for (const key of ["headerLeft", "headerRight", "headerTransparent", "headerLargeTitleShadowVisible", "unstable_headerRightItems", "unstable_headerLeftItems"]) {
      expect(seen.some((o) => key in o), key).toBe(false);
    }
  });

  it("leaves the layout's screenOptions alone: a shared headerRight survives the screen's header", () => {
    // A stand-in for the stack merging the layout's screenOptions with each Stack.Screen's options.
    const layout: Record<string, unknown> = { headerRight: "layout's button", headerTransparent: true };
    let merged: Record<string, unknown> = { ...layout };
    const StackScreen = ({ options }: { options?: Record<string, unknown> }) => {
      merged = { ...merged, ...options };
      return null;
    };
    const modules = { router: { StackScreen } };
    const view = render(<GenesisModulesProvider modules={modules}><ScreenContainer header={{ headerTitle: "Inbox" }}><i /></ScreenContainer></GenesisModulesProvider>);
    view.rerender(<GenesisModulesProvider modules={modules}><ScreenContainer header={{ headerTitle: "Inbox", large: false }}><i /></ScreenContainer></GenesisModulesProvider>);
    expect(merged).toMatchObject({ headerRight: "layout's button", headerTransparent: true, title: "Inbox", headerLargeTitle: false });
  });

  it("ScreenContainer header without the router module renders nothing extra", () => {
    expect(() => render(<ScreenContainer header={{ headerTitle: "Inbox" }}><i data-testid="body" /></ScreenContainer>)).not.toThrow();
    expect(screen.getByTestId("body")).toBeTruthy();
  });
});

describe("leaving a place of its own (createPlaceExit)", () => {
  it("remembers the last path outside, and falls back when there is none or it isn't accepted", () => {
    const exit = createPlaceExit((p) => p.startsWith("/messages"));
    let path = "/today";
    function Root() {
      exit.useRememberOutside();
      return null;
    }
    const modules = { router: { usePathname: () => path } };
    const view = render(<GenesisModulesProvider modules={modules}><Root /></GenesisModulesProvider>);
    expect(exit.exitPath("/")).toBe("/today");
    path = "/messages/1";
    view.rerender(<GenesisModulesProvider modules={{ router: { usePathname: () => path } }}><Root /></GenesisModulesProvider>);
    expect(exit.exitPath("/")).toBe("/today");
    expect(exit.exitPath("/admin", (p) => p.startsWith("/admin"))).toBe("/admin");
    exit.setLastOutside(null);
    expect(exit.exitPath("/")).toBe("/");
  });
});

describe("ScreenContainer header, set by field", () => {
  it("doesn't set the options again when an inline header has the same fields", () => {
    const seen: unknown[] = [];
    const StackScreen = ({ options }: { options?: Record<string, unknown> }) => {
      seen.push(options);
      return null;
    };
    const search = { placeholder: "Search" };
    const modules = { router: { StackScreen } };
    const view = render(<GenesisModulesProvider modules={modules}><ScreenContainer header={{ headerTitle: "Inbox", search }}><i /></ScreenContainer></GenesisModulesProvider>);
    const settled = new Set(seen).size;
    view.rerender(<GenesisModulesProvider modules={modules}><ScreenContainer header={{ headerTitle: "Inbox", search }}><i /></ScreenContainer></GenesisModulesProvider>);
    expect(new Set(seen).size).toBe(settled);
  });
});

describe("ScreenContainer header under StrictMode", () => {
  it("resets a removed search even with StrictMode's double render", () => {
    let merged: Record<string, unknown> = {};
    const StackScreen = ({ options }: { options?: Record<string, unknown> }) => {
      merged = { ...merged, ...options };
      return null;
    };
    const modules = { router: { StackScreen } };
    const search = { placeholder: "Search" };
    const view = render(
      <StrictMode>
        <GenesisModulesProvider modules={modules}>
          <ScreenContainer header={{ headerTitle: "Inbox", search }}><i /></ScreenContainer>
        </GenesisModulesProvider>
      </StrictMode>,
    );
    expect(merged.headerSearchBarOptions).toEqual(search);
    view.rerender(
      <StrictMode>
        <GenesisModulesProvider modules={modules}>
          <ScreenContainer header={{ headerTitle: "Inbox" }}><i /></ScreenContainer>
        </GenesisModulesProvider>
      </StrictMode>,
    );
    expect(merged.headerSearchBarOptions).toBeUndefined();
    expect(merged.title).toBe("Inbox");
  });
});

