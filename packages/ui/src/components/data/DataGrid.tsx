"use client";

import {
  useState,
  useEffect,
  useRef,
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
}

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
            className={cn(
              "px-4 py-3 transition-colors hover:bg-accent/50",
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
            className={cn(
              staggerAnimation && "animate-fade-in",
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
