import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShell } from "@marktiderman/genesis-ui/layout";
import {
  LayoutDashboard,
  Map,
  CheckSquare,
  Layers,
  Newspaper,
} from "lucide-react";

const meta: Meta<typeof AppShell> = {
  title: "Data/AppShell",
  component: AppShell,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof AppShell>;

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Overview", end: true },
  { to: "/map", icon: Map, label: "Genesis Map" },
  { to: "/tasks", icon: CheckSquare, label: "Tasks", badge: 4 },
  {
    to: "/gitdata",
    icon: Layers,
    label: "Gitdata",
    children: [{ to: "/gitdata/features", icon: Layers, label: "Features" }],
  },
  { to: "/research", icon: Newspaper, label: "Research" },
];

export const Default: Story = {
  render: () => (
    <AppShell
      appName="Genesis"
      appLogo="G"
      navItems={navItems}
      activePath="/map"
      options={{ configurable: true, railWidth: "wide" }}
    >
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Command Center</h1>
        <p className="text-sm text-muted-foreground">
          Resizable rail, customize popover, and mobile bottom nav.
        </p>
      </div>
    </AppShell>
  ),
};

export const Expanded: Story = {
  name: "Sidebar: expanded",
  render: () => (
    <AppShell
      appName="Breakthrough"
      appLogo="B"
      navItems={navItems}
      activePath="/tasks"
      defaultCollapsed={false}
    >
      <div className="text-sm text-muted-foreground">
        Icon and label per item. Collapse with the panel button beside the logo,
        or press <kbd>[</kbd>.
      </div>
    </AppShell>
  ),
};

export const CollapsedRail: Story = {
  name: "Sidebar: collapsed rail",
  render: () => (
    <AppShell
      appName="Breakthrough"
      appLogo="B"
      navItems={navItems}
      activePath="/tasks"
      defaultCollapsed
    >
      <div className="text-sm text-muted-foreground">
        A 64px icon rail: hover or tab onto an item for its name, open
        Gitdata for its nested items, expand from the button at the bottom
        or press <kbd>[</kbd>.
      </div>
    </AppShell>
  ),
};

/**
 * A page asks for the rail through its navigation node
 * (`defaultCollapsed: true`), the way a form builder route would. The
 * user's own toggle wins once they use it (persisted under
 * `optionsStorageKey`).
 */
export const PageDefaultCollapsed: Story = {
  name: "Sidebar: page asks for collapsed",
  render: () => (
    <AppShell
      appName="Breakthrough"
      appLogo="B"
      navigation={{
        id: "app",
        path: "/",
        label: "Home",
        items: navItems,
        children: [
          {
            id: "builder",
            path: "/forms/$formId/edit",
            label: "Form builder",
            items: [],
            defaultCollapsed: true,
          },
        ],
      }}
      activePath="/forms/f1/edit"
      optionsStorageKey="storybook-app-shell"
    >
      <div className="text-sm text-muted-foreground">
        The form builder route opens collapsed until the user picks a side.
      </div>
    </AppShell>
  ),
};

export const WindowScroll: Story = {
  render: () => (
    <AppShell
      appName="Genesis"
      appLogo="G"
      navItems={navItems}
      activePath="/"
      options={{ scrollRoot: "window", configurable: true }}
    >
      <div className="space-y-4">
        {Array.from({ length: 40 }).map((_, i) => (
          <p key={i} className="text-sm text-muted-foreground">
            Row {i + 1} — the document scrolls so React Router ScrollRestoration works.
          </p>
        ))}
      </div>
    </AppShell>
  ),
};
