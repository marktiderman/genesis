// @feat:app-shell
/**
 * AppShell's collapsible desktop sidebar: the 64px icon rail, its toggle and
 * `[` shortcut, rail tooltips and nested-group popovers, and the collapse
 * precedence (controlled > user choice > page default > app default).
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ClipboardList, Home, Layers, PencilRuler, Users } from "lucide-react";

import { AppShell, type NavItem } from "../AppShell";
import type { NavigationNode } from "../../../navigation";

const chrome = { showThemeToggle: false, configurable: false };

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
  it("expanded: icon + label rows, collapse beside the logo with aria-expanded", () => {
    render(
      <AppShell appName="Breakthrough" appLogo="B" navItems={items} activePath="/clients" options={chrome}>
        <div>content</div>
      </AppShell>,
    );
    expect(isCollapsed()).toBe(false);
    expect(within(sidebar()).getByText("Clients")).toBeTruthy();
    const button = toggle();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("Collapse sidebar");
    expect(button.getAttribute("aria-controls")).toBe(sidebar().id);
    expect(button.getAttribute("aria-keyshortcuts")).toBe("[");
    // Beside the logo: in the header row, before the nav.
    const nav = within(sidebar()).getByRole("navigation", { name: "Main" });
    expect(button.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("collapsed: 64px rail, logo mark, named icon links, expand button after the nav", () => {
    render(
      <AppShell appName="Breakthrough" appLogo="B" navItems={items} activePath="/clients" options={chrome}>
        <div>content</div>
      </AppShell>,
    );
    fireEvent.click(toggle());
    expect(isCollapsed()).toBe(true);
    expect(sidebar().className).toContain("md:w-16");
    expect(within(sidebar()).getByText("B")).toBeTruthy();
    expect(within(sidebar()).queryByText("Breakthrough")).toBeNull();

    const active = within(sidebar()).getByRole("link", { name: "Clients (3)" });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(within(sidebar()).getByRole("link", { name: "Home" })).toBeTruthy();

    const button = toggle();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-label")).toBe("Expand sidebar");
    const nav = within(sidebar()).getByRole("navigation", { name: "Main" });
    expect(nav.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
        <AppShell appName="Breakthrough" navItems={items} options={chrome}>
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
        <AppShell appName="Breakthrough" navItems={items} options={chrome}>
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
        <AppShell appName="Breakthrough" navItems={items} activePath="/library/lessons" options={chrome}>
          <div>content</div>
        </AppShell>,
      );
      // A nested child: on the rail it lives in the group's popover.
      within(sidebar()).getByRole("link", { name: "Courses" }).focus();
      fireEvent.keyDown(document.activeElement!, { key: "[" });
      expect(isCollapsed()).toBe(true);
      expect(document.activeElement).toBe(toggle());
    });

    it("leaves focus alone when it was outside the sidebar", () => {
      render(
        <AppShell appName="Breakthrough" navItems={items} options={chrome}>
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
    const renderShell = (extra?: { collapseShortcut?: string | false }) =>
      render(
        <AppShell appName="Breakthrough" navItems={items} options={{ ...chrome, ...extra }}>
          <input aria-label="Title" />
        </AppShell>,
      );

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
