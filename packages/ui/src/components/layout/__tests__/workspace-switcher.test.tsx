// @feat:workspaces
/**
 * The workspace switcher: the current workspace at the top of the sidebar, a menu of the viewer's
 * workspaces grouped by kind, each a link that keeps their place, and the rail and phone variants.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkspaceScope } from "@marktiderman/genesis-core/hooks";
import type { Workspace } from "@marktiderman/genesis-core/workspaces";

import { AppShell } from "../AppShell";
import { WorkspaceSwitcher, type WorkspaceSwitcherItemProps } from "../workspace-switcher";

const workspaces: Workspace[] = [
  { id: "acme", kind: "tenant", label: "Acme Fitness", description: "Owner", path: "/o/acme", scope: { orgId: "org-1" } },
  { id: "globex", kind: "tenant", label: "Globex", path: "/o/globex", scope: { orgId: "org-2" } },
  { id: "all", kind: "rollup", label: "All organizations", path: "/all", scope: { orgId: ["org-1", "org-2"] } },
  { id: "me", kind: "personal", label: "Personal", path: "/me", scope: { personId: "p-1" } },
];

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function inScope(ui: React.ReactNode, pathname = "/o/acme/clients/42") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <WorkspaceScope viewer="u-1" workspaces={workspaces} pathname={pathname} timeZone="UTC">
        {ui}
      </WorkspaceScope>
    </QueryClientProvider>,
  );
}

/** Radix's trigger opens on pointerdown, not click. */
function openMenu(name: RegExp = /Switch workspace/) {
  fireEvent.pointerDown(
    screen.getByRole("button", { name }),
    new PointerEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }),
  );
}

