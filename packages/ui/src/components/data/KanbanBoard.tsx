"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ArrowRightLeft, GripVertical } from "lucide-react";
import { Badge } from "../ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { cn } from "../../utils";
import { useAnnouncer } from "../patterns/use-announcer";
import { fillMessage, useUiMessages } from "../../messages";

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
   * Move an item to another column. When set (with `getKey`), every card can
   * be moved four ways: dragged with a mouse; dragged by its handle on a
   * touch screen; picked up from the keyboard with its handle (Space, then
   * ←/→ to choose a column, Space to drop, Escape to cancel; Alt+←/→ moves
   * straight away); or from its "Move to…" menu. A finished move is
   * announced to screen readers. A rejected promise leaves the card where it
   * was and announces that the move failed.
   */
  onMoveItem?: (item: T, toColumn: string) => void | Promise<void>;
  /** A name for an item, for its handle, menu and announcements ("Move Ana Ruiz"). */
  getItemLabel?: (item: T) => string;
  /** Under a column's cards, e.g. a "Load more" button. */
  renderColumnFooter?: (column: KanbanColumn<T>) => ReactNode;
}

const DRAG_TYPE = "application/x-genesis-kanban-item";

// useLayoutEffect warns during server rendering; nothing needs refocusing there.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Columns of cards, optionally movable between columns.
 *
 * Moving uses the same engine as SortableList: native drag and drop for the
 * mouse, pointer events on the handle for touch, a keyboard pick-up on the
 * handle, and a "Move to…" menu, with every finished move announced in a
 * polite live region. Radix has no drag and drop and native drag and drop
 * can't be done from a keyboard or a touch screen (docs/FRAMEWORK.md rule 3),
 * so dragging is never the only way to move a card.
 */
