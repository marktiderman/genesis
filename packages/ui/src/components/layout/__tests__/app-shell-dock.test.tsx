/**
 * AppShell's `dock` slot: panels that stay open across pages (genesis-chat's ChatDock), fixed
 * bottom-right outside the page, clear of the phone's bottom bar, letting clicks through.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Home, Settings } from "lucide-react";

import { AppShell, type NavItem } from "../AppShell";

const chrome = { showThemeToggle: false, showCollapse: false, configurable: false };
const nav: NavItem[] = [
  { to: "/", icon: Home, label: "Home", end: true },
  { to: "/settings", icon: Settings, label: "Settings" },
];

describe("AppShell dock", () => {
  it("renders nothing for the dock without one", () => {
    render(
      <AppShell appName="Acme" navItems={nav} options={chrome}>
        <p>Page</p>
      </AppShell>,
    );
    expect(screen.queryByTestId("app-shell-dock")).toBeNull();
  });

  it("puts the dock outside the page, fixed bottom-right, lifted over the phone's bottom bar", () => {
    render(
      <AppShell appName="Acme" navItems={nav} options={chrome} dock={<div data-testid="my-dock">Dock</div>}>
        <p>Page</p>
      </AppShell>,
    );
    const region = screen.getByTestId("app-shell-dock");
    expect(region.contains(screen.getByTestId("my-dock"))).toBe(true);
    expect(region.closest("main")).toBeNull();
    expect(region.className).toContain("fixed");
    expect(region.className).toContain("pointer-events-none");
    expect(region.className).toContain("bottom-[calc(4rem+env(safe-area-inset-bottom))]");
    expect(region.className).toContain("md:bottom-0");
  });

  it("sits at the bottom edge when the phone's bottom bar is off", () => {
    render(
      <AppShell appName="Acme" navItems={nav} options={{ ...chrome, showMobileBottomNav: false }} dock={<div />}>
        <p>Page</p>
      </AppShell>,
    );
    expect(screen.getByTestId("app-shell-dock").className).not.toContain("4rem");
  });
});
