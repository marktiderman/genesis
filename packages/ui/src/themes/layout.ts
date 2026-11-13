import type { AppShellOptions } from "../components/layout/AppShell";
import type { AppThemeLayout } from "./define";

/**
 * The `AppShell` options an app theme starts from (`theme.layout`: density,
 * rail width, a collapsed rail, sub-navigation), to spread under the app's own:
 *
 * ```tsx
 * <AppShell options={{ ...appShellOptionsFromTheme(theme), scrollRoot: "window" }} … />
 * ```
 *
 * Nothing for no theme, or one that leaves the layout alone, so the app's
 * options and their defaults stand. These are defaults: where the shell is
 * `configurable`, the person's own choice still wins.
 *
 * @stability Beta
 */
export function appShellOptionsFromTheme(theme: { layout?: AppThemeLayout | undefined } | null | undefined): Partial<AppShellOptions> {
  const layout = theme?.layout;
  if (!layout) return {};
  const out: Partial<AppShellOptions> = {};
  if (layout.density) out.density = layout.density;
  if (layout.railWidth) out.railWidth = layout.railWidth;
  if (layout.defaultCollapsed !== undefined) out.defaultCollapsed = layout.defaultCollapsed;
  if (layout.collapsedRailWidth) out.collapsedRailWidth = layout.collapsedRailWidth;
  if (layout.subNav) out.subNav = layout.subNav;
  return out;
}
