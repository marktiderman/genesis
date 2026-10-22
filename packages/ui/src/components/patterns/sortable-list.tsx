import * as React from "react";
import { GripVertical } from "lucide-react";
import { cn } from "../../utils";

export interface SortableListItemContext {
  /** The item's current position, from 0. */
  index: number;
  /**
   * The drag handle: drag it with a pointer, or focus it and press Space to
   * pick the item up, the arrow keys to move it and Space again to drop it.
   * Render it somewhere in the row.
   */
  handle: React.ReactNode;
  /** True while this item is being dragged with a pointer. */
  isDragging: boolean;
  /** True while this item is picked up from the keyboard. */
  isGrabbed: boolean;
  /**
   * Move this item without dragging, for a row menu ("Move up", "Move to
   * top"). Touch users rely on these, so offer them where dragging is awkward.
   */
  moveUp: () => void;
  moveDown: () => void;
  moveTo: (index: number) => void;
}

export interface SortableListProps<T> {
  items: T[];
  /** A stable key per item. Required: dragging finds the item again by key. */
  getKey: (item: T) => string;
  /** A name for an item, for the handle's label and announcements ("Week 1"). */
  getItemLabel: (item: T) => string;
  renderItem: (item: T, context: SortableListItemContext) => React.ReactNode;
  /**
   * Move the item at `from` to `to` (both from 0, `to` counted after the item
   * is taken out). The list is controlled: it shows the new order only once
   * `items` changes, so a rejected promise simply leaves everything in place.
   */
  onReorder: (from: number, to: number) => void | Promise<void>;
  /** Accessible name of the list ("Course steps"). */
  label: string;
  /** Turns off dragging and the keyboard and menu moves. */
  disabled?: boolean;
  className?: string;
  itemClassName?: string;
}

type DropAt = { key: string; edge: "before" | "after" };

const DRAG_TYPE = "application/x-genesis-sortable-item";

/**
 * An ordered list the user can rearrange: course steps, lesson blocks, form
 * fields.
 *
 * Three equivalent ways to move an item, so dragging is never the only one
 * (the same stance as KanbanBoard's "Move to…" menu):
 * - drag the handle with a pointer;
 * - focus the handle, Space or Enter to pick up, ↑/↓ (Home/End) to move,
 *   Space or Enter to drop, Escape to put it back; Alt+↑/↓ moves one step
 *   without picking up;
 * - `moveUp` / `moveDown` / `moveTo` from the render context, for a row menu.
 *
 * Every move is announced in a polite live region. Native drag and drop needs
 * no dependency and Radix has none to offer (docs/FRAMEWORK.md rule 3).
 *
 * @stability Beta
 */
