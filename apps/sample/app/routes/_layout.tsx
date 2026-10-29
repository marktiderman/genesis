import { Outlet } from "react-router";
import { BuildStamp } from "../components/site-footer";
import { AppShell, type NavigationNode, type NavItem } from "@marktiderman/genesis-ui/layout";
import {
  ReactRouterLink,
  useReactRouterActivePath,
} from "@marktiderman/genesis-ui/router/react-router";
import { Home, AppWindow, Building2, Blocks, Boxes, LayoutDashboard, Package, List, CheckSquare, ShoppingCart, Palette, SlidersHorizontal, Settings, Sparkles, Database, ClipboardList, PencilRuler, SwatchBook, Shapes, LayoutTemplate, ScrollText, ListChecks, Globe, MessagesSquare } from "lucide-react";

// Grouped so the sidebar reads as a site, not a list of routes: the sample
// app's screens, the building blocks on their own, and the design system.
const globalItems: NavItem[] = [
  { to: "/", icon: Home, label: "Home", end: true },
  {
    to: "/demo",
    icon: AppWindow,
    label: "Demo app",
    children: [
      { to: "/demo", icon: Building2, label: "Live demo" },
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/items", icon: Package, label: "Items" },
      { to: "/tasks", icon: CheckSquare, label: "Tasks" },
      { to: "/orders", icon: ShoppingCart, label: "Orders" },
      { to: "/settings", icon: Settings, label: "Settings" },
    ],
  },
  {
    to: "/forms",
    icon: Blocks,
    label: "Building blocks",
    children: [
      { to: "/forms", icon: ClipboardList, label: "Forms playground" },
      { to: "/forms-builder", icon: PencilRuler, label: "Form builder" },
      { to: "/studio", icon: Database, label: "Data Studio" },
      { to: "/chat", icon: MessagesSquare, label: "Chat" },
      { to: "/sites", icon: Globe, label: "Sites" },
      { to: "/features", icon: ListChecks, label: "Features" },
      { to: "/sandbox", icon: SlidersHorizontal, label: "List sandbox" },
      { to: "/items-custom", icon: List, label: "List, composed" },
    ],
  },
  {
    to: "/showcase",
    icon: Palette,
    label: "Design system",
    children: [
      { to: "/showcase", icon: Sparkles, label: "Components", end: true },
      { to: "/showcase/tokens", icon: SwatchBook, label: "Tokens" },
      { to: "/showcase/elements", icon: Shapes, label: "Elements" },
      { to: "/showcase/layouts", icon: LayoutTemplate, label: "Layouts" },
      { to: "/packages", icon: Boxes, label: "Packages" },
      { to: "/design-system", icon: Palette, label: "All on one page" },
    ],
  },
];

// The phone's bottom bar holds four destinations; the rest are in the menu.
const mobileItems: NavItem[] = [
  { to: "/", icon: Home, label: "Home", end: true },
  { to: "/demo", icon: AppWindow, label: "Demo" },
  { to: "/forms", icon: Blocks, label: "Blocks" },
  { to: "/showcase", icon: Palette, label: "Design" },
];

// Contextual nav while anywhere in the showcase.
const showcaseItems: NavItem[] = [
  { to: "/showcase", icon: Sparkles, label: "Overview", end: true },
  { to: "/showcase/tokens", icon: SwatchBook, label: "Tokens" },
  { to: "/showcase/elements", icon: Shapes, label: "Elements" },
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
          path: "/showcase/elements",
          label: "Elements",
          items: showcaseItems,
          children: [{ id: "primitive", path: "/showcase/elements/$slug", label: "Element", items: showcaseItems }],
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
      appName="Genesis"
      appLogo="G"
      navigation={navigation}
      mobileNavItems={mobileItems}
      footer={<BuildStamp className="px-3 text-xs text-muted-foreground" />}
      optionsStorageKey="genesis-sample:app-shell"
      // A wider design: a 64px rail and the opt-in `[` shortcut.
      options={{ collapsedRailWidth: 64, collapseShortcut: "[" }}
      linkComponent={ReactRouterLink}
      activePath={activePath}
    >
      <Outlet />
    </AppShell>
  );
}
