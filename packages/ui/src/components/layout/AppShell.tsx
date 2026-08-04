"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Menu,
  X,
  Sun,
  Moon,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeft,
  ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import { Collapsible, CollapsibleContent } from "../ui/collapsible";
import { cn } from "../../utils";
import { readStoredOptions, writeStoredOptions } from "../../option-storage";
import {
  DefaultLink,
  isPathActive,
  type LinkComponent,
} from "../../navigation";

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Nested items — rendered as a collapsible group when the rail is expanded */
  children?: NavItem[];
  badge?: string | number;
  disabled?: boolean;
  /** Exact-match active state (e.g. overview `/`) */
  end?: boolean;
}

/**
 * Declarative chrome for AppShell — developer defaults + optional
 * in-sidebar user toggles (Notion/Linear “customize chrome” pattern).
 *
 * @stability Beta
 */
export interface AppShellOptions {
  showLogo?: boolean;
  showAppName?: boolean;
  showThemeToggle?: boolean;
  /** Desktop rail collapse control */
  showCollapse?: boolean;
  showUserSlot?: boolean;
  showFooter?: boolean;
  showSecondaryNav?: boolean;
  /** Mobile fixed bottom tab bar */
  showMobileBottomNav?: boolean;
  defaultCollapsed?: boolean;
  /**
   * Show the in-sidebar Sidebar options popover so users can customize chrome.
   * Default true when collapse / secondary / theme / slots are available.
   */
  configurable?: boolean;
  /**
   * Toggle keys the developer has decided on and users may not override —
   * e.g. hiding `showThemeToggle` for a brand that manages theme elsewhere.
   * Locked keys are dropped from the options popover and any stored user
   * override for them is ignored on resolve.
   */
  lockedOptions?: (keyof AppShellOptions)[];
  /** Comfortable (default) vs compact row padding */
  density?: "comfortable" | "compact";
  /** Expanded rail width in rem-ish tokens: narrow ≈ 13rem, wide ≈ 16rem */
  railWidth?: "narrow" | "wide";
  /**
   * Where page content scrolls.
   * - `container` (default): main panel scrolls — classic app-shell chrome.
   * - `window`: document/window scrolls with a sticky rail so React Router
   *   `ScrollRestoration` keeps working (dashboard dogfood).
   */
  scrollRoot?: "container" | "window";
}

const OPTION_DEFAULTS: Required<
  Omit<AppShellOptions, "configurable" | "defaultCollapsed" | "lockedOptions">
> &
  Pick<AppShellOptions, "configurable" | "defaultCollapsed" | "lockedOptions"> = {
  showLogo: true,
  showAppName: true,
  showThemeToggle: true,
  showCollapse: true,
  showUserSlot: true,
  showFooter: true,
  showSecondaryNav: true,
  showMobileBottomNav: true,
  defaultCollapsed: false,
  configurable: undefined,
  density: "comfortable",
  railWidth: "narrow",
  scrollRoot: "container",
};

function readStoredCollapsed(key: string): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(`${key}:collapsed`);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return undefined;
  } catch {
    return undefined;
  }
}