export function SortableList<T>({
  items,
  getKey,
  getItemLabel,
  renderItem,
  onReorder,
  label,
  disabled,
  className,
  itemClassName,
}: SortableListProps<T>) {
  const [armed, setArmed] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [dropAt, setDropAt] = React.useState<DropAt | null>(null);
  const [grabbed, setGrabbed] = React.useState<{ key: string; from: number } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const handles = React.useRef(new Map<string, HTMLButtonElement>());
  const refocus = React.useRef<string | null>(null);
  const instructionsId = React.useId();

  const total = items.length;
  const indexOf = (key: string) => items.findIndex((item) => getKey(item) === key);
  const nameOf = (key: string) => {
    const item = items.find((i) => getKey(i) === key);
    return item === undefined ? "Item" : getItemLabel(item);
  };

  // Reordering moves DOM nodes, which can drop focus; put it back on the
  // handle of the item that just moved.
  React.useLayoutEffect(() => {
    const key = refocus.current;
    if (!key) return;
    const handle = handles.current.get(key);
    if (handle && document.activeElement !== handle) handle.focus();
    refocus.current = null;
  }, [items]);

  const move = (key: string, to: number, message?: string) => {
    const from = indexOf(key);
    const target = Math.max(0, Math.min(total - 1, to));
    if (from < 0 || target === from) return;
    refocus.current = key;
    setAnnouncement(message ?? `${nameOf(key)} moved to position ${target + 1} of ${total}.`);
    void Promise.resolve(onReorder(from, target)).catch(() => {
      // The caller reports the failure; the item stays where it was.
    });
  };

  const onHandleKeyDown = (event: React.KeyboardEvent, key: string) => {
    if (disabled) return;
    const index = indexOf(key);
    const isGrabbed = grabbed?.key === key;

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (isGrabbed) {
        setGrabbed(null);
        setAnnouncement(`${nameOf(key)} dropped at position ${index + 1} of ${total}.`);
      } else {
        setGrabbed({ key, from: index });
        setAnnouncement(
          `${nameOf(key)} picked up, position ${index + 1} of ${total}. Use the up and down arrow keys to move, Space to drop, Escape to cancel.`,
        );
      }
      return;
    }
    if (event.key === "Escape" && isGrabbed) {
      event.preventDefault();
      const from = grabbed.from;
      setGrabbed(null);
      if (from !== index) move(key, from, `Move cancelled. ${nameOf(key)} is back at position ${from + 1} of ${total}.`);
      else setAnnouncement(`Move cancelled. ${nameOf(key)} stays at position ${from + 1} of ${total}.`);
      return;
    }
    const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (step && (isGrabbed || event.altKey)) {
      event.preventDefault();
      move(key, index + step);
      return;
    }
    if (isGrabbed && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      move(key, event.key === "Home" ? 0 : total - 1);
    }
  };

  const onDragOver = (event: React.DragEvent<HTMLLIElement>, key: string) => {
    if (!dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const edge = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    if (dropAt?.key !== key || dropAt.edge !== edge) setDropAt({ key, edge });
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const key = event.dataTransfer.getData(DRAG_TYPE) || dragging;
    const target = dropAt;
    setDragging(null);
    setDropAt(null);
    setArmed(null);
    if (!key || !target) return;
    const from = indexOf(key);
    const over = indexOf(target.key);
    if (from < 0 || over < 0) return;
    // `to` counts positions after the dragged item is taken out.
    let to = target.edge === "before" ? over : over + 1;
    if (from < to) to -= 1;
    move(key, to, `${nameOf(key)} dropped at position ${to + 1} of ${total}.`);
  };

  const endDrag = () => {
    setDragging(null);
    setDropAt(null);
    setArmed(null);
  };

  return (
    <>
      <ul aria-label={label} className={cn("flex flex-col gap-1", className)}>
        {items.map((item, index) => {
          const key = getKey(item);
          const itemLabel = getItemLabel(item);
          const isGrabbed = grabbed?.key === key;
          const isDragging = dragging === key;
          const handle = disabled ? null : (
            <button
              type="button"
              ref={(node) => {
                if (node) handles.current.set(key, node);
                else handles.current.delete(key);
              }}
              aria-label={`Reorder ${itemLabel}`}
              aria-describedby={instructionsId}
              aria-pressed={isGrabbed}
              className={cn(
                "inline-flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground",
                "hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isGrabbed && "bg-accent text-foreground",
              )}
              onPointerDown={() => setArmed(key)}
              onPointerUp={() => {
                if (!dragging) setArmed(null);
              }}
              onKeyDown={(event) => onHandleKeyDown(event, key)}
              onBlur={() => {
                if (isGrabbed && refocus.current !== key) setGrabbed(null);
              }}
            >
              <GripVertical className="h-4 w-4" aria-hidden />
            </button>
          );
          return (
            <li
              key={key}
              data-sortable-key={key}
              draggable={(!disabled && armed === key) || undefined}
              className={cn(
                "relative rounded-md",
                isDragging && "opacity-50",
                isGrabbed && "ring-2 ring-primary/50",
                itemClassName,
              )}
              onDragStart={(event) => {
                if (disabled || armed !== key) return;
                event.dataTransfer.setData(DRAG_TYPE, key);
                event.dataTransfer.effectAllowed = "move";
                setDragging(key);
              }}
              onDragEnd={endDrag}
              onDragOver={(event) => onDragOver(event, key)}
              onDrop={onDrop}
            >
              {dropAt?.key === key && dragging !== key && (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-x-0 h-0.5 rounded bg-primary",
                    dropAt.edge === "before" ? "-top-0.5" : "-bottom-0.5",
                  )}
                />
              )}
              {renderItem(item, {
                index,
                handle,
                isDragging,
                isGrabbed,
                moveUp: () => {
                  if (!disabled) move(key, index - 1);
                },
                moveDown: () => {
                  if (!disabled) move(key, index + 1);
                },
                moveTo: (to) => {
                  if (!disabled) move(key, to);
                },
              })}
            </li>
          );
        })}
      </ul>
      <p id={instructionsId} hidden>
        Press Space to pick up, the arrow keys to move, Space to drop, Escape to cancel.
      </p>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
