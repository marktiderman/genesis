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

import type { LucideIcon } from "lucide-react";

import { cn } from "../../utils";
import { isPathActive, type LinkComponent } from "../../navigation";
import type { NavItem } from "./AppShell";

/**
 * How AppShell shows the current page's child items. Sub-navigation is
 * opt-in: the default, `section`, is the shell as it always was.
 * - `section` (default): a labelled section below the global sidebar
 *   items; on phones the children replace the bottom bar (no back item).
 * - `tabs`: one row of tabs across the top of the page content.
 * - `sidebar`: nested under the active item in the sidebar; a flyout from
 *   that item on the collapsed rail.
 * - `off`: nothing, on desktop or phones; the app draws its own
 *   (`SubNavTabs` is exported for it).
 *
 * With `tabs` or `sidebar`, phones switch the bottom bar to a back item to
 * the logical parent plus the children, with their badges.
 *
 * @stability Beta
 */
export type SubNavMode = "section" | "tabs" | "sidebar" | "off";

/**
 * A sub-navigation item: a `NavItem` whose `icon` is optional (the tab row,
 * the phone bar and the rail show the label's first letter without one).
 * Every `NavItem` is a `SubNavItem`; `NavItem` itself keeps `icon` required.
 *
 * @stability Beta
 */
export interface SubNavItem extends Omit<NavItem, "icon" | "children"> {
  icon?: LucideIcon;
  children?: SubNavItem[];
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
        active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
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
  activePath?: string;
  linkComponent: LinkComponent;
  isActive?: (to: string, activePath?: string) => boolean;
  /** Right-aligned slot in the row, e.g. a "Ready to publish" chip. */
  end?: ReactNode;
  /** Accessible name of the `<nav>` (default "Page sections"). */
  label?: string;
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
  label = "Page sections",
  className,
}: SubNavTabsProps) {
  const current = mostSpecificActive(items, activePath, isActive);
  return (
    <div
      className={cn("flex min-w-0 items-end gap-4 border-b", className)}
      data-testid="app-shell-sub-nav"
    >
      <nav aria-label={label} className="-mb-px min-w-0 flex-1 overflow-x-auto">
        <ul className="flex items-end gap-6">
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
            const cls = cn(
              "flex items-center gap-1.5 border-b-2 pb-2.5 pt-2 text-sm transition-colors motion-reduce:transition-none",
              active
                ? "border-primary font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            );
            return (
              <li key={item.to + item.label} className="shrink-0">
                {item.disabled ? (
                  <span className={cn(cls, "opacity-40")} aria-disabled>
                    {body}
                  </span>
                ) : (
                  <LinkComp
                    href={item.to}
                    aria-current={active ? "page" : undefined}
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
// Page → shell channel
// ---------------------------------------------------------------------------

interface PageSubNav {
  /** Absent: this registrant only sets a mode; items come from elsewhere. */
  items?: SubNavItem[];
  mode?: SubNavMode;
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
  mode?: SubNavMode;
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
 * portal, so it keeps the page's context and state. Renders nothing when
 * the shell shows no tab row (other modes, phones, no children). When
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
