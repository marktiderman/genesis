// @feat:app-shell
/**
 * Sub-navigation at any depth: a tabbed level inside another adds a second,
 * quieter row (a segmented control on a phone); a third folds the outer rows
 * into a breadcrumb; a `list` level draws a list beside the page (a list
 * page, then the item, on a phone); a `hub` level draws cards on its own
 * page; `phoneTabs: "top"` keeps tab rows at the top on a phone; and
 * `headerItems` are the top bar's links.
 */
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Home, Megaphone, Package, Settings } from "lucide-react";

import { AppShell, type AppShellProps, type NavItem } from "../AppShell";
import { layoutSubNavLevels, type SubNavLevel } from "../sub-nav";
import type { NavigationNode } from "../../../navigation";

const opts = { showThemeToggle: false, configurable: false };

const products: NavItem[] = [
  { to: "/products/offers", icon: Package, label: "Offers" },
  { to: "/products/catalog", icon: Package, label: "Catalog" },
];
const offers: NavItem[] = [
  { to: "/products/offers", icon: Package, label: "All", end: true },
  { to: "/products/offers/drafts", icon: Package, label: "Drafts" },
];
const draftViews: NavItem[] = [
  { to: "/products/offers/drafts", icon: Package, label: "Mine", end: true },
  { to: "/products/offers/drafts/shared", icon: Package, label: "Shared" },
];

function treeWith(
  overrides: { products?: Partial<NavigationNode<NavItem>>; offers?: Partial<NavigationNode<NavItem>>; drafts?: NavItem[] } = {},
): NavigationNode<NavItem> {
  return {
    id: "app",
    path: "/",
    label: "Home",
    items: [
      { to: "/", icon: Home, label: "Home", end: true },
      { to: "/products", icon: Package, label: "Products" },
      { to: "/marketing", icon: Megaphone, label: "Marketing" },
    ],
    children: [
      {
        id: "products",
        path: "/products",
        label: "Products",
        items: products,
        subNav: "tabs",
        ...overrides.products,
        children: [
          {
            id: "offers",
            path: "/products/offers",
            label: "Offers",
            items: offers,
            ...overrides.offers,
            children: [{ id: "drafts", path: "/products/offers/drafts", label: "Drafts", items: overrides.drafts ?? [] }],
          },
        ],
      },
      {
        id: "marketing",
        path: "/marketing",
        label: "Marketing",
        subNav: "hub",
        items: [
          { to: "/marketing/campaigns", icon: Megaphone, label: "Campaigns" },
          { to: "/marketing/emails", icon: Megaphone, label: "Emails" },
        ],
      },
      {
        id: "settings",
        path: "/settings",
        label: "Settings",
        subNav: "list",
        items: [
          { to: "/settings/profile", icon: Settings, label: "Profile" },
          { to: "/settings/billing", icon: Settings, label: "Billing" },
        ],
      },
    ],
  };
}

function renderShell(activePath: string, props: Partial<AppShellProps> = {}) {
  return render(
    <AppShell appName="Acme" navigation={treeWith()} options={opts} activePath={activePath} {...props}>
      <div>content</div>
    </AppShell>,
  );
}

const hrefs = (scope: HTMLElement) => within(scope).getAllByRole("link").map((a) => a.getAttribute("href"));
const current = (scope: HTMLElement) =>
  within(scope)
    .getAllByRole("link")
    .filter((a) => a.getAttribute("aria-current") === "page")
    .map((a) => a.textContent);
const bottomBar = () => screen.getByRole("navigation", { name: "Primary" });

beforeEach(() => localStorage.clear());

describe("layoutSubNavLevels", () => {
  const level = (label: string, mode: SubNavLevel["mode"], n = 2): SubNavLevel => ({
    label,
    mode,
    items: Array.from({ length: n }, (_, i) => ({ to: `/${label}/${i}`, label: `${label}${i}` })),
  });

  it("stacks two tab rows at most and folds the outer ones into the breadcrumb", () => {
    const out = layoutSubNavLevels([level("a", "tabs"), level("b", "tabs"), level("c", "tabs"), level("d", "tabs")]);
    expect(out.folded.map((l) => l.label)).toEqual(["a", "b"]);
    expect(out.rows.map((l) => l.label)).toEqual(["c", "d"]);
  });

  it("leaves out levels without items, and picks the innermost list and hub", () => {
    const out = layoutSubNavLevels([level("a", "list"), level("b", "tabs", 0), level("c", "list"), level("d", "hub")]);
    expect(out.rows).toEqual([]);
    expect(out.list?.label).toBe("c");
    expect(out.hub?.label).toBe("d");
  });
});

