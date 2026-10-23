import { Outlet } from "react-router";
import { AppShell, type NavigationNode, type NavItem } from "@marktiderman/genesis-ui/layout";
import {
  ReactRouterLink,
  useReactRouterActivePath,
} from "@marktiderman/genesis-ui/router/react-router";
import { LayoutDashboard, Package, List, CheckSquare, ShoppingCart, Palette, SlidersHorizontal, Settings, Sparkles, Database, ClipboardList, PencilRuler, SwatchBook, Shapes, LayoutTemplate, ScrollText, ListChecks, FolderKanban, FileText, Activity } from "lucide-react";

const globalItems: NavItem[] = [
  { to: "/showcase", icon: Sparkles, label: "Showcase" },
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/items", icon: Package, label: "Items (L1)" },
  { to: "/items-custom", icon: List, label: "Items (L2)" },
  { to: "/tasks", icon: CheckSquare, label: "Tasks" },
  { to: "/orders", icon: ShoppingCart, label: "Orders" },
  { to: "/design-system", icon: Palette, label: "Design System" },
  { to: "/sandbox", icon: SlidersHorizontal, label: "Sandbox" },
  { to: "/forms", icon: ClipboardList, label: "Forms playground" },
  { to: "/forms-builder", icon: PencilRuler, label: "Form builder" },
  { to: "/studio", icon: Database, label: "Data Studio" },
  { to: "/features", icon: ListChecks, label: "Features" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

// A project's four children. The page (`projects.$projectId.tsx`) hands over
// the same list with live badges through `useAppShellSubNav`.
const projectItems: NavItem[] = [
  { to: "/projects/$projectId", icon: FileText, label: "Overview", end: true },
  { to: "/projects/$projectId/tasks", icon: CheckSquare, label: "Tasks" },
  { to: "/projects/$projectId/activity", icon: Activity, label: "Activity" },
  { to: "/projects/$projectId/settings", icon: Settings, label: "Settings" },
];

// Contextual nav while anywhere in the showcase.
const showcaseItems: NavItem[] = [
  { to: "/showcase", icon: Sparkles, label: "Overview", end: true },
  { to: "/showcase/tokens", icon: SwatchBook, label: "Tokens" },
  { to: "/showcase/primitives", icon: Shapes, label: "Primitives" },
  { to: "/showcase/layouts", icon: LayoutTemplate, label: "Layouts" },
  { to: "/showcase/standards", icon: ScrollText, label: "Standards" },
];

// The app's logical hierarchy, declared once. AppShell derives the sidebar,
// the contextual section, the mobile tab bar and the back-to-parent link
// from it (`/showcase/layouts/auth` → back to Layouts).
const navigation: NavigationNode<NavItem> = {
  id: "home",
  path: "/",
  label: "Home",
  items: globalItems,
  children: [
    // The form builder needs the width: it opens with the sidebar as an icon
    // rail until the user picks a side with the toggle (or `[`).
    { id: "forms-builder", path: "/forms-builder", label: "Form builder", items: [], defaultCollapsed: true },
    {
      id: "projects",
      path: "/projects",
      label: "Projects",
      items: [],
      // Sub-navigation is opt-in; this subtree turns it on. The rest of the
      // app (the showcase's contextual section) renders as it always has.
      subNav: "tabs",
      children: [{ id: "project", path: "/projects/$projectId", label: "Project", items: projectItems }],
    },
    {
      id: "showcase",
      path: "/showcase",
      label: "Showcase",
      items: showcaseItems,
      children: [
        {
          id: "tokens",
          path: "/showcase/tokens",
          label: "Tokens",
          items: showcaseItems,
          children: [{ id: "token-category", path: "/showcase/tokens/$category", label: "Token category", items: showcaseItems }],
        },
        {
          id: "primitives",
          path: "/showcase/primitives",
          label: "Primitives",
          items: showcaseItems,
          children: [{ id: "primitive", path: "/showcase/primitives/$slug", label: "Primitive", items: showcaseItems }],
        },
        {
          id: "layouts",
          path: "/showcase/layouts",
          label: "Layouts",
          items: showcaseItems,
          children: [{ id: "layout", path: "/showcase/layouts/$slug", label: "Layout", items: showcaseItems }],
        },
        { id: "standards", path: "/showcase/standards", label: "Standards", items: showcaseItems },
      ],
    },
  ],
};

// genesis-ui ships the React Router adapter (link + full-location active
// path), so the app no longer hand-writes one.
export default function Layout() {
  const activePath = useReactRouterActivePath();
  return (
    <AppShell
      appName="Genesis Showcase"
      appLogo="G"
      navigation={navigation}
      optionsStorageKey="genesis-sample:app-shell"
      // The Breakthrough design: a 64px rail and the opt-in `[` shortcut.
      options={{ collapsedRailWidth: 64, collapseShortcut: "[" }}
      linkComponent={ReactRouterLink}
      activePath={activePath}
    >
      <Outlet />
    </AppShell>
  );
}
