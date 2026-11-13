"use client";

// ResourceView's sheet type (`type="sheet"`): a view's rows as a spreadsheet on genesis-ui's
// SheetGrid, the same grid the Data Studio's sheet uses. Only the view's writable fields are
// editable, each row through the view's guards and the screen's `can` (a refused cell says why),
// and every change goes through the resource's own update, row by row, so the provider's rules
// and a versioned resource's check apply. The last change can be undone.

import { useContext, useMemo, useRef, useState } from "react";
import { encodeRecordKey, useResource, useViewer, type BaseRecord, type DataRow, type FieldSchema } from "@marktiderman/genesis-core";
import { SheetCommitError, SheetGrid, type SheetCellChange, type SheetGridColumn } from "../../sheet-grid/sheet-grid";
import { Button } from "../../ui/button";
import { toast } from "../../ui/sonner";
import { fillMessage, useUiMessages } from "../../../messages";
import { useDisplayCell } from "./display";
import { ListModelContext } from "./list-controls";
import { useViewList } from "./use-view-list";
import type { ResourceViewProps } from "./ResourceView";

type Row = Record<string, unknown>;

/** A value as the sheet edits and copies it. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** What a cell's text means for its field; throws, in words, when it can't be one. */
function parseCell(field: FieldSchema, text: string, words: { notNumber: string; notJson: string }): unknown {
  const trimmed = text.trim();
  if (trimmed === "") return field.optional || field.nullable ? null : "";
  if (field.type === "number") {
    const n = Number(trimmed);
    if (!Number.isFinite(n)) throw new Error(words.notNumber);
    return n;
  }
  if (field.type === "boolean") return /^(true|yes|1)$/i.test(trimmed);
  if (field.type === "json") {
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error(words.notJson);
    }
  }
  return text;
}

interface UndoEntry {
  /** Each row the change saved, by key, with its cells' values before. */
  rows: { key: string; before: Record<string, unknown> }[];
}

/**
 * A view's rows as a spreadsheet: `<ResourceView view={v} type="sheet" />`, or `sheet` among a
 * view's `types`. Arrows, Tab, Enter and Escape move and edit as in a spreadsheet; a paste fills a
 * block, skipping read-only cells; Ctrl/Cmd+Z undoes the last change.
 *
 * @stability Beta
 */
