"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
  ChevronRight,
  ArrowLeft,
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
import { Tooltip } from "../ui/tooltip";
import {
  itemIsActive,
  mostSpecificActive,
  SubNavContext,
  SubNavTabs,
  useSubNavChannel,
  type SubNavItem,
  type SubNavMode,
} from "./sub-nav";
import { cn } from "../../utils";
import { useIsMobile } from "../../hooks/use-mobile";
import { readStoredOptions, writeStoredOptions } from "../../option-storage";
import {
  DefaultLink,
  isPathActive,
  resolveNavigation,
  type LinkComponent,
  type NavigationNode,
} from "../../navigation";

export interface NavItem {
  /** Route, optionally with `?search` / `#hash` (see `isPathActive`). */
  to: string;
  icon: LucideIcon;
  label: string;
  /** Nested items — rendered as a collapsible group when the rail is expanded */
  children?: NavItem[];
  /**
   * A count (`3`) or a short status (`"New"`), shown as a chip: in the
   * sidebar, the sub-navigation tabs and the mobile bar; as a dot on the
   * collapsed rail. It is part of the item's accessible name where the label
   * is hidden.
   */
  badge?: string | number;
  disabled?: boolean;
  /**
   * Exact-match active state (e.g. overview `/`). Exact on the path only, so
   * an `activePath` carrying `?search#hash` still matches.
   */
  end?: boolean;
}

/**
 * The "up" link AppShell renders above page content: a real link to the
 * logical parent, never `history.back()`.
 *
 * @stability Beta
 */
export interface ParentNavigation {
  href: string;
  label: string;
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
  /**
   * Open the desktop sidebar collapsed (an icon rail, `collapsedRailWidth` wide) when the user hasn't
   * chosen. The app-wide default; a page asks for its own through
   * `AppShellProps.defaultCollapsed` or `NavigationNode.defaultCollapsed`.
   */
  defaultCollapsed?: boolean;
  /**
   * Opt-in key that toggles the desktop sidebar, e.g. `"["` as in Linear and
   * Notion. Off (`false`) by default. It never fires while typing in a field,
   * while a listbox, combobox or menu has focus (Select typeahead), while a
   * dialog is open, with Ctrl/Cmd/Alt held, or when `showCollapse` is off.
   */
  collapseShortcut?: string | false;
  /**
   * Width of the collapsed icon rail in px: `56` (default, as before) or
   * `64` (a wider rail some apps use).
   */
  collapsedRailWidth?: 56 | 64;
  /**
   * Shell sub-navigation, opt-in. `"section"` (default) renders a page's
   * children exactly as AppShell always has; `"tabs"` or `"sidebar"` turn
   * sub-navigation on (see `SubNavMode`), and `"off"` hides them. A
   * navigation node, the `subNav` prop or the page
   * (`useAppShellSubNav(items, { mode })`) can override it.
   */
  subNav?: SubNavMode;
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
  Omit<
    AppShellOptions,
    | "configurable"
    | "defaultCollapsed"
    | "lockedOptions"
    | "collapseShortcut"
    | "subNav"
    | "collapsedRailWidth"
  >
> &
  Pick<
    AppShellOptions,
    | "configurable"
    | "defaultCollapsed"
    | "lockedOptions"
    | "collapseShortcut"
    | "subNav"
    | "collapsedRailWidth"
  > = {
  showLogo: true,
  showAppName: true,
  showThemeToggle: true,
  showCollapse: true,
  showUserSlot: true,
  showFooter: true,
  showSecondaryNav: true,
  showMobileBottomNav: true,
  defaultCollapsed: false,
  collapseShortcut: false,
  collapsedRailWidth: 56,
  subNav: "section",
  configurable: undefined,
  density: "comfortable",
  railWidth: "narrow",
  scrollRoot: "container",
};

// The user's collapse choice lives at `${optionsStorageKey}:collapsed` as
// "1" / "0"; no entry means they haven't chosen. It is read through
// `useSyncExternalStore`, so a client-only mount reads it during the first
// render (no expanded-then-collapsed flash), hydration uses the server
// snapshot (no mismatch), and every shell on the page, and other tabs via the
// `storage` event, stays in step.
const collapsedListeners = new Set<() => void>();

function subscribeCollapsed(listener: () => void): () => void {
  collapsedListeners.add(listener);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", listener);
  }
  return () => {
    collapsedListeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", listener);
    }
  };
}

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

function writeStoredCollapsed(key: string, collapsed: boolean | undefined) {
  if (typeof window === "undefined") return;
  try {
    if (collapsed === undefined) localStorage.removeItem(`${key}:collapsed`);
    else localStorage.setItem(`${key}:collapsed`, collapsed ? "1" : "0");
  } catch {
    // quota / private mode
  }
  collapsedListeners.forEach((listener) => listener());
}

