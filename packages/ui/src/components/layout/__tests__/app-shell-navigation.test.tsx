/**
 * AppShell `navigation`: sidebar, contextual section, mobile tab bar and the
 * parent link all derived from one `NavigationNode` tree.
 */
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { CheckSquare, FileText, LayoutDashboard, Plus, Users } from "lucide-react";

import { AppShell, type NavItem } from "../AppShell";
import type { NavigationNode } from "../../../navigation";

const chrome = { showThemeToggle: false, showCollapse: false, configurable: false };

const tree: NavigationNode<NavItem> = {
  id: "app",
  path: "/",
  label: "Home",
  items: [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/clients", icon: Users, label: "Clients" },
  ],
  children: [
    {
      id: "clients",
      path: "/clients",
      label: "Clients",
      items: [],
      children: [
        {
          id: "client",
          path: "/clients/$clientId",
          label: "Client",
          items: [
            { to: "/clients/$clientId", icon: FileText, label: "Overview", end: true },
            { to: "/clients/$clientId/tasks", icon: CheckSquare, label: "Tasks" },
          ],
        },
        { id: "new-client", path: "/clients/new", label: "New client", items: [] },
      ],
    },
  ],
};

function renderShell(activePath: string, props: Partial<Parameters<typeof AppShell>[0]> = {}) {
  return render(
    <AppShell appName="Genesis" navigation={tree} options={chrome} activePath={activePath} {...props}>
      <div>content</div>
    </AppShell>,
  );
}

const sidebar = () => within(screen.getByTestId("app-shell-sidebar"));
const bottomBar = () => within(screen.getByRole("navigation", { name: "Primary" }));

