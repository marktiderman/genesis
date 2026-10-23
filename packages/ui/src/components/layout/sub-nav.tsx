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
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** @internal Active-state rule shared by the sidebar, tabs and bottom bar. */
export function itemIsActive(
  item: NavItem,
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
  items: NavItem[],
  activePath: string | undefined,
  isActive: (to: string, activePath?: string) => boolean,
): NavItem | undefined {
  let best: NavItem | undefined;
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
  items: NavItem[];
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
  items: NavItem[];
  mode?: SubNavMode;
}

/** @internal What AppShell provides to pages. */
export interface SubNavChannel {
  register(id: string, value: PageSubNav): void;
  unregister(id: string): void;
  /** The tab row's end slot, once mounted. */
  endSlot: HTMLElement | null;
}

/** @internal */
export const SubNavContext = createContext<SubNavChannel | null>(null);

/**
 * @internal Shell side: holds the latest page registration. Registration runs
 * in a layout effect, so the page's items are in place before first paint.
 */
export function useSubNavChannel(): {
  page: PageSubNav | undefined;
  channel: SubNavChannel;
  setEndSlot: (el: HTMLElement | null) => void;
} {
  const [entries, setEntries] = useState<Array<[string, PageSubNav]>>([]);
  const [endSlot, setEndSlot] = useState<HTMLElement | null>(null);
  const channelRef = useRef<SubNavChannel | null>(null);
  const register = (id: string, value: PageSubNav) =>
    setEntries((prev) => [...prev.filter(([k]) => k !== id), [id, value]]);
  const unregister = (id: string) =>
    setEntries((prev) => prev.filter(([k]) => k !== id));
  // Stable identity for register/unregister; endSlot changes rarely.
  if (!channelRef.current || channelRef.current.endSlot !== endSlot) {
    channelRef.current = { register, unregister, endSlot };
  }
  return {
    page: entries.length ? entries[entries.length - 1]![1] : undefined,
    channel: channelRef.current,
    setEndSlot,
  };
}

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

function itemsKey(items: NavItem[]): string {
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
 * `null` / `undefined` to fall back to them. Use it when children depend on
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
  items: NavItem[] | null | undefined,
  options?: UseAppShellSubNavOptions,
): void {
  const channel = useContext(SubNavContext);
  const id = useId();
  const latest = useRef(items);
  latest.current = items;
  const key = items ? itemsKey(items) : "";
  const mode = options?.mode;
  const register = channel?.register;
  const unregister = channel?.unregister;

  useIsoLayoutEffect(() => {
    if (!register || !unregister) return;
    const value = latest.current;
    if (value) register(id, { items: value, mode });
    else unregister(id);
  }, [register, unregister, id, key, mode]);

  useIsoLayoutEffect(() => {
    if (!unregister) return;
    return () => unregister(id);
  }, [unregister, id]);
}

/**
 * Render `children` in the right-hand slot of the shell's sub-navigation
 * tab row, e.g. a "Ready to publish" status chip. Rendered through a
 * portal, so it keeps the page's context and state. Renders nothing when
 * the shell shows no tab row (other modes, phones, no children).
 *
 * @stability Beta
 */
export function AppShellSubNavEnd({ children }: { children: ReactNode }) {
  const channel = useContext(SubNavContext);
  if (!channel?.endSlot) return null;
  return createPortal(children, channel.endSlot);
}