function useStoredCollapsed(key: string | undefined): boolean | undefined {
  return useSyncExternalStore(
    subscribeCollapsed,
    () => (key ? readStoredCollapsed(key) : undefined),
    () => undefined,
  );
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || typeof (el as HTMLElement).tagName !== "string") return false;
  const node = el as HTMLElement;
  const tag = node.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    node.isContentEditable === true ||
    node.closest?.('[contenteditable=""], [contenteditable="true"]') != null
  );
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Focus is in a widget that uses printable keys itself (typeahead). */
function ownsKeys(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  return Boolean(
    node?.closest?.(
      '[role="listbox"], [role="combobox"], [role="menu"], [role="menubar"], [role="menuitem"], [role="option"], [role="tree"], [role="grid"]',
    ),
  );
}

/** A modal or Radix dialog is open somewhere on the page. */
function dialogOpen(): boolean {
  if (typeof document === "undefined") return false;
  return (
    document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [aria-modal="true"]') !=
    null
  );
}

/** md breakpoint: the desktop sidebar only exists at this width and up. */
const DESKTOP_QUERY = "(min-width: 768px)";

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
  /**
   * Primary navigation items. Optional when `navigation` is set: the tree
   * root's `items` are the global nav then.
   */
  navItems?: NavItem[];
  /**
   * The app's logical navigation hierarchy. AppShell resolves it against
   * `activePath` (see `resolveNavigation`) and derives:
   * - the sidebar's global items from the root's `items` (unless `navItems`),
   * - a contextual section from the current node's `items`, labelled with
   *   the node's `label` (`$param` segments in `to` filled from the URL),
   * - the mobile tab bar: the contextual items when there are any, else the
   *   global top-level items (unless `mobileNavItems`),
   * - a back link to the current node's logical parent (unless
   *   `parentNavigation`).
   *
   * @stability Beta
   */
  navigation?: NavigationNode<NavItem>;
  /**
   * Back-to-parent link rendered in the content header, above `children`, on
   * mobile and desktop. Derived from `navigation` when omitted; `null` hides
   * it. Use this instead of placing a back row inside page content.
   *
   * @stability Beta
   */
  parentNavigation?: ParentNavigation | null;
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
  /**
   * Replaces the app name in the phone's top bar: a workspace switcher (`WorkspaceSwitcher
   * variant="bar"`), so the viewer always sees where they are working.
   *
   * @stability Beta
   */
  mobileHeaderSlot?: ReactNode;
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
  /**
   * Controlled collapse (desktop rail). Overrides the stored user choice and
   * every default.
   */
  collapsed?: boolean;
  /** Called with the new state whenever the user toggles the sidebar. */
  onCollapsedChange?: (collapsed: boolean) => void;
  /**
   * This page's default: open the desktop sidebar collapsed (`true`) or
   * expanded (`false`) until the user toggles it. Reactive, so a layout can
   * pass it per route. Wins over `navigation`'s `defaultCollapsed` and
   * `options.defaultCollapsed`; the user's own choice (persisted under
   * `optionsStorageKey`) wins over all of them.
   *
   * @stability Beta
   */
  defaultCollapsed?: boolean;
  /**
   * This page's sub-navigation mode (see `AppShellOptions.subNav`). Wins
   * over `navigation`'s `subNav` and `options.subNav`; the page's own
   * `useAppShellSubNav(items, { mode })` wins over it.
   *
   * @stability Beta
   */
  subNav?: SubNavMode;
  /**
   * Accessible name of the sub-navigation tab row. Defaults to the current
   * navigation node's label, else "Page sections".
   */
  subNavLabel?: string;
  /**
   * Injectable link component. Defaults to a plain `<a>` (no router). Pass a
   * router adapter — e.g. React Router `({ href, ...p }) => <Link to={href} {...p} />`
   * or Next.js `next/link` — to get client-side navigation.
   */
  linkComponent?: LinkComponent;
  /**
   * Current location used to highlight the active nav item. Pass the full
   * location, `pathname + search + hash` (React Router: `useLocation()`), so
   * items whose `to` names a query or hash (`/admin?tab=users`) can become
   * active. A pathname alone still works for path-only items, `end` included.
   * Omit to disable active highlighting.
   */
  activePath?: string;
  /**
   * Optional custom active-state matcher. Defaults to a prefix match (with `/`
   * treated as exact), mirroring React Router `NavLink`.
   */
  isActive?: (to: string, activePath?: string) => boolean;
}

const PARAM = /^\$(.+)$/;

/**
 * Fill `$name` path segments from `params`; `undefined` if one is missing. A
 * `?query` / `#hash` on `to` is kept as is.
 */