function writeStoredCollapsed(key: string, collapsed: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${key}:collapsed`, collapsed ? "1" : "0");
  } catch {
    // quota / private mode
  }
}

/**
 * @stability Beta
 */
export interface AppShellProps {
  /** App name shown in sidebar header */
  appName: string;
  /** App logo letter or short text (ignored when `logo` is set) */
  appLogo?: string;
  /** Custom logo node — preferred over `appLogo` letter tile */
  logo?: ReactNode;
  /** Primary navigation items */
  navItems: NavItem[];
  /** Secondary nav (e.g. “More”) — rendered below a divider when shown */
  secondaryNavItems?: NavItem[];
  /** Label above secondary nav (default “More”) */
  secondaryNavLabel?: string;
  /**
   * Items for the mobile bottom tab bar. Defaults to top-level `navItems`
   * (no children). Pass a short list for apps with large sidebars; pass `[]`
   * and set `options.showMobileBottomNav: false` to hide.
   */
  mobileNavItems?: NavItem[];
  /** Slot below the logo row (product switcher, workspace picker, …) */
  headerSlot?: ReactNode;
  /**
   * Compact slot shown in the **collapsed** desktop rail, where `headerSlot`
   * is hidden for space. Use it to keep a core affordance reachable without
   * expanding — e.g. an icon-only product switcher. Omit to hide the header
   * region entirely while collapsed.
   */
  collapsedHeaderSlot?: ReactNode;
  /** Footer region above the user slot (version, links) */
  footer?: ReactNode;
  /**
   * User / account block at the bottom of the sidebar. When the rail is
   * collapsed, AppShell hides any descendant carrying the
   * `data-shell-user-detail` attribute (e.g. name/email text) so only a
   * compact element (avatar, initial) remains — tag the detail wrapper you
   * want hidden in the collapsed rail with that attribute.
   */
  userSlot?: ReactNode;
  /** Page content */
  children: ReactNode;
  /**
   * @deprecated Prefer `options.showThemeToggle`. Kept for sample-app
   * back-compat; merges into resolved options when `options` omits it.
   */
  showThemeToggle?: boolean;
  /** Chrome config (developer defaults + optional in-sidebar menu) */
  options?: AppShellOptions;
  /** Persist user sidebar-option overrides + collapse state (localStorage) */
  optionsStorageKey?: string;
  /** Controlled collapse (desktop rail) */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /**
   * Injectable link component. Defaults to a plain `<a>` (no router). Pass a
   * router adapter — e.g. React Router `({ href, ...p }) => <Link to={href} {...p} />`
   * or Next.js `next/link` — to get client-side navigation.
   */
  linkComponent?: LinkComponent;
  /**
   * Current path used to highlight the active nav item. Router consumers pass
   * `useLocation().pathname` (RR) or `usePathname()` (Next). Omit to disable
   * active highlighting.
   */
  activePath?: string;
  /**
   * Optional custom active-state matcher. Defaults to a prefix match (with `/`
   * treated as exact), mirroring React Router `NavLink`.
   */
  isActive?: (to: string, activePath?: string) => boolean;
}

function ThemeToggle({ testId }: { testId: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const isDark = stored === "dark" || (!stored && prefersDark);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="h-8 w-8"
      title="Toggle theme"
      aria-label="Toggle theme"
      data-testid={testId}
      testID={testId}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function itemIsActive(
  item: NavItem,
  activePath: string | undefined,
  isActive: (to: string, activePath?: string) => boolean,
): boolean {
  if (item.end) {
    return Boolean(activePath && activePath === item.to);
  }
  if (isActive(item.to, activePath)) return true;
  return Boolean(
    item.children?.some((child) => itemIsActive(child, activePath, isActive)),
  );
}

function NavLinkRow({
  item,
  collapsed,
  density,
  onNavClick,
  linkComponent: LinkComp,
  activePath,
  isActive,
}: {
  item: NavItem;
  collapsed: boolean;
  density: "comfortable" | "compact";
  onNavClick?: () => void;
  linkComponent: LinkComponent;
  activePath?: string;
  isActive: (to: string, activePath?: string) => boolean;
}) {
  const active = itemIsActive(item, activePath, isActive);
  const pad = density === "compact" ? "px-2.5 py-1.5" : "px-3 py-2";

  if (item.disabled) {
    return (
      <span
        title={item.label}
        className={cn(
          "flex items-center gap-3 rounded-lg text-sm font-medium opacity-40",
          pad,
          collapsed && "justify-center px-2",
        )}
        aria-disabled
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed ? <span className="truncate">{item.label}</span> : null}
      </span>
    );
  }

  return (
    <LinkComp
      href={item.to}
      onClick={onNavClick}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
        pad,
        collapsed && "justify-center px-2",
        active
          ? "bg-sidebar-accent text-sidebar-primary"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.badge != null ? (
            <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
              {item.badge}
            </Badge>
          ) : null}
        </>
      ) : null}
    </LinkComp>
  );
}

function NavGroup({
  item,
  collapsed,
  density,
  onNavClick,
  linkComponent,
  activePath,
  isActive,
}: {
  item: NavItem;
  collapsed: boolean;
  density: "comfortable" | "compact";
  onNavClick?: () => void;
  linkComponent: LinkComponent;
  activePath?: string;
  isActive: (to: string, activePath?: string) => boolean;
}) {
  const children = item.children ?? [];
  const childActive = children.some((c) =>
    itemIsActive(c, activePath, isActive),
  );
  const [open, setOpen] = useState(childActive);

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  if (children.length === 0) {
    return (
      <NavLinkRow
        item={item}
        collapsed={collapsed}
        density={density}
        onNavClick={onNavClick}
        linkComponent={linkComponent}
        activePath={activePath}
        isActive={isActive}
      />
    );
  }

  // Collapsed rail: only the parent link (or first child if parent is a group stub)
  if (collapsed) {
    const target: NavItem = item.to
      ? { ...item, children: undefined }
      : { ...children[0]!, children: undefined };
    return (
      <NavLinkRow
        item={target}
        collapsed
        density={density}
        onNavClick={onNavClick}
        linkComponent={linkComponent}
        activePath={activePath}
        isActive={isActive}
      />
    );
  }

  // Parent may be its own route (`item.to`) — keep a real link and a separate
  // expand control so groups under an existing page stay navigable + highlightable.
  // Visual highlight may use prefix match; aria-current is exact-only so a child
  // route does not leave two "page" currents in the tree (CMT-322-008).
  const selfExact = Boolean(item.to && activePath && activePath === item.to);
  const selfActive = item.to
    ? item.end
      ? selfExact
      : isActive(item.to, activePath)
    : false;
  const groupHighlight = selfActive || childActive;
  const pad = density === "compact" ? "px-2.5 py-1.5" : "px-3 py-2";
  const LinkComp = linkComponent;
  const parentClass = cn(
    "flex min-w-0 flex-1 items-center gap-3 rounded-lg text-sm font-medium transition-colors",
    pad,
    groupHighlight
      ? "bg-sidebar-accent/60 text-sidebar-primary"
      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="space-y-0.5">
        <div className="flex items-center gap-0.5" data-testid={`nav-group-${item.label}`}>
          {item.to && !item.disabled ? (
            <LinkComp
              href={item.to}
              onClick={onNavClick}
              aria-current={selfExact ? "page" : undefined}
              className={parentClass}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
            </LinkComp>
          ) : (
            <button
              type="button"
              className={parentClass}
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-disabled={item.disabled || undefined}
              disabled={item.disabled}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
            </button>
          )}
          <button
            type="button"
            className={cn(
              "shrink-0 rounded-lg p-1.5 text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
              groupHighlight && "text-sidebar-primary",
              item.disabled && "pointer-events-none opacity-40",
            )}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? `Collapse ${item.label}` : `Expand ${item.label}`}
            aria-disabled={item.disabled || undefined}
            disabled={item.disabled}
            data-testid={`nav-group-toggle-${item.label}`}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 opacity-60 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </div>
        <CollapsibleContent>
          <div className="ml-3 space-y-0.5 border-l border-sidebar-border pl-2">
            {children.map((child) => (
              <NavLinkRow
                key={child.to + child.label}
                item={child}
                collapsed={false}
                density={density}
                onNavClick={onNavClick}
                linkComponent={linkComponent}
                activePath={activePath}
                isActive={isActive}
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function SidebarNav({
  navItems,
  secondaryNavItems,
  secondaryNavLabel,
  showSecondary,
  collapsed,
  density,
  onNavClick,
  linkComponent,
  activePath,
  isActive,
}: {
  navItems: NavItem[];
  secondaryNavItems?: NavItem[];
  secondaryNavLabel: string;
  showSecondary: boolean;
  collapsed: boolean;
  density: "comfortable" | "compact";
  onNavClick?: () => void;
  linkComponent: LinkComponent;
  activePath?: string;
  isActive: (to: string, activePath?: string) => boolean;
}) {
  return (
    <nav
      className={cn(
        "flex-1 space-y-1 overflow-y-auto",
        collapsed ? "p-2" : "p-3",
      )}
      aria-label="Main"
    >
      {navItems.map((item) => (
        <NavGroup
          key={item.to + item.label}
          item={item}
          collapsed={collapsed}
          density={density}
          onNavClick={onNavClick}
          linkComponent={linkComponent}
          activePath={activePath}
          isActive={isActive}
        />
      ))}

      {showSecondary && secondaryNavItems && secondaryNavItems.length > 0 ? (
        <div
          className={cn(
            "mt-4 space-y-1 border-t border-sidebar-border pt-4",
            collapsed && "mt-2 pt-2",
          )}
        >
          {!collapsed ? (
            <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/40">
              {secondaryNavLabel}
            </p>
          ) : null}
          {secondaryNavItems.map((item) => (
            <NavGroup
              key={item.to + item.label}
              item={item}
              collapsed={collapsed}
              density={density}
              onNavClick={onNavClick}
              linkComponent={linkComponent}
              activePath={activePath}
              isActive={isActive}
            />
          ))}
        </div>
      ) : null}
    </nav>
  );
}

function SidebarBrand({
  appName,
  appLogo,
  logo,
  showLogo,
  showAppName,
  collapsed,
}: {
  appName: string;
  appLogo?: string;
  logo?: ReactNode;
  showLogo: boolean;
  showAppName: boolean;
  collapsed: boolean;
}) {
  if (!showLogo && !showAppName) return null;

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2",
        collapsed && "justify-center",
      )}
    >
      {showLogo ? (
        logo ? (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden">
            {logo}
          </div>
        ) : appLogo ? (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">
              {appLogo}
            </span>
          </div>
        ) : null
      ) : null}
      {showAppName && !collapsed ? (
        <span className="truncate font-semibold text-sidebar-foreground">
          {appName}
        </span>
      ) : null}
    </div>
  );
}

type ToggleDef = {
  key: keyof AppShellOptions;
  label: string;
  available: boolean;
};

export function AppShell({
  appName,
  appLogo,
  logo,
  navItems,
  secondaryNavItems,
  secondaryNavLabel = "More",
  mobileNavItems,
  headerSlot,
  collapsedHeaderSlot,
  footer,
  userSlot,
  children,
  showThemeToggle: showThemeToggleProp,
  options: optionsProp,
  optionsStorageKey,
  collapsed: collapsedProp,
  onCollapsedChange,
  linkComponent = DefaultLink,
  activePath,
  isActive = isPathActive,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userOverrides, setUserOverrides] = useState<Partial<AppShellOptions>>(
    {},
  );
  // Tracks which storage key the current overrides were hydrated from, so a
  // key change can't flush the previous key's overrides into the new key
  // before the read effect re-hydrates.
  const [hydratedKey, setHydratedKey] = useState<string | undefined>(
    optionsStorageKey ? undefined : "",
  );

  // Close the drawer on any path change (product switcher, deep links, …).
  useEffect(() => {
    setMobileOpen(false);
  }, [activePath]);

  const hasSecondary = Boolean(secondaryNavItems && secondaryNavItems.length);
  const hasUser = userSlot != null;
  const hasFooter = footer != null;
  const hasLogo = Boolean(logo || appLogo);

  useEffect(() => {
    if (!optionsStorageKey) {
      setUserOverrides({});
      setHydratedKey("");
      return;
    }
    setUserOverrides(readStoredOptions<AppShellOptions>(optionsStorageKey));
    setHydratedKey(optionsStorageKey);
  }, [optionsStorageKey]);

  useEffect(() => {
    // Persist only once overrides belong to the current key (see hydratedKey).
    if (!optionsStorageKey || hydratedKey !== optionsStorageKey) return;
    writeStoredOptions<AppShellOptions>(optionsStorageKey, userOverrides);
  }, [optionsStorageKey, userOverrides, hydratedKey]);

  const lockedOptions = optionsProp?.lockedOptions;

  const resolved = useMemo(() => {
    const merged: AppShellOptions = {
      ...OPTION_DEFAULTS,
      ...(showThemeToggleProp !== undefined
        ? { showThemeToggle: showThemeToggleProp }
        : {}),
      ...optionsProp,
      ...userOverrides,
    };
    if (merged.configurable === undefined) {
      merged.configurable =
        hasSecondary ||
        hasUser ||
        hasFooter ||
        Boolean(merged.showCollapse) ||
        Boolean(merged.showThemeToggle);
    }
    // Locked keys always resolve to the developer default, never a stored
    // or in-session user override.
    if (lockedOptions?.length) {
      const defaults = OPTION_DEFAULTS as Record<string, unknown>;
      const devOptions = optionsProp as Record<string, unknown> | undefined;
      const target = merged as Record<string, unknown>;
      for (const key of lockedOptions) {
        target[key] = devOptions?.[key] ?? defaults[key];
      }
    }
    return merged;
  }, [
    optionsProp,
    userOverrides,
    showThemeToggleProp,
    hasSecondary,
    hasUser,
    hasFooter,
    lockedOptions,
  ]);

  const patchOption = useCallback(
    (key: keyof AppShellOptions, value: boolean) => {
      if (lockedOptions?.includes(key)) return;
      setUserOverrides((prev) => ({ ...prev, [key]: value }));
    },
    [lockedOptions],
  );

  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState(
    () =>
      optionsProp?.defaultCollapsed ?? OPTION_DEFAULTS.defaultCollapsed!,
  );

  useEffect(() => {
    if (!optionsStorageKey || collapsedProp !== undefined) return;
    const stored = readStoredCollapsed(optionsStorageKey);
    if (stored !== undefined) setUncontrolledCollapsed(stored);
  }, [optionsStorageKey, collapsedProp]);

  const isCollapseControlled = collapsedProp !== undefined;
  const collapsed = isCollapseControlled
    ? collapsedProp!
    : uncontrolledCollapsed;

  const setCollapsed = (next: boolean) => {
    if (!isCollapseControlled) {
      setUncontrolledCollapsed(next);
      if (optionsStorageKey) writeStoredCollapsed(optionsStorageKey, next);
    }
    onCollapsedChange?.(next);
  };

  const density = resolved.density ?? "comfortable";
  const scrollWindow = resolved.scrollRoot === "window";
  const railExpanded =
    resolved.railWidth === "wide" ? "md:w-64" : "md:w-52";
  const railClass = collapsed ? "md:w-14" : railExpanded;

  const bottomItems = (
    mobileNavItems ??
    navItems.filter((i) => !i.children || i.children.length === 0)
  ).filter((i) => !i.disabled);

  const toggles: ToggleDef[] = (
    [
      { key: "showLogo", label: "Logo", available: hasLogo },
      { key: "showAppName", label: "App name", available: true },
      {
        key: "showThemeToggle",
        label: "Theme toggle",
        available: true,
      },
      { key: "showCollapse", label: "Collapse control", available: true },
      {
        key: "showSecondaryNav",
        label: "Secondary nav",
        available: hasSecondary,
      },
      { key: "showFooter", label: "Footer", available: hasFooter },
      { key: "showUserSlot", label: "User block", available: hasUser },
      {
        key: "showMobileBottomNav",
        label: "Mobile bottom nav",
        available: bottomItems.length > 0,
      },
    ] as const satisfies readonly ToggleDef[]
  ).filter((t) => t.available && !lockedOptions?.includes(t.key));

  const showTheme = resolved.showThemeToggle !== false;
  const showCollapseCtrl = resolved.showCollapse !== false;
  const showSecondary = hasSecondary && resolved.showSecondaryNav !== false;
  const showFooterSlot = hasFooter && resolved.showFooter !== false;
  const showUser = hasUser && resolved.showUserSlot !== false;
  const showMobileBottom =
    bottomItems.length > 0 && resolved.showMobileBottomNav !== false;

  const optionsControl =
    resolved.configurable && toggles.length > 0 ? (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Sidebar options"
            aria-label="Sidebar options"
            data-testid="app-shell-options"
            testID="app-shell-options"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-64 space-y-3">
          <div>
            <h4 className="text-sm font-semibold">Sidebar options</h4>
            <p className="text-xs text-muted-foreground">
              Customize this sidebar. Saved on this device when a storage key is
              set.
            </p>
          </div>
          <ul className="space-y-3">
            {toggles.map((t) => {
              const checked = Boolean(resolved[t.key] ?? true);
              return (
                <li
                  key={t.key}
                  className="flex items-center justify-between gap-3"
                >
                  <Label
                    htmlFor={`app-shell-opt-${t.key}`}
                    className="text-sm font-normal"
                  >
                    {t.label}
                  </Label>
                  <Switch
                    id={`app-shell-opt-${t.key}`}
                    checked={checked}
                    onCheckedChange={(v) => patchOption(t.key, v)}
                  />
                </li>
              );
            })}
          </ul>
          {optionsStorageKey && Object.keys(userOverrides).length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full text-xs"
              onClick={() => setUserOverrides({})}
              data-testid="app-shell-options-reset"
              aria-label="Reset sidebar options"
              testID="app-shell-options-reset"
            >
              Reset to defaults
            </Button>
          ) : null}
        </PopoverContent>
      </Popover>
    ) : null;

  const sidebarChrome = (opts: { mobile?: boolean }) => (
    <>
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border",
          collapsed && !opts.mobile ? "justify-center px-2" : "px-3",
        )}
      >
        <div className="min-w-0 flex-1">
          <SidebarBrand
            appName={appName}
            appLogo={appLogo}
            logo={logo}
            showLogo={resolved.showLogo !== false}
            showAppName={resolved.showAppName !== false}
            collapsed={collapsed && !opts.mobile}
          />
        </div>
        {opts.mobile ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            data-testid="app-shell-mobile-close"
            testID="app-shell-mobile-close"
          >
            <X className="h-5 w-5" />
          </Button>
        ) : (
          <div className="flex shrink-0 items-center gap-0.5">
            {showCollapseCtrl ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCollapsed(!collapsed)}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-pressed={collapsed}
                data-testid="app-shell-collapse"
                testID="app-shell-collapse"
              >
                {collapsed ? (
                  <PanelLeft className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
            ) : null}
            {!collapsed ? optionsControl : null}
          </div>
        )}
      </div>

      {collapsed && !opts.mobile ? (
        collapsedHeaderSlot ? (
          <div className="shrink-0 border-b border-sidebar-border p-2">
            {collapsedHeaderSlot}
          </div>
        ) : null
      ) : headerSlot ? (
        <div className="shrink-0 border-b border-sidebar-border">
          {headerSlot}
        </div>
      ) : null}

      <SidebarNav
        navItems={navItems}
        secondaryNavItems={secondaryNavItems}
        secondaryNavLabel={secondaryNavLabel}
        showSecondary={showSecondary}
        collapsed={collapsed && !opts.mobile}
        density={density}
        onNavClick={opts.mobile ? () => setMobileOpen(false) : undefined}
        linkComponent={linkComponent}
        activePath={activePath}
        isActive={isActive}
      />

      {(showFooterSlot || showUser || showTheme || (collapsed && optionsControl)) &&
      !opts.mobile ? (
        <div className="mt-auto shrink-0 space-y-2 border-t border-sidebar-border p-2">
          {showFooterSlot && !collapsed ? footer : null}
          {showUser ? (
            <div
              className={cn(
                collapsed &&
                  "flex justify-center [&_[data-shell-user-detail]]:hidden",
              )}
            >
              {userSlot}
            </div>
          ) : null}
          <div
            className={cn(
              "flex items-center gap-1",
              collapsed ? "flex-col" : "justify-end",
            )}
          >
            {collapsed ? optionsControl : null}
            {showTheme ? (
              <ThemeToggle testId="app-shell-theme-toggle-desktop" />
            ) : null}
          </div>
        </div>
      ) : null}

      {opts.mobile && (showFooterSlot || showUser || showTheme) ? (
        <div className="mt-auto shrink-0 space-y-2 border-t border-sidebar-border p-3">
          {showFooterSlot ? footer : null}
          {showUser ? userSlot : null}
          {showTheme ? (
            <div className="flex justify-end">
              <ThemeToggle testId="app-shell-theme-toggle-mobile-drawer" />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );

  return (
    <div
      className={cn(
        "flex",
        scrollWindow ? "min-h-screen" : "h-screen overflow-hidden",
      )}
    >
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
          scrollWindow && "sticky top-0 h-screen",
          railClass,
        )}
        data-collapsed={collapsed || undefined}
        data-testid="app-shell-sidebar"
      >
        {sidebarChrome({})}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* Mobile sidebar — inert when closed so off-screen links leave tab order */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-sidebar-border bg-sidebar transition-transform md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full pointer-events-none",
        )}
        id="app-shell-mobile-nav"
        aria-hidden={!mobileOpen}
        inert={!mobileOpen || undefined}
      >
        {sidebarChrome({ mobile: true })}
      </aside>

      {/* Main content */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          !scrollWindow && "overflow-hidden",
        )}
      >
        <header
          className={cn(
            "flex h-14 items-center gap-3 border-b px-4 md:hidden",
            scrollWindow && "sticky top-0 z-20 bg-background",
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            aria-controls="app-shell-mobile-nav"
            data-testid="app-shell-mobile-open"
            testID="app-shell-mobile-open"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="flex-1 truncate font-semibold">{appName}</span>
          {showTheme ? (
            <ThemeToggle testId="app-shell-theme-toggle-mobile-header" />
          ) : null}
        </header>

        <main
          className={cn(
            "flex-1",
            !scrollWindow && "overflow-y-auto",
            showMobileBottom ? "pb-16 md:pb-0" : "pb-0",
          )}
        >
          <div className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</div>
        </main>

        {showMobileBottom ? (
          <nav
            className="fixed bottom-0 left-0 right-0 z-30 flex border-t bg-background md:hidden"
            aria-label="Primary"
          >
            {bottomItems.map((item) => {
              const LinkComp = linkComponent;
              const active = itemIsActive(item, activePath, isActive);
              return (
                <LinkComp
                  key={item.to + item.label}
                  href={item.to}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="max-w-full truncate px-0.5">
                    {item.label}
                  </span>
                </LinkComp>
              );
            })}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
