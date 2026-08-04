import { Outlet, Link, useLocation } from "react-router";
import { AppShell, type NavItem } from "@marktiderman/genesis-ui/layout";
import type { LinkComponent } from "@marktiderman/genesis-ui";
import {
  Home,
  Sparkles,
  Palette,
  Component,
  LayoutTemplate,
  Database,
  BookOpen,
  SlidersHorizontal,
  LayoutDashboard,
  Package,
  List,
  CheckSquare,
  ShoppingCart,
  Settings,
  Blocks,
} from "lucide-react";

// Two groups below the marketing landing (`/`, outside this layout entirely
// — see `routes/_index.tsx`): the dev-facing "Showcase" (tokens, primitives,
// layouts, data, standards, the sandbox configurator) and a "Demo App" — a
// small, realistic app built from those same pieces, so a visitor can see
// them composed into real pages rather than only in isolation. `Sandbox`
// lives under Showcase, not Demo App: it's a ResourcePage config tool, not
// part of the "here's an app" narrative the Demo App group tells.
const navItems: NavItem[] = [
  { to: "/", icon: Home, label: "Home", end: true },
  {
    to: "/showcase",
    icon: Sparkles,
    label: "Showcase",
    children: [
      { to: "/showcase/tokens", icon: Palette, label: "Tokens" },
      { to: "/showcase/primitives", icon: Component, label: "Primitives" },
      { to: "/showcase/layouts", icon: LayoutTemplate, label: "Layouts" },
      { to: "/showcase/data", icon: Database, label: "Data & Resources" },
      { to: "/sandbox", icon: SlidersHorizontal, label: "Sandbox" },
      { to: "/showcase/standards", icon: BookOpen, label: "Standards" },
    ],
  },
  {
    to: "/dashboard",
    icon: LayoutDashboard,
    label: "Demo App",
    children: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/items", icon: Package, label: "Items (L1)" },
      { to: "/items-custom", icon: List, label: "Items (L2)" },
      { to: "/tasks", icon: CheckSquare, label: "Tasks" },
      { to: "/orders", icon: ShoppingCart, label: "Orders" },
      { to: "/settings", icon: Settings, label: "Settings" },
    ],
  },
  { to: "/design-system", icon: Blocks, label: "Kitchen Sink" },
];

// Flat, short list for the mobile bottom tab bar. AppShell's default
// (top-level `navItems` with any item that HAS children filtered out) would
// drop "Showcase" and "Demo App" entirely, since both are groups now — so a
// phone visitor needs an explicit, curated set instead.
const mobileNavItems: NavItem[] = [
  { to: "/", icon: Home, label: "Home", end: true },
  { to: "/showcase", icon: Sparkles, label: "Showcase" },
  { to: "/dashboard", icon: LayoutDashboard, label: "Demo" },
  { to: "/sandbox", icon: SlidersHorizontal, label: "Sandbox" },
  { to: "/design-system", icon: Blocks, label: "Kitchen Sink" },
];

// React Router adapter for genesis-ui's router-agnostic link contract.
// Map `testID` → `data-testid` (as DefaultLink does) so automation selectors
// survive on the RR path — React Router forwards `data-testid` to the anchor,
// but drops the non-standard `testID` prop.
const RouterLink: LinkComponent = ({ href, testID, ...props }) => (
  <Link to={href} data-testid={testID} {...props} />
);

export default function Layout() {
  const { pathname } = useLocation();
  return (
    <AppShell
      appName="Genesis Showcase"
      appLogo="G"
      navItems={navItems}
      mobileNavItems={mobileNavItems}
      linkComponent={RouterLink}
      activePath={pathname}
      // The custom `<ThemeControls>` card (rendered on /showcase and
      // /showcase/tokens) already covers light/dark/system + reduce-motion
      // in one place; AppShell's own built-in toggle uses a different
      // localStorage key and would fight it, so it's turned off here rather
      // than shipping two dark-mode switches that can disagree.
      options={{ showThemeToggle: false }}
    >
      <Outlet />
    </AppShell>
  );
}
