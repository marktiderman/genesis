"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "../../utils";
import { Spinner } from "../ui/spinner";

/* ── Types ── */

export interface SheetGridColumn<T> {
  key: string;
  header: string;
  /** Width in px. Default 160. */
  width?: number | undefined;
  /** The cell's text: what is shown when no `render` is given, edited, and copied. Default `String(row[key])`. */
  getText?: (row: T) => string;
  /** Custom display. Editing and copying still use `getText`. */
  render?: ((row: T) => ReactNode) | undefined;
  /** Whether this column's cells can be edited. */
  editable?: boolean | undefined;
  /** Why the cells can't be edited, shown on hover. */
  readOnlyReason?: string;
  /** Fixed choices: the editor becomes a select. */
  options?: string[];
  /** Shown before the header text, e.g. an icon for the field's type. */
  icon?: ReactNode | undefined;
  /** `end` right-aligns the cells, as for numbers. */
  align?: "start" | "end";
}

/** A column pinned to the left of every row, outside the cell grid (row numbers, a checkbox, an open button). */
export interface SheetGridRowHeader<T> {
  width: number;
  render: (row: T, index: number) => ReactNode;
  /** The header cell above it. */
  header?: ReactNode;
}

/** One cell's new text. A paste or a clear produces several at once. */
export interface SheetCellChange<T> {
  row: T;
  rowKey: string;
  column: string;
  value: string;
}

/**
 * Reject `onCommit` with this to mark specific cells, rather than every cell
 * in the commit, as failed.
 */
export class SheetCommitError extends Error {
  constructor(
    message: string,
    readonly cells: { rowKey: string; column: string; message: string }[],
  ) {
    super(message);
    this.name = "SheetCommitError";
  }
}

export interface SheetGridProps<T> {
  rows: T[];
  columns: SheetGridColumn<T>[];
  getKey: (row: T) => string;
  /**
   * Save one or more cells. Return a promise to show them as saving until it
   * settles; a rejection marks them failed with the error's message (or the
   * cells a `SheetCommitError` names) and keeps their old values.
   */
  onCommit: (changes: SheetCellChange<T>[]) => void | Promise<void>;
  /** Cmd/Ctrl+Z inside the grid. */
  onUndo?: () => void;
  /** Called when a paste or clear touched cells that can't be edited. */
  onSkipped?: (count: number) => void;
  /** Viewport height in px. Default 480. */
  height?: number;
  /** Row height in px. Default 32. */
  rowHeight?: number;
  /** Accessible name for the grid. */
  label: string;
  className?: string;
  /** A pinned column at the left of every row. */
  rowHeader?: SheetGridRowHeader<T>;
  /** Rendered after the last row, inside the scroll area (e.g. "Add a record"). */
  footer?: ReactNode;
  /** Shown when there are no rows. */
  empty?: ReactNode;
}

interface Cell {
  r: number;
  c: number;
}

/* ── Component ── */

/**
 * A spreadsheet grid: virtualized rows, a keyboard-driven active cell and
 * range, in-place editing, and copy and paste through the system clipboard
 * as tab-separated text, so it round-trips with Sheets and Excel.
 *
 * Keys: arrows, Tab and Shift+Tab move; Shift+arrows extend the range;
 * Enter or F2 edits (Enter again saves and moves down); typing starts an
 * edit; Escape cancels; Delete clears; Home/End and Ctrl+Home/End jump;
 * PageUp/PageDown move a screen; Ctrl/Cmd+Z undoes.
 *
 * Why it isn't Radix (docs/FRAMEWORK.md rule 3): Radix has no data grid.
 * The focus model follows the WAI-ARIA grid pattern instead: one tab stop
 * (the grid), the active cell exposed through aria-activedescendant, and
 * aria-selected for the range, so a screen reader announces each move.
 * Virtualization comes from TanStack Virtual (decision 20's spike: stable,
 * headless, actively released; react-data-grid's latest has been a beta for
 * years and brings its own CSS).
 *
 * @stability Experimental
 */
