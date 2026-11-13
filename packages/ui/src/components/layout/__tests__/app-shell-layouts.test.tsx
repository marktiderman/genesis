// @feat:shell-navigation-styles
/**
 * AppShell's layout (ADR 0022): one navigation setting (sidebar, rail, top tabs, bottom bar,
 * page tree) and a flush or inset frame, from the same NavItems; the defaults render as before.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { BookOpen, FileText, Home, Settings } from "lucide-react";

import { AppShell, type AppShellOptions, type NavItem } from "../AppShell";
import { TabBar } from "../tab-bar";
import { SubNavTabs } from "../sub-nav";
import { PageHeader } from "../PageHeader";

const chrome: AppShellOptions = { showThemeToggle: false, showCollapse: false, configurable: false };

const items: NavItem[] = [
  { to: "/", label: "Home", icon: Home, end: true },
  {
    to: "/docs",
    label: "Docs",
    icon: BookOpen,
    children: [
      {
        to: "/docs/guides",
        label: "Guides",
        icon: FileText,
        children: [{ to: "/docs/guides/start", label: "Start", icon: FileText }],
      },
      { to: "/docs/api", label: "API", icon: FileText },
    ],
  },
  { to: "/settings", label: "Settings", icon: Settings },
];

function renderShell(options: AppShellOptions, activePath = "/") {
  return render(
    <AppShell appName="Acme" navItems={items} activePath={activePath} options={{ ...chrome, ...options }}>
      <p>Page</p>
    </AppShell>,
  );
}

const shell = (c: HTMLElement) => c.querySelector('[data-slot="shell"]')!;

describe("AppShell navigation styles", () => {
  beforeEach(() => localStorage.clear());

  it("sidebar is the default and renders as before", () => {
    const { container } = renderShell({});
    expect(shell(container).getAttribute("data-navigation")).toBe("sidebar");
    expect(screen.getByTestId("app-shell-sidebar").hasAttribute("data-collapsed")).toBe(false);
    expect(container.querySelector('[data-slot="shell-page-tree"]')).toBeNull();
    expect(screen.queryByTestId("app-shell-top-tabs")).toBeNull();
    // The phone's top bar and bottom bar stay phone-only.
    expect(container.querySelector('[data-slot="shell-header"]')!.className).toContain("md:hidden");
    expect(screen.getByTestId("app-shell-mobile-bottom-nav").className).toContain("md:hidden");
  });

  it("rail opens collapsed, and a page or the person can still open it", () => {
    renderShell({ navigation: "rail" });
    expect(screen.getByTestId("app-shell-sidebar").getAttribute("data-collapsed")).toBe("true");
    localStorage.clear();
  });

  it("rail yields to a page's own default", () => {
    render(
      <AppShell appName="Acme" navItems={items} activePath="/" options={{ ...chrome, navigation: "rail" }} defaultCollapsed={false}>
        <p>Page</p>
      </AppShell>,
    );
    expect(screen.getByTestId("app-shell-sidebar").hasAttribute("data-collapsed")).toBe(false);
  });

  it("top-tabs puts the top items in a bar across the top, and an active item's children in a second row", () => {
    const { container } = renderShell({ navigation: "top-tabs" }, "/docs/api");
    expect(screen.queryByTestId("app-shell-sidebar")).toBeNull();
    const bar = screen.getByTestId("app-shell-top-tabs");
    expect(bar.getAttribute("data-slot")).toBe("shell-top-tabs");
    const tabs = within(bar).getAllByRole("link").map((a) => a.textContent);
    expect(tabs).toEqual(["Home", "Docs", "Settings"]);
    expect(within(bar).getByRole("link", { name: "Docs" }).getAttribute("data-active")).toBe("true");
    const rows = container.querySelectorAll('[data-slot="sub-nav"]');
    expect(rows).toHaveLength(2);
    expect(within(rows[1] as HTMLElement).getByRole("link", { name: "API" }).getAttribute("aria-current")).toBe("page");
  });

  it("bottom-bar keeps the top bar, the drawer and the bottom bar on every width", () => {
    const { container } = renderShell({ navigation: "bottom-bar" });
    expect(screen.queryByTestId("app-shell-sidebar")).toBeNull();
    expect(container.querySelector('[data-slot="shell-header"]')!.className).not.toContain("md:hidden");
    const bottom = screen.getByTestId("app-shell-mobile-bottom-nav");
    expect(bottom.className).not.toContain("md:hidden");
    expect(within(bottom).getAllByRole("link").map((a) => a.textContent)).toEqual(["Home", "Settings"]);
  });

  it("page-tree nests every level, indented, opening the branch you are in", () => {
    const { container } = renderShell({ navigation: "page-tree" }, "/docs/guides/start");
    const tree = container.querySelector('[data-slot="shell-page-tree"]') as HTMLElement;
    expect(tree).not.toBeNull();
    const start = within(tree).getByRole("link", { name: "Start" });
    expect(start.getAttribute("data-depth")).toBe("2");
    expect(start.getAttribute("aria-current")).toBe("page");
    // A page with children is a link to itself, not current while a child is.
    expect(within(tree).getByRole("link", { name: "Docs" }).hasAttribute("aria-current")).toBe(false);
    // Collapse and reopen a branch.
    fireEvent.click(within(tree).getByRole("button", { name: "Collapse Guides" }));
    expect(within(tree).queryByRole("link", { name: "Start" })).toBeNull();
    fireEvent.click(within(tree).getByRole("button", { name: "Expand Guides" }));
    expect(within(tree).getByRole("link", { name: "Start" })).not.toBeNull();
  });

  it("page-tree starts closed away from a branch", () => {
    const { container } = renderShell({ navigation: "page-tree" }, "/settings");
    const tree = container.querySelector('[data-slot="shell-page-tree"]') as HTMLElement;
    expect(within(tree).queryByRole("link", { name: "Guides" })).toBeNull();
    expect(within(tree).getByRole("button", { name: "Expand Docs" }).getAttribute("aria-expanded")).toBe("false");
  });
});

describe("AppShell frame and density", () => {
  it("flush is the default; inset frames the page area over the sidebar's colour", () => {
    const flush = renderShell({});
    const flushFrame = flush.container.querySelector('[data-slot="shell-frame"]')!;
    expect(flushFrame.getAttribute("data-frame")).toBe("flush");
    expect(shell(flush.container).className).not.toContain("bg-sidebar");
    flush.unmount();

    const { container } = renderShell({ frame: "inset" });
    expect(shell(container).className).toContain("md:bg-sidebar");
    const frame = container.querySelector('[data-slot="shell-frame"]')!;
    for (const token of ["--shell-frame-gap", "--shell-frame-radius", "--shell-frame-border-width", "--shell-frame-shadow"])
      expect(frame.className).toContain(`var(${token})`);
    expect(screen.getByTestId("app-shell-sidebar").className).toContain("md:border-r-0");
  });

  it("spacious pads sidebar rows more than comfortable", () => {
    renderShell({ density: "spacious" });
    expect(within(screen.getByTestId("app-shell-sidebar")).getByRole("link", { name: "Settings" }).className).toContain("py-2.5");
  });
});

describe("navigation parts", () => {
  it("TabBar, SubNavTabs and PageHeader name their parts and the active item", () => {
    const { container } = render(
      <>
        <TabBar items={[{ key: "a", label: "A", icon: <Home /> }, { key: "b", label: "B", icon: <Home /> }]} value="b" onChange={() => {}} />
        <SubNavTabs items={[{ to: "/x", label: "X" }]} activePath="/x" linkComponent={(p) => <a {...p} />} />
        <PageHeader title="People" />
      </>,
    );
    expect(container.querySelector('[data-slot="tab-bar"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="tab-bar-item"][data-active]')?.textContent).toBe("B");
    expect(container.querySelector('[data-slot="sub-nav-item"][data-active]')?.textContent).toBe("X");
    expect(container.querySelector('[data-slot="page-header-title"]')?.textContent).toBe("People");
  });
});
