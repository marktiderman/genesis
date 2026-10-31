import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  AppShell,
  AppShellPageHeader,
  AppShellSubNavEnd,
  useAppShellSubNav,
  type NavigationNode,
  type NavItem,
} from "@marktiderman/genesis-ui/layout";
import { Badge } from "@marktiderman/genesis-ui";
import {
  LayoutDashboard,
  Map,
  CheckSquare,
  Layers,
  Newspaper,
  ClipboardList,
  Home,
  Users,
  ListChecks,
  GitBranch,
  Inbox,
  Settings,
} from "lucide-react";

const meta: Meta<typeof AppShell> = {
  title: "Foundation/Data/AppShell",
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
      appName="Riverside Gym"
      appLogo="R"
      navItems={navItems}
      activePath="/tasks"
      defaultCollapsed={false}
      options={{ collapseShortcut: "[", collapsedRailWidth: 64 }}
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
      appName="Riverside Gym"
      appLogo="R"
      navItems={navItems}
      activePath="/tasks"
      defaultCollapsed
      options={{ collapseShortcut: "[", collapsedRailWidth: 64 }}
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
      appName="Riverside Gym"
      appLogo="R"
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

// ---------------------------------------------------------------------------
// Sub-navigation: a page's child items (a form's four tabs)
// ---------------------------------------------------------------------------

// A tree's items are `NavItem`s, so each has an icon. The page's own list
// (below, through the hook) is `SubNavItem`s and may leave icons out, as the
// design's tab row does.
const formTabs: NavItem[] = [
  { to: "/forms/$formId/edit", icon: ListChecks, label: "Questions", badge: 2, end: true },
  { to: "/forms/$formId/edit/logic", icon: GitBranch, label: "Logic and endings", badge: 1 },
  { to: "/forms/$formId/edit/responses", icon: Inbox, label: "Responses", badge: 2 },
  { to: "/forms/$formId/edit/settings", icon: Settings, label: "Settings" },
];

const formsTree: NavigationNode<NavItem> = {
  id: "app",
  path: "/",
  label: "Home",
  items: [
    { to: "/", icon: Home, label: "Home", end: true },
    { to: "/clients", icon: Users, label: "Clients" },
    { to: "/forms", icon: ClipboardList, label: "Forms" },
  ],
  children: [
    {
      id: "forms",
      path: "/forms",
      label: "Forms",
      items: [],
      children: [
        { id: "form", path: "/forms/$formId/edit", label: "Form", items: formTabs, defaultCollapsed: true },
      ],
    },
  ],
};

/**
 * What a form page does: live badges through the hook, its resource header
 * above the tab row (`AppShellPageHeader`), a chip in the row's end slot.
 */
function FormPage() {
  useAppShellSubNav([
    { to: "/forms/f1/edit", label: "Questions", badge: 2, end: true },
    { to: "/forms/f1/edit/logic", label: "Logic and endings", badge: 1 },
    { to: "/forms/f1/edit/responses", label: "Responses", badge: 2 },
    { to: "/forms/f1/edit/settings", label: "Settings" },
  ]);
  return (
    <div className="space-y-2">
      <AppShellSubNavEnd>
        <Badge variant="success">Ready to publish</Badge>
      </AppShellSubNavEnd>
      <AppShellPageHeader>
        <p className="text-xs text-muted-foreground">Forms › E2E Saturday check-in</p>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">E2E Saturday check-in</h1>
          <div className="flex gap-2">
            <button type="button" className="rounded-md border px-3 py-1.5 text-sm">Share</button>
            <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">
              Publish changes
            </button>
          </div>
        </div>
      </AppShellPageHeader>
      <p className="text-sm text-muted-foreground">Logic and endings is the current tab.</p>
    </div>
  );
}

const subNavShell = (
  subNav: "section" | "tabs" | "sidebar" | "off" | undefined,
  collapsed?: boolean,
) => (
  <AppShell
    appName="Riverside Gym"
    appLogo="R"
    navigation={formsTree}
    activePath="/forms/f1/edit/logic"
    subNav={subNav}
    defaultCollapsed={collapsed ?? false}
  >
    <FormPage />
  </AppShell>
);

/** No `subNav` anywhere: the shell renders a page's children as it always has. */
export const SubNavDefault: Story = {
  name: "Sub-nav: not set (legacy section)",
  render: () => subNavShell(undefined),
};

export const SubNavTabs: Story = {
  name: "Sub-nav: tabs",
  render: () => subNavShell("tabs"),
};

export const SubNavTabsCollapsed: Story = {
  name: "Sub-nav: tabs, sidebar collapsed",
  render: () => subNavShell("tabs", true),
};

export const SubNavSidebar: Story = {
  name: "Sub-nav: sidebar",
  render: () => subNavShell("sidebar"),
};

export const SubNavSidebarRail: Story = {
  name: "Sub-nav: sidebar, rail flyout",
  render: () => subNavShell("sidebar", true),
};

export const SubNavOff: Story = {
  name: "Sub-nav: off",
  render: () => subNavShell("off"),
};

export const SubNavPhone: Story = {
  name: "Sub-nav: phone bottom bar",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => subNavShell("tabs"),
};

/**
 * The tab row is hidden on phones (the bottom bar carries the children), so
 * the page's `<AppShellSubNavEnd>` chip moves to a strip under the page
 * header, and a disabled Publish keeps its reason in view.
 */
export const SubNavPhoneEndSlot: Story = {
  name: "Sub-nav: phone, end-slot chip under the header",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => subNavShell("tabs"),
};

export const SubNavPhoneDefault: Story = {
  name: "Sub-nav: phone, not set (legacy bar)",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => subNavShell(undefined),
};

export const SubNavPhoneOff: Story = {
  name: "Sub-nav: phone, off keeps the main bar",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => subNavShell("off"),
};

/**
 * An app-wide `mobileNavItems` (as an app may pass) still yields to a
 * page's children while sub-navigation is on.
 */
export const SubNavPhoneOverAppBar: Story = {
  name: "Sub-nav: phone, children win over mobileNavItems",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => (
    <AppShell
      appName="Riverside Gym"
      appLogo="R"
      navigation={formsTree}
      activePath="/forms/f1/edit/logic"
      subNav="tabs"
      mobileNavItems={formsTree.items}
    >
      <FormPage />
    </AppShell>
  ),
};
