"use client";

// ResourceView's board mode (docs/RESOURCE-VIEW.md, "Board"): a view's rows as cards in a column per
// value of one field. Loaded by useBoardColumns and drawn by KanbanBoard, the same two pieces
// studio's board uses. A move is the resource's own update, through the provider's write path.

import { useRef, useState, type ReactNode } from "react";
import { useDataProvider, useResource, useViewer, type BaseRecord, type DataRow, type FilterParam, type ResourceContract, type UseResourceOptions } from "@marktiderman/genesis-core";
import { encodeRecordKey } from "@marktiderman/genesis-core/schema";
import { useLiveInvalidation, type LiveOptions } from "@marktiderman/genesis-core/hooks";
import { boardChoices, boardProblems, type ResourceView as View, type ViewBoard, type ViewTone } from "@marktiderman/genesis-core/resource-view";
import { Button } from "../../ui/button";
import { cn } from "../../../utils";
import { fillMessage, useUiMessages } from "../../../messages";
import { DetailPanel } from "../DetailPanel";
import { KanbanBoard, type ColumnStatus, type KanbanColumn } from "../KanbanBoard";
import { BOARD_NONE, useBoardColumns } from "../board/use-board-columns";
import { warnOnce } from "../calendar/guard";
import type { ResourceAction } from "../ResourcePage";
import { useDisplayCell } from "./display";
import { useViewDetailFields } from "./view-list";

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
  const where = `ResourceView(${view.resource})`;
  const own = view.definition.board;
  const screen = withoutUndefined({ field: props.field, columns: props.columns, cardFields: props.cardFields, limits: props.limits });
  // The screen's block over the view's. A bad override (a hand-edited URL, a renamed value) warns
  // and falls back to the view's own block, which defineView already checked.
  let block: Partial<ViewBoard> = { ...own, ...screen };
  let problems = block.field ? boardProblems(view.contract.fields, block) : [];
  if (problems.length && own && Object.keys(screen).length) {
    warnOnce(`${where}: board ${problems.join("; ")}; showing the view's board`);
    block = own;
    problems = [];
  }
  if (!block.field) throw new Error(`${where}: mode="board" needs a board field: the view's board.field, or board={{ field }}`);
  if (problems.length) throw new Error(`${where}: ${problems.join("; ")}`);
  const { field: fieldName, columns: columnValues, cardFields = [], limits } = block;
  const { onSelect, renderCard, onMoveError, perPage } = props;
  const m = useUiMessages();
  const provider = useDataProvider();
  const viewer = useViewer();
  const cell = useDisplayCell();
  const detailFields = useViewDetailFields(view, cells);
  const field = view.field(fieldName)!;
  const values = columnValues ?? [...boardChoices(field)!, ...(field.nullable ? [BOARD_NONE] : [])];
  // A column's value as the field stores it: a yes/no board's "true" is `true`.
  const stored = (value: string): unknown => (value === BOARD_NONE ? null : field.type === "boolean" ? value === "true" : value);
  const orderBy = view.definition.orderBy;
  const keyOf = (row: T) => String(encodeRecordKey(view.contract, row as DataRow));

  const board = useBoardColumns<T & BaseRecord>({
    provider,
    resource: view.resource,
    field: fieldName,
    values,
    filters,
    ...(orderBy ? { sorts: [{ field: orderBy.field, order: orderBy.direction ?? "asc" }] } : {}),
    ...(select !== undefined ? { select } : {}),
    ...(perPage !== undefined ? { perPage } : {}),
    enabled,
    toValue: stored,
    getKey: (row) => keyOf(row as unknown as T),
  });
  useLiveInvalidation(view.resource, live, enabled, { filters: [...filters] }, [view.resource]);
  // The resource's own update: core's write path, so the provider's rules (and a versioned
  // resource's version check) apply. Pessimistic: a card moves once the server has it.
  const { update } = useResource<T & BaseRecord>(view.resource, {
    enabled: false,
    ...(resourceOptions?.invalidates ? { invalidates: resourceOptions.invalidates } : {}),
    ...(resourceOptions?.onError ? { onError: resourceOptions.onError } : {}),
    ...(resourceOptions?.onUpdateSuccess ? { onUpdateSuccess: resourceOptions.onUpdateSuccess } : {}),
  });
  const [refusal, setRefusal] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Rows whose move is saving. A pessimistic move leaves the card in its old column until the
  // refetch, so a second move then would be sent from the wrong column (and, on a versioned
  // resource, refused as a conflict with the first): it is turned away until the first settles.
  // The ref is the truth, read and written synchronously, so two moves inside one render can't
  // both pass; the state mirrors it to dim the card. The handle stays while a move saves, so
  // keyboard focus isn't dropped if the move fails and the card stays put.
  const inFlight = useRef(new Set<string>());
  const [saving, setSaving] = useState<ReadonlySet<string>>(() => new Set());

  const titleOf = (row: T) => view.summary(row as T & DataRow).title;
  const movable = view.writable("edit").includes(fieldName);
  // Guards only narrow: the view's rule AND the screen's own `can`.
  const allowed = (row: T): true | string => {
    if (can && !can("edit", row)) return m.board.notAllowed;
    return view.can("update", row as T & DataRow, viewer);
  };
  const tones = view.definition.fields?.[fieldName as never]?.tones as Readonly<Record<string, ViewTone>> | undefined;

  const columns: KanbanColumn<T>[] = board.columns.map((c) => {
    const tone = c.value === BOARD_NONE ? undefined : tones?.[c.value];
    return {
      key: c.value,
      label: c.value === BOARD_NONE ? m.board.noValue : view.valueLabel(fieldName, c.value),
      items: c.items,
      ...(c.total !== undefined ? { total: c.total } : {}),
      ...(tone ? { status: STATUS[tone] } : {}),
      ...(limits?.[c.value] !== undefined ? { limit: limits[c.value] } : {}),
    };
  });

  const move = async (row: T, to: string) => {
    const key = keyOf(row);
    if (inFlight.current.has(key)) throw new Error(fillMessage(m.board.stillSaving, { name: titleOf(row) }));
    inFlight.current.add(key);
    setRefusal(null);
    const verdict = allowed(row);
    setSaving(new Set(inFlight.current));
    try {
      if (verdict !== true) throw new Error(verdict);
      await update(key, { [fieldName]: stored(to) } as Partial<T & BaseRecord>);
    } catch (error) {
      if (onMoveError) onMoveError(error, row);
      else setRefusal(error instanceof Error && error.message ? error.message : fillMessage(m.kanban.moveFailed, { name: titleOf(row) }));
      throw error;
    } finally {
      inFlight.current.delete(key);
      setSaving(new Set(inFlight.current));
    }
  };

  const shownCard = (row: T) =>
    renderCard ? (
      renderCard(row)
    ) : (
      <button
        type="button"
        onClick={() => (onSelect ? onSelect(row) : setOpenKey(keyOf(row)))}
        aria-busy={saving.has(keyOf(row)) || undefined}
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

  return (
    <div className={className} data-testid={testID} aria-busy={board.loading || undefined}>
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
      <KanbanBoard<T>
        className="flex snap-x gap-4 overflow-x-auto pb-2 [&>section]:w-72 [&>section]:shrink-0 [&>section]:snap-start"
        columns={columns}
        getKey={keyOf}
        getItemLabel={titleOf}
        {...(movable ? { onMoveItem: move, canMoveItem: (row: T) => allowed(row) === true } : {})}
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
      <DetailPanel<T>
        item={open}
        open={open !== null}
        onClose={() => setOpenKey(null)}
        title={open ? titleOf(open) : undefined}
        subtitle={open ? view.summary(open as T & DataRow).subtitle : undefined}
        fields={detailFields}
      />
    </div>
  );
}
