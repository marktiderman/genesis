import type { AppThemeShell } from "@marktiderman/genesis-design-system/app-themes";
import type { AppShellOptions } from "./AppShell";

/**
 * The `AppShell` options an app theme asks for (`theme.shell`: density, rail
 * width, a collapsed rail, sub-navigation), to spread under the app's own:
 *
 * ```tsx
 * <AppShell options={{ ...appShellOptionsFromTheme(theme), scrollRoot: "window" }} … />
 * ```
 *
 * Nothing for no theme, or one that leaves the shell alone, so the app's
 * options and their defaults stand.
 *
 * @stability Beta
 */
export function appShellOptionsFromTheme(theme: { shell?: AppThemeShell | undefined } | null | undefined): Partial<AppShellOptions> {
  const shell = theme?.shell;
  if (!shell) return {};
  const out: Partial<AppShellOptions> = {};
  if (shell.density) out.density = shell.density;
  if (shell.railWidth) out.railWidth = shell.railWidth;
  if (shell.defaultCollapsed !== undefined) out.defaultCollapsed = shell.defaultCollapsed;
  if (shell.collapsedRailWidth) out.collapsedRailWidth = shell.collapsedRailWidth;
  if (shell.subNav) out.subNav = shell.subNav;
  return out;
}
