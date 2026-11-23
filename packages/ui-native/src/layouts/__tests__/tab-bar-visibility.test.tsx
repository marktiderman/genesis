// @feat:tab-bar-visibility
import { useEffect, useState } from "react";
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

function Tabs({ children }: { children: React.ReactNode }) {
  return (
    <TabBarVisibilityProvider>
      {(h) => (
        <>
          <i data-testid="state" data-hidden={String(h)} />
          <Bar />
          {children}
        </>
      )}
    </TabBarVisibilityProvider>
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
      <GenesisModulesProvider modules={{ router: { useFocusEffect } }}>
        <Tabs><Hider /></Tabs>
      </GenesisModulesProvider>,
    );
    expect(hidden()).toBe("true");
    focus(false);
    expect(hidden()).toBe("false");
    focus(true);
    expect(hidden()).toBe("true");
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
    const seen: Record<string, unknown>[] = [];
    const StackScreen = ({ options }: { options?: Record<string, unknown> }) => {
      seen.push(options ?? {});
      return null;
    };
    const view = render(
      <GenesisModulesProvider modules={{ router: { StackScreen } }}>
        <ScreenContainer header={{ headerTitle: "Inbox", search: { placeholder: "Search" } }}><i /></ScreenContainer>
      </GenesisModulesProvider>,
    );
    expect(seen.at(-1)).toMatchObject({ title: "Inbox", headerLargeTitle: true, headerSearchBarOptions: { placeholder: "Search" } });
    view.rerender(
      <GenesisModulesProvider modules={{ router: { StackScreen } }}>
        <ScreenContainer header={{ headerTitle: "Ada", large: false }}><i /></ScreenContainer>
      </GenesisModulesProvider>,
    );
    expect(seen.at(-1)).toEqual({ title: "Ada" });
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
