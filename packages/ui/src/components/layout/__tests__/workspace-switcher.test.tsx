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

import { DropdownMenuItem } from "../../ui/dropdown-menu";
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

/** Radix's menu trigger opens on pointerdown; the search popover's on click. */
function openMenu(name: RegExp = /Switch workspace/) {
  const trigger = screen.getByRole("button", { name });
  fireEvent.pointerDown(trigger, new PointerEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }));
  if (trigger.getAttribute("aria-haspopup") === "dialog") fireEvent.click(trigger);
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

  it("keeps the badge's bare value and the jump hint out of the row's name, and says what the badge means", async () => {
    const withBadge: Workspace[] = [{ ...workspaces[0]!, badge: 3 }, workspaces[1]!];
    render(<WorkspaceSwitcher workspaces={withBadge} current={withBadge[0]} shortcuts={{ jump: "mod" }} onNavigate={() => {}} />);
    openMenu();
    await screen.findByRole("menu");
    const acme = screen.getByTestId("workspace-switcher-item-acme");
    expect(acme.querySelector('[data-part="badge"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(acme.querySelector('[data-part="item-shortcut"]')?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Acme Fitness Owner , 3 new" })).toBe(acme);
    expect(acme.getAttribute("aria-keyshortcuts")).toBe("Control+1 Meta+1");
  });

  it("takes the badge's spoken label from badgeLabel", async () => {
    const withBadge: Workspace[] = [{ ...workspaces[0]!, badge: 3 }];
    render(<WorkspaceSwitcher workspaces={withBadge} current={withBadge[0]} badgeLabel={(_w, v) => `${v} unread messages`} />);
    openMenu();
    await screen.findByRole("menu");
    expect(screen.getByTestId("workspace-switcher-item-acme").textContent).toContain("3 unread messages");
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

    it("is off by default, however many workspaces there are: the list stays a menu", async () => {
      render(<WorkspaceSwitcher workspaces={many} current={many[0]} />);
      openMenu();
      await screen.findByRole("menu");
      expect(screen.queryByTestId("workspace-switcher-search")).toBeNull();
      expect(screen.queryByRole("combobox")).toBeNull();
    });

    it("turns on past seven with search=\"auto\", and can be forced on", async () => {
      const { unmount } = render(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} search="auto" />);
      openMenu();
      await screen.findByRole("menu");
      expect(screen.queryByTestId("workspace-switcher-search")).toBeNull();
      unmount();
      const second = render(<WorkspaceSwitcher workspaces={many} current={many[0]} search="auto" />);
      openMenu();
      expect(await screen.findByRole("combobox")).toBeTruthy();
      second.unmount();
      render(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} search />);
      openMenu();
      expect(await screen.findByRole("combobox")).toBeTruthy();
    });

    it("is a combobox over a listbox, never a text box inside a menu", async () => {
      render(<WorkspaceSwitcher workspaces={many} current={many[0]} search actions={[{ id: "new", label: "New", onSelect: () => {} }]} />);
      openMenu();
      const box = await screen.findByRole("combobox");
      expect(screen.queryByRole("menu")).toBeNull();
      const list = screen.getByRole("listbox");
      expect(box.getAttribute("aria-controls")).toBe(list.id);
      expect(box.getAttribute("aria-autocomplete")).toBe("list");
      // A listbox owns groups and options only; the footer sits outside it.
      for (const child of Array.from(list.children)) expect(child.getAttribute("role")).toBe("group");
      for (const group of Array.from(list.children)) {
        for (const el of Array.from(group.children)) {
          expect(["option", null]).toContain(el.getAttribute("role"));
          if (el.getAttribute("role") === null) expect(el.querySelector("a,button,input")).toBeNull();
        }
      }
      expect(within(list).getAllByRole("option").length).toBe(9);
      expect(list.contains(screen.getByTestId("workspace-switcher-action-new"))).toBe(false);
      expect(box.getAttribute("aria-activedescendant")).toBe(screen.getByTestId("workspace-switcher-item-org-1").id);
    });

    it("narrows the list as the viewer types, and says when nothing matches", async () => {
      render(<WorkspaceSwitcher workspaces={many} current={many[0]} search emptyText="Nothing here" />);
      openMenu();
      const box = await screen.findByRole("combobox");
      fireEvent.change(box, { target: { value: "zurich" } });
      expect(screen.getAllByRole("option").map((i) => i.textContent)).toEqual(["ZSZürich Studio"]);
      fireEvent.change(box, { target: { value: "nope" } });
      expect(screen.queryAllByRole("option")).toEqual([]);
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(box.hasAttribute("aria-activedescendant")).toBe(false);
      expect(screen.getByText("Nothing here").getAttribute("data-part")).toBe("empty");
    });

    it("takes focus on opening; the arrows move the highlight and Enter goes there", async () => {
      const onSelect = vi.fn();
      render(<WorkspaceSwitcher workspaces={many} current={many[0]} search onSelect={onSelect} />);
      openMenu();
      const box = await screen.findByRole("combobox");
      await waitFor(() => expect(document.activeElement).toBe(box));
      fireEvent.change(box, { target: { value: "tenant" } });
      fireEvent.keyDown(box, { key: "ArrowDown" });
      fireEvent.keyDown(box, { key: "ArrowDown" });
      const third = screen.getByTestId("workspace-switcher-item-org-3");
      expect(third.getAttribute("aria-selected")).toBe("true");
      expect(third.hasAttribute("data-highlighted")).toBe(true);
      expect(box.getAttribute("aria-activedescendant")).toBe(third.id);
      fireEvent.keyDown(box, { key: "ArrowUp" });
      fireEvent.keyDown(box, { key: "ArrowUp" });
      fireEvent.keyDown(box, { key: "ArrowUp" });
      expect(screen.getByTestId("workspace-switcher-item-org-9").getAttribute("aria-selected")).toBe("true");
      expect(document.activeElement).toBe(box);
      fireEvent.keyDown(box, { key: "Enter" });
      expect(onSelect).toHaveBeenCalledWith(many[8]);
    });

    it("ignores the Enter that commits an IME composition", async () => {
      const onSelect = vi.fn();
      render(<WorkspaceSwitcher workspaces={many} current={many[0]} search onSelect={onSelect} />);
      openMenu();
      const box = await screen.findByRole("combobox");
      fireEvent.keyDown(box, { key: "Enter", keyCode: 229, isComposing: true });
      fireEvent.keyDown(box, { key: "Process", keyCode: 229 });
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("does nothing on Enter when nothing matches, never running a footer action", async () => {
      const onAction = vi.fn();
      const onSelect = vi.fn();
      render(
        <WorkspaceSwitcher workspaces={many} current={many[0]} search onSelect={onSelect} actions={[{ id: "new", label: "New organization", onSelect: onAction }]} />,
      );
      openMenu();
      const box = await screen.findByRole("combobox");
      fireEvent.change(box, { target: { value: "zzzz" } });
      fireEvent.keyDown(box, { key: "Enter" });
      expect(onAction).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId("workspace-switcher-action-new"));
      expect(onAction).toHaveBeenCalledTimes(1);
    });

    it("keeps working with a ref of the app's own on the content", async () => {
      const ref = { current: null as HTMLDivElement | null };
      const onSelect = vi.fn();
      render(<WorkspaceSwitcher workspaces={many} current={many[0]} search onSelect={onSelect} slotProps={{ content: { ref } }} />);
      openMenu();
      const box = await screen.findByRole("combobox");
      expect(ref.current?.getAttribute("data-part")).toBe("content");
      fireEvent.keyDown(box, { key: "ArrowDown" });
      fireEvent.keyDown(box, { key: "Enter" });
      expect(onSelect).toHaveBeenCalledWith(many[1]);
    });

    it("starts clean after a parent closes it", async () => {
      const props = { workspaces: many, current: many[0], search: true } as const;
      const { rerender } = render(<WorkspaceSwitcher {...props} open />);
      const box = await screen.findByRole("combobox");
      fireEvent.change(box, { target: { value: "tenant 3" } });
      expect(screen.getAllByRole("option").length).toBe(1);
      rerender(<WorkspaceSwitcher {...props} open={false} />);
      rerender(<WorkspaceSwitcher {...props} open />);
      const again = await screen.findByRole("combobox");
      expect((again as HTMLInputElement).value).toBe("");
      expect(screen.getAllByRole("option").length).toBe(9);
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
          shortcuts={{ jump: "mod" }}
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

    it("never jumps with Alt while the viewer types (Option+digit types a character on a Mac)", () => {
      const onNavigate = vi.fn();
      render(
        <>
          <textarea data-testid="notes" />
          <WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} onNavigate={onNavigate} shortcuts={{ jump: "alt" }} />
        </>,
      );
      const notes = screen.getByTestId("notes");
      notes.focus();
      const typed = fireEvent.keyDown(notes, { key: "#", code: "Digit3", altKey: true });
      expect(typed).toBe(true);
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it("warns in development when jumping has no onNavigate", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      render(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} shortcuts={{ jump: true }} />);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("onNavigate"));
      warn.mockClear();
      cleanup();
      render(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} shortcuts={{ jump: true }} onNavigate={() => {}} />);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it("answers from the copy on screen, never the closed mobile drawer's", async () => {
      // Below md: the desktop sidebar is display:none; the closed drawer is inert and aria-hidden.
      const original = HTMLElement.prototype.checkVisibility;
      HTMLElement.prototype.checkVisibility = function (this: HTMLElement) {
        return !this.closest("aside:not(#app-shell-mobile-nav)");
      };
      try {
        inScope(
          <AppShell
            appName="Sample"
            navItems={[]}
            options={{ showThemeToggle: false, configurable: false }}
            headerSlot={<WorkspaceSwitcher shortcuts={{ open: "mod+k" }} />}
            mobileHeaderSlot={<WorkspaceSwitcher variant="bar" shortcuts={{ open: "mod+k" }} />}
          >
            <p>content</p>
          </AppShell>,
        );
        await screen.findAllByRole("button", { name: /Acme Fitness/ });
        fireEvent.keyDown(window, { key: "k", code: "KeyK", ctrlKey: true });
        await screen.findByRole("menu");
        const states = screen.getAllByTestId("workspace-switcher").map((el) => [el.getAttribute("data-variant"), el.getAttribute("data-state")]);
        expect(states.filter(([, state]) => state === "open")).toEqual([["bar", "open"]]);
      } finally {
        HTMLElement.prototype.checkVisibility = original;
      }
    });

    it.each([["alt" as const], [true as const]])("uses Alt for the jump with jump=%s (browsers keep ⌘/Ctrl+digit for tabs)", (jump) => {
      const onNavigate = vi.fn();
      render(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} onNavigate={onNavigate} shortcuts={{ jump }} />);
      fireEvent.keyDown(window, { key: "1", code: "Digit1", metaKey: true });
      expect(onNavigate).not.toHaveBeenCalled();
      fireEvent.keyDown(window, { key: "¡", code: "Digit1", altKey: true });
      expect(onNavigate).toHaveBeenCalledWith("/me", workspaces[3]);
    });

    it("matches a digit shortcut with Shift held, which types a symbol", async () => {
      render(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} shortcuts={{ open: "mod+shift+1" }} />);
      fireEvent.keyDown(window, { key: "!", code: "Digit1", ctrlKey: true, shiftKey: true });
      expect(await screen.findByRole("menu")).toBeTruthy();
    });

    it("answers while its own menu is open, though the open menu hides the rest of the page", async () => {
      const onNavigate = vi.fn();
      render(
        <WorkspaceSwitcher
          workspaces={workspaces}
          current={workspaces[0]}
          onNavigate={onNavigate}
          shortcuts={{ open: "mod+shift+o", jump: "alt" }}
        />,
      );
      const root = screen.getByTestId("workspace-switcher");
      fireEvent.keyDown(window, { key: "O", code: "KeyO", ctrlKey: true, shiftKey: true });
      await screen.findByRole("menu");
      await waitFor(() => expect(root.closest("[aria-hidden='true']")).not.toBeNull());
      fireEvent.keyDown(document.activeElement ?? window, { key: "O", code: "KeyO", ctrlKey: true, shiftKey: true });
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
      expect(root.getAttribute("data-state")).toBe("closed");

      fireEvent.keyDown(window, { key: "O", code: "KeyO", ctrlKey: true, shiftKey: true });
      await screen.findByRole("menu");
      await waitFor(() => expect(root.closest("[aria-hidden='true']")).not.toBeNull());
      fireEvent.keyDown(document.activeElement ?? window, { key: "¡", code: "Digit1", altKey: true });
      expect(onNavigate).toHaveBeenCalledWith("/me", workspaces[3]);
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    });
  });

  it("keeps the footer where it was when there are no actions: after a separator, straight in the menu", async () => {
    render(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} footer={<a href="/new" data-testid="new-org">New organization</a>} />);
    openMenu();
    const menu = await screen.findByRole("menu");
    const item = screen.getByTestId("new-org");
    expect(item.parentElement).toBe(menu);
    expect(item.previousElementSibling?.getAttribute("role")).toBe("separator");
    expect(menu.querySelector('[data-part="footer"]')).toBeNull();
  });

  describe("footer with search", () => {
    const many: Workspace[] = Array.from({ length: 9 }, (_, i) => ({
      id: `org-${i + 1}`,
      kind: "tenant" as const,
      label: `Tenant ${i + 1}`,
      path: `/o/org-${i + 1}`,
      scope: { orgId: `org-${i + 1}` },
    }));

    it('keeps the menu with search="auto" when the footer is menu items, and warns', async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        render(
          <WorkspaceSwitcher
            workspaces={many}
            current={many[0]}
            search="auto"
            footer={<DropdownMenuItem data-testid="new-org">New organization</DropdownMenuItem>}
          />,
        );
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("footer"));
        openMenu();
        await screen.findByRole("menu");
        expect(screen.queryByRole("combobox")).toBeNull();
        expect(screen.getByTestId("new-org").getAttribute("role")).toBe("menuitem");
      } finally {
        warn.mockRestore();
      }
    });

    it("renders a function footer for the mode it is in", async () => {
      const footer = (mode: "menu" | "search") =>
        mode === "menu" ? (
          <DropdownMenuItem data-testid="new-org">New organization</DropdownMenuItem>
        ) : (
          <a href="/new" data-testid="new-org">
            New organization
          </a>
        );
      render(<WorkspaceSwitcher workspaces={many} current={many[0]} search="auto" footer={footer} />);
      openMenu();
      await screen.findByRole("combobox");
      expect(screen.getByTestId("new-org").tagName).toBe("A");
      expect(screen.getByTestId("new-org").closest('[data-part="footer"]')).not.toBeNull();
      cleanup();
      render(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} search="auto" footer={footer} />);
      openMenu();
      await screen.findByRole("menu");
      expect(screen.getByTestId("new-org").getAttribute("role")).toBe("menuitem");
    });
  });

  it("keeps the picture's rounded-md and the menu's w-64 classes", async () => {
    render(<WorkspaceSwitcher workspaces={workspaces} current={workspaces[0]} />);
    const trigger = screen.getByRole("button", { name: /Acme Fitness/ });
    expect(trigger.querySelector('[data-part="image"]')?.classList.contains("rounded-md")).toBe(true);
    openMenu();
    expect((await screen.findByRole("menu")).classList.contains("w-64")).toBe(true);
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
