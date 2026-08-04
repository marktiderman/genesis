/**
 * Smoke tests for PageHeader + AppShell “customize chrome” options.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Compass, LayoutDashboard, Map } from "lucide-react";

import { PageHeader } from "../PageHeader";
import { AppShell } from "../AppShell";

describe("PageHeader options", () => {
  it("renders a single-row chrome cluster with details toggle + options", () => {
    render(
      <PageHeader
        title="Genesis map"
        icon={Compass}
        count={3}
        totalCount={10}
        entityName="row"
        details={<div>filters</div>}
        detailsHint="hint"
        pageSize={25}
        onPageSizeChange={() => {}}
        density="comfortable"
        onDensityChange={() => {}}
        options={{ configurable: true }}
      />,
    );

    expect(screen.getByTestId("page-title").textContent).toContain(
      "Genesis map",
    );
    expect(screen.getByTestId("page-header-details-toggle")).toBeTruthy();
    expect(screen.getByTestId("page-header-options")).toBeTruthy();
    expect(screen.queryByText("filters")).toBeNull();

    fireEvent.click(screen.getByTestId("page-header-details-toggle"));
    expect(screen.getByText("filters")).toBeTruthy();
  });

  it("uses the singular entity in the count badge at exactly one", () => {
    render(
      <PageHeader
        title="Rows"
        count={1}
        totalCount={1}
        entityName="row"
        options={{ configurable: false }}
      />,
    );

    expect(screen.getByText("1 row")).toBeTruthy();
    expect(screen.queryByText("1 rows")).toBeNull();
  });
});

describe("AppShell options", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("exposes collapse + sidebar options controls", () => {
    render(
      <AppShell
        appName="Genesis"
        appLogo="G"
        navItems={[
          { to: "/", icon: LayoutDashboard, label: "Overview", end: true },
          { to: "/map", icon: Map, label: "Map" },
        ]}
        secondaryNavItems={[
          { to: "/health", icon: Compass, label: "Health" },
        ]}
        options={{
          showThemeToggle: false,
          showCollapse: true,
          configurable: true,
        }}
      >
        <div>content</div>
      </AppShell>,
    );

    expect(screen.getByTestId("app-shell-sidebar")).toBeTruthy();
    expect(screen.getByTestId("app-shell-collapse")).toBeTruthy();
    expect(screen.getByTestId("app-shell-options")).toBeTruthy();
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("keeps a parent link for nav groups that have their own route", () => {
    render(
      <AppShell
        appName="Genesis"
        appLogo="G"
        navItems={[
          {
            to: "/gitdata",
            icon: LayoutDashboard,
            label: "Gitdata",
            children: [{ to: "/gitdata/features", icon: Map, label: "Features" }],
          },
        ]}
        options={{ showThemeToggle: false, showCollapse: false, configurable: false }}
        activePath="/gitdata"
      >
        <div>content</div>
      </AppShell>,
    );

    const parent = screen.getAllByRole("link", { name: "Gitdata" })[0]!;
    expect(parent.getAttribute("href")).toBe("/gitdata");
    expect(parent.getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByTestId("nav-group-toggle-Gitdata").length).toBeGreaterThan(0);
  });

  it("sets aria-current only on the exact parent route, not child prefixes", () => {
    render(
      <AppShell
        appName="Genesis"
        appLogo="G"
        navItems={[
          {
            to: "/gitdata",
            icon: LayoutDashboard,
            label: "Gitdata",
            children: [
              { to: "/gitdata/features", icon: Map, label: "Features" },
            ],
          },
        ]}
        options={{ showThemeToggle: false, showCollapse: false, configurable: false }}
        activePath="/gitdata/features"
      >
        <div>content</div>
      </AppShell>,
    );

    const parent = screen.getAllByRole("link", { name: "Gitdata" })[0]!;
    const child = screen.getAllByRole("link", { name: "Features" })[0]!;
    expect(parent.getAttribute("aria-current")).toBeNull();
    expect(child.getAttribute("aria-current")).toBe("page");
  });

  it("omits disabled items from the mobile bottom dock", () => {
    render(
      <AppShell
        appName="Genesis"
        appLogo="G"
        navItems={[
          { to: "/", icon: LayoutDashboard, label: "Overview", end: true },
          { to: "/map", icon: Map, label: "Map", disabled: true },
        ]}
        mobileNavItems={[
          { to: "/", icon: LayoutDashboard, label: "Overview", end: true },
          { to: "/map", icon: Map, label: "Map", disabled: true },
        ]}
        options={{
          showThemeToggle: false,
          showCollapse: false,
          configurable: false,
          showMobileBottomNav: true,
        }}
      >
        <div>content</div>
      </AppShell>,
    );

    const dock = screen.getByRole("navigation", { name: "Primary" });
    expect(dock.querySelectorAll("a")).toHaveLength(1);
    expect(dock.textContent).toContain("Overview");
    expect(dock.textContent).not.toContain("Map");
  });

  it("keeps the closed mobile drawer out of the tab order", () => {
    const { container } = render(
      <AppShell
        appName="Genesis"
        appLogo="G"
        navItems={[
          { to: "/", icon: LayoutDashboard, label: "Overview", end: true },
        ]}
        options={{ showThemeToggle: false, configurable: false }}
      >
        <div>content</div>
      </AppShell>,
    );

    const drawer = container.querySelector("#app-shell-mobile-nav")!;
    expect(drawer.getAttribute("aria-hidden")).toBe("true");
    expect(drawer.hasAttribute("inert")).toBe(true);
  });

  it("hydrates persisted overrides and persists collapse under :collapsed", () => {
    localStorage.setItem(
      "test-shell",
      JSON.stringify({ showFooter: false }),
    );
    render(
      <AppShell
        appName="Genesis"
        appLogo="G"
        navItems={[
          { to: "/", icon: LayoutDashboard, label: "Overview", end: true },
        ]}
        optionsStorageKey="test-shell"
        footer={<div>footer-slot</div>}
        options={{ showThemeToggle: false, showCollapse: true, configurable: true }}
      >
        <div>content</div>
      </AppShell>,
    );

    // Stored override (showFooter:false) hydrated → footer hidden.
    expect(screen.queryByText("footer-slot")).toBeNull();

    fireEvent.click(screen.getByTestId("app-shell-collapse"));
    expect(localStorage.getItem("test-shell:collapsed")).toBe("1");
  });

  it("locks options out of the popover and ignores stored overrides", () => {
    // A stale/hand-edited override tries to re-enable the theme toggle.
    localStorage.setItem(
      "locked-shell",
      JSON.stringify({ showThemeToggle: true }),
    );
    render(
      <AppShell
        appName="Genesis"
        appLogo="G"
        navItems={[
          { to: "/", icon: LayoutDashboard, label: "Overview", end: true },
        ]}
        optionsStorageKey="locked-shell"
        options={{
          showThemeToggle: false,
          lockedOptions: ["showThemeToggle"],
          showCollapse: true,
          configurable: true,
        }}
      >
        <div>content</div>
      </AppShell>,
    );

    // Locked to the developer default (false) despite the stored `true`.
    expect(screen.queryByTestId("app-shell-theme-toggle-desktop")).toBeNull();
  });
});