describe("WorkspaceSwitcher", () => {
  it("shows where the viewer is working", async () => {
    inScope(<WorkspaceSwitcher />);
    const trigger = await screen.findByRole("button", { name: "Switch workspace: Acme Fitness" });
    expect(within(trigger).getByText("Owner")).toBeTruthy();
    expect(within(trigger).getByText("AF")).toBeTruthy();
  });

  it("lists every workspace by kind, marks the current one, and keeps the viewer's place", async () => {
    inScope(<WorkspaceSwitcher />);
    await screen.findByRole("button", { name: /Acme Fitness/ });
    openMenu();
    const menu = await screen.findByRole("menu");
    const headings = ["Personal", "Overview", "Organizations"];
    for (const h of headings) expect(within(menu).getAllByText(h).length).toBeGreaterThan(0);
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent?.replace("Owner", ""))).toEqual(["Personal", "All organizations", "AFAcme Fitness", "GLGlobex"]);
    expect(screen.getByTestId("workspace-switcher-item-acme").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("workspace-switcher-item-globex").getAttribute("href")).toBe("/o/globex/clients");
    expect(screen.getByTestId("workspace-switcher-item-me").getAttribute("href")).toBe("/me");
  });

  it("takes the app's labels, footer and rows", async () => {
    inScope(
      <WorkspaceSwitcher
        kindLabels={{ tenant: "Gyms", personal: null }}
        footer={<a href="/new">New organization</a>}
        renderItem={(w, { current }) => <span>{`${w.label}${current ? " (here)" : ""}`}</span>}
      />,
    );
    await screen.findByRole("button", { name: /Acme Fitness/ });
    openMenu();
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Gyms")).toBeTruthy();
    expect(within(menu).queryByText("Organizations")).toBeNull();
    expect(within(menu).getByText("Acme Fitness (here)")).toBeTruthy();
    expect(within(menu).getByText("New organization")).toBeTruthy();
  });

  it("works from props alone, without a WorkspaceScope", () => {
    render(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[1]} />);
    expect(screen.getByRole("button", { name: "Switch workspace: Globex" })).toBeTruthy();
  });

  it("asks the viewer to choose outside every workspace", async () => {
    inScope(<WorkspaceSwitcher />, "/welcome");
    expect(await screen.findByRole("button", { name: "Switch workspace: Choose a workspace" })).toBeTruthy();
  });

  it("shows the picture alone on the rail, named for screen readers", async () => {
    inScope(<WorkspaceSwitcher variant="rail" />);
    const trigger = await screen.findByRole("button", { name: "Switch workspace: Acme Fitness" });
    expect(trigger.textContent).toBe("AF");
  });

  it("titles the phone's top bar through AppShell's mobileHeaderSlot", async () => {
    inScope(
      <AppShell
        appName="Sample"
        navItems={[]}
        options={{ showThemeToggle: false, configurable: false }}
        mobileHeaderSlot={<WorkspaceSwitcher variant="bar" />}
      >
        <p>content</p>
      </AppShell>,
    );
    const header = (await screen.findByTestId("app-shell-mobile-open")).closest("header")!;
    expect(within(header).getByRole("button", { name: "Switch workspace: Acme Fitness" })).toBeTruthy();
    expect(within(header).queryByText("Sample")).toBeNull();
  });

  it("names every part and its state for styling", async () => {
    inScope(<WorkspaceSwitcher />);
    const root = screen.getByTestId("workspace-switcher");
    expect(root.getAttribute("data-scope")).toBe("workspace-switcher");
    expect(root.getAttribute("data-part")).toBe("root");
    expect(root.getAttribute("data-variant")).toBe("sidebar");
    expect(root.getAttribute("data-state")).toBe("closed");
    expect(root.getAttribute("data-kind")).toBe("tenant");
    const trigger = await screen.findByRole("button", { name: /Acme Fitness/ });
    expect(trigger.getAttribute("data-part")).toBe("trigger");
    expect(root.querySelector('[data-part="name"]')?.textContent).toBe("Acme Fitness");
    expect(root.querySelector('[data-part="description"]')?.textContent).toBe("Owner");
    openMenu();
    const menu = await screen.findByRole("menu");
    expect(root.getAttribute("data-state")).toBe("open");
    expect(menu.getAttribute("data-part")).toBe("content");
    expect(menu.getAttribute("data-scope")).toBe("workspace-switcher");
    const acme = screen.getByTestId("workspace-switcher-item-acme");
    expect(acme.getAttribute("data-part")).toBe("item");
    expect(acme.hasAttribute("data-current")).toBe(true);
    expect(acme.getAttribute("data-kind")).toBe("tenant");
    expect(screen.getByTestId("workspace-switcher-item-globex").hasAttribute("data-current")).toBe(false);
    expect(menu.querySelectorAll('[data-part="group"]').length).toBe(3);
    expect(menu.querySelectorAll('[data-part="group-label"]').length).toBe(3);
    expect(acme.querySelector('[data-part="item-indicator"]')).toBeTruthy();
    expect(acme.querySelector('[data-part="image"]')?.getAttribute("data-kind")).toBe("tenant");
  });

  it("adds a class to each part through classNames and slotProps", async () => {
    inScope(
      <WorkspaceSwitcher
        className="from-prop"
        classNames={{ root: "c-root", trigger: "c-trigger", content: "c-content", item: "c-item", "item-name": "c-item-name", image: "c-image" }}
        slotProps={{ trigger: { className: "p-trigger" }, content: { className: "p-content" } }}
      />,
    );
    const root = screen.getByTestId("workspace-switcher");
    expect(root.className).toContain("c-root");
    expect(root.className).toContain("from-prop");
    const trigger = await screen.findByRole("button", { name: /Acme Fitness/ });
    expect(trigger.className).toContain("c-trigger");
    expect(trigger.className).toContain("p-trigger");
    openMenu();
    const menu = await screen.findByRole("menu");
    expect(menu.className).toContain("c-content");
    expect(menu.className).toContain("p-content");
    const acme = screen.getByTestId("workspace-switcher-item-acme");
    expect(acme.className).toContain("c-item");
    expect(acme.querySelector('[data-part="item-name"]')?.className).toContain("c-item-name");
    expect(acme.querySelector('[data-part="image"]')?.className).toContain("c-image");
  });

  it("replaces or drops a part through slots", async () => {
    function Row({ workspace, current, index }: WorkspaceSwitcherItemProps) {
      return <span>{`${index + 1}. ${workspace.label}${current ? " *" : ""}`}</span>;
    }
    inScope(
      <WorkspaceSwitcher
        slots={{ item: Row, image: ({ workspace }) => <i data-testid={`pic-${workspace.id}`} /> }}
      />,
    );
    const trigger = await screen.findByRole("button", { name: /Acme Fitness/ });
    expect(within(trigger).getByTestId("pic-acme")).toBeTruthy();
    openMenu();
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("3. Acme Fitness *")).toBeTruthy();
    expect(within(menu).getByText("1. Personal")).toBeTruthy();
  });

  it("shows each workspace's badge, and nothing for zero", async () => {
    const withBadges: Workspace[] = [
      { ...workspaces[0]!, badge: 3 },
      { ...workspaces[1]!, badge: 0 },
      { ...workspaces[3]!, badge: "new" },
    ];
    render(<WorkspaceSwitcher workspaces={withBadges} current={withBadges[0]} />);
    openMenu();
    await screen.findByRole("menu");
    expect(screen.getByTestId("workspace-switcher-item-acme").querySelector('[data-part="badge"]')?.textContent).toBe("3");
    expect(screen.getByTestId("workspace-switcher-item-globex").querySelector('[data-part="badge"]')).toBeNull();
    expect(screen.getByTestId("workspace-switcher-item-me").querySelector('[data-part="badge"]')?.textContent).toBe("new");
  });

  it("takes a badge renderer, and slots.badge null drops them", async () => {
    const withBadge: Workspace[] = [{ ...workspaces[0]!, badge: 3 }, workspaces[1]!];
    const { unmount } = render(
      <WorkspaceSwitcher workspaces={withBadge} current={withBadge[0]} renderBadge={(w) => (w.badge ? <b>{`${w.badge} unread`}</b> : null)} />,
    );
    openMenu();
    expect(within(await screen.findByRole("menu")).getByText("3 unread")).toBeTruthy();
    unmount();
    render(<WorkspaceSwitcher workspaces={withBadge} current={withBadge[0]} slots={{ badge: null }} />);
    openMenu();
    await screen.findByRole("menu");
    expect(screen.getByTestId("workspace-switcher-item-acme").querySelector('[data-part="badge"]')).toBeNull();
  });

  it("brands each workspace's picture and row with its theme", async () => {
    const branded: Workspace[] = [{ ...workspaces[0]!, theme: { accent: "160 84% 39%" } }, workspaces[1]!];
    render(<WorkspaceSwitcher workspaces={branded} current={branded[0]} />);
    const trigger = screen.getByRole("button", { name: /Acme Fitness/ });
    const image = trigger.querySelector<HTMLElement>('[data-part="image"]')!;
    expect(image.style.getPropertyValue("--primary")).toMatch(/^1[56]\d(\.\d)? \d/);
    openMenu();
    await screen.findByRole("menu");
    expect(screen.getByTestId("workspace-switcher-item-acme").style.getPropertyValue("--primary")).toMatch(/^1[56]\d(\.\d)? \d/);
    expect(screen.getByTestId("workspace-switcher-item-globex").style.getPropertyValue("--primary")).toBe("");
  });

  describe("search", () => {
    const many: Workspace[] = Array.from({ length: 9 }, (_, i) => ({
      id: `org-${i + 1}`,
      kind: "tenant" as const,
      label: i === 4 ? "Zürich Studio" : `Tenant ${i + 1}`,
      path: `/o/org-${i + 1}`,
      scope: { orgId: `org-${i + 1}` },
    }));

    it("is off for a short list and on past seven", async () => {
      const { unmount } = render(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} />);
      openMenu();
      await screen.findByRole("menu");
      expect(screen.queryByTestId("workspace-switcher-search")).toBeNull();
      unmount();
      render(<WorkspaceSwitcher workspaces={many} current={many[0]} />);
      openMenu();
      await screen.findByRole("menu");
      expect(screen.getByTestId("workspace-switcher-search")).toBeTruthy();
    });

    it("narrows the list as the viewer types, and says when nothing matches", async () => {
      render(<WorkspaceSwitcher workspaces={many} current={many[0]} emptyText="Nothing here" />);
      openMenu();
      const menu = await screen.findByRole("menu");
      const box = screen.getByTestId("workspace-switcher-search");
      fireEvent.change(box, { target: { value: "zurich" } });
      expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["ZSZürich Studio"]);
      fireEvent.change(box, { target: { value: "nope" } });
      expect(within(menu).queryAllByRole("menuitem")).toEqual([]);
      expect(within(menu).getByText("Nothing here").getAttribute("data-part")).toBe("empty");
    });

    it("takes focus on opening, keeps typed letters, and moves into the list on the down arrow", async () => {
      render(<WorkspaceSwitcher workspaces={many} current={many[0]} />);
      openMenu();
      await screen.findByRole("menu");
      const box = screen.getByTestId("workspace-switcher-search");
      await waitFor(() => expect(document.activeElement).toBe(box));
      fireEvent.keyDown(box, { key: "t" });
      expect(document.activeElement).toBe(box);
      fireEvent.change(box, { target: { value: "tenant 9" } });
      fireEvent.keyDown(box, { key: "ArrowDown" });
      expect(document.activeElement).toBe(screen.getByTestId("workspace-switcher-item-org-9"));
    });

    it("can be forced on or off", async () => {
      const { unmount } = render(<WorkspaceSwitcher workspaces={many} current={many[0]} search={false} />);
      openMenu();
      await screen.findByRole("menu");
      expect(screen.queryByTestId("workspace-switcher-search")).toBeNull();
      unmount();
      render(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} search />);
      openMenu();
      await screen.findByRole("menu");
      expect(screen.getByTestId("workspace-switcher-search")).toBeTruthy();
    });
  });

  describe("shortcuts", () => {
    it("listens for nothing unless asked", async () => {
      const onNavigate = vi.fn();
      render(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} onNavigate={onNavigate} />);
      fireEvent.keyDown(window, { key: "2", code: "Digit2", metaKey: true });
      expect(onNavigate).not.toHaveBeenCalled();
      expect(screen.getByTestId("workspace-switcher").getAttribute("data-state")).toBe("closed");
    });

    it("opens with the configured shortcut", async () => {
      render(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} shortcuts={{ open: "mod+shift+o" }} />);
      const trigger = screen.getByRole("button", { name: /Acme Fitness/ });
      expect(trigger.getAttribute("aria-keyshortcuts")).toBe("Control+Shift+O Meta+Shift+O");
      fireEvent.keyDown(window, { key: "o", code: "KeyO", metaKey: true });
      expect(screen.queryByRole("menu")).toBeNull();
      fireEvent.keyDown(window, { key: "O", code: "KeyO", ctrlKey: true, shiftKey: true });
      expect(await screen.findByRole("menu")).toBeTruthy();
    });

    it("jumps to the nth workspace in the menu's order, showing each number", async () => {
      const onNavigate = vi.fn();
      const onSelect = vi.fn();
      render(
        <WorkspaceSwitcher
          workspaces={workspaces}
          current={workspaces[0]}
          onNavigate={onNavigate}
          onSelect={onSelect}
          shortcuts={{ jump: true }}
        />,
      );
      // Personal, All organizations, Acme Fitness, Globex.
      fireEvent.keyDown(window, { key: "4", code: "Digit4", ctrlKey: true });
      expect(onNavigate).toHaveBeenCalledWith("/o/globex", workspaces[1]);
      expect(onSelect).toHaveBeenCalledWith(workspaces[1]);
      onNavigate.mockClear();
      fireEvent.keyDown(window, { key: "3", code: "Digit3", metaKey: true });
      expect(onNavigate).not.toHaveBeenCalled();
      fireEvent.keyDown(window, { key: "9", code: "Digit9", metaKey: true });
      expect(onNavigate).not.toHaveBeenCalled();
      openMenu();
      await screen.findByRole("menu");
      const hint = screen.getByTestId("workspace-switcher-item-me").querySelector('[data-part="item-shortcut"]')?.textContent;
      expect(hint).toMatch(/1$/);
    });

    it("uses Alt for the jump when asked", () => {
      const onNavigate = vi.fn();
      render(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} onNavigate={onNavigate} shortcuts={{ jump: "alt" }} />);
      fireEvent.keyDown(window, { key: "1", code: "Digit1", metaKey: true });
      expect(onNavigate).not.toHaveBeenCalled();
      fireEvent.keyDown(window, { key: "¡", code: "Digit1", altKey: true });
      expect(onNavigate).toHaveBeenCalledWith("/me", workspaces[3]);
    });
  });

  it("lists typed actions at the bottom of the menu", async () => {
    const onSelect = vi.fn();
    render(
      <WorkspaceSwitcher
        workspaces={workspaces}
        current={workspaces[0]}
        actions={[
          { id: "new", label: "New organization", onSelect, shortcut: "⌘N" },
          { id: "manage", label: "Manage workspaces", href: "/settings/workspaces" },
          { id: "off", label: "Archived", href: "/archived", disabled: true },
        ]}
      />,
    );
    openMenu();
    const menu = await screen.findByRole("menu");
    const footer = menu.querySelector('[data-part="footer"]')!;
    expect(within(footer as HTMLElement).getAllByRole("menuitem").map((i) => i.getAttribute("data-action"))).toEqual(["new", "manage", "off"]);
    expect(screen.getByTestId("workspace-switcher-action-manage").getAttribute("href")).toBe("/settings/workspaces");
    expect(screen.getByTestId("workspace-switcher-action-off").hasAttribute("data-disabled")).toBe(true);
    expect(within(menu).getByText("⌘N")).toBeTruthy();
    fireEvent.click(screen.getByTestId("workspace-switcher-action-new"));
    expect(onSelect).toHaveBeenCalled();
  });

  it("can be controlled", async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} open={false} onOpenChange={onOpenChange} />,
    );
    openMenu();
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("menu")).toBeNull();
    rerender(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} open onOpenChange={onOpenChange} />);
    expect(await screen.findByRole("menu")).toBeTruthy();
  });
});