describe("tabs at any depth", () => {
  it("a tabbed level inside another shows a primary row and a quieter second row", () => {
    renderShell("/products/offers/drafts");
    const primary = screen.getByRole("navigation", { name: "Products" });
    expect(hrefs(primary)).toEqual(["/products/offers", "/products/catalog"]);
    expect(current(primary)).toEqual(["Offers"]);
    const secondary = screen.getByTestId("app-shell-sub-nav-secondary");
    expect(secondary.getAttribute("data-variant")).toBe("secondary");
    expect(current(secondary)).toEqual(["Drafts"]);
  });

  it("the second row is a segmented control on a phone", () => {
    renderShell("/products/offers/drafts");
    const segmented = screen.getByTestId("app-shell-sub-nav-segmented");
    expect(segmented.className).toContain("md:hidden");
    expect(current(segmented)).toEqual(["Drafts"]);
  });

  it("a third tabbed level folds the outer row into a breadcrumb picker: never more than two rows", () => {
    render(
      <AppShell
        appName="Acme"
        navigation={treeWith({ drafts: draftViews })}
        options={opts}
        activePath="/products/offers/drafts/shared"
      >
        <div>content</div>
      </AppShell>,
    );
    const crumb = screen.getByTestId("app-shell-sub-nav-breadcrumb");
    expect(within(crumb).getByRole("button", { name: "Products: Offers" })).toBeTruthy();
    expect(screen.getAllByTestId(/^app-shell-sub-nav(-secondary)?$/)).toHaveLength(2);
    expect(current(screen.getByRole("navigation", { name: "Offers" }))).toEqual(["Drafts"]);
    expect(current(screen.getByTestId("app-shell-sub-nav-secondary"))).toEqual(["Shared"]);
  });

  it("an outer level shows only on the way through one of its items", () => {
    renderShell("/products");
    // At Products itself, only its own row: Offers' items aren't the way here.
    expect(screen.queryByTestId("app-shell-sub-nav-secondary")).toBeNull();
    expect(hrefs(screen.getByRole("navigation", { name: "Products" }))).toEqual(["/products/offers", "/products/catalog"]);
  });
});

describe("phones: phoneTabs", () => {
  it('"bottom" (default): the first row becomes the bottom bar, led by a back item', () => {
    renderShell("/products/offers/drafts");
    const links = within(bottomBar()).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual(["Back to Home", "Offers", "Catalog"]);
    // The primary row is hidden on phones; the bar carries it.
    expect(screen.getByRole("navigation", { name: "Products" }).closest("div.px-4")?.className).toContain("hidden md:block");
  });

  it('"top": tab rows stay at the top and the bottom bar keeps the app\'s items', () => {
    renderShell("/products/offers/drafts", { options: { ...opts, phoneTabs: "top" } });
    expect(hrefs(bottomBar())).toEqual(["/", "/products", "/marketing"]);
    const rowWrap = screen.getByRole("navigation", { name: "Products" }).closest("div.px-4");
    expect(rowWrap?.className).not.toContain("hidden");
  });
});

