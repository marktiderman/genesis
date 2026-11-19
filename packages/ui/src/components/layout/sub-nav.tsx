"use client";

/**
 * Shell sub-navigation: the child items of the page you are on (a form's
 * Questions / Logic and endings / Responses / Settings), shown by AppShell
 * as a tab row, nested in the sidebar, or not at all (`SubNavMode`), and in
 * the mobile bottom bar whatever the mode.
 *
 * Children come from two places:
 * - statically, the current `NavigationNode`'s `items` (with `$param`s filled
 *   from the URL), the same contextual items AppShell has always derived;
 * - dynamically, from the page: `useAppShellSubNav(items)` replaces them
 *   while the page is mounted, so badges can carry live counts.
 *
 * Role gating works as for every other `NavItem`: filter the list before
 * handing it over (the tree's `items` or the hook's argument).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";

import { cn } from "../../utils";
import { isPathActive, type LinkComponent, type NavigationSubNav } from "../../navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useUiMessages } from "../../messages";
import type { NavItem } from "./AppShell";

/**
 * How AppShell shows a page's child items. Sub-navigation is opt-in: the
 * default, `section`, is the shell as it always was.
 * - `section` (default): a labelled section below the global sidebar
 *   items; on phones the children replace the bottom bar (no back item).
 * - `tabs`: a row of tabs across the top of the page content. A tabbed
 *   level inside another adds a second, quieter row; a third folds the
 *   outer levels into a breadcrumb picker (never more than two rows).
 * - `sidebar`: sub-items, nested under the active item in the sidebar; a
 *   flyout from that item on the collapsed rail.
 * - `list`: a list beside the content; on a phone, the list on the
 *   level's own page, then the item with a link back to the list.
 * - `hub`: cards on the level's own page, one per child (one column on a
 *   phone).
 * - `off`: nothing, on desktop or phones; the app draws its own
 *   (`SubNavTabs` is exported for it).
 *
 * With `tabs` or `sidebar`, phones switch the bottom bar to a back item to
 * the logical parent plus the children, with their badges, unless
 * `options.phoneTabs` is `"top"` (see `AppShellOptions.phoneTabs`).
 *
 * @stability Beta
 */
export type SubNavMode = NavigationSubNav;

/**
 * A sub-navigation item: a `NavItem` whose `icon` is optional (the tab row,
 * the phone bar and the rail show the label's first letter without one).
 * Every `NavItem` is a `SubNavItem`; `NavItem` itself keeps `icon` required.
 *
 * @stability Beta
 */
export interface SubNavItem extends Omit<NavItem, "icon" | "children"> {
  icon?: LucideIcon | undefined;
  children?: SubNavItem[] | undefined;
  /**
   * Leave this item out of the phone bar (it stays in the tab row, the
   * sidebar and the rail). The phone bar fits back plus about four items:
   * fold a builder panel into its parent tab on phones instead of
   * overflowing. If its route sits under another item's (without `end`),
   * that item shows as current while it is open.
   */
  hideOnPhone?: boolean;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** @internal Active-state rule shared by the sidebar, tabs and bottom bar. */
export function itemIsActive(
  item: SubNavItem,
  activePath: string | undefined,
  isActive: (to: string, activePath?: string) => boolean,
): boolean {
  // `end` is exact on the path but ignores an incidental query/hash, so an
  // `end` item stays active on `/dashboard?page=2`.
  if (item.end) {
    return isPathActive(item.to, activePath, { end: true });
  }
  if (isActive(item.to, activePath)) return true;
  return Boolean(
    item.children?.some((child) => itemIsActive(child, activePath, isActive)),
  );
}

/**
 * Of several matching items, the one whose path matches most specifically,
 * so `/forms/f1/edit/logic` doesn't also light up an `/forms/f1/edit`
 * Questions tab that isn't marked `end`.
 *
 * @internal
 */
export function mostSpecificActive(
  items: SubNavItem[],
  activePath: string | undefined,
  isActive: (to: string, activePath?: string) => boolean,
): SubNavItem | undefined {
  let best: SubNavItem | undefined;
  for (const item of items) {
    if (!itemIsActive(item, activePath, isActive)) continue;
    if (!best || item.to.length > best.to.length) best = item;
  }
  return best;
}

function BadgeChip({ badge, active }: { badge: string | number; active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums",
        active ? "bg-primary/10 text-primary-text" : "bg-muted text-muted-foreground",
      )}
    >
      {badge}
    </span>
  );
}

