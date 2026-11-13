"use client";

// ResourceView's board mode (docs/RESOURCE-VIEW.md, "Board"): a view's rows as cards in a column per
// value of one field. Loaded by useBoardColumns and drawn by KanbanBoard, the same two pieces
// studio's board uses. A move is the resource's own update, through the provider's write path.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BaseRecord, DataRow, FilterParam, ResourceContract, UseResourceOptions } from "@marktiderman/genesis-core";
import type { LiveOptions } from "@marktiderman/genesis-core/hooks";
import type { RecordOpen, RecordView as RecordViewDef, ResourceView as View, ViewBoard, ViewTone } from "@marktiderman/genesis-core/resource-view";
import { defaultNavigate, type NavigateFn } from "../../../navigation";
import { Button } from "../../ui/button";
import { cn } from "../../../utils";
import { fillMessage, useUiMessages } from "../../../messages";
import { ConflictSheet } from "../ConflictSheet";
import { KanbanBoard, type ColumnStatus, type KanbanColumn } from "../KanbanBoard";
import type { ResourceAction } from "../ResourcePage";
import { useDisplayCell } from "./display";
import { useViewDetailFields } from "./view-list";
import { useViewBoard } from "./use-view-board";
import { recordViewOf, resolveRecordOpen, ViewRecordPeek } from "./record-open";

type Row = Record<string, unknown>;

/**
 * A screen's board settings: the view's `board` block for every key it has, overridden here, plus
 * what a description can't hold (functions).
 *
 * @stability Beta
 */
export interface ResourceBoardOptions<T extends Row = Row> extends Partial<ViewBoard> {
  /** A card was chosen. Default: the view's peek. */
  onSelect?: (row: T) => void;
  /** Draw a card this screen's way. Default: the row's title and the board's `cardFields`. */
  renderCard?: (row: T) => ReactNode;
  /**
   * A move was refused (a guard, the server, a conflict with someone else's edit). The card is
   * already back where it was. Default: the reason shows above the board.
   */
  onMoveError?: (error: unknown, row: T) => void;
  /** Cards per column page. Default 50. */
  perPage?: number;
  /**
   * How a card opens (ADR 0021): `side-peek`, `center-peek` or `page` (navigates to
   * `/{resource}/{id}` through `onNavigate`), or `none`. Default the view's `open`, else a side peek.
   */
  open?: RecordOpen | "none";
  /** The record view a peek draws. Default the view's `recordView`, else the view's columns. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  recordView?: RecordViewDef<ResourceContract<any>, any>;
  /** With `open="page"`: how to go to the record's page. Default a full-page navigation. */
  onNavigate?: NavigateFn;
}

export interface ResourceBoardProps<T extends Row = Row> extends ResourceBoardOptions<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
  view: View<ResourceContract<any>, T & DataRow>;
  /** Draw some card and peek fields the screen's own way, by key (ResourceView's `cells`). */
  cells?: Partial<Record<string, (row: T) => ReactNode>>;
  /** Server filters (the view's scope and the screen's), already as params. */
  filters?: readonly FilterParam[];
  /**
   * The screen's own guard (ResourceView's `can`): it only narrows the view's. A card moves only
   * when both allow `edit` for its row.
   */
  can?: (action: ResourceAction, item?: T) => boolean;
  /**
   * The list's write options (ResourceView's `resourceOptions`): `invalidates`, `onError` and
   * `onUpdateSuccess` apply to a move. A move is always pessimistic, so `mutationMode` is ignored.
   */
  resourceOptions?: Pick<UseResourceOptions<T & BaseRecord>, "invalidates" | "onError" | "onUpdateSuccess">;
  select?: string;
  /** False while the screen waits (on its scope, say): nothing is fetched. Default true. */
  enabled?: boolean;
  live?: boolean | LiveOptions;
  title?: string;
  subtitle?: string;
  className?: string;
  testID?: string;
}

const STATUS: Readonly<Record<ViewTone, ColumnStatus>> = {
  success: "success",
  warning: "warning",
  danger: "destructive",
  info: "info",
  muted: "neutral",
};

function withoutUndefined<O extends object>(o: O): Partial<O> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<O>;
}

/**
 * A view's rows as a board. Prefer `<ResourceView view={v} mode="board" />`, which passes the
 * scope and the screen's filters.
 *
 * @stability Beta
 */
