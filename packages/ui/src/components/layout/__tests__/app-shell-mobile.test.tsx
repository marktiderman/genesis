/**
 * AppShell on a phone (docs/MOBILE.md): the drawer is a real modal, and the bottom bar keeps
 * five readable slots, clear of the home indicator.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Calendar, FileText, Home, Inbox, LayoutDashboard, Settings, Users } from "lucide-react";

import { AppShell, type NavItem } from "../AppShell";

const chrome = { showThemeToggle: false, showCollapse: false, configurable: false };

function renderShell(navItems: NavItem[], activePath = "/") {
  return render(
    <AppShell appName="Acme" appLogo="A" navItems={navItems} options={chrome} activePath={activePath}>
      <button type="button">Page action</button>
    </AppShell>,
  );
}

const three: NavItem[] = [
  { to: "/", icon: Home, label: "Home", end: true },
  { to: "/clients", icon: Users, label: "Clients" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const seven: NavItem[] = [
  { to: "/", icon: Home, label: "Overview", end: true },
  { to: "/clients", icon: Users, label: "Clients" },
  { to: "/bookings", icon: Calendar, label: "Bookings" },
  { to: "/intake", icon: FileText, label: "Intake form" },
  { to: "/messages", icon: Inbox, label: "Messages" },
  { to: "/assistant", icon: LayoutDashboard, label: "Assistant" },
  { to: "/data", icon: Settings, label: "Data" },
];

describe("AppShell phone drawer", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.style.overflow = "";
  });

  function open() {
    fireEvent.click(screen.getByTestId("app-shell-mobile-open"));
    return screen.getByTestId("app-shell-mobile-nav");
  }

  it("opens as a modal dialog with focus inside it", () => {
    renderShell(three);
    const drawer = open();
    expect(drawer.getAttribute("role")).toBe("dialog");
    expect(drawer.getAttribute("aria-modal")).toBe("true");
    expect(drawer.contains(document.activeElement)).toBe(true);
  });

  it("makes the page behind unreachable and stops it scrolling", () => {
    renderShell(three);
    open();
    const page = screen.getByText("Page action");
    expect(page.closest("[inert]")).not.toBeNull();
    expect(screen.getByTestId("app-shell-sidebar").hasAttribute("inert")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("closes on Escape and hands focus back to the menu button", () => {
    renderShell(three);
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    const drawer = screen.getByTestId("app-shell-mobile-nav");
    expect(drawer.getAttribute("role")).toBeNull();
    expect(drawer.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(screen.getByTestId("app-shell-mobile-open"));
    expect(screen.getByText("Page action").closest("[inert]")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("gives every row and button in the drawer a 44px minimum", () => {
    renderShell(three);
    const cls = (open().getAttribute("class") ?? "").split(/\s+/);
    expect(cls).toContain("[&_a]:min-h-11");
    expect(cls).toContain("[&_button]:min-h-11");
  });
});

describe("AppShell phone bottom bar", () => {
  beforeEach(() => localStorage.clear());

  it("pads above the home indicator", () => {
    renderShell(three);
    const bar = screen.getByTestId("app-shell-mobile-bottom-nav");
    expect(bar.className).toContain("pb-[env(safe-area-inset-bottom)]");
  });

  it("shows every item when they fit in five slots", () => {
    renderShell(three);
    const bar = screen.getByTestId("app-shell-mobile-bottom-nav");
    expect(within(bar).getAllByRole("link")).toHaveLength(3);
    expect(within(bar).queryByTestId("app-shell-mobile-more")).toBeNull();
  });

  it("puts the rest under More past five slots", () => {
    renderShell(seven);
    const bar = screen.getByTestId("app-shell-mobile-bottom-nav");
    expect(within(bar).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Overview",
      "Clients",
      "Bookings",
      "Intake form",
    ]);
    fireEvent.click(within(bar).getByTestId("app-shell-mobile-more"));
    const sheet = screen.getByTestId("app-shell-mobile-more-sheet");
    expect(within(sheet).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Messages",
      "Assistant",
      "Data",
    ]);
  });

  it("highlights More when the current page is one of the items under it", () => {
    renderShell(seven, "/data");
    expect(screen.getByTestId("app-shell-mobile-more").className).toContain("text-primary");
  });
});