export function ResourceSheet<T extends Row = Row>(props: ResourceViewProps<T>) {
  const { view, preset, filter, scoped, resourceOptions, live, can, className } = props;
  const m = useUiMessages();
  const viewer = useViewer();
  const cell = useDisplayCell();
  const listFilters = useContext(ListModelContext)?.state.filters ?? [];
  const list = useViewList<T>(view, {
    ...(preset !== undefined ? { preset } : {}),
    ...(filter !== undefined ? { filter } : {}),
    ...(scoped !== undefined ? { scoped } : {}),
    ...(live !== undefined ? { live } : {}),
    resourceOptions: { ...resourceOptions, defaultFilters: [...(resourceOptions?.defaultFilters ?? []), ...listFilters] },
  });
  // The resource's own update: the provider's rules, its version check and its cache patching.
  const { update } = useResource<T & BaseRecord>(view.resource, { enabled: false, onError: () => {} });
  const writable = useMemo(() => new Set(props.allowEdit === false ? [] : view.writable("edit")), [view, props.allowEdit]);
  const columns = useMemo(() => view.columns(preset ?? "default"), [view, preset]);
  const undo = useRef<UndoEntry[]>([]);
  const [, redraw] = useState(0);

  // A row's cells can't change when the screen's `can` or the view's guard refuses it.
  const rowRefusal = (row: T): string | undefined => {
    if (can && !can("edit", row)) return m.table.notAllowed;
    const verdict = view.can("update", row as T & DataRow, viewer);
    return verdict === true ? undefined : verdict;
  };

  const gridColumns = useMemo<SheetGridColumn<T>[]>(
    () =>
      columns.map((column) => {
        const field = column.field;
        const editable = !!field && writable.has(field.name);
        return {
          key: column.key,
          header: column.label,
          getText: (row: T) => cellText(column.value(row as T & DataRow)),
          render: (row: T) => cell(column as never, row as Row),
          editable,
          ...(editable ? { cellReadOnly: rowRefusal } : { readOnlyReason: m.sheet.readOnly }),
          ...(field?.enumValues?.length ? { options: [...field.enumValues] } : field?.type === "boolean" ? { options: ["true", "false"] } : {}),
          ...(field?.type === "number" ? { align: "end" as const } : {}),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rowRefusal reads can, view and viewer
    [columns, writable, cell, m, can, view, viewer],
  );

  const keyOf = (row: T) => String(encodeRecordKey(view.contract, row as T & DataRow));

  /** Save changes row by row; mark each cell that failed with its reason. */
  async function commit(changes: SheetCellChange<T>[]) {
    const byRow = new Map<string, { row: T; data: Record<string, unknown>; before: Record<string, unknown> }>();
    const failed: { rowKey: string; column: string; message: string }[] = [];
    for (const change of changes) {
      const field = view.field(change.column);
      if (!field || !writable.has(field.name)) continue;
      const refusal = rowRefusal(change.row);
      if (refusal) {
        failed.push({ rowKey: change.rowKey, column: change.column, message: refusal });
        continue;
      }
      const entry = byRow.get(change.rowKey) ?? { row: change.row, data: {}, before: {} };
      try {
        entry.data[field.name] = parseCell(field, change.value, { notNumber: m.sheet.notNumber, notJson: m.sheet.notJson });
        entry.before[field.name] = (change.row as Row)[field.name] ?? null;
        byRow.set(change.rowKey, entry);
      } catch (error) {
        failed.push({ rowKey: change.rowKey, column: change.column, message: (error as Error).message });
      }
    }
    const saved: UndoEntry["rows"] = [];
    for (const [key, { data, before }] of byRow) {
      try {
        await update(key, data as Partial<T & BaseRecord>);
        saved.push({ key, before });
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : m.sheet.saveFailed;
        for (const column of Object.keys(data)) failed.push({ rowKey: key, column, message });
      }
    }
    if (saved.length) {
      undo.current = [...undo.current.slice(-19), { rows: saved }];
      redraw((n) => n + 1);
    }
    if (failed.length) {
      const message = fillMessage(m.sheet.failed, { count: failed.length });
      toast.error(message);
      throw new SheetCommitError(message, failed);
    }
  }

  async function undoLast() {
    const last = undo.current.pop();
    redraw((n) => n + 1);
    if (!last) {
      toast(m.sheet.nothingToUndo);
      return;
    }
    try {
      for (const { key, before } of last.rows) await update(key, before as Partial<T & BaseRecord>);
      toast.success(m.sheet.undone);
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : m.sheet.saveFailed);
    }
  }

  return (
    <div data-slot="resource-sheet" className={className ?? "space-y-2"} data-testid="resource-sheet">
      <SheetGrid<T>
        label={fillMessage(m.sheet.label, { title: props.title ?? view.title })}
        rows={list.rows}
        columns={gridColumns}
        getKey={keyOf}
        onCommit={commit}
        onUndo={() => void undoLast()}
        onSkipped={(count) => toast(fillMessage(m.sheet.skipped, { count }))}
        height={Math.min(640, Math.max(160, (list.rows.length + 2) * 32 + 4))}
        className="rounded-md"
        empty={list.loading ? m.common.loading : m.table.noRecords}
      />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button size="sm" variant="outline" disabled={list.page <= 1} onClick={() => list.setPage(list.page - 1)} testID="resource-sheet-previous">
          {m.sheet.previous}
        </Button>
        <span className="tabular-nums">{list.pageCount ? fillMessage(m.sheet.page, { page: list.page, pages: list.pageCount }) : list.page}</span>
        <Button size="sm" variant="outline" disabled={!list.hasMore} onClick={() => list.setPage(list.page + 1)} testID="resource-sheet-next">
          {m.sheet.next}
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" disabled={undo.current.length === 0} onClick={() => void undoLast()} testID="resource-sheet-undo">
          {m.sheet.undo}
        </Button>
      </div>
    </div>
  );
}
