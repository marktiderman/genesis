import type { ReactNode } from "react";
import { cn } from "../../utils";

export interface DataListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  emptyMessage?: string;
  className?: string;
}

export function DataList<T>({
  items,
  renderItem,
  emptyMessage = "No items found",
  className,
}: DataListProps<T>) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn("divide-y divide-border rounded-lg border", className)}>
      {items.map((item, i) => (
        <div
          key={i}
          className="px-4 py-3 transition-colors hover:bg-accent/50"
        >
          {renderItem(item, i)}
        </div>
      ))}
    </div>
  );
}
