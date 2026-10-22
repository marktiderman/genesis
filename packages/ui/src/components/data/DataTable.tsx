"use client";

import * as React from "react";
import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef as TanStackColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ExternalLink,
  Columns3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "../../utils";
import type { Density } from "../../hooks/use-view-settings";

/* ── Density row / cell rhythm ── */

const DENSITY_CELL: Record<Density, string> = {
  compact: "py-1 h-8",
  comfortable: "py-2",
  spacious: "py-3",
};

const DENSITY_HEAD: Record<Density, string> = {
  compact: "h-8 py-1",
  comfortable: "h-10",
  spacious: "h-12 py-3",
};

/* ── Column definition ── */

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /**
   * Starting width. A number is pixels: the column gets exactly that width
   * (until the user resizes it) and the rest share what is left. A string is
   * a class name for the cell, as before (`"w-48"`); a bare px string
   * (`"180"`, `"180px"`) also sets the width in pixels.
   */
  width?: string | number;
  hideBelow?: "sm" | "md" | "lg" | "xl";
  sortable?: boolean;
  render?: (item: T, value: unknown) => ReactNode;
  accessor?: (item: T) => unknown;
  editable?: {
    type: "text" | "select";
    options?: string[];
    /**
     * Called with the new value. Return a promise to keep the cell in a
     * saving state until it settles: a fulfilled save closes the editor, and
     * a rejected one keeps it open with the error's message beneath it, so
     * nothing the user typed is lost and the reason is on screen. A plain
     * `void` return closes the editor at once, as before.
     */
    onSave: (item: T, newValue: string) => void | Promise<void>;
  };
  /** Whether column is visible by default (default true) */
  defaultVisible?: boolean;
  /** Minimum width in px for resizing */
  minWidth?: number;
}

/* ── Component props ── */

export interface DataTableProps<T> {
  items: T[];
  columns: DataTableColumn<T>[];
  getKey: (item: T) => string;
  onRowClick?: (item: T) => void;
  selectable?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: () => void;
  renderActions?: (item: T) => ReactNode;
  emptyMessage?: string;
  /** Enable column visibility toggle dropdown */
  columnVisibility?: boolean;
  /** localStorage key for persisting column visibility */
  columnVisibilityKey?: string;
  /** Enable column resizing via drag */
  resizableColumns?: boolean;
  /** Enable pagination */
  pagination?: boolean;
  /** Initial page size (default 25) */
  pageSize?: number;
  /** Page size options (default [10, 25, 50, 100]) */
  pageSizeOptions?: number[];
  /** Sticky header on scroll */
  stickyHeader?: boolean;
  /** localStorage key for persisting column resize widths */
  resizeKey?: string;
  /** Make the first column sticky when scrolling horizontally */
  stickyFirstColumn?: boolean;
  /**
   * Row height / padding rhythm.
   * - compact: ~32px (py-1 / h-8)
   * - comfortable: default (py-2)
   * - spacious: taller (py-3)
   */
  density?: Density;
  /**
   * Keyboard use of rows when `onRowClick` is set. Each row's open column
   * (see `openColumn`) is a button named by its content, and the table is
   * one tab stop: Tab reaches the current row's button, Enter or Space
   * opens it, ↑/↓ (or j/k) and Home/End move between rows, and x toggles
   * the row's selection when `selectable`. Default true.
   */
  keyboardNavigation?: boolean;
  /**
   * The column whose cell opens the row (as a button), by key. Default: the
   * first visible column that isn't `editable`. Its `render` must not put a
   * link or button in the cell. `null` makes no cell a button (mouse only).
   */
  openColumn?: string | null;
  /**
   * Render only the rows in view, for a long table without pagination
   * (`pagination={false}`). The table scrolls inside a box of `height` px
   * (default 600). Ignored while paginated.
   */
  virtualize?: boolean | { height?: number; estimateRowHeight?: number };
  /**
   * Columns that stay in view when the table scrolls sideways, by key, on
   * the left and right. `stickyFirstColumn` is shorthand for pinning the
   * first visible column left.
   */
  pinnedColumns?: { left?: string[]; right?: string[] };
  /**
   * Let users reorder columns: drag a header, or press Alt+←/→ on its sort
   * button. Default true; the order is kept per device under
   * `columnOrderKey`, and "Reset to defaults" in the Columns menu restores it.
   */
  reorderableColumns?: boolean;
  /** localStorage key for the user's column order. */
  columnOrderKey?: string;
}

/** localStorage writes that never throw (Safari private mode, quota, blocked storage). */
function storeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // a remembered preference is a convenience; losing it is fine
  }
}
function storeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // as above
  }
}