describe("AppShell navigation tree", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("uses the root's items as the global sidebar and tab bar at the root", () => {
    renderShell("/dashboard");
    expect(sidebar().getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBe("page");
    expect(sidebar().getByRole("link", { name: "Clients" })).toBeTruthy();
    expect(screen.queryByTestId("app-shell-contextual-nav")).toBeNull();
    expect(bottomBar().getAllByRole("link").map((a) => a.textContent)).toEqual(["Dashboard", "Clients"]);
    expect(screen.queryByTestId("app-shell-parent-link")).toBeNull();
  });

  it("derives contextual items with `$param` filled from the URL", () => {
    renderShell("/clients/c%201/tasks?page=2");
    const contextual = within(sidebar().getByTestId("app-shell-contextual-nav"));
    expect(contextual.getByText("Client")).toBeTruthy();
    expect(contextual.getByRole("link", { name: "Overview" }).getAttribute("href")).toBe("/clients/c%201");
    const tasks = contextual.getByRole("link", { name: "Tasks" });
    expect(tasks.getAttribute("href")).toBe("/clients/c%201/tasks");
    expect(tasks.getAttribute("aria-current")).toBe("page");
    // Global items stay in the sidebar.
    expect(sidebar().getByRole("link", { name: "Dashboard" })).toBeTruthy();
  });

  it("puts the contextual items in the mobile tab bar", () => {
    renderShell("/clients/c1");
    expect(bottomBar().getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "/clients/c1",
      "/clients/c1/tasks",
    ]);
  });

  it("links to the logical parent, interpolated, in the content header", () => {
    renderShell("/clients/c1/tasks");
    const back = screen.getByTestId("app-shell-parent-link");
    expect(back.getAttribute("href")).toBe("/clients");
    expect(back.getAttribute("aria-label")).toBe("Back to Clients");
    expect(within(screen.getByTestId("app-shell-parent-nav")).getByText("Clients")).toBeTruthy();
  });

  it("ranks a static segment over a `$param` sibling", () => {
    renderShell("/clients/new");
    // `/clients/new` resolves to the "New client" node, not "Client" with
    // clientId "new": no contextual section, parent is Clients.
    expect(screen.queryByTestId("app-shell-contextual-nav")).toBeNull();
    expect(screen.getByTestId("app-shell-parent-link").getAttribute("href")).toBe("/clients");
  });

  it("interpolates a `$param` parent path", () => {
    const nested: NavigationNode<NavItem> = {
      ...tree,
      children: [
        {
          id: "client",
          path: "/clients/$clientId",
          label: "Acme",
          items: [],
          children: [{ id: "task", path: "/clients/$clientId/tasks/$taskId", label: "Task", items: [] }],
        },
      ],
    };
    renderShell("/clients/c1/tasks/t9", { navigation: nested });
    expect(screen.getByTestId("app-shell-parent-link").getAttribute("href")).toBe("/clients/c1");
  });

  it("lets explicit props win: navItems, mobileNavItems, parentNavigation", () => {
    renderShell("/clients/c1", {
      navItems: [{ to: "/other", icon: Plus, label: "Other" }],
      mobileNavItems: [{ to: "/m", icon: Plus, label: "Mobile" }],
      parentNavigation: { href: "/custom", label: "Custom" },
    });
    expect(sidebar().queryByRole("link", { name: "Dashboard" })).toBeNull();
    expect(sidebar().getByRole("link", { name: "Other" })).toBeTruthy();
    expect(bottomBar().getAllByRole("link").map((a) => a.textContent)).toEqual(["Mobile"]);
    expect(screen.getByTestId("app-shell-parent-link").getAttribute("href")).toBe("/custom");
  });

  it("hides the parent link with `parentNavigation={null}`", () => {
    renderShell("/clients/c1", { parentNavigation: null });
    expect(screen.queryByTestId("app-shell-parent-link")).toBeNull();
  });

  it("has no back link on a top-level page (its parent is the root)", () => {
    renderShell("/clients");
    expect(screen.queryByTestId("app-shell-parent-link")).toBeNull();
  });

  it("keeps a `?query` / `#hash` on an item's `to` while filling its params", () => {
    const withQuery: NavigationNode<NavItem> = {
      ...tree,
      children: [
        {
          id: "client",
          path: "/clients/$clientId",
          label: "Client",
          items: [
            { to: "/clients/$clientId?tab=notes", icon: FileText, label: "Notes" },
            { to: "/clients/$clientId#billing", icon: CheckSquare, label: "Billing" },
          ],
        },
      ],
    };
    renderShell("/clients/c1", { navigation: withQuery });
    const contextual = within(sidebar().getByTestId("app-shell-contextual-nav"));
    expect(contextual.getByRole("link", { name: "Notes" }).getAttribute("href")).toBe("/clients/c1?tab=notes");
    expect(contextual.getByRole("link", { name: "Billing" }).getAttribute("href")).toBe("/clients/c1#billing");
  });

  const currentLinks = () =>
    sidebar()
      .getAllByRole("link")
      .filter((a) => a.getAttribute("aria-current") === "page")
      .map((a) => a.textContent);
  const highlighted = (name: string) =>
    sidebar().getByRole("link", { name }).className.includes("text-sidebar-primary");

  it("marks only the contextual link current on a deeper page, and keeps the section highlighted", () => {
    renderShell("/clients/c1/tasks");
    expect(currentLinks()).toEqual(["Tasks"]);
    expect(highlighted("Clients")).toBe(true);
  });

  it("marks only the contextual Overview current when it shares the page's path", () => {
    renderShell("/clients/c1");
    expect(currentLinks()).toEqual(["Overview"]);
    expect(highlighted("Clients")).toBe(true);
  });

  it("keeps the global item current where no contextual item matches", () => {
    renderShell("/dashboard");
    expect(currentLinks()).toEqual(["Dashboard"]);
  });

  it("labels the contextual section as a group", () => {
    renderShell("/clients/c1");
    const group = sidebar().getByRole("group", { name: "Client" });
    expect(group.getAttribute("data-testid")).toBe("app-shell-contextual-nav");
  });

  it("falls back to global items on mobile when every contextual item has children", () => {
    const grouped: NavigationNode<NavItem> = {
      ...tree,
      children: [
        {
          id: "client",
          path: "/clients/$clientId",
          label: "Client",
          items: [
            {
              to: "/clients/$clientId",
              icon: FileText,
              label: "Overview",
              children: [{ to: "/clients/$clientId/tasks", icon: CheckSquare, label: "Tasks" }],
            },
          ],
        },
      ],
    };
    renderShell("/clients/c1", { navigation: grouped });
    expect(bottomBar().getAllByRole("link").map((a) => a.textContent)).toEqual(["Dashboard", "Clients"]);
    // The section stays highlighted; the current page is the contextual item, not this tab.
    const clients = bottomBar().getByRole("link", { name: "Clients" });
    expect(clients.className).toContain("text-primary");
    expect(clients.getAttribute("aria-current")).toBeNull();
  });

  it("renders `parentNavigation` without a tree", () => {
    render(
      <AppShell
        appName="Genesis"
        navItems={[{ to: "/a", icon: Plus, label: "A" }]}
        parentNavigation={{ href: "/a", label: "A" }}
        options={chrome}
      >
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getByTestId("app-shell-parent-link").getAttribute("href")).toBe("/a");
  });
});
