import { Outlet } from "react-router";
import { AppShell } from "@marktiderman/genesis-ui/data";
import {
  ReactRouterLink,
  useReactRouterActivePath,
} from "@marktiderman/genesis-ui/router/react-router";
import { LayoutDashboard, Package, List, CheckSquare, ShoppingCart, Palette, SlidersHorizontal, Settings, Sparkles, Database, ClipboardList, PencilRuler } from "lucide-react";

const navItems = [
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
  { to: "/settings", icon: Settings, label: "Settings" },
];

// genesis-ui ships the React Router adapter (link + full-location active
// path), so the app no longer hand-writes one.
export default function Layout() {
  const activePath = useReactRouterActivePath();
  return (
    <AppShell
      appName="Genesis Showcase"
      appLogo="G"
      navItems={navItems}
      linkComponent={ReactRouterLink}
      activePath={activePath}
    >
      <Outlet />
    </AppShell>
  );
}