export function SheetGrid<T>({
  rows,
  columns,
  getKey,
  onCommit,
  onUndo,
  onSkipped,
  height = 480,
  rowHeight = 32,
  label,
  className,
  rowHeader,
  footer,
  empty,
}: SheetGridProps<T>) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Cell>({ r: 0, c: 0 });
  const [anchor, setAnchor] = useState<Cell | null>(null);
  // The row being edited is remembered by its key, not its position: rows can
  // be refetched, added or removed while the editor is open.
  const [editing, setEditingState] = useState<{ cell: Cell; rowKey: string; draft: string } | null>(null);
  // Mirrors `editing` synchronously. Enter and the blur that follows it fire
  // in the same tick; only the first may save, or the cell is sent twice
  // with the same (by then stale) version.
  const editingRef = useRef<{ cell: Cell; rowKey: string; draft: string } | null>(null);
  const setEditing = (next: { cell: Cell; rowKey: string; draft: string } | null) => {
    editingRef.current = next;
    setEditingState(next);
  };
  const [status, setStatus] = useState<Record<string, { saving?: boolean; error?: string }>>({});
  const id = React.useId();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => rowHeight,
    overscan: 10,
    // Render the first screen before layout is measured (server render, tests).
    initialRect: { width: 1024, height },
  });

  const textOf = useCallback(
    (row: T, column: SheetGridColumn<T>) =>
      column.getText ? column.getText(row) : String((row as Record<string, unknown>)[column.key] ?? ""),
    [],
  );
  const cellKey = (rowKey: string, column: string) => `${rowKey}\u0000${column}`;
  const lead = rowHeader?.width ?? 0;
  const width = useMemo(() => lead + columns.reduce((sum, c) => sum + (c.width ?? 160), 0), [columns, lead]);

  // Keep the active cell inside the grid as rows come and go.
  useEffect(() => {
    setActive((a) => ({ r: Math.min(a.r, Math.max(0, rows.length - 1)), c: Math.min(a.c, Math.max(0, columns.length - 1)) }));
  }, [rows.length, columns.length]);

  const range = useMemo(() => {
    const from = anchor ?? active;
    return {
      r0: Math.min(from.r, active.r),
      r1: Math.max(from.r, active.r),
      c0: Math.min(from.c, active.c),
      c1: Math.max(from.c, active.c),
    };
  }, [anchor, active]);
  const inRange = (r: number, c: number) => r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1;

  const moveTo = useCallback(
    (cell: Cell, extend = false) => {
      const next = { r: Math.max(0, Math.min(rows.length - 1, cell.r)), c: Math.max(0, Math.min(columns.length - 1, cell.c)) };
      if (extend) setAnchor((a) => a ?? active);
      else setAnchor(null);
      setActive(next);
      virtualizer.scrollToIndex(next.r, { align: "auto" });
    },
    [rows.length, columns.length, active, virtualizer],
  );

  const commit = useCallback(
    async (changes: SheetCellChange<T>[]) => {
      if (!changes.length) return;
      const keys = changes.map((ch) => cellKey(ch.rowKey, ch.column));
      setStatus((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, { saving: true }])) }));
      try {
        await onCommit(changes);
        setStatus((s) => {
          const next = { ...s };
          for (const k of keys) delete next[k];
          return next;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus((s) => {
          const next = { ...s };
          for (const k of keys) delete next[k];
          if (error instanceof SheetCommitError && error.cells.length) {
            for (const cell of error.cells) next[cellKey(cell.rowKey, cell.column)] = { error: cell.message };
          } else {
            for (const k of keys) next[k] = { error: message };
          }
          return next;
        });
      }
    },
    [onCommit],
  );

  const startEdit = (cell: Cell, draft?: string) => {
    const column = columns[cell.c];
    const row = rows[cell.r];
    if (!column?.editable || !row) return;
    setEditing({ cell, rowKey: getKey(row), draft: draft ?? textOf(row, column) });
  };

  const finishEdit = async (move?: Cell) => {
    const current = editingRef.current;
    if (!current) return;
    const { cell, rowKey, draft } = current;
    const row = rows.find((r) => getKey(r) === rowKey);
    const column = columns[cell.c]!;
    setEditing(null);
    scroller.current?.focus();
    if (move) moveTo(move);
    // The row left the grid while it was being edited: drop the draft rather
    // than save it to whichever row now sits at that position.
    if (!row) return;
    if (draft !== textOf(row, column)) {
      await commit([{ row, rowKey, column: column.key, value: draft }]);
    }
  };

  /** Changes for writing `values` (a block) at the active cell, skipping read-only cells. */
  const blockChanges = (values: string[][], origin: Cell) => {
    const changes: SheetCellChange<T>[] = [];
    let skipped = 0;
    values.forEach((line, dr) => {
      line.forEach((value, dc) => {
        const row = rows[origin.r + dr];
        const column = columns[origin.c + dc];
        if (!row || !column) return;
        if (!column.editable) {
          skipped++;
          return;
        }
        if (value !== textOf(row, column)) changes.push({ row, rowKey: getKey(row), column: column.key, value });
      });
    });
    if (skipped) onSkipped?.(skipped);
    return changes;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing) return; // the editor handles its own keys
    // Keys pressed in a row header or the footer (a checkbox, a button) belong to that control.
    if (e.target !== e.currentTarget) return;
    const mod = e.metaKey || e.ctrlKey;
    const page = Math.max(1, Math.floor(height / rowHeight) - 1);
    const { r, c } = active;
    const go = (cell: Cell) => {
      e.preventDefault();
      moveTo(cell, e.shiftKey && e.key !== "Tab");
    };
    switch (e.key) {
      case "ArrowUp":
        return go({ r: mod ? 0 : r - 1, c });
      case "ArrowDown":
        return go({ r: mod ? rows.length - 1 : r + 1, c });
      case "ArrowLeft":
        return go({ r, c: mod ? 0 : c - 1 });
      case "ArrowRight":
        return go({ r, c: mod ? columns.length - 1 : c + 1 });
      case "Tab":
        return go({ r, c: e.shiftKey ? c - 1 : c + 1 });
      case "Home":
        return go({ r: mod ? 0 : r, c: 0 });
      case "End":
        return go({ r: mod ? rows.length - 1 : r, c: columns.length - 1 });
      case "PageUp":
        return go({ r: r - page, c });
      case "PageDown":
        return go({ r: r + page, c });
      case "Enter":
      case "F2":
        e.preventDefault();
        return startEdit(active);
      case "Escape":
        setAnchor(null);
        return;
      case "Delete":
      case "Backspace": {
        e.preventDefault();
        const blank = Array.from({ length: range.r1 - range.r0 + 1 }, () => Array.from({ length: range.c1 - range.c0 + 1 }, () => ""));
        void commit(blockChanges(blank, { r: range.r0, c: range.c0 }));
        return;
      }
      default:
        if (mod && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
          e.preventDefault();
          onUndo?.();
          return;
        }
        if (!mod && !e.altKey && e.key.length === 1) {
          e.preventDefault();
          startEdit(active, e.key);
        }
    }
  };

  const onCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (editing || e.target !== e.currentTarget || rows.length === 0 || columns.length === 0) return;
    const block: string[][] = [];
    for (let r = range.r0; r <= range.r1; r++) {
      const line: string[] = [];
      for (let c = range.c0; c <= range.c1; c++) line.push(textOf(rows[r]!, columns[c]!));
      block.push(line);
    }
    e.clipboardData.setData("text/plain", toTsv(block));
    e.preventDefault();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (editing || e.target !== e.currentTarget) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    let block = parseTsv(text.replace(/\r?\n$/, ""));
    // One value pasted over a range fills the range, as spreadsheets do.
    if (block.length === 1 && block[0]!.length === 1 && (range.r1 > range.r0 || range.c1 > range.c0)) {
      block = Array.from({ length: range.r1 - range.r0 + 1 }, () => Array.from({ length: range.c1 - range.c0 + 1 }, () => block[0]![0]!));
    }
    void commit(blockChanges(block, { r: range.r0, c: range.c0 }));
  };

  const items = virtualizer.getVirtualItems();
  const activeCellId = `${id}-cell-${active.r}-${active.c}`;

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-background", className)} data-testid="sheet-grid">
      <div
        ref={scroller}
        role="grid"
        aria-label={label}
        aria-rowcount={rows.length + 1}
        aria-colcount={columns.length}
        aria-multiselectable="true"
        aria-activedescendant={rows.length ? activeCellId : undefined}
        tabIndex={0}
        className="group/grid relative overflow-auto text-sm outline-none"
        style={{ height }}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onPaste={onPaste}
      >
        <div role="row" aria-rowindex={1} className="sticky top-0 z-20 flex border-b bg-muted" style={{ width }}>
          {rowHeader && (
            <div
              role="presentation"
              className="sticky left-0 z-10 flex shrink-0 items-center border-r bg-muted px-2 text-xs text-muted-foreground"
              style={{ width: rowHeader.width, height: rowHeight }}
            >
              {rowHeader.header}
            </div>
          )}
          {columns.map((column, c) => (
            <div
              key={column.key}
              role="columnheader"
              aria-colindex={c + 1}
              className="flex shrink-0 items-center gap-1.5 border-r px-2 py-1.5 text-xs font-medium text-muted-foreground"
              style={{ width: column.width ?? 160, height: rowHeight }}
              title={column.readOnlyReason}
            >
              {column.icon && <span className="flex shrink-0 items-center" aria-hidden>{column.icon}</span>}
              <span className="truncate">{column.header}</span>
            </div>
          ))}
        </div>
        {rows.length === 0 && empty && (
          <div className="sticky left-0 px-3 py-6 text-sm text-muted-foreground" style={{ width: "100%" }}>
            {empty}
          </div>
        )}
        <div style={{ height: virtualizer.getTotalSize(), width, position: "relative" }}>
          {items.map((item) => {
            const row = rows[item.index]!;
            const rowKey = getKey(row);
            return (
              <div
                key={rowKey}
                role="row"
                aria-rowindex={item.index + 2}
                className="group/row absolute left-0 flex border-b hover:bg-muted/40"
                style={{ top: item.start, height: rowHeight, width }}
              >
                {rowHeader && (
                  <div
                    role="presentation"
                    className="sticky left-0 z-10 flex shrink-0 items-center border-r bg-background px-2 text-xs text-muted-foreground group-hover/row:bg-muted"
                    style={{ width: rowHeader.width }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {rowHeader.render(row, item.index)}
                  </div>
                )}
                {columns.map((column, c) => {
                  const isActive = active.r === item.index && active.c === c;
                  const selected = inRange(item.index, c);
                  const state = status[cellKey(rowKey, column.key)];
                  const isEditing = editing && editing.rowKey === rowKey && editing.cell.c === c;
                  return (
                    <div
                      key={column.key}
                      id={`${id}-cell-${item.index}-${c}`}
                      role="gridcell"
                      aria-colindex={c + 1}
                      aria-selected={selected}
                      aria-readonly={!column.editable || undefined}
                      aria-invalid={state?.error ? true : undefined}
                      aria-busy={state?.saving || undefined}
                      title={state?.error ?? (!column.editable ? column.readOnlyReason : undefined)}
                      className={cn(
                        "relative flex shrink-0 items-center border-r px-2",
                        selected && (range.r1 > range.r0 || range.c1 > range.c0) && "bg-primary/5",
                        // The active cell shows while the grid has focus, as in a spreadsheet.
                        isActive && "group-focus-within/grid:outline group-focus-within/grid:outline-2 group-focus-within/grid:-outline-offset-2 group-focus-within/grid:outline-primary",
                        state?.error && "bg-destructive/10",
                        column.align === "end" && "justify-end tabular-nums",
                      )}
                      style={{ width: column.width ?? 160 }}
                      onMouseDown={(e) => {
                        if (isEditing) return;
                        e.preventDefault();
                        scroller.current?.focus();
                        moveTo({ r: item.index, c }, e.shiftKey);
                      }}
                      onDoubleClick={() => startEdit({ r: item.index, c })}
                    >
                      {isEditing ? (
                        column.options ? (
                          <select
                            autoFocus
                            aria-label={`${column.header}, row ${item.index + 1}`}
                            className="h-full w-full bg-background text-sm outline-none"
                            value={editing.draft}
                            onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                            onBlur={() => void finishEdit()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void finishEdit({ r: item.index + 1, c });
                              if (e.key === "Escape") {
                                setEditing(null);
                                scroller.current?.focus();
                              }
                            }}
                          >
                            {!column.options.includes(editing.draft) && <option value={editing.draft}>{editing.draft || "—"}</option>}
                            {column.options.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            autoFocus
                            aria-label={`${column.header}, row ${item.index + 1}`}
                            className="h-full w-full bg-background text-sm outline-none"
                            value={editing.draft}
                            onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                            onBlur={() => void finishEdit()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void finishEdit({ r: item.index + 1, c });
                              } else if (e.key === "Tab") {
                                e.preventDefault();
                                void finishEdit({ r: item.index, c: c + (e.shiftKey ? -1 : 1) });
                              } else if (e.key === "Escape") {
                                setEditing(null);
                                scroller.current?.focus();
                              }
                            }}
                          />
                        )
                      ) : (
                        <span className="truncate">{column.render ? column.render(row) : textOf(row, column) || <span className="text-muted-foreground">—</span>}</span>
                      )}
                      {state?.saving && <Spinner size="sm" className="absolute right-1 h-3 w-3" aria-label="Saving" />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {footer && (
          <div className="sticky left-0 border-b" style={{ width: Math.max(width, 0) }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── TSV for copy and paste ── */

/** Parse spreadsheet clipboard text (tab-separated, quoted when needed). */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // A field that was quoted counts even when empty: `""` is one blank cell.
  let wasQuoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
      wasQuoted = true;
    } else if (ch === "\t") {
      row.push(field);
      field = "";
      wasQuoted = false;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      wasQuoted = false;
    } else field += ch;
  }
  if (field !== "" || wasQuoted || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function tsvField(text: string): string {
  return /[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Write a block of cells as spreadsheet clipboard text (the inverse of `parseTsv`). */
export function toTsv(grid: string[][]): string {
  // A row that is one blank cell would otherwise be an empty line, which a
  // paste can't tell from no row at all: write it as `""`.
  return grid.map((row) => (row.length === 1 && row[0] === "" ? '""' : row.map(tsvField).join("\t"))).join("\n");
}
