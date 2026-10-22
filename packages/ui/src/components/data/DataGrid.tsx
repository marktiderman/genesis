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
  gridCols?: string;
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
      ((item: T) => (item as Record<string, unknown>).id as string);
    return (
      <div
        ref={keyboardContainerRef}
        className="divide-y divide-border rounded-lg border"
      >
        {items.map((item, i) => (
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
        ))}
      </div>
    );
  }

  const visible = items.slice(0, visibleCount);
  const keyFn =
    getKey ||
    ((item: T) => (item as Record<string, unknown>).id as string);

  return (
    <>
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