export function KanbanBoard<T>({
  columns,
  renderCard,
  emptyMessage: emptyMessageProp,
  className,
  getKey,
  onMoveItem,
  getItemLabel,
  renderColumnFooter,
}: KanbanBoardProps<T>) {
  // A mouse drag (native) or a touch drag on the handle.
  const [dragging, setDragging] = useState<{ key: string; from: string; pointer?: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // A keyboard pick-up: the card stays put and `target` is the column it
  // would drop into.
  const [grabbed, setGrabbed] = useState<{ key: string; from: string; target: string } | null>(null);
  const m = useUiMessages();
  const k = m.kanban;
  const emptyMessage = emptyMessageProp ?? k.noItems;
  const { message: announcement, announce } = useAnnouncer();
  const handles = useRef(new Map<string, HTMLButtonElement>());
  // A card moved from the keyboard lands in another column, a new element;
  // its handle gets focus back once it renders there.
  const refocus = useRef<string | null>(null);
  // Which move the pending refocus belongs to: a slower, earlier move of the
  // same card that fails must not cancel the refocus a later move set up.
  const refocusMove = useRef(0);
  // The column the card was in when its move started: until it shows up
  // somewhere else, the move is still saving.
  const refocusFrom = useRef<string | null>(null);
  const moves = useRef(0);
  const instructionsId = useId();
  const keyOf = (item: T, index: number) => (getKey ? getKey(item) : String(index));
  // Dragging needs stable keys to find the dropped item again.
  const movable = Boolean(onMoveItem && getKey);

  const find = (key: string) => {
    if (!getKey) return null;
    for (const column of columns) {
      const item = column.items.find((i) => getKey(i) === key);
      if (item !== undefined) return { item, column };
    }
    return null;
  };
  const labelOf = (key: string) => {
    const found = find(key);
    return found && getItemLabel ? getItemLabel(found.item) : k.card;
  };
  const columnLabel = (key: string) => columns.find((c) => c.key === key)?.label ?? key;

  const move = (item: T, to: string, name: string) => {
    const id = ++moves.current;
    const key = getKey?.(item);
    if (key !== undefined && refocus.current === key) {
      refocusMove.current = id;
      refocusFrom.current = find(key)?.column.key ?? null;
    }
    let result: void | Promise<void>;
    try {
      result = onMoveItem?.(item, to);
    } catch (error) {
      result = Promise.reject(error);
    }
    // The caller reports the failure; the card simply stays put.
    void Promise.resolve(result).then(
      () => announce(fillMessage(k.moved, { name, column: columnLabel(to) })),
      () => {
        // Nothing moved, so there is no new handle to focus; a pending
        // refocus would otherwise grab focus the next time it reaches body.
        if (key !== undefined && refocus.current === key && refocusMove.current === id) {
          refocus.current = null;
        }
        announce(fillMessage(k.moveFailed, { name }));
      },
    );
  };

  const moveKey = (key: string, to: string) => {
    const found = find(key);
    if (!found || found.column.key === to) return;
    move(found.item, to, labelOf(key));
  };

  const onDrop = (event: DragEvent, to: string) => {
    event.preventDefault();
    setOver(null);
    const key = event.dataTransfer.getData(DRAG_TYPE) || dragging?.key;
    setDragging(null);
    if (key) moveKey(key, to);
  };

  // ── Keyboard pick-up on the handle ──
  const pickUp = (key: string, from: string) => {
    setGrabbed({ key, from, target: from });
    announce(fillMessage(k.pickedUp, { name: labelOf(key), column: columnLabel(from) }));
  };
  const aim = (index: number) => {
    if (!grabbed) return;
    const column = columns[Math.max(0, Math.min(columns.length - 1, index))];
    if (!column || column.key === grabbed.target) return;
    setGrabbed({ ...grabbed, target: column.key });
    announce(fillMessage(k.over, { column: column.label, n: columns.indexOf(column) + 1, count: columns.length }));
  };
  const drop = () => {
    if (!grabbed) return;
    setGrabbed(null);
    if (grabbed.target === grabbed.from) {
      announce(fillMessage(k.droppedBack, { name: labelOf(grabbed.key), column: columnLabel(grabbed.from) }));
      return;
    }
    refocus.current = grabbed.key;
    moveKey(grabbed.key, grabbed.target);
  };
  const cancel = () => {
    if (!grabbed) return;
    setGrabbed(null);
    announce(fillMessage(k.cancelled, { name: labelOf(grabbed.key), column: columnLabel(grabbed.from) }));
  };

  // Escape while a card is picked up must not also close a surrounding
  // Dialog or Sheet, which listen before the handle does.
  useEffect(() => {
    if (!grabbed) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // A card that disappears mid-gesture (or a board that stops being
  // movable) ends the gesture.
  useEffect(() => {
    if (grabbed && (!movable || !find(grabbed.key))) setGrabbed(null);
    if (dragging && (!movable || !find(dragging.key))) {
      setDragging(null);
      setOver(null);
    }
  });

  useIsomorphicLayoutEffect(() => {
    const key = refocus.current;
    if (!key) return;
    const found = find(key);
    if (!found) {
      // The card left the board (filtered out, or moved to a column that
      // isn't shown): nothing to put focus back on.
      refocus.current = null;
      return;
    }
    // Still in the column it left: the move is saving (or failed, which
    // clears this). Wait.
    if (found.column.key === refocusFrom.current) return;
    const handle = handles.current.get(key);
    if (!handle) return;
    const active = document.activeElement;
    // Arrived. Moving it remounted the card, dropping focus to the page:
    // give it back. If the user has moved on to something else, leave it.
    if (active === null || active === document.body) handle.focus();
    refocus.current = null;
  });

  const onHandleKeyDown = (event: KeyboardEvent, key: string, from: string) => {
    const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (grabbed?.key === key) {
      const index = columns.findIndex((c) => c.key === grabbed.target);
      if (delta) {
        event.preventDefault();
        aim(index + delta);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        aim(event.key === "Home" ? 0 : columns.length - 1);
      }
      return;
    }
    if (delta && event.altKey && !grabbed) {
      event.preventDefault();
      const to = columns[columns.findIndex((c) => c.key === from) + delta];
      if (to) {
        refocus.current = key;
        moveKey(key, to.key);
      }
    }
  };

  // Space and Enter reach the handle as a click with `detail === 0`, as do
  // screen readers' activations; a pointer click does nothing here.
  const onHandleClick = (event: { detail: number }, key: string, from: string) => {
    if (event.detail !== 0) return;
    if (grabbed?.key === key) drop();
    else if (!grabbed) pickUp(key, from);
  };

  // ── Touch (and pen) drag on the handle ──
  // Native drag and drop doesn't start from a touch, so the handle tracks
  // the pointer itself and drops on the column under the finger.
  const columnAt = (x: number, y: number) =>
    (typeof document.elementFromPoint === "function" ? document.elementFromPoint(x, y) : null)
      ?.closest<HTMLElement>("[data-kanban-column]")
      ?.dataset.kanbanColumn ?? null;
  const onHandlePointerDown = (event: PointerEvent<HTMLButtonElement>, key: string, from: string) => {
    if (event.pointerType === "mouse" || grabbed || dragging) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging({ key, from, pointer: event.pointerId });
    announce(fillMessage(k.pickedUpTouch, { name: labelOf(key), column: columnLabel(from) }));
  };
  const onHandlePointerMove = (event: PointerEvent) => {
    if (dragging?.pointer !== event.pointerId) return;
    const to = columnAt(event.clientX, event.clientY);
    if (to !== over) setOver(to);
  };
  const onHandlePointerUp = (event: PointerEvent) => {
    if (dragging?.pointer !== event.pointerId) return;
    const to = columnAt(event.clientX, event.clientY) ?? over;
    const { key, from } = dragging;
    setDragging(null);
    setOver(null);
    if (to && to !== from) moveKey(key, to);
    else announce(fillMessage(k.droppedBack, { name: labelOf(key), column: columnLabel(from) }));
  };
  const onHandlePointerCancel = (event: PointerEvent) => {
    if (dragging?.pointer !== event.pointerId) return;
    setDragging(null);
    setOver(null);
  };

  return (
    <>
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
            movable &&
              ((dragging && over === column.key && dragging.from !== column.key) ||
                (grabbed && grabbed.target === column.key && grabbed.from !== column.key)) &&
              "bg-accent/40 ring-2 ring-primary/40",
          )}
          onDragOver={movable ? (e) => {
            if (!dragging || dragging.pointer !== undefined) return;
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
                const name = getItemLabel?.(item) ?? k.cardInLabel;
                const isGrabbed = grabbed?.key === key;
                return (
                <div
                  key={key}
                  className={cn(
                    "animate-fade-in",
                    movable && "group relative rounded-lg",
                    dragging?.key === key && "opacity-50",
                    isGrabbed && "ring-2 ring-primary/50",
                  )}
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
                    <button
                      type="button"
                      ref={(node) => {
                        if (node) handles.current.set(key, node);
                        else handles.current.delete(key);
                      }}
                      aria-label={fillMessage(k.pickUp, { name })}
                      aria-describedby={instructionsId}
                      data-grabbed={isGrabbed || undefined}
                      className={cn(
                        "absolute right-8 top-1.5 cursor-grab touch-none rounded p-1 text-muted-foreground",
                        "hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isGrabbed && "bg-accent text-foreground",
                      )}
                      onClick={(e) => onHandleClick(e, key, column.key)}
                      onKeyDown={(e) => onHandleKeyDown(e, key, column.key)}
                      onBlur={() => {
                        if (isGrabbed) cancel();
                      }}
                      onPointerDown={(e) => onHandlePointerDown(e, key, column.key)}
                      onPointerMove={onHandlePointerMove}
                      onPointerUp={onHandlePointerUp}
                      onPointerCancel={onHandlePointerCancel}
                    >
                      <GripVertical className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                  {movable && columns.length > 1 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={fillMessage(k.move, { name })}
                        className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>{k.moveTo}</DropdownMenuLabel>
                        {columns
                          .filter((c) => c.key !== column.key)
                          .map((c) => (
                            <DropdownMenuItem
                              key={c.key}
                              onSelect={() => {
                                refocus.current = key;
                                move(item, c.key, getItemLabel?.(item) ?? k.card);
                              }}
                            >
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
    {movable && (
      <>
        <p id={instructionsId} hidden>
          {k.instructions}
        </p>
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>
      </>
    )}
    </>
  );
}
