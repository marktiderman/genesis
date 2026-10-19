/**
 * AppShell active state when `activePath` carries `?search#hash`
 * (pathname + search + hash, as `isPathActive` supports).
 */
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LayoutDashboard, Map, Users } from "lucide-react";

import { AppShell, type NavItem } from "../AppShell";

const chrome = { showThemeToggle: false, showCollapse: false, configurable: false };

function renderShell(navItems: NavItem[], activePath: string) {
  return render(
    <AppShell appName="Genesis" appLogo="G" navItems={navItems} options={chrome} activePath={activePath}>
      <div>content</div>
    </AppShell>,
  );
}

// Scope to the sidebar: the mobile bottom dock renders the same links again.
function currentOf(name: string) {
  return within(screen.getByTestId("app-shell-sidebar"))
    .getByRole("link", { name })
    .getAttribute("aria-current");
}

describe("AppShell `end` items with a query/hash-aware activePath", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const items: NavItem[] = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", end: true },
    { to: "/clients", icon: Users, label: "Clients" },
  ];

  it("stays active when the location adds a query", () => {
    renderShell(items, "/dashboard?page=2");
    expect(currentOf("Dashboard")).toBe("page");
    expect(currentOf("Clients")).toBeNull();
  });

  it("stays active when the location adds a hash", () => {
    renderShell(items, "/dashboard#recent");
    expect(currentOf("Dashboard")).toBe("page");
  });

  it("is still exact on the path", () => {
    renderShell(items, "/dashboard/reports?page=2");
    expect(currentOf("Dashboard")).toBeNull();
  });

  it("matches an `end` item whose `to` names a query by param, not string", () => {
    const admin: NavItem[] = [
      { to: "/admin?tab=users", icon: Users, label: "Users", end: true },
      { to: "/admin?tab=clients", icon: Map, label: "Admin clients", end: true },
    ];
    renderShell(admin, "/admin?page=2&tab=users");
    expect(currentOf("Users")).toBe("page");
    expect(currentOf("Admin clients")).toBeNull();
  });
});

describe("AppShell nav group parent with a query/hash-aware activePath", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const group = (end?: boolean): NavItem[] => [
    {
      to: "/gitdata",
      icon: LayoutDashboard,
      label: "Gitdata",
      end,
      children: [{ to: "/gitdata/features", icon: Map, label: "Features" }],
    },
  ];

  it("keeps aria-current on the parent route when the location adds a query", () => {
    renderShell(group(), "/gitdata?tab=open");
    expect(currentOf("Gitdata")).toBe("page");
  });

  it("keeps aria-current on an `end` parent when the location adds a hash", () => {
    renderShell(group(true), "/gitdata#top");
    expect(currentOf("Gitdata")).toBe("page");
  });

  it("still leaves aria-current on the child only for a child route (CMT-322-008)", () => {
    renderShell(group(), "/gitdata/features?page=2");
    expect(currentOf("Gitdata")).toBeNull();
    expect(currentOf("Features")).toBe("page");
  });
});
