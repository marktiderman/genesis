"use client";

import {
  useState,
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "../../utils";
import { Loader2 } from "lucide-react";
import type { ViewMode } from "../patterns/view-toggle";

const DEFAULT_BATCH_SIZE = 48;

interface DataGridProps<T> {
  items: T[];
  viewMode: ViewMode;
  /** Items per infinite scroll batch (grid only). Default 48 */
  batchSize?: number;
  /** Tailwind grid column classes */
  gridCols?: string | undefined;
  /** Render a single card in grid mode */
  renderCard: (item: T, index: number) => ReactNode;
  /** Render the table view (receives currently visible items) */
  renderTable?: (items: T[]) => ReactNode;
  /** Render a compact list row */
  renderListItem?: (item: T, index: number) => ReactNode;
  /** Animate cards with staggered fade-in. Default true */
  staggerAnimation?: boolean;
  /** Unique key extractor. Defaults to (item as any).id */
  getKey?: (item: T) => string;
  /** Keyboard navigation: focused item index (-1 = none) */
  focusedIndex?: number;
  /** Keyboard navigation: container ref for scroll management */
  keyboardContainerRef?: RefObject<HTMLDivElement | null>;
  /**
   * Open an item. Makes each card (and list row) one keyboard-reachable
   * button: click, Enter or Space activates it, with a focus ring. Clicks on
   * a link, button or input inside the card are left to that control, so a
   * card can still carry its own actions. Use this instead of wrapping cards
   * in a hand-rolled `div role="button"`.
   */
  onItemClick?: ((item: T) => void) | undefined;
  /** Accessible name for an activatable item, e.g. `Open ${item.name}`. Used with `onItemClick`. */
  getItemLabel?: ((item: T) => string) | undefined;
  /**
   * Cards and list rows under group headers (ADR 0017): the group an item is in. Items come in
   * group order; a header goes wherever the group changes.
   */
  groupOf?: ((item: T) => { key: string; label: ReactNode }) | undefined;
  /** What a group's header shows after its count (its totals). */
  groupSummary?: ((items: T[]) => ReactNode) | undefined;
}

/** Consecutive runs of items by group, each with the index of its first item. */
function runsOf<T>(items: T[], groupOf: (item: T) => { key: string; label: ReactNode }) {
  const runs: { key: string; label: ReactNode; items: T[]; start: number }[] = [];
  items.forEach((item, i) => {
    const { key, label } = groupOf(item);
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.items.push(item);
    else runs.push({ key, label, items: [item], start: i });
  });
  return runs;
}

function GroupHeader({ label, count, summary }: { label: ReactNode; count: number; summary?: ReactNode }) {
  return (
    <div data-slot="grid-group" className="flex items-center gap-2 px-1 pt-2 text-sm font-medium">
      <span className="truncate">{label}</span>
      <span className="text-xs font-normal text-muted-foreground tabular-nums">{count}</span>
      {summary ? <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">{summary}</span> : null}
    </div>
  );
}

const NESTED_CONTROL =
  "a,button,input,select,textarea,label,[role=button],[role=link],[role=checkbox],[role=switch],[role=menuitem],[contenteditable=true]";

/** Props that make one grid/list item activatable, or none without `onItemClick`. */
function activation<T>(
  item: T,
  onItemClick: ((item: T) => void) | undefined,
  getItemLabel: ((item: T) => string) | undefined,
) {
  if (!onItemClick) return {};
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": getItemLabel?.(item),
    onClick: (e: MouseEvent<HTMLDivElement>) => {
      const control = (e.target as HTMLElement).closest(NESTED_CONTROL);
      if (control && control !== e.currentTarget) return;
      onItemClick(item);
    },
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onItemClick(item);
      }
    },
  } as const;
}

