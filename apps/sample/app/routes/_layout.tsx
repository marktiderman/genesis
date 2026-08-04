import { Outlet, Link, useLocation } from "react-router";
import { AppShell, type LinkComponent } from "@marktiderman/genesis-ui/data";
import { LayoutDashboard, Package, List, CheckSquare, ShoppingCart, Palette, SlidersHorizontal, Settings, Sparkles } from "lucide-react";

const navItems = [
  { to: "/showcase", icon: Sparkles, label: "Showcase" },
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/items", icon: Package, label: "Items (L1)" },
  { to: "/items-custom", icon: List, label: "Items (L2)" },
  { to: "/tasks", icon: CheckSquare, label: "Tasks" },
  { to: "/orders", icon: ShoppingCart, label: "Orders" },
  { to: "/design-system", icon: Palette, label: "Design System" },
  { to: "/sandbox", icon: SlidersHorizontal, label: "Sandbox" },
  { to: "/settings", icon: Settings, label: "Settings" },
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
      linkComponent={RouterLink}
      activePath={pathname}
    >
      <Outlet />
    </AppShell>
  );
}
