import { Outlet, Link, useLocation } from "react-router";
import {
  AppShell,
  type LinkComponent,
  type NavigationNode,
  type NavItem,
} from "@marktiderman/genesis-ui/layout";
import { LayoutDashboard, Package, List, CheckSquare, ShoppingCart, Palette, SlidersHorizontal, Settings, Sparkles, Database, ClipboardList, PencilRuler, SwatchBook, Shapes, LayoutTemplate, ScrollText } from "lucide-react";

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
  { to: "/settings", icon: Settings, label: "Settings" },
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

// React Router adapter for genesis-ui's router-agnostic link contract.
// Map `testID` → `data-testid` (as DefaultLink does) so automation selectors
// survive on the RR path — React Router forwards `data-testid` to the anchor,
// but drops the non-standard `testID` prop.
const RouterLink: LinkComponent = ({ href, testID, ...props }) => (
  <Link to={href} data-testid={testID} {...props} />
);

export default function Layout() {
  const { pathname, search, hash } = useLocation();
  return (
    <AppShell
      appName="Genesis Showcase"
      appLogo="G"
      navigation={navigation}
      linkComponent={RouterLink}
      activePath={`${pathname}${search}${hash}`}
    >
      <Outlet />
    </AppShell>
  );
}
