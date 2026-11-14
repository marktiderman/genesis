"use client";

// ResourceView's sheet type (`type="sheet"`): a view's rows as a spreadsheet on genesis-ui's
// SheetGrid, the same grid the Data Studio's sheet uses. Only the view's writable fields are
// editable, each row through the view's guards and the screen's `can` (a refused cell says why),
// and every change goes through the resource's own update, row by row, so the provider's rules
// and a versioned resource's check apply. The last change can be undone.

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { encodeRecordKey, useResource, useViewer, type BaseRecord, type DataRow, type FieldSchema } from "@marktiderman/genesis-core";
import { SheetCommitError, SheetGrid, type SheetCellChange, type SheetGridColumn } from "../../sheet-grid/sheet-grid";
import { Button } from "../../ui/button";
import { EmptyState } from "../../patterns/empty-state";
import { toast } from "../../ui/sonner";
import { fillMessage, useUiMessages } from "../../../messages";
import { useDisplayCell } from "./display";
import { ListModelContext, refuseHeldRows } from "./list-controls";
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
  /** The resource the change was saved to: undo never writes it into another one. */
  resource: string;
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
  // Rendered directly too: held rows would be ignored and edits would skip the screen's onEdit.
  refuseHeldRows(view.resource, "sheet", props.rows);
  const m = useUiMessages();
  const viewer = useViewer();
  const cell = useDisplayCell();
  const listState = useContext(ListModelContext)?.state;
  const listFilters = listState?.filters ?? [];
  const list = useViewList<T>(view, {
    ...(preset !== undefined ? { preset } : {}),
    ...(filter !== undefined ? { filter } : {}),
    ...(scoped !== undefined ? { scoped } : {}),
    ...(live !== undefined ? { live } : {}),
    resourceOptions: { ...resourceOptions, defaultFilters: [...(resourceOptions?.defaultFilters ?? []), ...listFilters] },
  });
  // A saved view's search and sort come back here too, as on every list; the sheet's own reach the
  // list state, for saving.
  const restoreNonce = listState?.restore.nonce ?? 0;
  useEffect(() => {
    if (!restoreNonce || !listState) return;
    list.setSearch(listState.restore.search);
    list.setSort(listState.restore.sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per restore
  }, [restoreNonce]);
  const observe = listState?.observeQuery;
  useEffect(() => {
    observe?.({ search: list.search, sort: list.sort ? { field: list.sort.field, order: list.sort.order } : null });
  }, [observe, list.search, list.sort]);

  // The resource's own update: the provider's rules, its version check and its cache patching.
  const { update } = useResource<T & BaseRecord>(view.resource, { enabled: false, onError: () => {} });
  const writable = useMemo(() => new Set(props.allowEdit === false ? [] : view.writable("edit")), [view, props.allowEdit]);
  const columns = useMemo(() => view.columns(preset ?? "default"), [view, preset]);
  const undo = useRef<UndoEntry[]>([]);
  // Bumped each time the sheet shows another resource (an undo entry only joins the showing it was made in).
  const generation = useRef(0);
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
        // A list field (`array`) shows as text the sheet can't turn back into a list: read-only.
        const editable = !!field && writable.has(field.name) && !field.array;
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
  // Writes go one at a time: an undo waits for a save still out, and a save for an undo, so two
  // restores of the same cell can't land in the wrong order. `undoing` is set synchronously, before
  // the history changes, so a second Undo (button or keyboard) while one runs does nothing.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const undoing = useRef(false);
  const serial = <R,>(work: () => Promise<R>): Promise<R> => {
    const run = queue.current.then(work, work);
    queue.current = run.catch(() => undefined);
    return run;
  };

  function commit(changes: SheetCellChange<T>[]) {
    // Which showing of the resource this edit was made in: a save that lands after the sheet moved
    // to another resource (even back again) adds no undo entry, so a stale one is never offered.
    const madeIn = generation.current;
    return serial(() => commitNow(changes, madeIn));
  }

  async function commitNow(changes: SheetCellChange<T>[], madeIn: number) {
    const byRow = new Map<string, { row: T; data: Record<string, unknown>; before: Record<string, unknown> }>();
    const failed: { rowKey: string; column: string; message: string }[] = [];
    for (const change of changes) {
      const field = view.field(change.column);
      if (!field || !writable.has(field.name) || field.array) continue;
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
    const resource = view.resource;
    const saved: UndoEntry["rows"] = [];
    for (const [key, { data, before }] of byRow) {
      // Queued behind another write, it may run after the sheet moved to another resource: its
      // keys and values are the old one's, so it's never sent (the cells say why).
      if (madeIn !== generation.current) {
        for (const column of Object.keys(data)) failed.push({ rowKey: key, column, message: m.sheet.moved });
        continue;
      }
      try {
        await update(key, data as Partial<T & BaseRecord>);
        saved.push({ key, before });
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : m.sheet.saveFailed;
        for (const column of Object.keys(data)) failed.push({ rowKey: key, column, message });
      }
    }
    if (saved.length && madeIn === generation.current) {
      undo.current = [...undo.current.slice(-19), { resource, rows: saved }];
      redraw((n) => n + 1);
    }
    if (failed.length) {
      const message = fillMessage(m.sheet.failed, { count: failed.length });
      toast.error(message);
      throw new SheetCommitError(message, failed);
    }
  }

  // Undo belongs to the resource it was made on: a sheet that now shows another one starts clean.
  const shownResource = view.resource;
  const history = () => undo.current.filter((entry) => entry.resource === shownResource);
  useEffect(() => {
    generation.current += 1;
    undo.current = undo.current.filter((entry) => entry.resource === shownResource);
    redraw((n) => n + 1);
  }, [shownResource]);

  /**
   * Undo the last change, row by row, each through the same checks an edit has now: the row as it
   * is loaded, the screen's `can`, the view's guard and the fields it may write. A row that's
   * refused, or whose write fails, stays in the history to try again; the ones restored leave it.
   */
  async function undoLast() {
    if (undoing.current) return;
    undoing.current = true;
    try {
      await serial(undoNow);
    } finally {
      undoing.current = false;
      redraw((n) => n + 1);
    }
  }

  async function undoNow() {
    // The showing this undo runs in: if the sheet moves to another resource (and back) before it
    // fails, what's left of it isn't put back into a history it no longer belongs to.
    const madeIn = generation.current;
    const entries = history();
    const last = entries[entries.length - 1];
    if (!last) {
      toast(m.sheet.nothingToUndo);
      return;
    }
    undo.current = undo.current.filter((entry) => entry !== last);
    redraw((n) => n + 1);
    const left: UndoEntry["rows"] = [];
    let problem: string | undefined;
    for (const item of last.rows) {
      // The sheet moved to another resource while this undo waited or ran: nothing more is sent.
      if (madeIn !== generation.current) {
        left.push(item);
        problem ??= m.sheet.moved;
        continue;
      }
      const row = list.rows.find((r) => keyOf(r) === item.key);
      const refusal = !row
        ? m.table.notAllowed
        : (rowRefusal(row) ?? (Object.keys(item.before).every((name) => writable.has(name)) ? undefined : m.sheet.readOnly));
      if (refusal) {
        left.push(item);
        problem ??= refusal;
        continue;
      }
      try {
        await update(item.key, item.before as Partial<T & BaseRecord>);
      } catch (error) {
        left.push(item);
        problem ??= error instanceof Error && error.message ? error.message : m.sheet.saveFailed;
      }
    }
    if (left.length) {
      if (madeIn === generation.current) undo.current = [...undo.current, { resource: last.resource, rows: left }];
      redraw((n) => n + 1);
      toast.error(problem ?? m.sheet.saveFailed);
    } else toast.success(m.sheet.undone);
  }

  // A failed read says so, with a retry: never an empty sheet.
  if (list.error && list.rows.length === 0) {
    return (
      <div data-slot="resource-sheet" className={className ?? "space-y-2"} data-testid="resource-sheet">
        <div role="alert" data-testid="resource-sheet-error">
          <EmptyState
            title={m.page.errorTitle}
            description={fillMessage(m.page.errorBody, { entity: view.noun })}
            action={
              <Button size="sm" variant="outline" onClick={() => list.refetch()} testID="resource-sheet-retry">
                {m.page.retry}
              </Button>
            }
          />
        </div>
      </div>
    );
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
        <Button size="sm" variant="ghost" className="ml-auto" disabled={history().length === 0 || undoing.current} onClick={() => void undoLast()} testID="resource-sheet-undo">
          {m.sheet.undo}
        </Button>
      </div>
    </div>
  );
}