describe("phones: the bar, its back item and the content's parent link", () => {
  it("an outer row in the bar goes back to that level's own parent; an app's parentNavigation still wins", () => {
    const { unmount } = renderShell("/products/offers/drafts");
    expect(screen.getByTestId("app-shell-mobile-back").getAttribute("href")).toBe("/");
    unmount();
    renderShell("/products/offers/drafts", { parentNavigation: { href: "/somewhere", label: "Somewhere" } });
    expect(screen.getByTestId("app-shell-mobile-back").getAttribute("href")).toBe("/somewhere");
  });

  it("keeps the outer row on the page when the bar can't carry it (every item hideOnPhone)", () => {
    const hidden = products.map((item) => ({ ...item, hideOnPhone: true }));
    render(
      <AppShell appName="Acme" navigation={treeWith({ products: { items: hidden } })} options={opts} activePath="/products/offers/drafts">
        <div>content</div>
      </AppShell>,
    );
    expect(hrefs(bottomBar())).toEqual(["/", "/products", "/marketing"]);
    const rowWrap = screen.getByRole("navigation", { name: "Products" }).closest("div.px-4");
    expect(rowWrap?.className).not.toContain("hidden");
  });

  it("leaves out the content's parent link when that parent's row already shows", () => {
    renderShell("/products/offers/drafts");
    // The parent here is Offers, whose row (the second) shows.
    expect(screen.queryByTestId("app-shell-parent-link")).toBeNull();
  });

  it("keeps the parent link when the parent's row has no way to the parent's own page", () => {
    // Offers' row without its "All" item: nothing in it leads to /products/offers itself.
    render(
      <AppShell
        appName="Acme"
        navigation={treeWith({ offers: { items: offers.filter((item) => item.label !== "All") } })}
        options={opts}
        activePath="/products/offers/drafts"
      >
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "Back to Offers" }).getAttribute("href")).toBe("/products/offers");
  });

  it('"top" with a sidebar-mode page under a tabbed parent: the row stays at the top, the bar keeps the page\'s children', () => {
    render(
      <AppShell
        appName="Acme"
        navigation={treeWith({ offers: { subNav: "sidebar" } })}
        options={{ ...opts, phoneTabs: "top" }}
        activePath="/products/offers"
      >
        <div>content</div>
      </AppShell>,
    );
    const rowWrap = screen.getByRole("navigation", { name: "Products" }).closest("div.px-4");
    expect(rowWrap?.className).not.toContain("hidden");
    // Offers draws its children as sidebar sub-items, which the phone bar carries as before.
    expect(within(bottomBar()).getAllByRole("link").map((a) => a.getAttribute("aria-label"))).toEqual([
      "Back to Products",
      "All",
      "Drafts",
    ]);
  });
});

describe("list and hub", () => {
  it("list: a column beside the page on a wide screen, the item with a link back on a phone", () => {
    renderShell("/settings/billing");
    const lists = screen.getAllByTestId("app-shell-sub-nav-list");
    expect(lists).toHaveLength(1);
    expect(lists[0]!.className).toContain("md:block");
    expect(current(lists[0]!)).toEqual(["Billing"]);
    const back = screen.getByTestId("app-shell-sub-nav-list-back");
    expect(back.getAttribute("href")).toBe("/settings");
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("list: the level's own page on a phone is the list", () => {
    renderShell("/settings");
    const page = screen.getAllByTestId("app-shell-sub-nav-list").find((n) => n.getAttribute("data-variant") === "page");
    expect(page?.className).toContain("md:hidden");
    expect(hrefs(page!)).toEqual(["/settings/profile", "/settings/billing"]);
    expect(screen.queryByTestId("app-shell-sub-nav-list-back")).toBeNull();
  });

  it("list: leaves the bottom bar to the app", () => {
    renderShell("/settings/billing");
    expect(hrefs(bottomBar())).toEqual(["/", "/products", "/marketing"]);
  });

  it("hub: cards on the level's own page, none once a child is open", () => {
    const { unmount } = renderShell("/marketing");
    const hub = screen.getByTestId("app-shell-sub-nav-hub");
    expect(hrefs(hub)).toEqual(["/marketing/campaigns", "/marketing/emails"]);
    unmount();
    renderShell("/marketing/emails");
    expect(screen.queryByTestId("app-shell-sub-nav-hub")).toBeNull();
  });

  it("keeps the page mounted when a list level comes and goes", () => {
    const { rerender } = renderShell("/");
    const page = screen.getByText("content");
    rerender(
      <AppShell appName="Acme" navigation={treeWith()} options={opts} activePath="/settings/billing">
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getByText("content")).toBe(page);
  });
});

describe("headerItems: the top bar's links", () => {
  const headerItems: NavItem[] = [{ to: "/help", icon: Home, label: "Help" }];

  it("draws them above the page on a wide screen and in the phone's drawer", () => {
    renderShell("/", { headerItems });
    const top = screen.getByTestId("app-shell-header-items");
    expect(hrefs(top)).toEqual(["/help"]);
    expect(top.closest("div")?.className).toContain("md:flex");
  });

  it('puts them in the top-tabs bar with navigation: "top-tabs"', () => {
    renderShell("/", { headerItems, options: { ...opts, navigation: "top-tabs" } });
    const bar = screen.getByTestId("app-shell-top-tabs");
    expect(hrefs(within(bar).getByTestId("app-shell-header-items"))).toEqual(["/help"]);
  });

  it("marks the current one", () => {
    renderShell("/help", { headerItems });
    expect(current(screen.getByTestId("app-shell-header-items"))).toEqual(["Help"]);
  });
});
