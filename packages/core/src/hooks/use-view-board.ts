// useViewBoard: a board's data and its moves, from a view (ADR 0019). The columns come from the
// view's board block (or `boardChoices` of its field), each paged on its own; a move writes the
// field through the resource's own update, with the view's guards, a refusal's reason and the
// conflict sheet's choices. The web's ResourceBoard, a custom view and the phone's board all draw
// what this returns; each brings its own words (`words`).

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDataProvider } from "../provider/context";
import type { BaseRecord, FilterParam } from "../provider/types";
import { resourceKeys } from "../query-keys";
import { encodeRecordKey } from "../schema/keys";
import type { DataRow, ResourceContract } from "../schema/types";
import { isDataWriteError, NO_ROWS_MATCHED } from "../schema/write-outcome";
import { writeConflict, type WriteConflict } from "../schema/write-state";
import { boardChoices, boardProblems } from "../resource-view/define-view";
import type { ResourceView as View, ViewBoard, ViewTone } from "../resource-view/types";
import { warnOnce } from "../resource-view/calendar";
import { BOARD_NONE, useBoardColumns } from "./use-board-columns";
import { useLiveInvalidation, type LiveOptions } from "./use-live";
import { useResource, type UseResourceOptions } from "./use-resource";
import { useViewer } from "./viewer-scope";

type Row = Record<string, unknown>;

/** @stability Beta */
export interface UseViewBoardOptions<T extends Row = Row> extends Partial<ViewBoard> {
  /** Server filters (the view's scope and the screen's), already as params. */
  filters?: readonly FilterParam[] | undefined;
  select?: string | undefined;
  /** False while the screen waits: nothing is fetched. Default true. */
  enabled?: boolean | undefined;
  live?: boolean | LiveOptions | undefined;
  /** Cards per column page. Default 50. */
  perPage?: number | undefined;
  /** The screen's own guard: it only narrows the view's. A card moves only when both allow `edit`. */
  can?: ((action: "create" | "edit" | "delete", item?: T) => boolean) | undefined;
  /** `invalidates`, `onError` and `onUpdateSuccess` apply to a move. A move is always pessimistic. */
  resourceOptions?: Pick<UseResourceOptions<T & BaseRecord>, "invalidates" | "onError" | "onUpdateSuccess"> | undefined;
  /** A move was refused. Without it, the reason is in `refusal` (and a conflict in `conflict`). */
  onMoveError?: ((error: unknown, row: T) => void) | undefined;
  /** The board's words, in the app's language. Default English. */
  words?: Partial<ViewBoardWords> | undefined;
  /** A conflict that came back after the board was gone (a route change mid-save): tell the person. Default nothing. */
  onLostConflict?: ((error: unknown) => void) | undefined;
}

/** What a board says, for each platform's message catalogue. @stability Beta */
export interface ViewBoardWords {
  /** The screen's `can` refuses the move. */
  notAllowed: string;
  /** The column for rows with no value. */
  noValue: string;
  /** A card whose last move is still saving. */
  stillSaving: (name: string) => string;
  /** The move matched no row (it changed or went away). */
  notChanged: (noun: string) => string;
  /** The move failed with no words of its own. */
  moveFailed: (name: string) => string;
}

const ENGLISH: ViewBoardWords = {
  notAllowed: "You can't move this card.",
  noValue: "No value",
  stillSaving: (name) => `${name} is still moving. Try again in a moment.`,
  notChanged: (noun) => `This ${noun} was not changed.`,
  moveFailed: (name) => `Couldn’t move ${name}.`,
};

/** One column: its value, its words, its tone and its cards so far. @stability Beta */
export interface ViewBoardColumn<T extends Row = Row> {
  /** A value of the board's field, or `BOARD_NONE` for rows with none. */
  value: string;
  label: string;
  /** The field's tone for this value (`fields.<field>.tones`). */
  tone?: ViewTone;
  items: T[];
  /** Cards in the column in all, once counted. */
  total?: number;
  hasMore: boolean;
  loading: boolean;
  /** The column's work-in-progress limit (`board.limits`). */
  limit?: number;
}

/** A move that met someone else's change, for ConflictSheet. @stability Beta */
export interface ViewBoardConflict {
  conflict: WriteConflict;
  id: string;
  data: Record<string, unknown>;
}