/** Row height estimate per density, for virtualization. */
const ROW_HEIGHT: Record<Density, number> = { compact: 33, comfortable: 41, spacious: 49 };
/** Width assumed for a pinned column with no width of its own (pinning needs offsets). */
const PINNED_WIDTH = 160;

/**
 * Typed comparison for sorting: numbers and dates by value, booleans false
 * before true, everything else as text with numbers in it ordered naturally.
 * Empty values never reach it: they sort last (see `sortUndefined`).
 */
function compareValues(a: unknown, b: unknown): number {
  const emptyA = a == null || a === "";
  const emptyB = b == null || b === "";
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? -1 : 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "bigint" && typeof b === "bigint") return a < b ? -1 : a > b ? 1 : 0;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

const ROW_OPEN = "data-row-open";

/** Focus row `index`'s open button in this table body, if it is rendered. */
function focusRowAt(body: Element | null, index: number): boolean {
  const target = body?.querySelector<HTMLElement>(`[${ROW_OPEN}="${index}"]`);
  target?.focus();
  return !!target;
}

/* ── Helpers ── */

type SortEntry = { key: string; dir: "asc" | "desc" };

function getCellClasses(col: DataTableColumn<unknown>) {
  const hide = col.hideBelow
    ? col.hideBelow === "sm"
      ? "hidden sm:table-cell"
      : col.hideBelow === "md"
        ? "hidden md:table-cell"
        : col.hideBelow === "lg"
          ? "hidden lg:table-cell"
          : "hidden xl:table-cell"
    : "";
  return cn(typeof col.width === "string" && !PX_WIDTH.test(col.width) ? col.width : undefined, hide);
}

/** A width string that means pixels: `180` or `180px`. Other strings are class names. */
const PX_WIDTH = /^\s*\d+(\.\d+)?(px)?\s*$/;

/** The column's starting width in px, when it names one. */
function pxWidth(width: string | number | undefined): number | undefined {
  if (typeof width === "number") return width > 0 ? width : undefined;
  if (width && PX_WIDTH.test(width)) {
    const px = parseFloat(width);
    return px > 0 ? px : undefined;
  }
  return undefined;
}

/** `<col>` visibility matching a cell's `hideBelow`, so hidden cells don't shift widths. */
function colHideClass(hideBelow: DataTableColumn<unknown>["hideBelow"]) {
  if (!hideBelow) return undefined;
  return hideBelow === "sm"
    ? "hidden sm:table-column"
    : hideBelow === "md"
      ? "hidden md:table-column"
      : hideBelow === "lg"
        ? "hidden lg:table-column"
        : "hidden xl:table-column";
}

/* ── Inline edit cell ── */

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function EditableCell<T>({
  item,
  column,
  value,
}: {
  item: T;
  column: DataTableColumn<T>;
  value: unknown;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not state: Enter and the blur that follows it land in the same
  // tick, and only the first may start a save.
  const inFlight = useRef(false);
  // The draft that last failed, so leaving the cell doesn't silently retry it.
  const failedDraft = useRef<string | null>(null);
  const editable = column.editable!;

  const close = useCallback(() => {
    setEditing(false);
    setError(null);
    failedDraft.current = null;
  }, []);

  const commit = useCallback(
    (v: string) => {
      if (inFlight.current) return;
      let result: void | Promise<void>;
      try {
        result = editable.onSave(item, v);
      } catch (e) {
        setError(errorMessage(e));
        failedDraft.current = v;
        return;
      }
      if (!result || typeof (result as Promise<void>).then !== "function") {
        close();
        return;
      }
      inFlight.current = true;
      setSaving(true);
      setError(null);
      (result as Promise<void>).then(
        () => {
          inFlight.current = false;
          setSaving(false);
          close();
        },
        (e: unknown) => {
          inFlight.current = false;
          setSaving(false);
          setError(errorMessage(e));
          failedDraft.current = v;
        },
      );
    },
    [editable, item, close],
  );

  if (!editing) {
    return (
      <span
        className="cursor-pointer hover:underline decoration-dashed underline-offset-4 decoration-muted-foreground/40"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(String(value ?? ""));
          setError(null);
          failedDraft.current = null;
          setEditing(true);
        }}
      >
        {column.render ? column.render(item, value) : String(value ?? "\u2014")}
      </span>
    );
  }

  const feedback = error ? (
    <p role="alert" className="mt-1 text-[11px] leading-snug text-destructive">
      {error}
    </p>
  ) : null;

  if (editable.type === "select" && editable.options) {
    // Controlled, so what it shows is always the draft; and closable without
    // choosing again — Radix fires no change for the value already picked,
    // so after a failed save Escape or Cancel is the only way out.
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !inFlight.current) close();
        }}
        aria-busy={saving || undefined}
      >
        <Select
          value={draft}
          disabled={saving}
          onValueChange={(v) => {
            setDraft(v);
            commit(v);
          }}
        >
          <SelectTrigger className="h-7 text-xs w-28" aria-invalid={error ? true : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {editable.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {feedback}
        {error && (
          <button
            type="button"
            className="mt-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={close}
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()} aria-busy={saving || undefined}>
      <div className="relative">
        <Input
          autoFocus
          className={cn("h-7 text-xs w-full", saving && "pr-7 opacity-70")}
          value={draft}
          // readOnly rather than disabled while saving: disabling would drop
          // focus, and the resulting blur would try to save a second time.
          readOnly={saving}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (inFlight.current) return;
            if (failedDraft.current === draft) close();
            else commit(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(draft);
            if (e.key === "Escape" && !inFlight.current) close();
          }}
        />
        {saving && (
          <Spinner className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" aria-label="Saving" />
        )}
      </div>
      {feedback}
    </div>
  );
}

