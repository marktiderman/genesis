import { useState, type DragEvent, type ReactNode } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Badge } from "../ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "../ui/dropdown-menu";
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
  /** How many items the column holds in all, when `items` is one page of them. */
  total?: number;
}

export interface KanbanBoardProps<T> {
  columns: KanbanColumn<T>[];
  renderCard: (item: T) => ReactNode;
  emptyMessage?: string;
  className?: string;
  /** A stable key per item. Without one, cards are keyed by position. */
  getKey?: (item: T) => string;
  /**
   * Move an item to another column. When set, cards can be dragged between
   * columns, and each card gets a "Move to…" menu that does the same from
   * the keyboard. A rejected promise leaves the card where it was.
   */
  onMoveItem?: (item: T, toColumn: string) => void | Promise<void>;
  /** A name for an item, for the move menu's label ("Move Ana Ruiz"). */
  getItemLabel?: (item: T) => string;
  /** Under a column's cards, e.g. a "Load more" button. */
  renderColumnFooter?: (column: KanbanColumn<T>) => ReactNode;
}

const DRAG_TYPE = "application/x-genesis-kanban-item";

/**
 * Columns of cards, optionally movable between columns.
 *
 * Why the keyboard path isn't Radix (docs/FRAMEWORK.md rule 3): Radix has no
 * drag and drop, and native drag and drop can't be done from a keyboard. The
 * "Move to…" menu (a Radix DropdownMenu) is the equivalent path for keyboard
 * and screen-reader users, so dragging is never the only way to move a card.
 */
export function KanbanBoard<T>({
  columns,
  renderCard,
  emptyMessage = "No items",
  className,
  getKey,
  onMoveItem,
  getItemLabel,
  renderColumnFooter,
}: KanbanBoardProps<T>) {
  const [dragging, setDragging] = useState<{ key: string; from: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const keyOf = (item: T, index: number) => (getKey ? getKey(item) : String(index));

  const move = (item: T, to: string) => {
    void Promise.resolve(onMoveItem?.(item, to)).catch(() => {
      // The caller reports the failure; the card simply stays put.
    });
  };

  const onDrop = (event: DragEvent, to: string) => {
    event.preventDefault();
    setOver(null);
    const key = event.dataTransfer.getData(DRAG_TYPE) || dragging?.key;
    setDragging(null);
    if (!key || !getKey) return;
    for (const column of columns) {
      const item = column.items.find((i) => getKey(i) === key);
      if (item) {
        if (column.key !== to) move(item, to);
        return;
      }
    }
  };

  // Dragging needs stable keys to find the dropped item again.
  const movable = Boolean(onMoveItem && getKey);

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
        <section
          key={column.key}
          aria-label={column.label}
          data-kanban-column={column.key}
          className={cn(
            "flex flex-col gap-3 rounded-lg",
            movable && over === column.key && dragging?.from !== column.key && "bg-accent/40 ring-2 ring-primary/40",
          )}
          onDragOver={movable ? (e) => {
            if (!dragging) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (over !== column.key) setOver(column.key);
          } : undefined}
          onDragLeave={movable ? (e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
          } : undefined}
          onDrop={movable ? (e) => onDrop(e, column.key) : undefined}
        >
          {/* Column header */}
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-semibold", resolved.color)}>
              {column.label}
            </span>
            <Badge
              variant="secondary"
              className={cn("text-[10px] px-1.5 py-0", resolved.bgColor)}
            >
              {column.total ?? column.items.length}
            </Badge>
          </div>

          {/* Cards */}
          <div className="flex flex-col gap-2 min-h-[80px]">
            {column.items.length === 0 ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-6 text-xs text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              column.items.map((item, i) => {
                const key = keyOf(item, i);
                return (
                <div
                  key={key}
                  className={cn("animate-fade-in", movable && "group relative", dragging?.key === key && "opacity-50")}
                  style={{ animationDelay: `${i * 30}ms`, animationFillMode: "both" }}
                  draggable={movable || undefined}
                  onDragStart={movable ? (e) => {
                    e.dataTransfer.setData(DRAG_TYPE, key);
                    e.dataTransfer.effectAllowed = "move";
                    setDragging({ key, from: column.key });
                  } : undefined}
                  onDragEnd={movable ? () => {
                    setDragging(null);
                    setOver(null);
                  } : undefined}
                >
                  {renderCard(item)}
                  {movable && columns.length > 1 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Move ${getItemLabel?.(item) ?? "card"}`}
                        className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Move to</DropdownMenuLabel>
                        {columns
                          .filter((c) => c.key !== column.key)
                          .map((c) => (
                            <DropdownMenuItem key={c.key} onSelect={() => move(item, c.key)}>
                              {c.label}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                );
              })
            )}
          </div>
          {renderColumnFooter?.(column)}
        </section>
        );
      })}
    </div>
  );
}
