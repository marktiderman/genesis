// @feat:app-shell
/**
 * AppShell's collapsible desktop sidebar: the 64px icon rail, its toggle and
 * `[` shortcut, rail tooltips and nested-group popovers, and the collapse
 * precedence (controlled > user choice > page default > app default).
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { ClipboardList, Home, Layers, PencilRuler, Users } from "lucide-react";

import { AppShell, type NavItem } from "../AppShell";
import type { NavigationNode } from "../../../navigation";

const chrome = { showThemeToggle: false, configurable: false };
// The `[` shortcut is opt-in; tests that press it turn it on.
const withKey = { ...chrome, collapseShortcut: "[" as const };

const items: NavItem[] = [
  { to: "/", icon: Home, label: "Home", end: true },
  { to: "/clients", icon: Users, label: "Clients", badge: 3 },
  {
    to: "/library",
    icon: Layers,
    label: "Library",
    children: [
      { to: "/library/lessons", icon: Layers, label: "Lessons" },
      { to: "/library/courses", icon: Layers, label: "Courses" },
    ],
  },
];

const tree: NavigationNode<NavItem> = {
  id: "app",
  path: "/",
  label: "Home",
  items: [
    { to: "/", icon: Home, label: "Home", end: true },
    { to: "/forms", icon: ClipboardList, label: "Forms" },
  ],
  children: [
    {
      id: "forms",
      path: "/forms",
      label: "Forms",
      items: [],
      children: [
        {
          id: "builder",
          path: "/forms/$formId/edit",
          label: "Builder",
          items: [{ to: "/forms/$formId/edit", icon: PencilRuler, label: "Edit" }],
          defaultCollapsed: true,
        },
      ],
    },
  ],
};

const sidebar = () => screen.getByTestId("app-shell-sidebar");
const isCollapsed = () => sidebar().hasAttribute("data-collapsed");
const toggle = () => within(sidebar()).getByTestId("app-shell-collapse");

beforeEach(() => {
  localStorage.clear();
});

describe("AppShell collapsible sidebar", () => {
  it("expanded: icon + label rows, collapse beside the logo with its pre-existing markup", () => {
    render(
      <AppShell appName="Breakthrough" appLogo="B" navItems={items} activePath="/clients" options={chrome}>
        <div>content</div>
      </AppShell>,
    );
    expect(isCollapsed()).toBe(false);
    expect(within(sidebar()).getByText("Clients")).toBeTruthy();
    const button = toggle();
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("title")).toBe("Collapse sidebar");
    expect(button.getAttribute("aria-label")).toBe("Collapse sidebar");
    expect(button.hasAttribute("aria-expanded")).toBe(false);
    // No shortcut unless the app turns one on.
    expect(button.hasAttribute("aria-keyshortcuts")).toBe(false);
    expect(sidebar().hasAttribute("id")).toBe(false);
    expect(sidebar().hasAttribute("aria-label")).toBe(false);
    // Beside the logo: in the header row, before the nav.
    const nav = within(sidebar()).getByRole("navigation", { name: "Main" });
    expect(button.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("collapsed: 56px rail, logo mark, named icon links, expand button after the nav", () => {
    render(
      <AppShell appName="Breakthrough" appLogo="B" navItems={items} activePath="/clients" options={chrome}>
        <div>content</div>
      </AppShell>,
    );
    fireEvent.click(toggle());
    expect(isCollapsed()).toBe(true);
    expect(sidebar().className).toContain("md:w-14");
    expect(within(sidebar()).getByText("B")).toBeTruthy();
    expect(within(sidebar()).queryByText("Breakthrough")).toBeNull();

    const active = within(sidebar()).getByRole("link", { name: "Clients (3)" });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(within(sidebar()).getByRole("link", { name: "Home" })).toBeTruthy();

    const button = toggle();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("title")).toBe("Expand sidebar");
    expect(button.getAttribute("aria-label")).toBe("Expand sidebar");
    const nav = within(sidebar()).getByRole("navigation", { name: "Main" });
    expect(nav.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is 64px when collapsedRailWidth asks for it", () => {
    render(
      <AppShell appName="Breakthrough" navItems={items} collapsed options={{ ...chrome, collapsedRailWidth: 64 }}>
        <div>content</div>
      </AppShell>,
    );
    expect(sidebar().className).toContain("md:w-16");
  });

  it("announces a disabled rail item as a disabled link", () => {
    render(
      <AppShell
        appName="Breakthrough"
        navItems={[...items, { to: "/data", icon: Layers, label: "Data", disabled: true }]}
        collapsed
        options={chrome}
      >
        <div>content</div>
      </AppShell>,
    );
    const data = within(sidebar()).getByRole("link", { name: "Data" });
    expect(data.tagName).toBe("SPAN");
    expect(data.getAttribute("aria-disabled")).toBe("true");
    expect(data.hasAttribute("href")).toBe(false);
  });

  it("titles the toggle with the shortcut when one is on", () => {
    render(
      <AppShell appName="Breakthrough" navItems={items} options={withKey}>
        <div>content</div>
      </AppShell>,
    );
    expect(toggle().getAttribute("title")).toBe("Collapse sidebar ([)");
    expect(toggle().getAttribute("aria-keyshortcuts")).toBe("[");
  });

  it("falls back to the app name's first letter when there is no logo", () => {
    render(
      <AppShell appName="breakthrough" navItems={items} collapsed options={chrome}>
        <div>content</div>
      </AppShell>,
    );
    expect(within(sidebar()).getByText("B")).toBeTruthy();
  });

  it("shows the item's name in a tooltip on keyboard focus", async () => {
    render(
      <AppShell appName="Breakthrough" navItems={items} activePath="/" collapsed options={chrome}>
        <div>content</div>
      </AppShell>,
    );
    const link = within(sidebar()).getByRole("link", { name: "Home" });
    await act(async () => {
      link.focus();
    });
    const tip = await screen.findByRole("tooltip");
    expect(tip.textContent).toBe("Home");
  });

  it("opens a nested group's items in a popover from the rail", async () => {
    render(
      <AppShell appName="Breakthrough" navItems={items} activePath="/library/courses" collapsed options={chrome}>
        <div>content</div>
      </AppShell>,
    );
    const trigger = screen.getByTestId("nav-rail-group-Library");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const popover = await screen.findByTestId("nav-rail-popover-Library");
    const links = within(popover).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Library", "Lessons", "Courses"]);
    expect(
      within(popover).getByRole("link", { name: "Courses" }).getAttribute("aria-current"),
    ).toBe("page");
    fireEvent.keyDown(popover, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("reads the stored choice on the first render, with no expanded flash", () => {
    localStorage.setItem("bt-shell:collapsed", "1");
    const { container } = render(
      <AppShell appName="Breakthrough" navItems={items} optionsStorageKey="bt-shell" options={chrome}>
        <div>content</div>
      </AppShell>,
    );
    expect(container.querySelector("[data-collapsed]")).toBeTruthy();
  });

  it("persists the toggle under the app-scoped key", () => {
    render(
      <AppShell appName="Breakthrough" navItems={items} optionsStorageKey="bt-shell" options={chrome}>
        <div>content</div>
      </AppShell>,
    );
    fireEvent.click(toggle());
    expect(localStorage.getItem("bt-shell:collapsed")).toBe("1");
    fireEvent.click(toggle());
    expect(localStorage.getItem("bt-shell:collapsed")).toBe("0");
  });

  describe("page defaults", () => {
    it("defaultCollapsed prop collapses the page; the user's toggle wins after", () => {
      const { rerender } = render(
        <AppShell appName="Breakthrough" navItems={items} defaultCollapsed optionsStorageKey="bt" options={chrome}>
          <div>content</div>
        </AppShell>,
      );
      expect(isCollapsed()).toBe(true);
      fireEvent.click(toggle());
      expect(isCollapsed()).toBe(false);
      // Another page that also asks for collapsed: the user's choice holds.
      rerender(
        <AppShell appName="Breakthrough" navItems={items} defaultCollapsed optionsStorageKey="bt" options={chrome}>
          <div>other page</div>
        </AppShell>,
      );
      expect(isCollapsed()).toBe(false);
    });

    it("a stored choice beats the page default", () => {
      localStorage.setItem("bt:collapsed", "0");
      render(
        <AppShell appName="Breakthrough" navItems={items} defaultCollapsed optionsStorageKey="bt" options={chrome}>
          <div>content</div>
        </AppShell>,
      );
      expect(isCollapsed()).toBe(false);
    });

    it("follows the navigation node's defaultCollapsed as the route changes", () => {
      const shell = (path: string) => (
        <AppShell appName="Breakthrough" navigation={tree} activePath={path} options={chrome}>
          <div>content</div>
        </AppShell>
      );
      const { rerender } = render(shell("/forms"));
      expect(isCollapsed()).toBe(false);
      rerender(shell("/forms/f1/edit"));
      expect(isCollapsed()).toBe(true);
      rerender(shell("/"));
      expect(isCollapsed()).toBe(false);
    });

    it("without a storage key, the in-session toggle still wins over route defaults", () => {
      const shell = (path: string) => (
        <AppShell appName="Breakthrough" navigation={tree} activePath={path} options={chrome}>
          <div>content</div>
        </AppShell>
      );
      const { rerender } = render(shell("/forms/f1/edit"));
      expect(isCollapsed()).toBe(true);
      fireEvent.click(toggle());
      rerender(shell("/"));
      rerender(shell("/forms/f2/edit"));
      expect(isCollapsed()).toBe(false);
    });

    it("the prop beats the navigation node, and controlled `collapsed` beats everything", () => {
      localStorage.setItem("bt:collapsed", "1");
      const { rerender } = render(
        <AppShell appName="Breakthrough" navigation={tree} activePath="/forms/f1/edit" defaultCollapsed={false} options={chrome}>
          <div>content</div>
        </AppShell>,
      );
      expect(isCollapsed()).toBe(false);
      rerender(
        <AppShell appName="Breakthrough" navigation={tree} activePath="/" optionsStorageKey="bt" collapsed={false} options={chrome}>
          <div>content</div>
        </AppShell>,
      );
      expect(isCollapsed()).toBe(false);
    });

    it("Reset to defaults hands the sidebar back to the page default", () => {
      localStorage.setItem("bt:collapsed", "0");
      render(
        <AppShell
          appName="Breakthrough"
          navItems={items}
          defaultCollapsed
          optionsStorageKey="bt"
          options={{ showThemeToggle: false, configurable: true }}
        >
          <div>content</div>
        </AppShell>,
      );
      expect(isCollapsed()).toBe(false);
      fireEvent.click(screen.getByTestId("app-shell-options"));
      fireEvent.click(screen.getByTestId("app-shell-options-reset"));
      expect(localStorage.getItem("bt:collapsed")).toBeNull();
      expect(isCollapsed()).toBe(true);
    });
  });

  describe("keeps keyboard focus across the collapse", () => {
    it("clicking the toggle leaves focus on the (moved) toggle, both ways", () => {
      render(
        <AppShell appName="Breakthrough" navItems={items} options={withKey}>
          <div>content</div>
        </AppShell>,
      );
      toggle().focus();
      fireEvent.click(toggle());
      expect(isCollapsed()).toBe(true);
      expect(document.activeElement).toBe(toggle());
      expect(toggle().getAttribute("aria-label")).toBe("Expand sidebar");
      fireEvent.click(toggle());
      expect(isCollapsed()).toBe(false);
      expect(document.activeElement).toBe(toggle());
    });

    it("pressing [ on a sidebar link keeps focus on that link", () => {
      render(
        <AppShell appName="Breakthrough" navItems={items} options={withKey}>
          <div>content</div>
        </AppShell>,
      );
      within(sidebar()).getByRole("link", { name: /Clients/ }).focus();
      fireEvent.keyDown(document.activeElement!, { key: "[" });
      expect(isCollapsed()).toBe(true);
      const focused = document.activeElement as HTMLElement;
      expect(focused.getAttribute("href")).toBe("/clients");
      expect(sidebar().contains(focused)).toBe(true);
      fireEvent.keyDown(focused, { key: "[" });
      expect(isCollapsed()).toBe(false);
      expect((document.activeElement as HTMLElement).getAttribute("href")).toBe("/clients");
    });

    it("falls back to the toggle when the focused link isn't on the rail", () => {
      render(
        <AppShell appName="Breakthrough" navItems={items} activePath="/library/lessons" options={withKey}>
          <div>content</div>
        </AppShell>,
      );
      // A nested child: on the rail it lives in the group's popover.
      within(sidebar()).getByRole("link", { name: "Courses" }).focus();
      fireEvent.keyDown(document.activeElement!, { key: "[" });
      expect(isCollapsed()).toBe(true);
      expect(document.activeElement).toBe(toggle());
    });

    it("restores focus when a route's defaultCollapsed collapses the sidebar", () => {
      const shell = (path: string) => (
        <AppShell appName="Breakthrough" navigation={tree} activePath={path} options={chrome}>
          <div>content</div>
        </AppShell>
      );
      const { rerender } = render(shell("/forms"));
      expect(isCollapsed()).toBe(false);
      // The user clicked "Forms" (focus on it); the route below asks for the rail.
      within(sidebar()).getByRole("link", { name: "Forms" }).focus();
      rerender(shell("/forms/f1/edit"));
      expect(isCollapsed()).toBe(true);
      const focused = document.activeElement as HTMLElement;
      expect(focused.getAttribute("href")).toBe("/forms");
      expect(sidebar().contains(focused)).toBe(true);
    });

    it("leaves focus alone when it was outside the sidebar", () => {
      render(
        <AppShell appName="Breakthrough" navItems={items} options={withKey}>
          <button type="button">page action</button>
        </AppShell>,
      );
      const action = screen.getByRole("button", { name: "page action" });
      action.focus();
      fireEvent.keyDown(action, { key: "[" });
      expect(isCollapsed()).toBe(true);
      expect(document.activeElement).toBe(action);
    });
  });

  describe("[ shortcut", () => {
    const renderShell = (extra?: { collapseShortcut?: string | false }, children?: React.ReactNode) =>
      render(
        <AppShell appName="Breakthrough" navItems={items} options={{ ...withKey, ...extra }}>
          <input aria-label="Title" />
          {children}
        </AppShell>,
      );

    it("is off by default", () => {
      render(
        <AppShell appName="Breakthrough" navItems={items} options={chrome}>
          <div>content</div>
        </AppShell>,
      );
      fireEvent.keyDown(window, { key: "[" });
      expect(isCollapsed()).toBe(false);
    });

    it("is skipped while a dialog is open", () => {
      renderShell(undefined, <div role="dialog" data-state="open" aria-label="Edit" />);
      fireEvent.keyDown(window, { key: "[" });
      expect(isCollapsed()).toBe(false);
    });

    it("is skipped while an aria-modal element is open", () => {
      renderShell(undefined, <div aria-modal="true" />);
      fireEvent.keyDown(window, { key: "[" });
      expect(isCollapsed()).toBe(false);
    });

    it("is skipped while a listbox, combobox or menu has focus (typeahead)", () => {
      renderShell(
        undefined,
        <>
          <div role="listbox" aria-label="Options" tabIndex={0}>
            <div role="option" aria-selected="false" tabIndex={-1}>One</div>
          </div>
          <button type="button" role="combobox" aria-expanded="false" aria-controls="x">Pick</button>
          <div role="menu" aria-label="Actions" tabIndex={0} />
        </>,
      );
      fireEvent.keyDown(screen.getByRole("listbox"), { key: "[" });
      fireEvent.keyDown(screen.getByRole("option"), { key: "[" });
      fireEvent.keyDown(screen.getByRole("combobox"), { key: "[" });
      fireEvent.keyDown(screen.getByRole("menu"), { key: "[" });
      expect(isCollapsed()).toBe(false);
    });

    it("toggles the sidebar", () => {
      renderShell();
      fireEvent.keyDown(window, { key: "[" });
      expect(isCollapsed()).toBe(true);
      fireEvent.keyDown(window, { key: "[" });
      expect(isCollapsed()).toBe(false);
    });

    it("ignores typing, modifier chords and repeats", () => {
      renderShell();
      fireEvent.keyDown(screen.getByLabelText("Title"), { key: "[" });
      fireEvent.keyDown(window, { key: "[", metaKey: true });
      fireEvent.keyDown(window, { key: "[", ctrlKey: true });
      fireEvent.keyDown(window, { key: "[", repeat: true });
      expect(isCollapsed()).toBe(false);
    });

    it("can be turned off", () => {
      renderShell({ collapseShortcut: false });
      fireEvent.keyDown(window, { key: "[" });
      expect(isCollapsed()).toBe(false);
    });
  });

  it("leaves the mobile drawer as it was: full labels, no rail", () => {
    const { container } = render(
      <AppShell appName="Breakthrough" navItems={items} collapsed options={chrome}>
        <div>content</div>
      </AppShell>,
    );
    const drawer = container.querySelector("#app-shell-mobile-nav") as HTMLElement;
    expect(within(drawer).getByText("Clients")).toBeTruthy();
    expect(within(drawer).queryByTestId("app-shell-collapse")).toBeNull();
  });
});
