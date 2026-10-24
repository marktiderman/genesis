/**
 * Consumer type test, compiled against the BUILT package (`dist`, through the
 * package's own `exports`) under `strict`, exactly as an app sees it:
 * `pnpm --filter @marktiderman/genesis-ui typecheck` after a build.
 *
 * Locks in that `NavItem.icon` stays required, so apps that render
 * `<item.icon />` (an app's shell does) keep compiling, while
 * sub-navigation items (`SubNavItem`) may omit it.
 */
import type { ReactElement } from "react";
import { LayoutDashboard } from "lucide-react";
import {
  useAppShellSubNav,
  type NavItem,
  type NavigationNode,
  type SubNavItem,
} from "@marktiderman/genesis-ui/layout";

export function Row({ item }: { item: NavItem }): ReactElement {
  return <item.icon className="h-4 w-4" />;
}

export function Rows({ tree }: { tree: NavigationNode<NavItem> }): ReactElement {
  return (
    <>
      {tree.items.map((item) => (
        <item.icon key={item.to} />
      ))}
      {tree.items.flatMap((item) => item.children ?? []).map((child) => (
        <child.icon key={child.to} />
      ))}
    </>
  );
}

// @ts-expect-error — a NavItem without an icon is still an error.
export const missingIcon: NavItem = { to: "/x", label: "X" };

export const withIcon: NavItem = { to: "/x", icon: LayoutDashboard, label: "X" };

// Every NavItem is a SubNavItem; a SubNavItem may omit its icon.
export const asSub: SubNavItem = withIcon;
export const iconless: SubNavItem = { to: "/y", label: "Y", badge: 2 };

export function Page(): null {
  useAppShellSubNav([withIcon, iconless]);
  return null;
}