const ACTIVATABLE =
  "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function DataGrid<T>({
  items,
  viewMode,
  batchSize = DEFAULT_BATCH_SIZE,
  gridCols = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  renderCard,
  renderTable,
  renderListItem,
  staggerAnimation = true,
  getKey,
  focusedIndex = -1,
  keyboardContainerRef,
  onItemClick,
  getItemLabel,
  groupOf,
  groupSummary,
}: DataGridProps<T>) {
  const [visibleCount, setVisibleCount] = useState(batchSize);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when items change
  useEffect(() => {
    setVisibleCount(batchSize);
  }, [items.length, batchSize]);

  // Infinite scroll observer (grid mode only)
  useEffect(() => {
    if (viewMode !== "grid") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && visibleCount < items.length) {
          setVisibleCount((prev) =>
            Math.min(prev + batchSize, items.length),
          );
        }
      },
      { rootMargin: "200px" },
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [viewMode, visibleCount, items.length, batchSize]);

  if (viewMode === "table" && renderTable) {
    return <>{renderTable(items)}</>;
  }

  if (viewMode === "list" && renderListItem) {
    const keyFnList =
      getKey ||
      ((item: T) => (item as Record<string, unknown>)["id"] as string);
    const listRow = (item: T, i: number) => (
      <div
        key={keyFnList(item)}
        data-nav-item
        {...activation(item, onItemClick, getItemLabel)}
        className={cn(
          "px-4 py-3 transition-colors hover:bg-accent/50",
          onItemClick && ACTIVATABLE,
          focusedIndex === i &&
            "ring-2 ring-inset ring-primary bg-accent/50",
        )}
      >
        {renderListItem(item, i)}
      </div>
    );
    if (groupOf) {
      return (
        <div ref={keyboardContainerRef} className="space-y-3">
          {runsOf(items, groupOf).map((run) => (
            // A group can come back in a later run (rows not sorted by it): the run's first row makes it unique.
            <section key={`${run.key}\u0000${keyFnList(run.items[0]!)}`} data-group={run.key}>
              <GroupHeader label={run.label} count={run.items.length} summary={groupSummary?.(run.items)} />
              <div className="mt-1 divide-y divide-border rounded-lg border">
                {run.items.map((item, j) => listRow(item, run.start + j))}
              </div>
            </section>
          ))}
        </div>
      );
    }
    return (
      <div
        ref={keyboardContainerRef}
        className="divide-y divide-border rounded-lg border"
      >
        {items.map((item, i) => listRow(item, i))}
      </div>
    );
  }

  const visible = items.slice(0, visibleCount);
  const keyFn =
    getKey ||
    ((item: T) => (item as Record<string, unknown>)["id"] as string);

  const card = (item: T, i: number) => (
          <div
            key={keyFn(item)}
            data-nav-item
            {...activation(item, onItemClick, getItemLabel)}
            className={cn(
              staggerAnimation && "animate-fade-in",
              onItemClick && cn(ACTIVATABLE, "h-full rounded-xl"),
              focusedIndex === i &&
                "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-xl transition-shadow duration-150",
            )}
            style={
              staggerAnimation
                ? {
                    animationDelay: `${(i % batchSize) * 30}ms`,
                    animationFillMode: "both",
                  }
                : undefined
            }
          >
            {renderCard(item, i)}
          </div>
  );

  return (
    <>
      {groupOf ? (
        <div ref={keyboardContainerRef} className="space-y-4">
          {runsOf(visible, groupOf).map((run) => (
            <section key={`${run.key}\u0000${keyFn(run.items[0]!)}`} data-group={run.key}>
              <GroupHeader label={run.label} count={run.items.length} summary={groupSummary?.(run.items)} />
              <div className={`mt-2 grid ${gridCols} gap-4`}>{run.items.map((item, j) => card(item, run.start + j))}</div>
            </section>
          ))}
        </div>
      ) : (
      <div ref={keyboardContainerRef} className={`grid ${gridCols} gap-4`}>
        {visible.map((item, i) => (
          <div
            key={keyFn(item)}
            data-nav-item
            {...activation(item, onItemClick, getItemLabel)}
            className={cn(
              staggerAnimation && "animate-fade-in",
              onItemClick && cn(ACTIVATABLE, "h-full rounded-xl"),
              focusedIndex === i &&
                "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-xl transition-shadow duration-150",
            )}
            style={
              staggerAnimation
                ? {
                    animationDelay: `${(i % batchSize) * 30}ms`,
                    animationFillMode: "both",
                  }
                : undefined
            }
          >
            {renderCard(item, i)}
          </div>
        ))}
      </div>
      )}
      {visibleCount < items.length && (
        <div
          ref={sentinelRef}
          className="h-12 flex items-center justify-center"
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
    </>
  );
}
