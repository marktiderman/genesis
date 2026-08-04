import type { Meta, StoryObj } from "@storybook/react";
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

export const CollapsedRail: Story = {
  render: () => (
    <AppShell
      appName="Genesis"
      appLogo="G"
      navItems={navItems}
      activePath="/tasks"
      collapsed
      options={{ configurable: true }}
    >
      <div className="text-sm text-muted-foreground">Collapsed to an icon rail.</div>
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
