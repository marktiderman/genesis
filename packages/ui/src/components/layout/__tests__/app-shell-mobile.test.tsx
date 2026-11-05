/**
 * AppShell on a phone (docs/MOBILE.md): the drawer is a real modal, and the bottom bar keeps
 * five readable slots, clear of the home indicator.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { Calendar, FileText, Home, Inbox, LayoutDashboard, Settings, Users } from "lucide-react";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../../ui/dialog";
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

/** A `matchMedia` whose md query can be flipped, firing `change` like a browser does. */
function controllableMedia() {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let wide = false;
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes("min-width: 768px") ? wide : false;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => listeners.delete(fn),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
  return {
    widen() {
      wide = true;
      act(() => {
        for (const fn of [...listeners]) fn({ matches: true, media: "(min-width: 768px)" } as MediaQueryListEvent);
      });
    },
    restore() {
      window.matchMedia = original;
    },
  };
}

describe("AppShell phone drawer", () => {
  beforeEach(() => localStorage.clear());

  /** Escape where a keyboard sends it: the focused element, bubbling to the document. */
  function escape() {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  }

  function open() {
    const opener = screen.getByTestId("app-shell-mobile-open");
    opener.focus();
    fireEvent.click(opener);
    return screen.getByTestId("app-shell-mobile-nav");
  }

  it("opens as a modal dialog with focus on its close button", () => {
    renderShell(three);
    const drawer = open();
    expect(drawer.getAttribute("role")).toBe("dialog");
    expect(screen.getByRole("dialog", { name: "Navigation" })).toBe(drawer);
    expect(document.activeElement).toBe(screen.getByTestId("app-shell-mobile-close"));
  });

  it("hides the page behind from assistive tech and locks its scroll", () => {
    renderShell(three);
    open();
    expect(screen.getByText("Page action").closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByTestId("app-shell-sidebar").closest('[aria-hidden="true"]')).not.toBeNull();
    // react-remove-scroll, through Radix: it stacks with other locks and pads for the scrollbar.
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(true);
  });

  it("traps focus, including away from things outside the shell such as a toast", () => {
    const toast = document.createElement("button");
    toast.textContent = "Toast action";
    document.body.appendChild(toast);
    try {
      renderShell(three);
      const drawer = open();
      // Focus moving out of the drawer (a toast, a portal, the page) is pulled back in.
      act(() => toast.focus());
      expect(drawer.contains(document.activeElement)).toBe(true);
      act(() => screen.getByTestId("app-shell-mobile-open").focus());
      expect(drawer.contains(document.activeElement)).toBe(true);
    } finally {
      toast.remove();
    }
  });

  it("closes on Escape and hands focus back to the menu button", async () => {
    renderShell(three);
    open();
    escape();
    expect(screen.queryByTestId("app-shell-mobile-nav")).toBeNull();
    // Radix returns focus on the tick after the drawer unmounts.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("app-shell-mobile-open")));
    expect(screen.getByText("Page action").closest('[aria-hidden="true"]')).toBeNull();
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
  });

  it("closes only a dialog opened from the drawer on Escape, not the drawer too", () => {
    function Footer() {
      const [opened, setOpened] = useState(false);
      return (
        <Dialog open={opened} onOpenChange={setOpened}>
          <DialogTrigger asChild>
            <button type="button">Account</button>
          </DialogTrigger>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>Account</DialogTitle>
          </DialogContent>
        </Dialog>
      );
    }
    render(
      <AppShell appName="Acme" appLogo="A" navItems={three} options={chrome} activePath="/" footer={<Footer />}>
        <p>Page</p>
      </AppShell>,
    );
    open();
    fireEvent.click(within(screen.getByTestId("app-shell-mobile-nav")).getByRole("button", { name: "Account" }));
    expect(screen.getByRole("dialog", { name: "Account" })).toBeTruthy();
    escape();
    expect(screen.queryByRole("dialog", { name: "Account" })).toBeNull();
    expect(screen.getByTestId("app-shell-mobile-nav")).toBeTruthy();
    escape();
    expect(screen.queryByTestId("app-shell-mobile-nav")).toBeNull();
  });

  it("hands focus to the menu button after a drawer link navigates", async () => {
    renderShell(three);
    const drawer = open();
    const link = within(drawer).getByRole("link", { name: "Clients" });
    act(() => link.focus());
    fireEvent.click(link);
    expect(screen.queryByTestId("app-shell-mobile-nav")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("app-shell-mobile-open")));
  });

  it("closes when the route changes", () => {
    const { rerender } = renderShell(three);
    open();
    rerender(
      <AppShell appName="Acme" appLogo="A" navItems={three} options={chrome} activePath="/clients">
        <button type="button">Page action</button>
      </AppShell>,
    );
    expect(screen.queryByTestId("app-shell-mobile-nav")).toBeNull();
  });

  it("closes when the viewport widens past the phone breakpoint", () => {
    const media = controllableMedia();
    try {
      renderShell(three);
      open();
      media.widen();
      expect(screen.queryByTestId("app-shell-mobile-nav")).toBeNull();
    } finally {
      media.restore();
    }
  });

  it("hands focus to the desktop sidebar's toggle when the viewport widens with the drawer open", async () => {
    const media = controllableMedia();
    try {
      render(
        <AppShell appName="Acme" appLogo="A" navItems={three} options={{ ...chrome, showCollapse: true }} activePath="/">
          <button type="button">Page action</button>
        </AppShell>,
      );
      open();
      media.widen();
      expect(screen.queryByTestId("app-shell-mobile-nav")).toBeNull();
      // Not the menu button: it sits in the phone header, hidden from md up.
      await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("app-shell-collapse")));
    } finally {
      media.restore();
    }
  });

  it("counts as an open dialog, so the shell's keyboard shortcuts stand down", () => {
    renderShell(three);
    open();
    expect(document.querySelector('[role="dialog"][data-state="open"]')).toBe(
      screen.getByTestId("app-shell-mobile-nav"),
    );
  });

  it("keeps the drawer's look and gives every row and button a 44px minimum", () => {
    renderShell(three);
    const cls = (open().getAttribute("class") ?? "").split(/\s+/);
    expect(cls).toContain("w-72");
    expect(cls).toContain("max-w-[85vw]");
    expect(cls).toContain("bg-sidebar");
    expect(cls).toContain("pt-[env(safe-area-inset-top)]");
    expect(cls).toContain("[&_a]:min-h-11");
    expect(cls).toContain("[&_button]:min-h-11");
    expect(cls).not.toContain("w-3/4");
    expect(cls).not.toContain("p-6");
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
    expect(screen.getByTestId("app-shell-mobile-more").className).toContain("text-primary-text");
  });

  it("names the More button for screen readers when the current page is under it", () => {
    renderShell(seven, "/data");
    const more = screen.getByTestId("app-shell-mobile-more");
    expect(more.getAttribute("aria-label")).toBe("More, includes the current page");
    expect(screen.getByRole("button", { name: "More, includes the current page" })).toBe(more);
  });

  it("leaves the More button plain when the current page is in the bar", () => {
    renderShell(seven, "/clients");
    expect(screen.getByTestId("app-shell-mobile-more").hasAttribute("aria-label")).toBe(false);
    expect(screen.getByRole("button", { name: "More" })).toBeTruthy();
  });

  it("closes the More sheet when the viewport widens, so the page isn't left frozen", () => {
    const media = controllableMedia();
    try {
      renderShell(seven);
      fireEvent.click(screen.getByTestId("app-shell-mobile-more"));
      expect(screen.getByTestId("app-shell-mobile-more-sheet")).toBeTruthy();
      media.widen();
      expect(screen.queryByTestId("app-shell-mobile-more-sheet")).toBeNull();
      expect(document.body.style.pointerEvents).not.toBe("none");
    } finally {
      media.restore();
    }
  });

  it("hides the More sheet's scrim from the md breakpoint up", () => {
    renderShell(seven);
    fireEvent.click(screen.getByTestId("app-shell-mobile-more"));
    const overlay = document.querySelector('[data-state="open"].fixed.inset-0');
    expect(overlay?.className).toContain("md:hidden");
  });
});
