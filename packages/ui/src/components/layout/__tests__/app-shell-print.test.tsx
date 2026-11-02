/**
 * AppShell in print: navigation is chrome and stays off the page, and the content isn't clipped
 * to the screen's height, so a printed calendar sheet runs onto as many pages as it needs.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Home, Settings } from "lucide-react";

import { AppShell, type NavItem } from "../AppShell";

const navItems: NavItem[] = [
  { to: "/", icon: Home, label: "Home", end: true },
  { to: "/settings", icon: Settings, label: "Settings" },
];

describe("AppShell in print", () => {
  it("leaves its navigation off the printed page and lets the content run on", () => {
    render(
      <AppShell appName="Acme" appLogo="A" navItems={navItems} options={{ showThemeToggle: false, showCollapse: false, configurable: false }} activePath="/">
        <p>Sheet</p>
      </AppShell>,
    );
    expect(screen.getByTestId("app-shell-sidebar").className).toContain("print:hidden");
    expect(screen.getByTestId("app-shell-mobile-open").closest("header")!.className).toContain("print:hidden");
    const main = screen.getByText("Sheet").closest("main")!;
    expect(main.className).toContain("print:overflow-visible");
    expect(main.parentElement!.parentElement!.className).toContain("print:h-auto");
  });
});
