"use client";

import * as React from "react";
import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
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
  width?: string;
  hideBelow?: "sm" | "md" | "lg" | "xl";
  sortable?: boolean;
  render?: (item: T, value: unknown) => ReactNode;
  accessor?: (item: T) => unknown;
  editable?: {
    type: "text" | "select";
    options?: string[];
    onSave: (item: T, newValue: string) => void;
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
  return cn(col.width, hide);
}

/* ── Inline edit cell ── */

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
  const editable = column.editable!;

  const commit = useCallback(
    (v: string) => {
      editable.onSave(item, v);
      setEditing(false);
    },
    [editable, item],
  );

  if (!editing) {
    return (
      <span
        className="cursor-pointer hover:underline decoration-dashed underline-offset-4 decoration-muted-foreground/40"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(String(value ?? ""));
          setEditing(true);
        }}
      >
        {column.render ? column.render(item, value) : String(value ?? "\u2014")}
      </span>
    );
  }

  if (editable.type === "select" && editable.options) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Select defaultValue={draft} onValueChange={(v) => commit(v)}>
          <SelectTrigger className="h-7 text-xs w-28">
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
      </div>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Input
        autoFocus
        className="h-7 text-xs w-full"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(draft);
          if (e.key === "Escape") setEditing(false);
        }}
      />
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
}: DataTableProps<T>) {
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
    localStorage.setItem(
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
    if (columnVisibilityKey) {
      localStorage.removeItem(`dt-vis-${columnVisibilityKey}`);
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

  const activeColumns = columnVisibility
    ? columns.filter((c) => visibleCols[c.key] !== false)
    : columns;

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
    // Initialize from column width definitions (parse px/rem values to px numbers)
    const initial: Record<string, number> = {};
    columns.forEach((c) => {
      if (c.width) {
        const px = parseInt(c.width, 10);
        if (!isNaN(px) && px > 0) initial[c.key] = px;
      }
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
      localStorage.setItem(`dt-resize-${resizeKey}`, JSON.stringify(colWidths));
    }
  }, [resizeKey, colWidths]);

  // ── Pagination ──
  const [currentPage, setCurrentPage] = useState(0);
  const [currentPageSize, setCurrentPageSize] = useState(initialPageSize);

  // Reset page when items change
  useEffect(() => {
    setCurrentPage(0);
  }, [items.length, currentPageSize]);

  // ── Sort items ──
  const sorted = (() => {
    if (sorts.length === 0) return items;
    return [...items].sort((a, b) => {
      for (const s of sorts) {
        const col = columns.find((c) => c.key === s.key);
        if (!col) continue;
        const acc =
          col.accessor ||
          ((item: T) => (item as Record<string, unknown>)[col.key]);
        const va = acc(a);
        const vb = acc(b);
        const sa = va == null ? "" : String(va);
        const sb = vb == null ? "" : String(vb);
        const cmp = sa.localeCompare(sb, undefined, {
          numeric: true,
          sensitivity: "base",
        });
        if (cmp !== 0) return s.dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  })();

  // ── Paginate ──
  const totalItems = sorted.length;
  const totalPages = pagination
    ? Math.max(1, Math.ceil(totalItems / currentPageSize))
    : 1;
  const displayItems = pagination
    ? sorted.slice(
        currentPage * currentPageSize,
        (currentPage + 1) * currentPageSize,
      )
    : sorted;
  const showingFrom =
    totalItems === 0 ? 0 : currentPage * currentPageSize + 1;
  const showingTo = Math.min(
    (currentPage + 1) * currentPageSize,
    totalItems,
  );

  const totalCols =
    activeColumns.length + (selectable ? 1 : 0) + (renderActions ? 1 : 0);

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
      <div className="overflow-x-auto">
        <Table style={{ tableLayout: "fixed" }}>
          <TableHeader
            className={
              stickyHeader ? "sticky top-0 z-10 bg-background" : ""
            }
          >
            <TableRow>
              {selectable && (
                <TableHead className={cn("w-10", headDensity)}>
                  <Checkbox
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
                const isFirstCol = colIndex === 0 && stickyFirstColumn;

                return (
                  <TableHead
                    key={col.key}
                    className={cn(
                      getCellClasses(col as DataTableColumn<unknown>),
                      headDensity,
                      col.sortable && "cursor-pointer select-none",
                      resizableColumns && "relative",
                      isFirstCol && "sticky left-0 bg-background",
                      isFirstCol && stickyHeader ? "z-[15]" : isFirstCol ? "z-[5]" : undefined,
                    )}
                    style={
                      resizeWidth
                        ? { width: resizeWidth, minWidth: resizeWidth }
                        : undefined
                    }
                    onClick={
                      col.sortable
                        ? (e: React.MouseEvent) => handleSort(col.key, e.shiftKey)
                        : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable &&
                        (sortEntry ? (
                          <>
                            {sortEntry.dir === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-foreground" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-foreground" />
                            )}
                            {sorts.length > 1 && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {sortIndex + 1}
                              </span>
                            )}
                          </>
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
                        ))}
                    </span>
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
                <TableHead className={cn("w-10", headDensity)} />
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
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
              displayItems.map((item) => {
                const id = getKey(item);
                return (
                  <TableRow
                    key={id}
                    className={cn(onRowClick && "cursor-pointer")}
                    data-state={
                      selected?.has(id) ? "selected" : undefined
                    }
                    onClick={
                      onRowClick ? () => onRowClick(item) : undefined
                    }
                  >
                    {selectable && (
                      <TableCell
                        className={cellDensity}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <Checkbox
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
                      const isFirstCol = colIndex === 0 && stickyFirstColumn;
                      return (
                        <TableCell
                          key={col.key}
                          className={cn(
                            getCellClasses(
                              col as DataTableColumn<unknown>,
                            ),
                            cellDensity,
                            isFirstCol && "sticky left-0 z-[1] bg-background",
                          )}
                        >
                          {col.editable ? (
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
                          )}
                        </TableCell>
                      );
                    })}
                    {renderActions && (
                      <TableCell
                        className={cellDensity}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        {renderActions(item)}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
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