/** @stability Beta */
export interface ViewBoardState<T extends Row = Row> {
  /** The board block in use: the screen's over the view's. */
  block: ViewBoard;
  /** The board's field. */
  field: string;
  columns: ViewBoardColumn<T>[];
  loadMore: (value: string) => void;
  /** Some column is still on its first load. */
  loading: boolean;
  error: unknown;
  /** A filter on the board's own field was set aside (each column has its own). */
  ownFilterSetAside: boolean;
  /** The view can write the field on edit, so cards can move at all. */
  movable: boolean;
  /** Whether this card may move: `true`, or the reason. */
  canMove: (row: T) => true | string;
  /** Move a card to a column's value. Rejects when refused; the card stays where it was. */
  move: (row: T, to: string) => Promise<void>;
  /** Keys of cards whose move is saving. */
  saving: ReadonlySet<string>;
  /** Why the last move was refused, in words (when there's no `onMoveError`). */
  refusal: string | null;
  clearRefusal: () => void;
  /** A move that met someone else's change, until kept or dropped. */
  conflict: ViewBoardConflict | null;
  /** Keep my move, checked against their version. */
  keepMine: () => Promise<void>;
  /** Take theirs: the card goes where their row puts it. */
  takeTheirs: () => void;
  /** Refetch every column. */
  refresh: () => Promise<void>;
  keyOf: (row: T) => string;
  titleOf: (row: T) => string;
}

function withoutUndefined<O extends object>(o: O): Partial<O> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<O>;
}

/**
 * A view's rows as board columns, with moves:
 *
 * ```tsx
 * const board = useViewBoard(tasksView, { filters: useViewListParams({ view: tasksView }).filters });
 * board.columns.map((c) => <Lane key={c.value} title={c.label} cards={c.items} onDrop={(row) => board.move(row, c.value)} />);
 * ```
 *
 * Throws when the view has no board field and the options name none, or names one a board can't
 * use (a field without choices).
 *
 * @stability Beta
 */
