import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Building2, Plus, Settings } from "lucide-react";
import {
  AppShell,
  WorkspaceSwitcher,
  type WorkspaceSwitcherItemProps,
  type WorkspaceSwitcherProps,
} from "@marktiderman/genesis-ui/layout";

type Workspace = NonNullable<WorkspaceSwitcherProps["workspaces"]>[number];

const workspaces: Workspace[] = [
  { id: "me", kind: "personal", label: "Personal", path: "/me", scope: { personId: "p-1" } },
  { id: "all", kind: "rollup", label: "All organizations", path: "/all", scope: { orgId: ["org-1", "org-2", "org-3"] } },
  { id: "acme", kind: "tenant", label: "Acme Fitness", description: "Owner", path: "/o/acme", scope: { orgId: "org-1" } },
  { id: "globex", kind: "tenant", label: "Globex Studio", description: "Coach", path: "/o/globex", scope: { orgId: "org-2" } },
  { id: "initech", kind: "tenant", label: "Initech Wellness", description: "Admin", path: "/o/initech", scope: { orgId: "org-3" } },
];

const many: Workspace[] = [
  ...workspaces,
  ...["Northwind Gym", "Umbrella Health", "Stark Athletics", "Wayne Recovery", "Hooli Yoga", "Vandelay Barbell", "Soylent Nutrition"].map(
    (label, i): Workspace => ({
      id: `extra-${i}`,
      kind: "tenant",
      label,
      description: i % 2 ? "Coach" : "Staff",
      path: `/o/extra-${i}`,
      scope: { orgId: `org-x${i}` },
    }),
  ),
];

/** Links stay inside the story instead of leaving Storybook. */
const hrefFor = (w: Workspace) => `#${w.path}`;

const meta: Meta<typeof WorkspaceSwitcher> = {
  title: "Layout/WorkspaceSwitcher",
  component: WorkspaceSwitcher,
  args: { workspaces, current: workspaces[2], hrefFor },
  decorators: [
    (Story, { parameters }) =>
      parameters.bare ? (
        <Story />
      ) : (
        <div className="w-64 rounded-md border bg-sidebar">
          <Story />
        </div>
      ),
  ],
};
export default meta;
type Story = StoryObj<typeof WorkspaceSwitcher>;

/** The full row for AppShell's `headerSlot`. */
export const Sidebar: Story = {};

/** The picture alone, for the collapsed rail's `collapsedHeaderSlot`. */
export const Rail: Story = {
  args: { variant: "rail" },
  parameters: { bare: true },
  decorators: [
    (Story) => (
      <div className="w-14 rounded-md border bg-sidebar py-2">
        <Story />
      </div>
    ),
  ],
};

/** The name and a chevron, for the phone's top bar (`mobileHeaderSlot`). */
export const Bar: Story = { args: { variant: "bar" } };

/** Outside every workspace: the trigger asks the viewer to choose. */
export const NoCurrentWorkspace: Story = { args: { current: undefined } };

/** Counts and short statuses beside each workspace (`badge`); zero shows nothing. */
export const Badges: Story = {
  args: {
    workspaces: workspaces.map((w) =>
      w.id === "globex" ? { ...w, badge: 12 } : w.id === "initech" ? { ...w, badge: "new" } : w.id === "acme" ? { ...w, badge: 0 } : w,
    ),
    defaultOpen: true,
  },
};

const accents: Record<string, string> = { acme: "160 84% 39%", globex: "262 83% 58%", initech: "24 95% 53%" };
const branded = workspaces.map((w) => (accents[w.id] ? { ...w, theme: { accent: accents[w.id] } } : w));

/** Each workspace's brand (`theme.accent`) colors its own tile and row, darkened when too light for text. */
export const BrandThemes: Story = {
  args: { workspaces: branded, current: branded[2], defaultOpen: true },
};

/** Past seven workspaces the menu opens with a search box. */
export const Search: Story = {
  args: { workspaces: many },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /Switch workspace/ }));
    const body = within(canvasElement.ownerDocument.body);
    const box = await body.findByTestId("workspace-switcher-search");
    await waitFor(() => expect(box).toHaveFocus());
    await userEvent.type(box, "yoga");
    await expect(body.getAllByRole("menuitem").map((i) => i.getAttribute("data-testid"))).toEqual([
      "workspace-switcher-item-extra-4",
    ]);
    await userEvent.clear(box);
    await userEvent.type(box, "nothing like it");
    await expect(body.getByText("No workspaces found")).toBeVisible();
  },
};

/** Ctrl/⌘+Shift+O opens it; Alt+1 to Alt+9 jump straight to a workspace (numbered in the menu). */
export const KeyboardShortcuts: Story = {
  args: { shortcuts: { open: "mod+shift+o", jump: "alt" }, onNavigate: fn(), onSelect: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.keyboard("{Control>}{Shift>}o{/Shift}{/Control}");
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("menu")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("menu")).toBeNull());
    await userEvent.keyboard("{Alt>}4{/Alt}");
    await expect(args.onNavigate).toHaveBeenCalledWith("#/o/globex", workspaces[3]);
  },
};

/** Typed actions at the bottom of the menu. */
export const FooterActions: Story = {
  args: {
    defaultOpen: true,
    actions: [
      { id: "new", label: "New organization", icon: Plus, onSelect: fn(), shortcut: "⌘N" },
      { id: "manage", label: "Manage workspaces", icon: Settings, href: "#/settings/workspaces" },
    ],
  },
};

/**
 * Styling by part: `classNames` per part, and the CSS variables for the menu's width and the
 * pictures' corners. The same parts are reachable from a stylesheet through
 * `[data-scope="workspace-switcher"][data-part="item"][data-current]`.
 */
export const StyledParts: Story = {
  args: {
    defaultOpen: true,
    classNames: {
      trigger: "rounded-full border border-border",
      image: "[--workspace-switcher-image-radius:9999px]",
      "group-label": "uppercase tracking-wide",
      item: "data-[current]:bg-accent data-[current]:font-medium",
    },
    slotProps: { content: { className: "[--workspace-switcher-menu-width:20rem]" } },
  },
};

function CompactRow({ workspace, image, badge, current }: WorkspaceSwitcherItemProps) {
  return (
    <>
      {image}
      <span className="flex-1 truncate">{workspace.label}</span>
      {badge}
      {current ? <span className="text-xs text-muted-foreground">here</span> : null}
    </>
  );
}

/** Parts replaced through `slots`: a one-line row and a building icon for every tile. */
export const CustomSlots: Story = {
  args: {
    defaultOpen: true,
    slots: {
      item: CompactRow,
      image: ({ size }) => <Building2 aria-hidden className={size === "sm" ? "size-4" : "size-6"} />,
    },
  },
};

/** In AppShell: the sidebar row in `headerSlot`, the picture on the collapsed rail, the name on the phone. */
export const InAppShell: Story = {
  parameters: { layout: "fullscreen", bare: true },
  render: (args) => (
    <AppShell
      appName="Sample"
      navItems={[{ to: "#/o/acme", label: "Home", icon: Building2 }]}
      headerSlot={<WorkspaceSwitcher {...args} />}
      collapsedHeaderSlot={<WorkspaceSwitcher {...args} variant="rail" />}
      mobileHeaderSlot={<WorkspaceSwitcher {...args} variant="bar" />}
    >
      <p className="text-sm text-muted-foreground">Everything here belongs to {args.current?.label}.</p>
    </AppShell>
  ),
};