function fillParams(to: string, params: Record<string, string>): string | undefined {
  const cut = to.search(/[?#]/);
  const path = cut === -1 ? to : to.slice(0, cut);
  const suffix = cut === -1 ? "" : to.slice(cut);
  let missing = false;
  const filled = path
    .split("/")
    .map((part) => {
      const name = PARAM.exec(part)?.[1];
      if (name == null) return part;
      const value = params[name];
      if (value == null) missing = true;
      return value == null ? part : encodeURIComponent(value);
    })
    .join("/");
  return missing ? undefined : filled + suffix;
}

/** Interpolate items (and children); drop any whose path the URL can't fill. */
function fillItems(items: NavItem[], params: Record<string, string>): NavItem[] {
  return items.flatMap((item) => {
    const to = fillParams(item.to, params);
    if (to == null) return [];
    return [
      {
        ...item,
        to,
        children: item.children ? fillItems(item.children, params) : undefined,
      },
    ];
  });
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

/** The item's icon, or its label's first letter when it has none. */
function NavIcon({ item, className }: { item: SubNavItem; className?: string }) {
  if (item.icon) {
    const Icon = item.icon;
    return <Icon className={className} />;
  }
  return (
    <span
      className={cn(
        className,
        "inline-flex items-center justify-center rounded text-[11px] font-semibold uppercase leading-none",
      )}
      aria-hidden
    >
      {item.label.trim().charAt(0)}
    </span>
  );
}

/**
 * Name tooltip for an icon-rail entry, on hover and on keyboard focus. The
 * trigger is a wrapper span rather than the link itself, so it works with any
 * injected `linkComponent` (Radix needs a ref and event props on its
 * trigger; a router adapter need not forward either). Focus and blur bubble
 * up to the span, so tabbing onto the link still opens it.
 */
function RailTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip content={label} side="right" className="flex w-full">
      <span className="flex w-full">{children}</span>
    </Tooltip>
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
  notCurrent = false,
  active: activeOverride,
}: {
  item: SubNavItem;
  collapsed: boolean;
  density: "comfortable" | "compact";
  onNavClick?: () => void;
  linkComponent: LinkComponent;
  activePath?: string;
  isActive: (to: string, activePath?: string) => boolean;
  /** Highlight as usual but never claim `aria-current` (another section holds it). */
  notCurrent?: boolean;
  /** Decided by the caller (most specific of siblings) instead of by `isActive`. */
  active?: boolean;
}) {
  const active = activeOverride ?? itemIsActive(item, activePath, isActive);
  const pad = density === "compact" ? "px-2.5 py-1.5" : "px-3 py-2";

  if (item.disabled) {
    if (!collapsed) {
      return (
        <span
          title={item.label}
          className={cn(
            "flex items-center gap-3 rounded-lg text-sm font-medium opacity-40",
            pad,
          )}
          aria-disabled
        >
          <NavIcon item={item} className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </span>
      );
    }
    // Rail: a disabled link, named so screen readers announce it (a bare
    // span's aria-label is not reliably read).
    return (
      <RailTooltip label={item.label}>
        <span
          role="link"
          aria-disabled="true"
          aria-label={item.label}
          className="flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium opacity-40"
        >
          <NavIcon item={item} className="h-4 w-4 shrink-0" />
        </span>
      </RailTooltip>
    );
  }

  const link = (
    <LinkComp
      href={item.to}
      onClick={onNavClick}
      aria-label={
        collapsed
          ? item.badge != null
            ? `${item.label} (${item.badge})`
            : item.label
          : undefined
      }
      aria-current={active && !notCurrent ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
        pad,
        collapsed && "relative h-10 w-full justify-center px-0 py-0 motion-reduce:transition-none",
        active
          ? "bg-sidebar-accent text-sidebar-primary"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <NavIcon item={item} className="h-4 w-4 shrink-0" />
      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.badge != null ? (
            <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
              {item.badge}
            </Badge>
          ) : null}
        </>
      ) : item.badge != null ? (
        // The rail has no room for the count: a dot shows there is one, and
        // the accessible name carries the number.
        <span
          className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sidebar-primary"
          aria-hidden
        />
      ) : null}
    </LinkComp>
  );
  return collapsed ? <RailTooltip label={item.label}>{link}</RailTooltip> : link;
}

/**
 * A nested group on the collapsed rail: one icon button that opens a popover
 * listing the group's own page (when it has one) and its children. Radix
 * Popover moves focus into the list, closes on Escape / outside click and
 * hands focus back to the button.
 */