export function useViewBoard<T extends Row = Row>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
  view: View<ResourceContract<any>, T & DataRow>,
  options: UseViewBoardOptions<T> = {},
): ViewBoardState<T> {
  const { filters = [], select, enabled = true, live, perPage, can, resourceOptions, onMoveError, onLostConflict } = options;
  const words: ViewBoardWords = { ...ENGLISH, ...options.words };
  const where = `ResourceView(${view.resource})`;
  const own = view.definition.board;
  const screen = withoutUndefined({ field: options.field, columns: options.columns, cardFields: options.cardFields, limits: options.limits });
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
  const { field: fieldName, columns: columnValues, limits } = block;
  const provider = useDataProvider();
  const viewer = useViewer();
  const field = view.field(fieldName)!;
  const values = columnValues ?? [...boardChoices(field)!, ...(field.nullable ? [BOARD_NONE] : [])];
  // A column's value as the field stores it: a yes/no board's "true" is `true`.
  const stored = (value: string): unknown => (value === BOARD_NONE ? null : field.type === "boolean" ? value === "true" : value);
  const orderBy = view.definition.orderBy;
  const keyOf = (row: T) => String(encodeRecordKey(view.contract, row as DataRow));
  const titleOf = (row: T) => view.summary(row as T & DataRow).title;

  const board = useBoardColumns<T & BaseRecord>({
    provider,
    resource: view.resource,
    field: fieldName,
    values,
    filters,
    ...(orderBy ? { sorts: [{ field: orderBy.field, order: orderBy.direction ?? "asc", ...(orderBy.nulls ? { nulls: orderBy.nulls } : {}) }] } : {}),
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
    // The board reports a failed move itself (the refusal, or `onMoveError`), so a failure isn't
    // logged as well; and a conflict is the sheet's, so it isn't the app's failure either.
    onError: (error) => {
      if (!onMoveError && writeConflict(error, {})) return;
      resourceOptions?.onError?.(error);
    },
    ...(resourceOptions?.onUpdateSuccess ? { onUpdateSuccess: resourceOptions.onUpdateSuccess } : {}),
  });
  const [refusal, setRefusal] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState<ViewBoardConflict | null>(null);
  // A conflict that settles after the board is gone has no sheet to open: it's toasted instead.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [...resourceKeys(view.resource).all] }),
      ...(resourceOptions?.invalidates ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey] })),
    ]);
  };
  // Rows whose move is saving. A pessimistic move leaves the card in its old column until the
  // refetch, so a second move then would be sent from the wrong column (and, on a versioned
  // resource, refused as a conflict with the first): it is turned away until the first settles.
  // The ref is the truth, read and written synchronously, so two moves inside one render can't
  // both pass; the state mirrors it to dim the card.
  const inFlight = useRef(new Set<string>());
  const [saving, setSaving] = useState<ReadonlySet<string>>(() => new Set());

  const movable = view.writable("edit").includes(fieldName);
  // Guards only narrow: the view's rule AND the screen's own `can`.
  const canMove = (row: T): true | string => {
    if (can && !can("edit", row)) return words.notAllowed;
    return view.can("update", row as T & DataRow, viewer);
  };
  const tones = view.definition.fields?.[fieldName as never]?.tones as Readonly<Record<string, ViewTone>> | undefined;

  const columns: ViewBoardColumn<T>[] = board.columns.map((c) => {
    const tone = c.value === BOARD_NONE ? undefined : tones?.[c.value];
    return {
      value: c.value,
      label: c.value === BOARD_NONE ? words.noValue : view.valueLabel(fieldName, c.value),
      ...(tone ? { tone } : {}),
      items: c.items as T[],
      ...(c.total !== undefined ? { total: c.total } : {}),
      hasMore: c.hasMore,
      loading: c.loading,
      ...(limits?.[c.value] !== undefined ? { limit: limits[c.value] } : {}),
    };
  });

  const move = async (row: T, to: string) => {
    const key = keyOf(row);
    if (inFlight.current.has(key)) throw new Error(words.stillSaving(titleOf(row)));
    inFlight.current.add(key);
    setRefusal(null);
    const verdict = canMove(row);
    setSaving(new Set(inFlight.current));
    const data = { [fieldName]: stored(to) };
    try {
      if (verdict !== true) throw new Error(verdict);
      await update(key, data as Partial<T & BaseRecord>);
    } catch (error) {
      const found = onMoveError ? null : writeConflict(error, data, { changed: [fieldName] });
      if (onMoveError) onMoveError(error, row);
      else if (found) {
        // Gone before the conflict came back (a route change mid-save): say so rather than drop it.
        if (mounted.current) setConflict({ conflict: found, id: key, data });
        else onLostConflict?.(error);
      } else if (isDataWriteError(error) && error.code === NO_ROWS_MATCHED) setRefusal(words.notChanged(view.noun));
      else setRefusal(error instanceof Error && error.message ? error.message : words.moveFailed(titleOf(row)));
      throw error;
    } finally {
      inFlight.current.delete(key);
      setSaving(new Set(inFlight.current));
    }
  };

  // Keep mine: the same move again, checked against the version their change left, through the
  // resource's own write path, so it's queued behind any other write of the row. A new conflict
  // replaces this one, any other failure rejects, and success clears it.
  const keepMine = async () => {
    if (!conflict) return;
    const { id, data, conflict: c } = conflict;
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setSaving(new Set(inFlight.current));
    try {
      await update(id, data as Partial<T & BaseRecord>, c.currentVersion != null ? { expectedVersion: c.currentVersion } : undefined);
      setConflict(null);
    } catch (error) {
      const again = writeConflict(error, data, { changed: [fieldName] });
      if (!again) throw error;
      setConflict({ conflict: again, id, data });
      void refresh();
    } finally {
      inFlight.current.delete(id);
      setSaving(new Set(inFlight.current));
    }
  };
  const takeTheirs = () => {
    setConflict(null);
    void refresh();
  };

  return {
    block: block as ViewBoard,
    field: fieldName,
    columns,
    loadMore: board.loadMore,
    loading: board.loading,
    error: board.error,
    ownFilterSetAside: board.ownFilterSetAside,
    movable,
    canMove,
    move,
    saving,
    refusal,
    clearRefusal: () => setRefusal(null),
    conflict,
    keepMine,
    takeTheirs,
    refresh,
    keyOf,
    titleOf,
  };
}