export function ResourceBoard<T extends Row = Row>(props: ResourceBoardProps<T>) {
  const { view, filters = [], select, enabled = true, live, title, subtitle, className, cells, can, resourceOptions, testID = "resource-board" } = props;
  const { onSelect, renderCard, onMoveError, perPage } = props;
  const m = useUiMessages();
  const cell = useDisplayCell();
  const detailFields = useViewDetailFields(view, cells);
  const board = useViewBoard<T>(view, {
    ...withoutUndefined({ field: props.field, columns: props.columns, cardFields: props.cardFields, limits: props.limits }),
    filters,
    select,
    enabled,
    live,
    perPage,
    can,
    resourceOptions,
    onMoveError,
  });
  const { field: fieldName, block, keyOf, titleOf, movable, saving, conflict } = board;
  const cardFields = block.cardFields ?? [];
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openMode = resolveRecordOpen(view, props.open);
  const recordView = recordViewOf(view, props.recordView);
  const choose = (row: T) => {
    if (onSelect) return onSelect(row);
    if (openMode === "page") return (props.onNavigate ?? defaultNavigate)(`/${view.resource}/${keyOf(row)}`);
    if (openMode !== "none") setOpenKey(keyOf(row));
  };
  // Columns past either edge: a fade there says the board scrolls sideways. It's decoration: the
  // columns are regions a screen reader lists, and focusing a card or handle scrolls it into view.
  // Measured from the start edge, so it works right to left too (where scrollLeft runs negative).
  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ before: false, after: false });
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const measure = () => {
      const scrolled = Math.abs(el.scrollLeft);
      const before = scrolled > 1;
      const after = scrolled + el.clientWidth < el.scrollWidth - 1;
      setEdges((e) => (e.before === before && e.after === after ? e : { before, after }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    // The strip's own size, and the board inside it (columns load, cards arrive).
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, []);
  const columns: KanbanColumn<T>[] = board.columns.map((c) => ({
    key: c.value,
    label: c.label,
    items: c.items,
    ...(c.total !== undefined ? { total: c.total } : {}),
    ...(c.tone ? { status: STATUS[c.tone] } : {}),
    ...(c.limit !== undefined ? { limit: c.limit } : {}),
  }));

  const shownCard = (row: T) =>
    renderCard ? (
      renderCard(row)
    ) : (
      <button
        type="button"
        onClick={() => choose(row)}
        aria-busy={saving.has(keyOf(row)) || undefined}
        data-slot="board-card"
        data-saving={saving.has(keyOf(row)) ? "" : undefined}
        className={cn(
          "w-full rounded-lg border bg-card p-3 text-left text-sm shadow-sm hover:border-primary/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          movable && "pr-16",
          saving.has(keyOf(row)) && "opacity-60",
        )}
        data-testid={`${testID}-card`}
      >
        <span className="block truncate font-medium">{titleOf(row)}</span>
        {cardFields.map((name) => {
          const column = view.column(name);
          if (!column) return null;
          return (
            <span key={name} className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <span className="sr-only">{column.label}: </span>
              <span className="min-w-0 truncate">{cells?.[name] ? cells[name]!(row) : cell(column as never, row)}</span>
            </span>
          );
        })}
      </button>
    );

  const open = openKey === null ? null : (board.columns.flatMap((c) => c.items).find((row) => keyOf(row) === openKey) ?? null);
  const error = board.error;
  const refusal = board.refusal;

  return (
    <div data-slot="board" className={className} data-testid={testID} aria-busy={board.loading || undefined}>
      {title && <h2 className={cn("text-lg font-semibold", !subtitle && "mb-2")}>{title}</h2>}
      {subtitle && <p className="mb-2 text-sm text-muted-foreground">{subtitle}</p>}
      {board.ownFilterSetAside && <p className="mb-2 text-xs text-muted-foreground">{fillMessage(m.board.ownFilterSetAside, { field: view.label(fieldName) })}</p>}
      {error ? (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </p>
      ) : null}
      {refusal && (
        <p role="alert" className="mb-2 text-sm text-destructive" data-testid={`${testID}-refusal`}>
          {refusal}
        </p>
      )}
      <div className="relative">
      <div ref={strip} className="snap-x overflow-x-auto pb-2" data-testid={`${testID}-strip`}>
      <KanbanBoard<T>
        className="flex w-max gap-4 [&>section]:w-72 [&>section]:shrink-0 [&>section]:snap-start"
        columns={columns}
        getKey={keyOf}
        getItemLabel={titleOf}
        {...(movable ? { onMoveItem: board.move, canMoveItem: (row: T) => board.canMove(row) === true } : {})}
        emptyMessage={m.kanban.noItems}
        renderCard={shownCard}
        renderColumnFooter={(column) => {
          const data = board.columns.find((c) => c.value === column.key);
          if (!data?.hasMore) return null;
          const left = data.total !== undefined ? data.total - data.items.length : undefined;
          return (
            <Button type="button" variant="ghost" size="sm" onClick={() => board.loadMore(column.key)} testID={`${testID}-more-${column.key}`}>
              {left !== undefined ? fillMessage(m.board.loadMoreLeft, { count: left.toLocaleString() }) : m.board.loadMore}
            </Button>
          );
        }}
      />
      </div>
      {edges.before && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 start-0 w-10 bg-gradient-to-r from-[var(--board-edge,var(--color-background))] to-transparent rtl:bg-gradient-to-l" data-testid={`${testID}-fade-start`} />
      )}
      {edges.after && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 end-0 w-10 bg-gradient-to-l from-[var(--board-edge,var(--color-background))] to-transparent rtl:bg-gradient-to-r" data-testid={`${testID}-fade-end`} />
      )}
      </div>
      <ConflictSheet
        conflict={conflict?.conflict ?? null}
        noun={view.noun}
        label={(name) => view.label(name)}
        format={(name, value) => (name === fieldName ? (value == null ? m.board.noValue : view.valueLabel(fieldName, value)) : String(value ?? ""))}
        onKeepMine={board.keepMine}
        onTakeTheirs={board.takeTheirs}
        onDismiss={board.takeTheirs}
        testID={`${testID}-conflict`}
      />
      <ViewRecordPeek<T> view={view} recordView={recordView} open={openMode} row={open} onClose={() => setOpenKey(null)} fields={detailFields} />
    </div>
  );
}