function RailGroup({
  item,
  density,
  linkComponent,
  activePath,
  isActive,
  notCurrent,
}: {
  item: SubNavItem;
  density: "comfortable" | "compact";
  linkComponent: LinkComponent;
  activePath?: string;
  isActive: (to: string, activePath?: string) => boolean;
  notCurrent: boolean;
}) {
  const [open, setOpen] = useState(false);
  const children = item.children ?? [];
  const active = itemIsActive(item, activePath, isActive);
  const entries: SubNavItem[] = item.to
    ? [{ ...item, children: undefined, end: true }, ...children]
    : children;
  const current = mostSpecificActive(entries, activePath, isActive);

  // Close when navigation lands, whichever link (or the URL) caused it.
  useEffect(() => {
    setOpen(false);
  }, [activePath]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <RailTooltip label={item.label}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={item.label}
            disabled={item.disabled}
            data-testid={`nav-rail-group-${item.label}`}
            className={cn(
              "relative flex h-10 w-full items-center justify-center rounded-lg transition-colors motion-reduce:transition-none",
              active
                ? "bg-sidebar-accent text-sidebar-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              item.disabled && "pointer-events-none opacity-40",
            )}
          >
            <NavIcon item={item} className="h-4 w-4 shrink-0" />
            <ChevronRight
              className="absolute right-0.5 h-3 w-3 opacity-50"
              aria-hidden
            />
          </button>
        </PopoverTrigger>
      </RailTooltip>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-56 p-1.5 motion-reduce:animate-none"
        aria-label={item.label}
        data-testid={`nav-rail-popover-${item.label}`}
      >
        <p className="truncate px-2.5 pb-1 pt-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {item.label}
        </p>
        <nav aria-label={item.label} className="space-y-0.5">
          {entries.map((entry) => (
            <NavLinkRow
              key={entry.to + entry.label}
              item={entry}
              collapsed={false}
              density={density}
              onNavClick={() => setOpen(false)}
              linkComponent={linkComponent}
              activePath={activePath}
              isActive={isActive}
              notCurrent={notCurrent}
              active={entry === current}
            />
          ))}
        </nav>
      </PopoverContent>
    </Popover>
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
  notCurrent = false,
}: {
  item: SubNavItem;
  collapsed: boolean;
  density: "comfortable" | "compact";
  onNavClick?: () => void;
  linkComponent: LinkComponent;
  activePath?: string;
  isActive: (to: string, activePath?: string) => boolean;
  /** Highlight as usual but never claim `aria-current` (another section holds it). */
  notCurrent?: boolean;
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
        notCurrent={notCurrent}
      />
    );
  }

  // Collapsed rail: the group becomes one icon that opens its items in a popover.
  if (collapsed) {
    return (
      <RailGroup
        item={item}
        density={density}
        linkComponent={linkComponent}
        activePath={activePath}
        isActive={isActive}
        notCurrent={notCurrent}
      />
    );
  }

  // Parent may be its own route (`item.to`) — keep a real link and a separate
  // expand control so groups under an existing page stay navigable + highlightable.
  // Visual highlight may use prefix match; aria-current is exact-only so a child
  // route does not leave two "page" currents in the tree (CMT-322-008). Exact
  // means the same path; a query/hash on `activePath` alone doesn't break it.
  const selfExact = Boolean(
    item.to && isPathActive(item.to, activePath, { end: true }),
  );
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
              aria-current={selfExact && !notCurrent ? "page" : undefined}
              className={parentClass}
            >
              <NavIcon item={item} className="h-4 w-4 shrink-0" />
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
              <NavIcon item={item} className="h-4 w-4 shrink-0" />
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
                notCurrent={notCurrent}
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
  contextualNavItems,
  contextualNavLabel,
  secondaryNavItems,
  secondaryNavLabel,
  showSecondary,
  collapsed,
  density,
  onNavClick,
  linkComponent,
  activePath,
  isActive,
  subActive = false,
  nest = false,
}: {
  navItems: SubNavItem[];
  /** The page's children, in `subNav: "sidebar"` mode only. */
  contextualNavItems?: SubNavItem[];
  contextualNavLabel?: string;
  /** A sub-navigation item (wherever it renders) is the current page. */
  subActive?: boolean;
  /**
   * `subNav: "sidebar"`: nest the children under the active item (a flyout on
   * the rail), and mark only the most specific one current. Off, they keep
   * the legacy section below the global items.
   */
  nest?: boolean;
  secondaryNavItems?: SubNavItem[];
  secondaryNavLabel: string;
  showSecondary: boolean;
  collapsed: boolean;
  density: "comfortable" | "compact";
  onNavClick?: () => void;
  linkComponent: LinkComponent;
  activePath?: string;
  isActive: (to: string, activePath?: string) => boolean;
}) {
  const contextualLabelId = useId();
  // While a contextual item is the current page, global items keep their
  // highlight (the section you are in) but leave `aria-current` to it, so
  // "Showcase" and "Overview" are never both the current page.
  const contextualActive =
    subActive ||
    Boolean(
      contextualNavItems?.some((item) => itemIsActive(item, activePath, isActive)),
    );
  const contextual = contextualNavItems ?? [];
  // Children nest under the active global item ("Forms" for a form's tabs).
  // With none active they get their own section below the global items.
  const host =
    nest && contextual.length > 0
      ? mostSpecificActive(navItems, activePath, isActive)
      : undefined;
  // Only the most specific sibling is current: `/forms/f1/edit/logic` must
  // not also light up a Questions item at `/forms/f1/edit`.
  const contextualCurrent = mostSpecificActive(contextual, activePath, isActive);

  const contextualGroup = (nested: boolean) => (
    <div
      className={cn(
        nested
          ? "ml-3 space-y-0.5 border-l border-sidebar-border pl-2"
          : "mt-4 space-y-1 border-t border-sidebar-border pt-4",
        !nested && collapsed && "mt-2 pt-2",
      )}
      data-testid="app-shell-contextual-nav"
      role="group"
      aria-labelledby={!collapsed && !nested && contextualNavLabel ? contextualLabelId : undefined}
      aria-label={collapsed || nested ? contextualNavLabel : undefined}
    >
      {!collapsed && !nested && contextualNavLabel ? (
        <p
          id={contextualLabelId}
          className="mb-2 truncate px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/40"
        >
          {contextualNavLabel}
        </p>
      ) : null}
      {contextual.map((item) =>
        item.children?.length ? (
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
        ) : (
          <NavLinkRow
            key={item.to + item.label}
            item={item}
            collapsed={collapsed}
            density={density}
            onNavClick={onNavClick}
            linkComponent={linkComponent}
            activePath={activePath}
            isActive={isActive}
            active={nest ? item === contextualCurrent : undefined}
          />
        ),
      )}
    </div>
  );

  return (
    <nav
      className={cn(
        "flex-1 space-y-1 overflow-y-auto",
        collapsed ? "p-2" : "p-3",
      )}
      aria-label="Main"
    >
      {navItems.map((item) => {
        if (item === host && collapsed) {
          // Rail: the active item opens a flyout with its children.
          return (
            <RailGroup
              key={item.to + item.label}
              item={{ ...item, children: [...(item.children ?? []), ...contextual] }}
              density={density}
              linkComponent={linkComponent}
              activePath={activePath}
              isActive={isActive}
              notCurrent={false}
            />
          );
        }
        const row = (
          <NavGroup
            key={item.to + item.label}
            item={item}
            collapsed={collapsed}
            density={density}
            onNavClick={onNavClick}
            linkComponent={linkComponent}
            activePath={activePath}
            isActive={isActive}
            notCurrent={contextualActive}
          />
        );
        if (item !== host) return row;
        return (
          <div key={item.to + item.label} className="space-y-0.5">
            {row}
            {contextualGroup(true)}
          </div>
        );
      })}

      {contextual.length > 0 && !host ? contextualGroup(false) : null}

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
        ) : appLogo || collapsed ? (
          // Collapsed with no logo at all: the app name's first letter keeps
          // a mark at the top of the rail.
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary"
            aria-hidden={!appLogo || undefined}
          >
            <span className="text-sm font-bold text-primary-foreground">
              {appLogo || appName.trim().charAt(0).toUpperCase()}
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
  navItems: navItemsProp,
  navigation,
  parentNavigation: parentNavigationProp,
  secondaryNavItems,
  secondaryNavLabel = "More",
  mobileNavItems,
  headerSlot,
  collapsedHeaderSlot,
  mobileHeaderSlot,
  footer,
  userSlot,
  children,
  showThemeToggle: showThemeToggleProp,
  options: optionsProp,
  optionsStorageKey,
  collapsed: collapsedProp,
  onCollapsedChange,
  defaultCollapsed: defaultCollapsedProp,
  subNav: subNavProp,
  subNavLabel,
  linkComponent = DefaultLink,
  activePath,
  isActive = isPathActive,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Hierarchical nav: resolve the tree against the current location once.
  const derived = useMemo(() => {
    if (!navigation) return undefined;
    const nav = resolveNavigation(navigation, activePath ?? "/");
    const atRoot = nav.trail.length === 1;
    const globalItems = fillItems(navigation.items, nav.params);
    const contextualItems = atRoot ? [] : fillItems(nav.items, nav.params);
    // No link up to the root from a top-level page (it is where the global
    // nav already goes), and none whose path the URL couldn't fill.
    const parent =
      nav.parent &&
      nav.trail.length > 2 &&
      !nav.parent.path.split("/").some((p) => PARAM.test(p))
        ? { href: nav.parent.path, label: nav.parent.label }
        : undefined;
    // Nearest node in the trail that states a sidebar default.
    const navDefaultCollapsed = [...nav.trail]
      .reverse()
      .find((node) => node.defaultCollapsed !== undefined)?.defaultCollapsed;
    const navSubNav = [...nav.trail]
      .reverse()
      .find((node) => node.subNav !== undefined)?.subNav;
    // The mobile bar's back item: the logical parent, the root included.
    const navParentPath = nav.parent ? fillParams(nav.parent.path, nav.params) : undefined;
    const backItem =
      nav.parent && navParentPath ? { href: navParentPath, label: nav.parent.label } : undefined;
    return {
      current: nav.current,
      globalItems,
      contextualItems,
      parent,
      navDefaultCollapsed,
      navSubNav,
      backItem,
    };
  }, [navigation, activePath]);

  const navItems = navItemsProp ?? derived?.globalItems ?? [];
  const subNavChannel = useSubNavChannel();
  const pageSubNav = subNavChannel.page;
  const hasPageHeader = subNavChannel.hasHeader;
  // The current page's children: the page's own (hook) over the node's items.
  const contextualNavItems = pageSubNav?.items ?? derived?.contextualItems ?? [];
  const parentNavigation =
    parentNavigationProp === undefined ? derived?.parent : parentNavigationProp ?? undefined;

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

  // Collapse precedence: controlled prop > the user's own choice (stored, or
  // this session's when there is no storage key) > this page's default
  // (prop, then the navigation trail) > the app default > expanded.
  const storedCollapsed = useStoredCollapsed(optionsStorageKey);
  const [sessionCollapsed, setSessionCollapsed] = useState<boolean | undefined>(
    undefined,
  );
  const userCollapsed = optionsStorageKey ? storedCollapsed : sessionCollapsed;
  const pageDefaultCollapsed =
    defaultCollapsedProp ??
    derived?.navDefaultCollapsed ??
    optionsProp?.defaultCollapsed ??
    OPTION_DEFAULTS.defaultCollapsed!;

  const isCollapseControlled = collapsedProp !== undefined;
  const collapsed = isCollapseControlled
    ? collapsedProp!
    : (userCollapsed ?? pageDefaultCollapsed);

  const setCollapsed = useCallback(
    (next: boolean) => {
      if (!isCollapseControlled) {
        if (optionsStorageKey) writeStoredCollapsed(optionsStorageKey, next);
        else setSessionCollapsed(next);
      }
      onCollapsedChange?.(next);
    },
    [isCollapseControlled, optionsStorageKey, onCollapsedChange],
  );

  const sidebarRef = useRef<HTMLElement>(null);

  // Collapsing re-renders the sidebar's insides: the toggle moves from the
  // header to the rail's foot, and rail links gain a tooltip wrapper. Both
  // remount, which would drop keyboard focus on <body>. So note what had
  // focus (the toggle, or a link by its href) and put focus back on the
  // matching element once the new layout has committed.
  const pendingFocus = useRef<{ toggle: true } | { href: string } | null>(null);
  const toggleCollapsed = useCallback(
    (fromToggle: boolean) => {
      const aside = sidebarRef.current;
      const focused = typeof document === "undefined" ? null : document.activeElement;
      if (fromToggle) {
        pendingFocus.current = { toggle: true };
      } else if (aside && focused instanceof HTMLElement && aside.contains(focused)) {
        const href = focused.getAttribute("href");
        pendingFocus.current = href ? { href } : { toggle: true };
      }
      setCollapsed(!collapsed);
    },
    [collapsed, setCollapsed],
  );
  // A collapse that no toggle asked for (a route's `defaultCollapsed`, a
  // controlled prop): capture what had focus during the render that changes
  // it, before the commit remounts the sidebar's insides.
  const renderedCollapsed = useRef(collapsed);
  if (renderedCollapsed.current !== collapsed && !pendingFocus.current) {
    const aside = sidebarRef.current;
    const focused = typeof document === "undefined" ? null : document.activeElement;
    if (aside && focused instanceof HTMLElement && aside.contains(focused)) {
      const href = focused.getAttribute("href");
      pendingFocus.current = href ? { href } : { toggle: true };
    }
  }
  // Runs on every commit, so a request is always consumed in the commit that
  // follows it: a controlled parent that keeps `collapsed` as it was, or a
  // discarded render, can't leave a stale request for a later collapse.
  useIsoLayoutEffect(() => {
    const changed = renderedCollapsed.current !== collapsed;
    renderedCollapsed.current = collapsed;
    const want = pendingFocus.current;
    pendingFocus.current = null;
    const aside = sidebarRef.current;
    if (!changed || !want || !aside) return;
    const toggleEl = aside.querySelector<HTMLElement>('[data-testid="app-shell-collapse"]');
    let target: HTMLElement | null = null;
    if ("href" in want) {
      target =
        Array.from(aside.querySelectorAll<HTMLElement>("a[href]")).find(
          (a) => a.getAttribute("href") === want.href,
        ) ?? null;
    }
    (target ?? toggleEl)?.focus();
  });
  const showCollapseCtrl = resolved.showCollapse !== false;
  const collapseShortcut =
    optionsProp?.collapseShortcut ?? OPTION_DEFAULTS.collapseShortcut!;

  // Opt-in shortcut (e.g. `[`) toggles the desktop sidebar. Skipped while
  // typing, in a listbox/combobox/menu (typeahead), while a dialog is open,
  // with a modifier held (those chords belong to the app or browser), when
  // another handler already took the key, below the md breakpoint (no
  // desktop sidebar there), and when the collapse control is hidden.
  useEffect(() => {
    if (!collapseShortcut || !showCollapseCtrl) return;
    if (typeof window === "undefined") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== collapseShortcut || e.repeat || e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (ownsKeys(e.target)) return;
      if (dialogOpen()) return;
      if (window.matchMedia && !window.matchMedia(DESKTOP_QUERY).matches) return;
      e.preventDefault();
      toggleCollapsed(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [collapseShortcut, showCollapseCtrl, toggleCollapsed]);

  const ParentLink = linkComponent;
  const LinkComp = linkComponent;
  const density = resolved.density ?? "comfortable";
  const scrollWindow = resolved.scrollRoot === "window";
  const railExpanded =
    resolved.railWidth === "wide" ? "md:w-64" : "md:w-52";
  // Collapsed icon rail: 56px as before, or 64px when asked for.
  const railCollapsed =
    (optionsProp?.collapsedRailWidth ?? OPTION_DEFAULTS.collapsedRailWidth) === 64
      ? "md:w-16"
      : "md:w-14";
  const railClass = collapsed ? railCollapsed : railExpanded;

  // Sub-navigation mode: page (hook) > prop > nearest node > app option.
  const subNavMode: SubNavMode =
    pageSubNav?.mode ??
    subNavProp ??
    derived?.navSubNav ??
    resolved.subNav ??
    OPTION_DEFAULTS.subNav!;
  const subActive = contextualNavItems.some((i) => itemIsActive(i, activePath, isActive));

  // "tabs" and "sidebar" turn sub-navigation on; "section" (the default) is
  // the shell as it always was; "off" hides the children entirely.
  const subNavOn = subNavMode === "tabs" || subNavMode === "sidebar";

  const leaves = (items: SubNavItem[]) =>
    items.filter((i) => !i.children || i.children.length === 0);
  // Phones. On: a page with children swaps the bar to them, led by a back
  // item to the logical parent. "section": the children replace the bar
  // as before, with no back item. "off": the app's main bar. An explicit
  // `mobileNavItems` always wins.
  const contextualLeaves =
    subNavMode === "off" ? [] : leaves(contextualNavItems).filter((i) => !i.hideOnPhone);
  // With sub-navigation on, a page's children win over an app-wide
  // `mobileNavItems` on that page; elsewhere `mobileNavItems` applies.
  const subBottom = subNavOn && contextualLeaves.length > 0;
  const legacyBottom = !subNavOn && !mobileNavItems && contextualLeaves.length > 0;
  const backTarget = subBottom
    ? (parentNavigation ?? derived?.backItem ?? (() => {
        const hostItem = mostSpecificActive(navItems, activePath, isActive);
        return hostItem ? { href: hostItem.to, label: hostItem.label } : undefined;
      })())
    : undefined;
  const bottomItems = (
    subBottom
      ? contextualLeaves
      : (mobileNavItems ?? (legacyBottom ? contextualLeaves : leaves(navItems)))
  ).filter((i) => !i.disabled);
  // Global tabs keep their highlight, but leave `aria-current` to the sub
  // item that is the current page (see SidebarNav).
  const bottomNotCurrent =
    !mobileNavItems && !subBottom && !legacyBottom && subActive;
  const bottomCurrent = subBottom
    ? mostSpecificActive(bottomItems, activePath, isActive)
    : undefined;

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
  const showSecondary = hasSecondary && resolved.showSecondaryNav !== false;
  const showFooterSlot = hasFooter && resolved.showFooter !== false;
  const showUser = hasUser && resolved.showUserSlot !== false;
  const showMobileBottom =
    bottomItems.length > 0 && resolved.showMobileBottomNav !== false;
  const showTabs = subNavMode === "tabs" && contextualNavItems.length > 0;
  // Phones hide the tab row behind the bottom bar, so the row's end slot (a
  // page's readiness chip) moves to a strip under the page header there.
  // One target at a time: the slot element is either in the row or in the
  // strip, never both, so the chip is never rendered twice.
  const isPhone = useIsMobile();
  const endOnPhone = showTabs && showMobileBottom && isPhone && subNavChannel.hasEnd;

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
          {optionsStorageKey &&
          (Object.keys(userOverrides).length > 0 ||
            storedCollapsed !== undefined) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full text-xs"
              onClick={() => {
                setUserOverrides({});
                // Hand the sidebar back to the page defaults too.
                writeStoredCollapsed(optionsStorageKey, undefined);
              }}
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

  const collapseLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
  // Same markup as before this feature (title + aria-pressed); only its
  // place changes on the collapsed rail (the foot instead of the header).
  const collapseToggle = showCollapseCtrl ? (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => toggleCollapsed(true)}
      title={collapseShortcut ? `${collapseLabel} (${collapseShortcut})` : collapseLabel}
      aria-label={collapseLabel}
      aria-pressed={collapsed}
      aria-keyshortcuts={collapseShortcut || undefined}
      data-testid="app-shell-collapse"
      testID="app-shell-collapse"
    >
      {collapsed ? (
        <PanelLeft className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </Button>
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
          // Expanded: collapse sits beside the logo. Collapsed: the rail's
          // header is the logo mark alone; expand moves to the rail's foot.
          !collapsed ? (
            <div className="flex shrink-0 items-center gap-0.5">
              {collapseToggle}
              {optionsControl}
            </div>
          ) : null
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
        contextualNavItems={
          (
            opts.mobile
              ? subNavMode !== "off"
              : subNavMode === "sidebar" || subNavMode === "section"
          )
            ? contextualNavItems
            : undefined
        }
        nest={subNavMode === "sidebar" || (opts.mobile && subNavOn)}
        contextualNavLabel={derived?.current.label}
        subActive={subActive}
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

      {(showFooterSlot ||
        showUser ||
        showTheme ||
        (collapsed && (optionsControl || collapseToggle))) &&
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
            {collapsed ? collapseToggle : null}
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
          "hidden flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 motion-reduce:transition-none md:flex",
          scrollWindow && "sticky top-0 h-screen",
          railClass,
        )}
        ref={sidebarRef}
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
          {mobileHeaderSlot ? (
            <div className="flex min-w-0 flex-1 items-center">{mobileHeaderSlot}</div>
          ) : (
            <span className="flex-1 truncate font-semibold">{appName}</span>
          )}
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
          {parentNavigation ? (
            <div
              className="flex min-w-0 items-center px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8"
              data-testid="app-shell-parent-nav"
            >
              {/* -ml-3 lines the arrow up with the content's left edge. */}
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="-ml-3 min-w-0 max-w-full"
                testID="app-shell-parent-link"
              >
                <ParentLink
                  href={parentNavigation.href}
                  aria-label={`Back to ${parentNavigation.label}`}
                >
                  <ArrowLeft aria-hidden />
                  <span className="truncate">{parentNavigation.label}</span>
                </ParentLink>
              </Button>
            </div>
          ) : null}
          {/* Page header slot (<AppShellPageHeader>): above the tab row, on
              phones too. Empty and unstyled until a page mounts one. */}
          {hasPageHeader ? (
            <div
              ref={subNavChannel.setHeaderSlot}
              className={cn(
                "min-w-0 px-4 sm:px-6 lg:px-8",
                parentNavigation ? "pt-2 sm:pt-3 lg:pt-4" : "pt-4 sm:pt-6 lg:pt-8",
              )}
              data-testid="app-shell-page-header"
            />
          ) : null}
          {endOnPhone ? (
            <div
              ref={subNavChannel.setEndSlot}
              className={cn(
                "flex min-w-0 flex-wrap items-center justify-end gap-2 px-4 sm:px-6",
                parentNavigation || hasPageHeader ? "pt-2 sm:pt-3" : "pt-4 sm:pt-6",
              )}
              data-testid="app-shell-sub-nav-end-phone"
            />
          ) : null}
          {showTabs ? (
            <div
              className={cn(
                "px-4 sm:px-6 lg:px-8",
                // Phones use the bottom bar, unless the app turned it off.
                showMobileBottom && "hidden md:block",
                (!parentNavigation || hasPageHeader) && "pt-2 sm:pt-3 lg:pt-4",
              )}
            >
              <SubNavTabs
                items={contextualNavItems}
                activePath={activePath}
                isActive={isActive}
                linkComponent={linkComponent}
                label={subNavLabel ?? derived?.current.label ?? "Page sections"}
                end={
                  subNavChannel.hasEnd && !endOnPhone ? (
                    <div ref={subNavChannel.setEndSlot} className="flex items-center" />
                  ) : undefined
                }
              />
            </div>
          ) : null}
          <div
            className={cn(
              "min-w-0 p-4 sm:p-6 lg:p-8",
              (parentNavigation || hasPageHeader) && !showTabs && "pt-2 sm:pt-3 lg:pt-4",
            )}
          >
            <SubNavContext.Provider value={subNavChannel.channel}>
              {children}
            </SubNavContext.Provider>
          </div>
        </main>

        {showMobileBottom ? (
          <nav
            className="fixed bottom-0 left-0 right-0 z-30 flex border-t bg-background md:hidden"
            aria-label="Primary"
          >
            {backTarget ? (
              <LinkComp
                href={backTarget.href}
                aria-label={`Back to ${backTarget.label}`}
                className="flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium text-muted-foreground transition-colors"
                testID="app-shell-mobile-back"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden />
                <span className="max-w-full truncate px-0.5">{backTarget.label}</span>
              </LinkComp>
            ) : null}
            {bottomItems.map((item) => {
              const active = bottomCurrent
                ? item === bottomCurrent
                : itemIsActive(item, activePath, isActive);
              return (
                <LinkComp
                  key={item.to + item.label}
                  href={item.to}
                  title={item.label}
                  aria-label={
                    subNavOn && item.badge != null
                      ? `${item.label} (${item.badge})`
                      : item.label
                  }
                  aria-current={active && !bottomNotCurrent ? "page" : undefined}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {subNavOn && item.badge != null ? (
                    <span className="relative">
                      <NavIcon item={item} className="h-5 w-5" />
                      {/* Anchored to the icon's right edge and growing right,
                          so a word badge ("New") never covers the icon. */}
                      <span
                        className="absolute -top-1.5 left-full -ml-1 inline-flex h-4 min-w-4 items-center justify-center whitespace-nowrap rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground ring-2 ring-background"
                        aria-hidden
                      >
                        {item.badge}
                      </span>
                    </span>
                  ) : (
                    <NavIcon item={item} className="h-5 w-5" />
                  )}
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
