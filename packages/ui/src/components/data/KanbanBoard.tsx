import type { ReactNode } from "react";
import { Badge } from "../ui/badge";
import { cn } from "../../utils";

export type ColumnStatus = "neutral" | "warning" | "success" | "info" | "destructive" | "primary";

const statusColorMap: Record<ColumnStatus, { color: string; bgColor: string }> = {
  neutral: { color: "text-muted-foreground", bgColor: "bg-muted" },
  warning: { color: "text-warning", bgColor: "bg-warning/15" },
  success: { color: "text-success", bgColor: "bg-success/15" },
  info: { color: "text-info", bgColor: "bg-info/15" },
  destructive: { color: "text-destructive", bgColor: "bg-destructive/15" },
  primary: { color: "text-primary", bgColor: "bg-primary/15" },
};

export interface KanbanColumn<T> {
  key: string;
  label: string;
  /** Semantic status for automatic color mapping */
  status?: ColumnStatus;
  /** Raw color class (used if status not provided) */
  color?: string;
  /** Raw bg color class (used if status not provided) */
  bgColor?: string;
  items: T[];
}

export interface KanbanBoardProps<T> {
  columns: KanbanColumn<T>[];
  renderCard: (item: T) => ReactNode;
  emptyMessage?: string;
  className?: string;
}

export function KanbanBoard<T>({
  columns,
  renderCard,
  emptyMessage = "No items",
  className,
}: KanbanBoardProps<T>) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {columns.map((column) => {
        const resolved = column.status
          ? statusColorMap[column.status]
          : { color: column.color ?? "", bgColor: column.bgColor ?? "" };
        return (
        <div key={column.key} className="flex flex-col gap-3">
          {/* Column header */}
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-semibold", resolved.color)}>
              {column.label}
            </span>
            <Badge
              variant="secondary"
              className={cn("text-[10px] px-1.5 py-0", resolved.bgColor)}
            >
              {column.items.length}
            </Badge>
          </div>

          {/* Cards */}
          <div className="flex flex-col gap-2 min-h-[80px]">
            {column.items.length === 0 ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-6 text-xs text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              column.items.map((item, i) => (
                <div key={i} className="animate-fade-in" style={{ animationDelay: `${i * 30}ms`, animationFillMode: "both" }}>
                  {renderCard(item)}
                </div>
              ))
            )}
          </div>
        </div>
        );
      })}
    </div>
  );
}