/**
 * Props for {@link SubNavTabs}.
 *
 * @stability Beta
 */
export interface SubNavTabsProps {
  items: SubNavItem[];
  /** Current location (`pathname + search + hash`); drives the active tab. */
  activePath?: string | undefined;
  linkComponent: LinkComponent;
  isActive?: (to: string, activePath?: string) => boolean;
  /** Right-aligned slot in the row, e.g. a "Ready to publish" chip. */
  end?: ReactNode;
  /** Accessible name of the `<nav>` (default "Page sections"). */
  label?: string;
  /**
   * `primary` (default): the page's tab row. `secondary`: a smaller, quieter
   * row for a tabbed level inside another, drawn under the primary row.
   */
  variant?: "primary" | "secondary";
  className?: string;
}

/**
 * A row of navigation tabs: real links (deep links and middle-click work),
 * `aria-current="page"` on the active one, badges as chips, the active tab
 * underlined in the brand colour. AppShell renders it in `tabs` mode; an app
 * using `subNav: "off"` can place it itself.
 *
 * @stability Beta
 */
export function SubNavTabs({
  items,
  activePath,
  linkComponent: LinkComp,
  isActive = isPathActive,
  end,
  label,
  variant = "primary",
  className,
}: SubNavTabsProps) {
  const pageSections = useUiMessages().shell.pageSections;
  const navLabel = label ?? pageSections;
  const current = mostSpecificActive(items, activePath, isActive);
  const secondary = variant === "secondary";
  return (
    <div
      className={cn("flex min-w-0 items-end gap-4", !secondary && "border-b", className)}
      data-slot="sub-nav"
      data-variant={variant}
      data-testid={secondary ? "app-shell-sub-nav-secondary" : "app-shell-sub-nav"}
    >
      {/* Scrolls sideways when the tabs don't fit (a phone): a swipe moves the row, snapping to tabs. */}
      <nav aria-label={navLabel} className="-mb-px min-w-0 flex-1 snap-x overflow-x-auto overscroll-x-contain">
        <ul className={cn("flex items-end", secondary ? "gap-1" : "gap-6")}>
          {items.map((item) => {
            const active = item === current;
            const Icon = item.icon;
            const body = (
              <>
                {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
                <span className="whitespace-nowrap">{item.label}</span>
                {item.badge != null ? <BadgeChip badge={item.badge} active={active} /> : null}
              </>
            );
            const cls = secondary
              ? cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] transition-colors motion-reduce:transition-none pointer-coarse:min-h-11",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )
              : cn(
                  "flex items-center gap-1.5 border-b-2 pb-2.5 pt-2 text-sm transition-colors motion-reduce:transition-none",
                  active
                    ? "border-primary font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                );
            return (
              <li key={item.to + item.label} className="shrink-0 snap-start">
                {item.disabled ? (
                  <span className={cn(cls, "opacity-40")} role="link" aria-disabled="true" data-slot="sub-nav-item">
                    {body}
                  </span>
                ) : (
                  <LinkComp
                    href={item.to}
                    aria-current={active ? "page" : undefined}
                    data-slot="sub-nav-item"
                    data-active={active || undefined}
                    className={cn(
                      cls,
                      "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    testID={`app-shell-sub-nav-${item.label}`}
                  >
                    {body}
                  </LinkComp>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      {end != null ? <div className="flex shrink-0 items-center pb-2">{end}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Levels: tabs, a second row, the breadcrumb fold, lists and hubs
// ---------------------------------------------------------------------------

/**
 * One level of sub-navigation: a node in the trail whose children show,
 * with the way they are drawn.
 *
 * @internal
 */
export interface SubNavLevel {
  /** The level's own label (the node's), for the `<nav>` name and the list's back link. */
  label: string;
  /** The level's own address (the node's path, filled). */
  href?: string | undefined;
  items: SubNavItem[];
  mode: SubNavMode;
}

/**
 * How AppShell draws a set of levels, outermost first. Tabbed levels stack
 * as two rows at most (primary, then secondary); the levels above the last
 * two fold into breadcrumb pickers. The innermost `list` level is drawn as
 * a list, and a `hub` level as cards. Pure: AppShell and the tests share it.
 *
 * @internal
 */
export function layoutSubNavLevels(levels: SubNavLevel[]): {
  folded: SubNavLevel[];
  rows: SubNavLevel[];
  list: SubNavLevel | undefined;
  hub: SubNavLevel | undefined;
} {
  const shown = levels.filter((l) => l.items.length > 0);
  const tabbed = shown.filter((l) => l.mode === "tabs");
  const cut = Math.max(0, tabbed.length - 2);
  return {
    folded: tabbed.slice(0, cut),
    rows: tabbed.slice(cut),
    list: [...shown].reverse().find((l) => l.mode === "list"),
    hub: [...shown].reverse().find((l) => l.mode === "hub"),
  };
}

/**
 * Props for {@link SubNavSegmented}.
 *
 * @stability Beta
 */
export interface SubNavSegmentedProps {
  items: SubNavItem[];
  activePath?: string | undefined;
  linkComponent: LinkComponent;
  isActive?: (to: string, activePath?: string) => boolean;
  /** Accessible name of the `<nav>`. */
  label?: string;
  className?: string;
}

/**
 * A segmented control of links: the phone form of a second tab row. Each
 * segment is a real link with `aria-current` on the active one, at least
 * 44px tall on touch; the control scrolls sideways when it doesn't fit.
 *
 * @stability Beta
 */
export function SubNavSegmented({
  items,
  activePath,
  linkComponent: LinkComp,
  isActive = isPathActive,
  label,
  className,
}: SubNavSegmentedProps) {
  const pageSections = useUiMessages().shell.pageSections;
  const current = mostSpecificActive(items, activePath, isActive);
  return (
    <nav
      aria-label={label ?? pageSections}
      className={cn("min-w-0 overflow-x-auto overscroll-x-contain", className)}
      data-slot="sub-nav-segmented"
      data-testid="app-shell-sub-nav-segmented"
    >
      <ul className="inline-flex min-w-full rounded-lg bg-muted p-1">
        {items.map((item) => {
          const active = item === current;
          const cls = cn(
            "flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm pointer-coarse:min-h-11",
            active ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground",
          );
          return (
            <li key={item.to + item.label} className="flex-1 shrink-0">
              {item.disabled ? (
                <span className={cn(cls, "opacity-40")} role="link" aria-disabled="true">
                  {item.label}
                </span>
              ) : (
                <LinkComp
                  href={item.to}
                  aria-current={active ? "page" : undefined}
                  data-active={active || undefined}
                  className={cn(cls, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
                  testID={`app-shell-sub-nav-segment-${item.label}`}
                >
                  {item.label}
                  {item.badge != null ? <BadgeChip badge={item.badge} active={active} /> : null}
                </LinkComp>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Props for {@link SubNavBreadcrumb}.
 *
 * @stability Beta
 */
export interface SubNavBreadcrumbProps {
  /** The folded levels, outermost first. */
  levels: Array<Pick<SubNavLevel, "label" | "items">>;
  activePath?: string | undefined;
  linkComponent: LinkComponent;
  isActive?: (to: string, activePath?: string) => boolean;
  className?: string;
}

/**
 * The outer tab levels folded into a breadcrumb: one picker per level,
 * showing its current item and opening the level's other items. AppShell
 * draws it above the two tab rows when a third tabbed level is open.
 *
 * @stability Beta
 */
export function SubNavBreadcrumb({
  levels,
  activePath,
  linkComponent: LinkComp,
  isActive = isPathActive,
  className,
}: SubNavBreadcrumbProps) {
  const breadcrumb = useUiMessages().shell.breadcrumb;
  return (
    <nav aria-label={breadcrumb} className={cn("min-w-0", className)} data-slot="sub-nav-breadcrumb" data-testid="app-shell-sub-nav-breadcrumb">
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
        {levels.map((level, i) => {
          const current = mostSpecificActive(level.items, activePath, isActive);
          return (
            <li key={level.label + i} className="flex min-w-0 items-center gap-1">
              {i > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
                  aria-label={`${level.label}: ${current?.label ?? level.label}`}
                  data-testid={`app-shell-sub-nav-crumb-${level.label}`}
                >
                  <span className="truncate">{current?.label ?? level.label}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {level.items
                    .filter((item) => !item.disabled)
                    .map((item) => (
                      <DropdownMenuItem key={item.to + item.label} asChild>
                        <LinkComp
                          href={item.to}
                          aria-current={item === current ? "page" : undefined}
                          testID={`app-shell-sub-nav-crumb-item-${item.label}`}
                        >
                          {item.label}
                        </LinkComp>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Props for {@link SubNavList}.
 *
 * @stability Beta
 */
export interface SubNavListProps {
  items: SubNavItem[];
  activePath?: string | undefined;
  linkComponent: LinkComponent;
  isActive?: (to: string, activePath?: string) => boolean;
  label?: string;
  /** `column` (default): a list beside the content. `page`: full-width rows with a chevron, a phone's list page. */
  variant?: "column" | "page";
  className?: string;
}

/**
 * A level's children as a vertical list of links: a column beside the
 * content on a wide screen, or full-width rows (a phone's list page).
 *
 * @stability Beta
 */
export function SubNavList({
  items,
  activePath,
  linkComponent: LinkComp,
  isActive = isPathActive,
  label,
  variant = "column",
  className,
}: SubNavListProps) {
  const pageSections = useUiMessages().shell.pageSections;
  const current = mostSpecificActive(items, activePath, isActive);
  const page = variant === "page";
  return (
    <nav aria-label={label ?? pageSections} className={cn("min-w-0", className)} data-slot="sub-nav-list" data-variant={variant} data-testid="app-shell-sub-nav-list">
      <ul className={cn(page ? "divide-y rounded-lg border" : "space-y-0.5")}>
        {items.map((item) => {
          const active = item === current;
          const Icon = item.icon;
          const cls = cn(
            "flex items-center gap-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            page
              ? "min-h-11 px-4 py-3"
              : cn(
                  "rounded-md px-3 py-1.5 pointer-coarse:min-h-11",
                  active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                ),
          );
          const body = (
            <>
              {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.badge != null ? <BadgeChip badge={item.badge} active={active} /> : null}
              {page ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
            </>
          );
          return (
            <li key={item.to + item.label}>
              {item.disabled ? (
                <span className={cn(cls, "opacity-40")} role="link" aria-disabled="true">
                  {body}
                </span>
              ) : (
                <LinkComp
                  href={item.to}
                  aria-current={active ? "page" : undefined}
                  data-active={active || undefined}
                  className={cls}
                  testID={`app-shell-sub-nav-list-${item.label}`}
                >
                  {body}
                </LinkComp>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Props for {@link SubNavHub}.
 *
 * @stability Beta
 */
export interface SubNavHubProps {
  items: SubNavItem[];
  linkComponent: LinkComponent;
  label?: string;
  className?: string;
}

/**
 * A level's children as cards, one per child (icon, label, badge): a
 * section's landing page. One column on a phone, more as the width allows.
 *
 * @stability Beta
 */
export function SubNavHub({ items, linkComponent: LinkComp, label, className }: SubNavHubProps) {
  const pageSections = useUiMessages().shell.pageSections;
  return (
    <nav aria-label={label ?? pageSections} className={cn("min-w-0", className)} data-slot="sub-nav-hub" data-testid="app-shell-sub-nav-hub">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items
          .filter((item) => !item.disabled)
          .map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to + item.label} className="min-w-0">
                <LinkComp
                  href={item.to}
                  className="flex h-full min-h-11 items-center gap-3 rounded-lg border bg-card p-4 text-card-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  testID={`app-shell-sub-nav-hub-${item.label}`}
                >
                  {Icon ? (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                  {item.badge != null ? <BadgeChip badge={item.badge} /> : null}
                </LinkComp>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Page → shell channel
// ---------------------------------------------------------------------------

interface PageSubNav {
  /** Absent: this registrant only sets a mode; items come from elsewhere. */
  items?: SubNavItem[] | undefined;
  mode?: SubNavMode | undefined;
}

interface Registration extends PageSubNav {
  id: string;
  /**
   * Render order of the registering component, taken at its first render.
   * React renders top-down, so a page inside a layout always gets a higher
   * number than that layout, and a page mounted later (a route change under
   * a mounted layout) does too: the highest number is the innermost caller.
   */
  order: number;
}

/** Portal slots the shell exposes to pages. */
type SlotName = "header" | "end";

/** @internal What AppShell provides to pages. */
export interface SubNavChannel {
  register(id: string, order: number, value: PageSubNav): void;
  unregister(id: string): void;
  /** Claim a portal slot; the innermost claimant (highest order) renders. */
  claimSlot(slot: SlotName, id: string, order: number): void;
  releaseSlot(slot: SlotName, id: string): void;
  /** The mounted slot elements, and which claimant owns each. */
  slots: Record<SlotName, { el: HTMLElement | null; owner: string | undefined }>;
}

/** @internal */
export const SubNavContext = createContext<SubNavChannel | null>(null);

type Claims = Record<SlotName, Array<{ id: string; order: number }>>;

function innermost(claims: Array<{ id: string; order: number }>): string | undefined {
  let best: { id: string; order: number } | undefined;
  for (const c of claims) if (!best || c.order > best.order) best = c;
  return best?.id;
}

/**
 * @internal Shell side: holds the page registrations and slot claims.
 * Registration runs in a layout effect, so the page's items are in place
 * before first paint.
 */
export function useSubNavChannel(): {
  page: PageSubNav | undefined;
  channel: SubNavChannel;
  setEndSlot: (el: HTMLElement | null) => void;
  setHeaderSlot: (el: HTMLElement | null) => void;
  /** A page header has been claimed (render the header region). */
  hasHeader: boolean;
  /** An end-slot chip has been claimed (render the row's end region). */
  hasEnd: boolean;
} {
  const [entries, setEntries] = useState<Registration[]>([]);
  const [endSlot, setEndSlot] = useState<HTMLElement | null>(null);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState<Claims>({ header: [], end: [] });

  // Updated in place, so a badge change never reorders registrants.
  const register = useCallback((id: string, order: number, value: PageSubNav) => {
    setEntries((prev) =>
      prev.some((e) => e.id === id)
        ? prev.map((e) => (e.id === id ? { ...value, id, order } : e))
        : [...prev, { ...value, id, order }],
    );
  }, []);
  const unregister = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);
  const claimSlot = useCallback((slot: SlotName, id: string, order: number) => {
    setClaims((prev) =>
      prev[slot].some((c) => c.id === id)
        ? prev
        : { ...prev, [slot]: [...prev[slot], { id, order }] },
    );
  }, []);
  const releaseSlot = useCallback((slot: SlotName, id: string) => {
    setClaims((prev) =>
      prev[slot].some((c) => c.id === id)
        ? { ...prev, [slot]: prev[slot].filter((c) => c.id !== id) }
        : prev,
    );
  }, []);

  const headerOwner = innermost(claims.header);
  const endOwner = innermost(claims.end);
  const channel = useMemo<SubNavChannel>(
    () => ({
      register,
      unregister,
      claimSlot,
      releaseSlot,
      slots: {
        header: { el: headerSlot, owner: headerOwner },
        end: { el: endSlot, owner: endOwner },
      },
    }),
    [register, unregister, claimSlot, releaseSlot, headerSlot, headerOwner, endSlot, endOwner],
  );

  // Innermost registrant wins, separately for items and for mode, so a page
  // that only sets a mode keeps a layout's items (and vice versa).
  const byDepth = [...entries].sort((a, b) => b.order - a.order);
  const items = byDepth.find((e) => e.items)?.items;
  const mode = byDepth.find((e) => e.mode)?.mode;
  return {
    page: items || mode ? { items, mode } : undefined,
    channel,
    setEndSlot,
    setHeaderSlot,
    hasHeader: headerOwner !== undefined,
    hasEnd: endOwner !== undefined,
  };
}

let nextOrder = 0;

const iconIds = new WeakMap<object, number>();
let nextIconId = 1;
function iconKey(icon: unknown): number {
  if (!icon || (typeof icon !== "object" && typeof icon !== "function")) return 0;
  let id = iconIds.get(icon as object);
  if (id == null) {
    id = nextIconId++;
    iconIds.set(icon as object, id);
  }
  return id;
}

function itemsKey(items: SubNavItem[]): string {
  return JSON.stringify(
    items.map((i) => [
      i.to,
      i.label,
      i.badge ?? null,
      Boolean(i.disabled),
      Boolean(i.end),
      iconKey(i.icon),
      i.children ? itemsKey(i.children) : null,
    ]),
  );
}

/**
 * Options for {@link useAppShellSubNav}.
 *
 * @stability Beta
 */
export interface UseAppShellSubNavOptions {
  /** This page's `subNav` mode; wins over the shell's and the node's. */
  mode?: SubNavMode | undefined;
}

/**
 * Give the shell this page's child items (sub-navigation) while the page is
 * mounted. They replace the current `NavigationNode`'s `items`; pass
 * `null` / `undefined` to fall back to them (a `mode` still applies). When
 * several components call it (a layout and its page), the innermost wins,
 * for items and for mode separately. Use it when children depend on
 * page data, such as live badge counts. A fresh array each render is fine:
 * the shell only updates when a `to`, label, badge, icon or flag changes.
 *
 * ```tsx
 * useAppShellSubNav([
 *   { to: `/forms/${id}/edit`, label: "Questions", icon: ListChecks, badge: questions.length, end: true },
 *   { to: `/forms/${id}/edit/logic`, label: "Logic and endings", icon: GitBranch, badge: rules.length },
 *   { to: `/forms/${id}/edit/responses`, label: "Responses", icon: Inbox, badge: responses },
 *   { to: `/forms/${id}/edit/settings`, label: "Settings", icon: Settings },
 * ]);
 * ```
 *
 * Does nothing outside an `AppShell`.
 *
 * @stability Beta
 */
export function useAppShellSubNav(
  items: SubNavItem[] | null | undefined,
  options?: UseAppShellSubNavOptions,
): void {
  const channel = useContext(SubNavContext);
  const id = useId();
  const [order] = useState(() => ++nextOrder);
  const latest = useRef(items);
  latest.current = items;
  const key = items ? itemsKey(items) : "";
  const mode = options?.mode;
  const register = channel?.register;
  const unregister = channel?.unregister;

  useIsoLayoutEffect(() => {
    if (!register || !unregister) return;
    const value = latest.current ?? undefined;
    // `null` items with a mode still register: the mode applies, and the
    // items fall back to an outer registrant or the node's.
    if (value || mode) register(id, order, { items: value, mode });
    else unregister(id);
  }, [register, unregister, id, order, key, mode]);

  useIsoLayoutEffect(() => {
    if (!unregister) return;
    return () => unregister(id);
  }, [unregister, id]);
}

function useSlotPortal(slot: SlotName, children: ReactNode): ReactNode {
  const channel = useContext(SubNavContext);
  const id = useId();
  const [order] = useState(() => ++nextOrder);
  const claimSlot = channel?.claimSlot;
  const releaseSlot = channel?.releaseSlot;
  useIsoLayoutEffect(() => {
    if (!claimSlot || !releaseSlot) return;
    claimSlot(slot, id, order);
    return () => releaseSlot(slot, id);
  }, [claimSlot, releaseSlot, slot, id, order]);
  const target = channel?.slots[slot];
  if (!target?.el || target.owner !== id) return null;
  return createPortal(children, target.el);
}

/**
 * Render `children` in the right-hand slot of the shell's sub-navigation
 * tab row, e.g. a "Ready to publish" status chip. Rendered through a
 * portal, so it keeps the page's context and state. On phones, where the
 * bottom bar replaces the tab row, it renders in a compact strip under the
 * page header instead, so the chip stays reachable. Renders nothing when
 * the shell has no tab row (other modes, a page without children). When
 * several are mounted (a layout's and a page's), the innermost renders.
 *
 * @stability Beta
 */
export function AppShellSubNavEnd({ children }: { children: ReactNode }) {
  return useSlotPortal("end", children);
}

/**
 * Render the page's resource header (breadcrumb, title, status, actions) at
 * the top of the shell's content, ABOVE the sub-navigation tab row, where
 * the design puts it. A portal like `AppShellSubNavEnd`, so it keeps the
 * page's state; the innermost mounted one renders. On phones it stays at
 * the top of the content while the bottom bar carries the children. With
 * no tab row (the default `"section"` mode, or a page without children) it
 * simply sits at the top of the content. Mount none and the layout is
 * unchanged.
 *
 * @stability Beta
 */
export function AppShellPageHeader({ children }: { children: ReactNode }) {
  return useSlotPortal("header", children);
}
