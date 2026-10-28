// @feat:workspaces
/**
 * The workspace switcher: the current workspace at the top of the sidebar, a menu of the viewer's
 * workspaces grouped by kind, each a link that keeps their place, and the rail and phone variants.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceScope } from "@marktiderman/genesis-core/hooks";
import type { Workspace } from "@marktiderman/genesis-core/workspaces";

import { AppShell } from "../AppShell";
import { WorkspaceSwitcher } from "../workspace-switcher";

const workspaces: Workspace[] = [
  { id: "acme", kind: "tenant", label: "Acme Fitness", description: "Owner", path: "/o/acme", scope: { orgId: "org-1" } },
  { id: "globex", kind: "tenant", label: "Globex", path: "/o/globex", scope: { orgId: "org-2" } },
  { id: "all", kind: "rollup", label: "All organizations", path: "/all", scope: { orgIds: ["org-1", "org-2"] } },
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
});
