import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShell, DocumentPage, type AppShellOptions, type NavItem } from "@marktiderman/genesis-ui/layout";
import { Button } from "@marktiderman/genesis-ui";
import { BookOpen, CheckSquare, FileText, Home, Inbox, Layers, Settings, Users } from "lucide-react";

/**
 * An app's layout (ADR 0022): one navigation setting over the same items, a flush or inset
 * frame, and the document page template.
 */
const meta: Meta<typeof AppShell> = {
  title: "Foundation/Layout/Layouts",
  component: AppShell,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof AppShell>;

const navItems: NavItem[] = [
  { to: "/", icon: Home, label: "Home", end: true },
  { to: "/inbox", icon: Inbox, label: "Inbox", badge: 3 },
  {
    to: "/docs",
    icon: BookOpen,
    label: "Docs",
    children: [
      {
        to: "/docs/guides",
        icon: FileText,
        label: "Guides",
        children: [
          { to: "/docs/guides/start", icon: FileText, label: "Getting started" },
          { to: "/docs/guides/themes", icon: FileText, label: "Themes" },
        ],
      },
      { to: "/docs/reference", icon: Layers, label: "Reference" },
    ],
  },
  { to: "/tasks", icon: CheckSquare, label: "Tasks" },
  { to: "/people", icon: Users, label: "People" },
];
const secondary: NavItem[] = [{ to: "/settings", icon: Settings, label: "Settings" }];

function Shell({ options, activePath = "/docs/guides/start" }: { options: AppShellOptions; activePath?: string }) {
  return (
    <AppShell
      appName="Acme"
      appLogo="A"
      navItems={navItems}
      secondaryNavItems={secondary}
      activePath={activePath}
      options={{ configurable: false, ...options }}
    >
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Getting started</h1>
        <p className="text-sm text-muted-foreground">
          navigation: <code>{options.navigation ?? "sidebar"}</code>, frame: <code>{options.frame ?? "flush"}</code>, density:{" "}
          <code>{options.density ?? "comfortable"}</code>
        </p>
      </div>
    </AppShell>
  );
}

export const Sidebar: Story = { name: "Navigation: sidebar (default)", render: () => <Shell options={{}} /> };
export const Rail: Story = { name: "Navigation: rail", render: () => <Shell options={{ navigation: "rail" }} /> };
export const TopTabs: Story = { name: "Navigation: top tabs", render: () => <Shell options={{ navigation: "top-tabs" }} activePath="/docs/reference" /> };
export const BottomBar: Story = { name: "Navigation: bottom bar", render: () => <Shell options={{ navigation: "bottom-bar" }} activePath="/inbox" /> };
export const PageTree: Story = { name: "Navigation: page tree", render: () => <Shell options={{ navigation: "page-tree" }} /> };

export const InsetFrame: Story = { name: "Frame: inset", render: () => <Shell options={{ frame: "inset" }} /> };
export const InsetTopTabs: Story = {
  name: "Frame: inset, with top tabs",
  render: () => <Shell options={{ navigation: "top-tabs", frame: "inset" }} activePath="/tasks" />,
};
export const PageTreeSpacious: Story = {
  name: "Density: spacious page tree",
  render: () => <Shell options={{ navigation: "page-tree", density: "spacious" }} />,
};
export const Compact: Story = { name: "Density: compact", render: () => <Shell options={{ density: "compact" }} /> };

export const Document: Story = {
  name: "Page template: DocumentPage",
  render: () => (
    <AppShell appName="Acme" appLogo="A" navItems={navItems} activePath="/docs/guides/start" options={{ navigation: "page-tree", frame: "inset", configurable: false }}>
      <DocumentPage
        cover={<div className="h-full w-full bg-gradient-to-r from-primary/30 via-primary/10 to-muted" />}
        icon="📘"
        title="Getting started"
        subtitle="Edited 2 days ago"
        actions={
          <Button variant="ghost" size="sm">
            Share
          </Button>
        }
      >
        <p>
          A document page keeps long text at a readable width: a cover across the top, an icon over its edge, a large title, and
          the body in one centred column.
        </p>
        <p className="mt-4">Set width to full for tables and boards in the body.</p>
      </DocumentPage>
    </AppShell>
  ),
};
