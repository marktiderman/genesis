"use client";

import * as React from "react";
import { GripVertical, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { cn } from "../../utils";

export interface SortableListItemContext {
  /** The item's position as shown, from 0. */
  index: number;
  /**
   * The drag handle: drag it with a pointer, or focus it and press Space or
   * Enter to pick the item up, the arrow keys to move it and Space or Enter
   * again to drop it. Render it somewhere in the row.
   */
  handle: React.ReactNode;
  /** True while this item is being dragged with a pointer. */
  isDragging: boolean;
  /** True while this item is picked up from the keyboard. */
  isGrabbed: boolean;
  /** Move this item without dragging, for a row menu of your own. */
  moveUp: () => void;
  moveDown: () => void;
  moveTo: (index: number) => void;
}

export interface SortableListReorder {
  /** Key of the item that moved. */
  key: string;
}

export interface SortableListProps<T> {
  items: readonly T[];
  /** A stable key per item. Required: dragging finds the item again by key. */
  getKey: (item: T) => string;
  /** A name for an item, for the handle's label and announcements ("Week 1"). */
  getItemLabel: (item: T) => string;
  renderItem: (item: T, context: SortableListItemContext) => React.ReactNode;
  /**
   * Move the item at `from` to `to` (both from 0, `to` counted after the item
   * is taken out). Each finished move calls this once: a keyboard pick-up
   * that wanders and comes back calls nothing.
   *
   * The list shows the new order straight away and keeps showing it until the
   * returned promise settles; by then `items` must be in the new order. A
   * synchronous handler must update `items` in the same tick. A rejected
   * promise puts the old order back and announces that the move failed. Other
   * moves wait until this one settles.
   */
  onReorder: (from: number, to: number, move: SortableListReorder) => void | Promise<void>;
  /** Accessible name of the list ("Course steps"). */
  label: string;
  /** Turns off dragging and every kind of move. */
  disabled?: boolean | undefined;
  /**
   * A "Move" menu on each row (up, down, to top, to bottom), on by default so
   * touch and screen-reader users always have a way to move an item. Turn it
   * off only when the row offers `moveUp` / `moveDown` / `moveTo` itself.
   */
  moveMenu?: boolean | undefined;
  className?: string | undefined;
  itemClassName?: string | undefined;
}

type DropAt = { key: string; edge: "before" | "after" };

const DRAG_TYPE = "application/x-genesis-sortable-item";

// useLayoutEffect warns during server rendering; nothing needs refocusing there.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

function moved(keys: readonly string[], from: number, to: number) {
  const next = keys.slice();
  const [key] = next.splice(from, 1);
  next.splice(to, 0, key!);
  return next;
}

/**
 * A vertical list the user can rearrange: course steps, lesson blocks, form
 * fields.
 *
 * Every way to move an item is equivalent, so dragging is never the only one
 * (the same stance as KanbanBoard's "Move to…" menu):
 * - drag the handle with a pointer;
 * - focus the handle, Space or Enter to pick up, ↑/↓ and Home/End to move,
 *   Space or Enter to drop, Escape to put it back (tabbing away also puts it
 *   back); Alt+↑/↓ moves one step without picking up;
 * - the row's "Move" menu, or `moveUp` / `moveDown` / `moveTo` from the render
 *   context.
 *
 * Moves are announced in a polite live region once they succeed. Native drag
 * and drop needs no dependency and Radix has none to offer (docs/FRAMEWORK.md
 * rule 3).
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
  moveMenu = true,
  className,
  itemClassName,
}: SortableListProps<T>) {
  const [armed, setArmed] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [dropAt, setDropAt] = React.useState<DropAt | null>(null);
  // While a key is grabbed, `preview` is the order on screen; nothing is
  // written until the drop.
  const [grabbed, setGrabbed] = React.useState<{ key: string; from: number } | null>(null);
  // The order to show instead of `items`: during a keyboard pick-up, and from
  // a committed move until its promise settles.
  const [preview, setPreview] = React.useState<string[] | null>(null);
  const [pending, setPending] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const handles = React.useRef(new Map<string, HTMLButtonElement>());
  const refocus = React.useRef<string | null>(null);
  const instructionsId = React.useId();

  const byKey = new Map(items.map((item) => [getKey(item), item] as const));
  const itemKeys = items.map(getKey);
  const keys = preview && preview.length === itemKeys.length && preview.every((k) => byKey.has(k)) ? preview : itemKeys;
  const total = keys.length;
  const nameOf = (key: string) => {
    const item = byKey.get(key);
    return item === undefined ? "Item" : getItemLabel(item);
  };

  // A live region only speaks when its text changes, so the same message
  // twice in a row is told apart by a trailing no-break space.
  const announce = (message: string) =>
    setAnnouncement((previous) => (previous === message ? `${message} ` : message));

  // Only follow the moved item with focus when its handle had focus (or the
  // DOM move dropped focus to the body); a row menu keeps its own focus.
  const keepFocus = (key: string) => {
    const active = typeof document === "undefined" ? null : document.activeElement;
    refocus.current = active === handles.current.get(key) || active === document.body || active === null ? key : null;
  };
  const keysSignature = keys.join("\u0000");
  useIsomorphicLayoutEffect(() => {
    const key = refocus.current;
    refocus.current = null;
    if (!key) return;
    const handle = handles.current.get(key);
    const active = document.activeElement;
    if (handle && (active === document.body || active === null || active === handle)) handle.focus();
  }, [keysSignature]);

  // An item that disappears mid-gesture, or the list turning disabled, ends
  // the gesture.
  React.useEffect(() => {
    if (disabled && (grabbed || armed || dragging)) {
      setGrabbed(null);
      setArmed(null);
      setDragging(null);
      setDropAt(null);
      if (!pending) setPreview(null);
      return;
    }
    if (dragging && !byKey.has(dragging)) {
      setDragging(null);
      setDropAt(null);
      setArmed(null);
    }
    if (grabbed && !byKey.has(grabbed.key)) {
      setGrabbed(null);
      setPreview(null);
    }
  });

  const commit = (key: string, from: number, to: number, message: string) => {
    if (from === to) return;
    setPending(true);
    setPreview(moved(itemKeys, from, to));
    // Called synchronously, so a synchronous handler updates `items` in the
    // same tick as the preview.
    let result: void | Promise<void>;
    try {
      result = onReorder(from, to, { key });
    } catch (error) {
      result = Promise.reject(error);
    }
    Promise.resolve(result)
      .then(
        () => announce(message),
        () => announce(`Couldn’t move ${nameOf(key)}.`),
      )
      .finally(() => {
        setPending(false);
        setPreview(null);
      });
  };

  const move = (key: string, to: number) => {
    if (disabled || pending || grabbed) return;
    if (!Number.isFinite(to)) return;
    const from = itemKeys.indexOf(key);
    const target = Math.max(0, Math.min(total - 1, Math.round(to)));
    if (from < 0 || target === from) return;
    keepFocus(key);
    commit(key, from, target, `${nameOf(key)} moved to position ${target + 1} of ${total}.`);
  };

  const pickUp = (key: string) => {
    if (disabled || pending) return;
    const from = itemKeys.indexOf(key);
    if (from < 0) return;
    setGrabbed({ key, from });
    setPreview(itemKeys);
    announce(
      `${nameOf(key)} picked up, position ${from + 1} of ${total}. Use the up and down arrow keys to move, Space to drop, Escape to cancel.`,
    );
  };

  const drop = (key: string) => {
    if (!grabbed) return;
    const to = keys.indexOf(key);
    const from = grabbed.from;
    setGrabbed(null);
    if (to === from) {
      setPreview(null);
      announce(`${nameOf(key)} dropped at position ${to + 1} of ${total}.`);
      return;
    }
    keepFocus(key);
    commit(key, from, to, `${nameOf(key)} dropped at position ${to + 1} of ${total}.`);
  };

  const cancel = (key: string) => {
    if (!grabbed) return;
    const from = grabbed.from;
    keepFocus(key);
    setGrabbed(null);
    setPreview(null);
    announce(`Move cancelled. ${nameOf(key)} is back at position ${from + 1} of ${total}.`);
  };

  const step = (key: string, to: number) => {
    const index = keys.indexOf(key);
    const target = Math.max(0, Math.min(total - 1, to));
    if (index < 0 || target === index) return;
    keepFocus(key);
    setPreview(moved(keys, index, target));
    announce(`${nameOf(key)} moved to position ${target + 1} of ${total}.`);
  };

  // Escape while an item is picked up must not also close a surrounding
  // Dialog or Sheet, which listen before the handle does.
  React.useEffect(() => {
    if (!grabbed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancel(grabbed.key);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // A press on the handle arms its row for native dragging; any release or
  // cancel, wherever it lands, disarms it.
  React.useEffect(() => {
    if (!armed || dragging) return;
    const disarm = () => setArmed(null);
    window.addEventListener("pointerup", disarm, { once: true });
    window.addEventListener("pointercancel", disarm, { once: true });
    return () => {
      window.removeEventListener("pointerup", disarm);
      window.removeEventListener("pointercancel", disarm);
    };
  }, [armed, dragging]);

  const onHandleKeyDown = (event: React.KeyboardEvent, key: string) => {
    if (disabled) return;
    const isGrabbed = grabbed?.key === key;
    const index = keys.indexOf(key);
    const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (isGrabbed) {
      if (delta) {
        event.preventDefault();
        step(key, index + delta);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        step(key, event.key === "Home" ? 0 : total - 1);
      }
      return;
    }
    if (delta && event.altKey) {
      event.preventDefault();
      move(key, index + delta);
    }
  };

  // Space and Enter reach the handle as a click with `detail === 0`, as do
  // screen readers' activations; a pointer click is a press for dragging.
  const onHandleClick = (event: React.MouseEvent, key: string) => {
    if (disabled || event.detail !== 0) return;
    if (grabbed?.key === key) drop(key);
    else if (!grabbed) pickUp(key);
  };

  const onDragOver = (event: React.DragEvent<HTMLLIElement>, key: string) => {
    if (!dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const edge = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    if (dropAt?.key !== key || dropAt.edge !== edge) setDropAt({ key, edge });
  };

  const endDrag = () => {
    setDragging(null);
    setDropAt(null);
    setArmed(null);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const key = event.dataTransfer.getData(DRAG_TYPE) || dragging;
    const target = dropAt;
    endDrag();
    if (!key || !target || pending || grabbed) return;
    const from = itemKeys.indexOf(key);
    const over = itemKeys.indexOf(target.key);
    if (from < 0 || over < 0) return;
    // `to` counts positions after the dragged item is taken out.
    let to = target.edge === "before" ? over : over + 1;
    if (from < to) to -= 1;
    commit(key, from, to, `${nameOf(key)} dropped at position ${to + 1} of ${total}.`);
  };

  return (
    <>
      <ul aria-label={label} aria-busy={pending || undefined} className={cn("flex flex-col gap-1", className)}>
        {keys.map((key, index) => {
          const item = byKey.get(key)!;
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
              data-grabbed={isGrabbed || undefined}
              className={cn(
                "inline-flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground",
                "hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isGrabbed && "bg-accent text-foreground",
              )}
              onPointerDown={() => {
                if (!pending && !grabbed) setArmed(key);
              }}
              onPointerCancel={() => setArmed(null)}
              onClick={(event) => onHandleClick(event, key)}
              onKeyDown={(event) => onHandleKeyDown(event, key)}
              onBlur={() => {
                // A DOM move during the pick-up blurs the handle for a moment;
                // that is not the user leaving.
                if (isGrabbed && refocus.current !== key) cancel(key);
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
                moveMenu && !disabled && "pr-8",
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
                moveUp: () => move(key, index - 1),
                moveDown: () => move(key, index + 1),
                moveTo: (to) => move(key, to),
              })}
              {moveMenu && !disabled && total > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Move ${itemLabel}`}
                    className="absolute right-1 top-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <MoreVertical className="h-4 w-4" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled={index === 0} onSelect={() => move(key, index - 1)}>
                      Move up
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={index === total - 1} onSelect={() => move(key, index + 1)}>
                      Move down
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={index === 0} onSelect={() => move(key, 0)}>
                      Move to top
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={index === total - 1} onSelect={() => move(key, total - 1)}>
                      Move to bottom
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>
      <p id={instructionsId} hidden>
        Space or Enter picks the item up. Up and down arrows, Home and End move it. Space or Enter drops it, Escape puts
        it back. Alt with an arrow moves it one step.
      </p>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