/* ── Column resize handle ── */

function ResizeHandle({
  onResize,
  onResizeEnd,
}: {
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
}) {
  const startX = useRef(0);
  const [isResizing, setIsResizing] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startX.current = e.clientX;
      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX.current;
        startX.current = ev.clientX;
        onResize(delta);
      };
      const onUp = () => {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        setIsResizing(false);
        document.body.style.cursor = "";
        onResizeEnd?.();
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
    },
    [onResize, onResizeEnd],
  );

  return (
    <div
      className={cn(
        "absolute right-0 top-0 bottom-0 cursor-col-resize transition-colors",
        isResizing
          ? "w-1.5 bg-primary/50"
          : "w-1 hover:bg-primary/30",
      )}
      onPointerDown={handlePointerDown}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/* ── Main component ── */

export function DataTable<T>({
  items,
  columns,
  getKey,
  onRowClick,
  selectable,
  selected,
  onToggleSelect,
  onToggleAll,
  renderActions,
  emptyMessage = "No records found",
  columnVisibility = true,
  columnVisibilityKey,
  resizableColumns = true,
  pagination = true,
  pageSize: initialPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  stickyHeader = true,
  resizeKey,
  stickyFirstColumn,
  density = "comfortable",
  keyboardNavigation = true,
  openColumn,
  virtualize,
  pinnedColumns,
  reorderableColumns = true,
  columnOrderKey,
}: DataTableProps<T>) {
  const rowKeys = keyboardNavigation && !!onRowClick;
  // Roving tabindex: one row's open button is the table's tab stop.
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const cellDensity = DENSITY_CELL[density];
  const headDensity = DENSITY_HEAD[density];
  // ── Multi-column sort ──
  const [sorts, setSorts] = useState<SortEntry[]>([]);

  const handleSort = useCallback(
    (key: string, shiftKey: boolean) => {
      setSorts((prev) => {
        const existing = prev.findIndex((s) => s.key === key);
        if (existing >= 0) {
          const entry = prev[existing];
          if (entry.dir === "asc") {
            const next = [...prev];
            next[existing] = { key, dir: "desc" };
            return next;
          }
          // Remove on third click
          return prev.filter((_, i) => i !== existing);
        }
        if (shiftKey) return [...prev, { key, dir: "asc" }];
        return [{ key, dir: "asc" }];
      });
    },
    [],
  );

  // ── Column visibility ──
  // SSR-safe: start from column defaults, restore localStorage after mount,
  // and only persist once hydrated — otherwise the defaults write would wipe
  // saved prefs on every full page load.
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {};
      columns.forEach((c) => {
        initial[c.key] = c.defaultVisible !== false;
      });
      return initial;
    },
  );
  const [visibilityHydrated, setVisibilityHydrated] = useState(false);

  useEffect(() => {
    if (!columnVisibilityKey) {
      setVisibilityHydrated(true);
      return;
    }
    try {
      const saved = localStorage.getItem(`dt-vis-${columnVisibilityKey}`);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>;
        setVisibleCols((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(parsed)) {
            if (k in next || columns.some((c) => c.key === k)) {
              next[k] = v;
            }
          }
          // Keep defaults for any column not in the saved map
          columns.forEach((c) => {
            if (!(c.key in next)) next[c.key] = c.defaultVisible !== false;
          });
          return next;
        });
      }
    } catch {
      // ignore corrupt prefs
    }
    setVisibilityHydrated(true);
    // Intentionally once-per-mount for this key (columns keys are stable)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnVisibilityKey]);

  useEffect(() => {
    if (!visibilityHydrated || !columnVisibilityKey) return;
    storeSet(
      `dt-vis-${columnVisibilityKey}`,
      JSON.stringify(visibleCols),
    );
  }, [visibleCols, columnVisibilityKey, visibilityHydrated]);

  const toggleColumnVisibility = useCallback((key: string) => {
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const resetColumnVisibility = useCallback(() => {
    const defaults: Record<string, boolean> = {};
    columns.forEach((c) => {
      defaults[c.key] = c.defaultVisible !== false;
    });
    setVisibleCols(defaults);
    setColOrder(null);
    if (columnVisibilityKey) {
      storeRemove(`dt-vis-${columnVisibilityKey}`);
    }
  }, [columns, columnVisibilityKey]);

  // Sync new columns that aren't in saved state
  useEffect(() => {
    setVisibleCols((prev) => {
      const updated = { ...prev };
      let changed = false;
      columns.forEach((c) => {
        if (!(c.key in updated)) {
          updated[c.key] = c.defaultVisible !== false;
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [columns]);

  // ── Column order (drag a header, or Alt+←/→ on its button) ──
  // Keys in the user's order; columns it doesn't name keep their place at
  // the end, so a new column still shows up.
  const [colOrder, setColOrder] = useState<string[] | null>(null);
  const [orderHydrated, setOrderHydrated] = useState(false);
  useEffect(() => {
    if (columnOrderKey) {
      try {
        const saved = localStorage.getItem(`dt-order-${columnOrderKey}`);
        const parsed: unknown = saved ? JSON.parse(saved) : null;
        // Only a list of column keys is an order; anything else is ignored.
        if (Array.isArray(parsed) && parsed.every((k) => typeof k === "string")) {
          setColOrder(parsed);
        }
      } catch {
        // ignore corrupt prefs
      }
    }
    setOrderHydrated(true);
  }, [columnOrderKey]);
  useEffect(() => {
    if (!orderHydrated || !columnOrderKey) return;
    if (colOrder) storeSet(`dt-order-${columnOrderKey}`, JSON.stringify(colOrder));
    else storeRemove(`dt-order-${columnOrderKey}`);
  }, [colOrder, columnOrderKey, orderHydrated]);
  const orderedColumns = useMemo(() => {
    if (!colOrder) return columns;
    const rank = new Map(colOrder.map((k, i) => [k, i]));
    return [...columns].sort(
      (a, b) => (rank.get(a.key) ?? colOrder.length) - (rank.get(b.key) ?? colOrder.length),
    );
  }, [columns, colOrder]);
  /** Move column `key` to just before or just after another column. */
  const moveColumn = useCallback(
    (key: string, to: { before: string } | { after: string }) => {
      const keys = orderedColumns.map((c) => c.key);
      const from = keys.indexOf(key);
      if (from < 0) return;
      keys.splice(from, 1);
      const at =
        "before" in to
          ? Math.max(0, keys.indexOf(to.before))
          : keys.indexOf(to.after) + 1;
      keys.splice(at, 0, key);
      setColOrder(keys);
    },
    [orderedColumns],
  );
  const [dragKey, setDragKey] = useState<string | null>(null);

  const visibleColumns = columnVisibility
    ? orderedColumns.filter((c) => visibleCols[c.key] !== false)
    : orderedColumns;

  // ── Pinning: left-pinned first, right-pinned last, each kept in view ──
  const leftKeys =
    pinnedColumns?.left ??
    (stickyFirstColumn && visibleColumns[0] ? [visibleColumns[0].key] : []);
  const rightKeys = pinnedColumns?.right ?? [];
  const activeColumns = [
    ...visibleColumns.filter((c) => leftKeys.includes(c.key)),
    ...visibleColumns.filter((c) => !leftKeys.includes(c.key) && !rightKeys.includes(c.key)),
    ...visibleColumns.filter((c) => rightKeys.includes(c.key)),
  ];

  // ── Column resizing ──
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    // Restore from localStorage if resizeKey is provided
    if (resizeKey) {
      try {
        const saved = localStorage.getItem(`dt-resize-${resizeKey}`);
        if (saved) return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    // Initialize from column widths that name pixels (a class name like
    // "w-48" or "12rem" is not a pixel count, so it is left to CSS).
    const initial: Record<string, number> = {};
    columns.forEach((c) => {
      const px = pxWidth(c.width);
      if (px) initial[c.key] = px;
    });
    return initial;
  });

  const handleResize = useCallback(
    (key: string, delta: number, minWidth: number) => {
      setColWidths((prev) => {
        const current = prev[key] || 150;
        return { ...prev, [key]: Math.max(minWidth, current + delta) };
      });
    },
    [],
  );

  const handleResizeEnd = useCallback(() => {
    if (resizeKey) {
      storeSet(`dt-resize-${resizeKey}`, JSON.stringify(colWidths));
    }
  }, [resizeKey, colWidths]);

  // Pinned columns: each one's offset from its edge, after the checkbox
  // (left) or actions (right) column, which pin with them.
  const pinWidth = (key: string) => colWidths[key] ?? PINNED_WIDTH;
  const pinned: Record<string, { side: "left" | "right"; offset: number }> = {};
  {
    let left = selectable ? 40 : 0;
    for (const c of activeColumns) {
      if (!leftKeys.includes(c.key)) continue;
      pinned[c.key] = { side: "left", offset: left };
      left += pinWidth(c.key);
    }
    let right = renderActions ? 40 : 0;
    for (const c of [...activeColumns].reverse()) {
      if (!rightKeys.includes(c.key)) continue;
      pinned[c.key] = { side: "right", offset: right };
      right += pinWidth(c.key);
    }
  }
  /** Sticky classes and offset for a pinned cell (header cells sit above body cells). */
  const pinProps = (key: string | "__select" | "__actions", header: boolean) => {
    const z = header ? (stickyHeader ? "z-[15]" : "z-[5]") : "z-[1]";
    if (key === "__select") {
      return leftKeys.length ? { className: cn("sticky left-0 bg-background", z), style: { left: 0 } } : null;
    }
    if (key === "__actions") {
      return rightKeys.length ? { className: cn("sticky right-0 bg-background", z), style: { right: 0 } } : null;
    }
    const p = pinned[key];
    return p ? { className: cn("sticky bg-background", z), style: { [p.side]: p.offset } } : null;
  };

  // ── Pagination ──
  const [currentPage, setCurrentPage] = useState(0);
  const [currentPageSize, setCurrentPageSize] = useState(initialPageSize);

  // Reset page when items change
  useEffect(() => {
    setCurrentPage(0);
  }, [items.length, currentPageSize]);

  // ── Sort and page: TanStack Table's row models ──
  // The header buttons own the sort state (asc → desc → off, Shift adds a
  // secondary sort); TanStack applies it with a typed comparison and pages
  // the result. Ties keep the items' own order.
  const sorting = useMemo<SortingState>(
    () => sorts.map((s) => ({ id: s.key, desc: s.dir === "desc" })),
    [sorts],
  );
  const tanstackColumns = useMemo<TanStackColumnDef<T>[]>(
    () =>
      columns.map((col) => ({
        id: col.key,
        // Blanks read as undefined here, so `sortUndefined` keeps them last
        // whichever way the column sorts.
        accessorFn: (row: T) => {
          const v = col.accessor ? col.accessor(row) : (row as Record<string, unknown>)[col.key];
          return v == null || v === "" ? undefined : v;
        },
        sortUndefined: "last" as const,
        sortingFn: (a, b, id) => compareValues(a.getValue(id), b.getValue(id)),
      })),
    [columns],
  );
  const table = useReactTable<T>({
    data: items,
    columns: tanstackColumns,
    getRowId: (row) => getKey(row),
    state: {
      sorting,
      pagination: { pageIndex: currentPage, pageSize: currentPageSize },
    },
    enableMultiSort: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(pagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  });
  const totalItems = table.getPrePaginationRowModel().rows.length;
  const totalPages = pagination
    ? Math.max(1, Math.ceil(totalItems / currentPageSize))
    : 1;
  const displayItems = table.getRowModel().rows.map((row) => row.original);

  // ── Virtualization (long, unpaged tables) ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const virtualizing = !!virtualize && !pagination;
  const virtualOptions = typeof virtualize === "object" ? virtualize : {};
  const viewportHeight = virtualOptions.height ?? 600;
  const rowVirtualizer = useVirtualizer({
    count: virtualizing ? displayItems.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => virtualOptions.estimateRowHeight ?? ROW_HEIGHT[density],
    overscan: 10,
    initialRect: { width: 0, height: viewportHeight },
  });
  const virtualRows = virtualizing ? rowVirtualizer.getVirtualItems() : null;

  /** Move the roving focus to row `index`, scrolling it into view first when virtualized. */
  const focusRow = (index: number) => {
    const last = displayItems.length - 1;
    const target = Math.max(0, Math.min(last, index));
    if (focusRowAt(bodyRef.current, target)) return;
    if (!virtualizing) return;
    rowVirtualizer.scrollToIndex(target);
    requestAnimationFrame(() => focusRowAt(bodyRef.current, target));
  };

  // The column whose cell opens the row, and the row that holds the tab stop.
  const openKey = !rowKeys
    ? null
    : openColumn !== undefined
      ? openColumn
      : (activeColumns.find((c) => !c.editable)?.key ?? null);
  const tabStopKey =
    activeRowKey && displayItems.some((it) => getKey(it) === activeRowKey)
      ? activeRowKey
      : displayItems[0]
        ? getKey(displayItems[0])
        : null;
  /** A row's name for its checkbox: the open column's text, or its key. */
  const rowLabel = (item: T, id: string) => {
    const col = activeColumns.find((c) => c.key === (openKey ?? activeColumns[0]?.key));
    const value = col
      ? (col.accessor ?? ((it: T) => (it as Record<string, unknown>)[col.key]))(item)
      : undefined;
    return typeof value === "string" || typeof value === "number" ? String(value) : id;
  };
  const showingFrom =
    totalItems === 0 ? 0 : currentPage * currentPageSize + 1;
  const showingTo = Math.min(
    (currentPage + 1) * currentPageSize,
    totalItems,
  );

  const totalCols =
    activeColumns.length + (selectable ? 1 : 0) + (renderActions ? 1 : 0);

  const renderRow = (item: T, index: number, measure?: (el: HTMLTableRowElement | null) => void) => {
            const id = getKey(item);
            return (
              <TableRow
                key={id}
                ref={measure}
                data-index={index}
                aria-rowindex={virtualizing ? index + 2 : undefined}
                className={cn(
                  onRowClick && "cursor-pointer",
                  "focus-within:bg-muted/40",
                )}
                data-state={
                  selected?.has(id) ? "selected" : undefined
                }
                onClick={
                  onRowClick ? () => onRowClick(item) : undefined
                }
              >
                {selectable && (
                  <TableCell
                    className={cn(cellDensity, pinProps("__select", false)?.className)}
                    style={pinProps("__select", false)?.style}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                    <Checkbox
                      aria-label={`Select ${rowLabel(item, id)}`}
                      checked={selected?.has(id)}
                      onCheckedChange={() => onToggleSelect?.(id)}
                    />
                  </TableCell>
                )}
                {activeColumns.map((col, colIndex) => {
                  const acc =
                    col.accessor ||
                    ((it: T) =>
                      (it as Record<string, unknown>)[col.key]);
                  const value = acc(item);
                  const pin = pinProps(col.key, false);
                  return (
                    <TableCell
                      key={col.key}
                      className={cn(
                        getCellClasses(
                          col as DataTableColumn<unknown>,
                        ),
                        cellDensity,
                        pin?.className,
                      )}
                      style={pin?.style}
                    >
                      {(() => {
                        const content = col.editable ? (
                          <EditableCell
                            item={item}
                            column={col}
                            value={value}
                          />
                        ) : col.render ? (
                          col.render(item, value)
                        ) : (
                          <span className="truncate block max-w-[300px]">
                            {String(value ?? "\u2014")}
                          </span>
                        );
                        if (col.key !== openKey) return content;
                        // The row's named open action: a button the
                        // screen reader announces, and the table's one
                        // tab stop when this row holds it.
                        return (
                          <button
                            type="button"
                            {...{ [ROW_OPEN]: String(index) }}
                            tabIndex={id === tabStopKey ? 0 : -1}
                            className="-mx-1 block w-[calc(100%+0.5rem)] min-w-0 rounded px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            onFocus={() => setActiveRowKey(id)}
                            onClick={(e) => {
                              e.stopPropagation();
                              onRowClick?.(item);
                            }}
                            onKeyDown={(e) => {
                              if (e.metaKey || e.ctrlKey || e.altKey) return;
                              const move = (to: number) => {
                                e.preventDefault();
                                focusRow(to);
                              };
                              if (e.key === "ArrowDown" || e.key === "j") move(index + 1);
                              else if (e.key === "ArrowUp" || e.key === "k") move(index - 1);
                              else if (e.key === "Home") move(0);
                              else if (e.key === "End") move(displayItems.length - 1);
                              else if (e.key === "x" && selectable) {
                                e.preventDefault();
                                onToggleSelect?.(id);
                              }
                            }}
                          >
                            {content}
                          </button>
                        );
                      })()}
                    </TableCell>
                  );
                })}
                {renderActions && (
                  <TableCell
                    className={cn(cellDensity, pinProps("__actions", false)?.className)}
                    style={pinProps("__actions", false)?.style}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                    {renderActions(item)}
                  </TableCell>
                )}
              </TableRow>
            );
  };


  return (
    <div className="border rounded-lg animate-fade-in flex flex-col">
      {/* ── Toolbar ── */}
      {columnVisibility && (
        <div className="flex items-center justify-end px-3 py-2 border-b bg-muted/30">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
              >
                <Columns3 className="h-3.5 w-3.5" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-44 bg-popover z-50"
            >
              {columns.map((col) =>
                col.header ? (
                  <DropdownMenuCheckboxItem
                    key={col.key}
                    checked={visibleCols[col.key] !== false}
                    onCheckedChange={() => toggleColumnVisibility(col.key)}
                  >
                    {col.header}
                  </DropdownMenuCheckboxItem>
                ) : null,
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={resetColumnVisibility}>
                Reset to defaults
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* ── Table ── */}
      <div
        ref={scrollRef}
        className={cn("overflow-x-auto", virtualizing && "overflow-y-auto")}
        style={virtualizing ? { maxHeight: viewportHeight } : undefined}
      >
        <Table
          style={{ tableLayout: "fixed" }}
          // A virtualized body holds only some rows; say how many there are.
          aria-rowcount={virtualizing ? displayItems.length + 1 : undefined}
        >
          {/* Fixed layout sizes columns from the first row: a <colgroup>
              gives each column its px width (the rest share what is left). */}
          <colgroup>
            {selectable && <col style={{ width: 40 }} />}
            {activeColumns.map((col) => {
              const w = colWidths[col.key] ?? (pinned[col.key] ? PINNED_WIDTH : undefined);
              return (
                <col
                  key={col.key}
                  className={colHideClass(col.hideBelow)}
                  style={w ? { width: w } : undefined}
                />
              );
            })}
            {renderActions && <col style={{ width: 40 }} />}
          </colgroup>
          <TableHeader
            className={
              stickyHeader ? "sticky top-0 z-10 bg-background" : ""
            }
          >
            <TableRow aria-rowindex={virtualizing ? 1 : undefined}>
              {selectable && (
                <TableHead
                  className={cn("w-10", headDensity, pinProps("__select", true)?.className)}
                  style={pinProps("__select", true)?.style}
                >
                  <Checkbox
                    aria-label="Select all rows"
                    checked={
                      items.length > 0 && selected?.size === items.length
                    }
                    onCheckedChange={onToggleAll}
                  />
                </TableHead>
              )}
              {activeColumns.map((col, colIndex) => {
                const sortIndex = sorts.findIndex((s) => s.key === col.key);
                const sortEntry =
                  sortIndex >= 0 ? sorts[sortIndex] : null;
                const resizeWidth = colWidths[col.key];
                const pin = pinProps(col.key, true);
                // Unpinned columns can be dragged onto one another to reorder.
                const draggable = reorderableColumns && !pin;

                return (
                  <TableHead
                    key={col.key}
                    className={cn(
                      getCellClasses(col as DataTableColumn<unknown>),
                      headDensity,
                      col.sortable && "select-none",
                      "overflow-hidden",
                      resizableColumns && "relative",
                      pin?.className,
                    )}
                    style={{
                      ...(resizeWidth ? { width: resizeWidth, minWidth: resizeWidth } : {}),
                      ...pin?.style,
                    }}
                    draggable={draggable || undefined}
                    onDragStart={
                      draggable
                        ? (e: React.DragEvent) => {
                            setDragKey(col.key);
                            e.dataTransfer.effectAllowed = "move";
                            // Firefox starts a drag only when it carries data.
                            e.dataTransfer.setData("text/plain", col.key);
                          }
                        : undefined
                    }
                    onDragOver={
                      draggable
                        ? (e: React.DragEvent) => {
                            if (dragKey && dragKey !== col.key) e.preventDefault();
                          }
                        : undefined
                    }
                    onDrop={
                      draggable
                        ? (e: React.DragEvent) => {
                            e.preventDefault();
                            if (dragKey && dragKey !== col.key) moveColumn(dragKey, { before: col.key });
                            setDragKey(null);
                          }
                        : undefined
                    }
                    onDragEnd={draggable ? () => setDragKey(null) : undefined}
                    // Only the primary sort column carries aria-sort; a
                    // secondary sort is said in its button's name instead.
                    aria-sort={
                      sortEntry && sortIndex === 0
                        ? sortEntry.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {(() => {
                      const label = (
                    <span className="flex min-w-0 items-center gap-1">
                      {/* Long headers truncate; the full text stays in the tooltip. */}
                      <span className="truncate" title={col.header}>
                        {col.header}
                      </span>
                      {col.sortable &&
                        (sortEntry ? (
                          <>
                            {sortEntry.dir === "asc" ? (
                              <ArrowUp className="h-3 w-3 shrink-0 text-foreground" />
                            ) : (
                              <ArrowDown className="h-3 w-3 shrink-0 text-foreground" />
                            )}
                            {sorts.length > 1 && (
                              <span
                                aria-hidden="true"
                                className="text-[10px] text-muted-foreground font-mono"
                              >
                                {sortIndex + 1}
                              </span>
                            )}
                          </>
                        ) : (
                          <ArrowUpDown className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                        ))}
                    </span>
                      );
                      // A sortable header is a real button: Tab reaches it, Enter
                      // or Space sorts (Shift adds a secondary sort), and the
                      // cell's aria-sort says which way.
                      return col.sortable ? (
                        <button
                          type="button"
                          className="-mx-1 flex w-[calc(100%+0.5rem)] min-w-0 items-center rounded px-1 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={(e) => handleSort(col.key, e.shiftKey)}
                          onKeyDown={(e) => {
                            // Alt+←/→ moves the column past its visible neighbour.
                            if (!draggable || !e.altKey) return;
                            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                            const movable = activeColumns.filter((c) => !pinned[c.key]);
                            const i = movable.findIndex((c) => c.key === col.key);
                            const neighbour = movable[e.key === "ArrowLeft" ? i - 1 : i + 1];
                            if (!neighbour) return;
                            e.preventDefault();
                            moveColumn(col.key, e.key === "ArrowLeft" ? { before: neighbour.key } : { after: neighbour.key });
                          }}
                          aria-label={
                            sortEntry && sortIndex > 0
                              ? `${col.header}, sorted ${sortEntry.dir === "asc" ? "ascending" : "descending"}, sort ${sortIndex + 1}`
                              : undefined
                          }
                        >
                          {label}
                        </button>
                      ) : (
                        label
                      );
                    })()}
                    {resizableColumns && (
                      <ResizeHandle
                        onResize={(delta) =>
                          handleResize(
                            col.key,
                            delta,
                            col.minWidth ?? 60,
                          )
                        }
                        onResizeEnd={handleResizeEnd}
                      />
                    )}
                  </TableHead>
                );
              })}
              {renderActions && (
                <TableHead
                  className={cn("w-10", headDensity, pinProps("__actions", true)?.className)}
                  style={pinProps("__actions", true)?.style}
                />
              )}
            </TableRow>
          </TableHeader>
          <TableBody ref={bodyRef}>
            {displayItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={totalCols}
                  className="text-center py-12 text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              virtualRows
                ? [
                    <tr key="__top" aria-hidden style={{ height: virtualRows[0]?.start ?? 0 }} />,
                    ...virtualRows.map((vr) =>
                      renderRow(displayItems[vr.index]!, vr.index, rowVirtualizer.measureElement),
                    ),
                    <tr
                      key="__bottom"
                      aria-hidden
                      style={{
                        height: rowVirtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0),
                      }}
                    />,
                  ]
                : displayItems.map((item, index) => renderRow(item, index))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Pagination footer ── */}
      {pagination && (
        <div className="sticky bottom-0 z-10 flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t bg-muted/30 text-xs text-muted-foreground">
          <span>
            {totalItems === 0
              ? "No records"
              : `Showing ${showingFrom}\u2013${showingTo} of ${totalItems}`}
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>Rows:</span>
              <Select
                value={String(currentPageSize)}
                onValueChange={(v) => setCurrentPageSize(Number(v))}
              >
                <SelectTrigger className="h-7 w-16 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {pageSizeOptions.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={currentPage === 0}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="px-2 tabular-nums">
                {currentPage + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Pre-built cell renderers ── */

export function ThumbnailCell({
  src,
  alt,
}: {
  src?: string | null;
  alt: string;
}) {
  if (!src) {
    return (
      <div className="h-10 w-14 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
        &mdash;
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="h-10 w-14 rounded object-cover bg-muted"
      loading="lazy"
    />
  );
}

export function LinkCell({
  href,
  label,
}: {
  href?: string | null;
  label?: string;
}) {
  if (!href) return <span className="text-muted-foreground">&mdash;</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline max-w-[200px] truncate"
    >
      {label || new URL(href).hostname}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}
