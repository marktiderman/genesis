"use client";

// CustomView (ADR 0019): a screen an app draws itself over a view, while Genesis keeps the view's
// states, data, URL, live updates and permissions. The app passes a function that draws the rows;
// loading, empty and error are drawn here (each replaceable through a slot), so every custom view
// says "loading", "nothing yet" and "that failed" the same way, in the app's style.

import { useRef, type ReactNode } from "react";
import type { DataRow, ResourceContract, SortParam } from "@marktiderman/genesis-core";
import { dayIn, deviceTimeZone } from "@marktiderman/genesis-core/dates";
import { groupRows, type GroupRowsOptions, type ResourceView as View, type RowGroup } from "@marktiderman/genesis-core/resource-view";
import { fillMessage, useUiMessages } from "../../../messages";
import type { SearchParamsAdapter } from "../../../navigation";
import type { ResourceUrlStateOptions } from "../../../hooks/use-resource-url-state";
import { useReducedMotion } from "../../../hooks/use-reduced-motion";
import { EmptyState } from "../../patterns/empty-state";
import { Alert, AlertDescription } from "../../ui/alert";
import { Button } from "../../ui/button";
import { Skeleton } from "../../ui/skeleton";
import { calendarWindow } from "../calendar/placement";
import { useViewListParams, type ViewListOptions, type ViewListParams } from "./view-list";
import { useViewList, useViewPermissions, type ViewListState, type ViewPermissions, type ViewScreenCan } from "./use-view-list";
import { useViewBoard, type UseViewBoardOptions, type ViewBoardState } from "./use-view-board";
import { useViewCalendarRange, type UseViewCalendarRangeOptions, type ViewCalendarRange, type ViewCalendarRangeState } from "./use-view-calendar-range";

type Row = Record<string, unknown>;

/**
 * Which data a custom view draws: a page of rows (`list`), board columns (`board`) or one
 * calendar window (`calendar`).
 *
 * @stability Beta
 */
export type CustomViewType = "list" | "board" | "calendar";

/** Where a custom view is: the states Genesis draws, then `ready` for the app's own. @stability Beta */
export type CustomViewStatus = "loading" | "error" | "empty" | "ready";

/** @stability Beta */
export interface UseCustomViewOptions<T extends Row = Row> extends Omit<ViewListOptions, "view"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
  view: View<ResourceContract<any>, T & DataRow>;
  /** Default `list`. Fixed for the component's life: give the component a `key` per type to switch. */
  type?: CustomViewType;
  /** The screen's own rule; it only narrows the view's guards. */
  can?: ViewScreenCan<T> | undefined;
  /** `list`: rows per page. */
  perPage?: number;
  /** `list`: the first sort (default the view's `orderBy`). */
  sort?: SortParam | null;
  /** `list`: the first search. */
  search?: string;
  /** `list`: keep page, sort, search and the open record in the URL (ResourcePage's `urlState`). */
  urlState?: SearchParamsAdapter | ResourceUrlStateOptions | undefined;
  /** `board`: the board block over the view's, and its write options. */
  board?: Omit<UseViewBoardOptions<T>, "filters" | "select" | "enabled" | "live"> | undefined;
  /** `calendar`: the days to load. Default this month's grid on the viewer's clock. */
  range?: ViewCalendarRange | undefined;
  /** `calendar`: the calendar block's fields, limit and clock over the view's. */
  calendar?: Omit<UseViewCalendarRangeOptions, "filters" | "select" | "enabled" | "live"> | undefined;
}

interface CustomViewStateBase<T extends Row> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  view: View<ResourceContract<any>, T & DataRow>;
  status: CustomViewStatus;
  error: unknown;
  retry: () => void;
  /** The rows loaded now (every column's for a board). */
  rows: T[];
  /** The rows under headers: the view's `groupBy`, or `options.field`. */
  groups: (rows?: readonly T[], options?: GroupRowsOptions) => RowGroup<T & DataRow>[];
  /** The view's guards for this viewer, narrowed by the screen's `can`. */
  can: ViewPermissions<T>;
  /** The scope, filters, select and live the data was asked with. */
  params: ViewListParams;
  /** The person asked for less motion: skip or shorten animations. */
  reducedMotion: boolean;
}

/**
 * What a custom view draws from: the status, the rows, and the data of its type.
 *
 * @stability Beta
 */
export type CustomViewState<T extends Row = Row> =
  | (CustomViewStateBase<T> & { type: "list"; list: ViewListState<T> })
  | (CustomViewStateBase<T> & { type: "board"; board: ViewBoardState<T> })
  | (CustomViewStateBase<T> & { type: "calendar"; calendar: ViewCalendarRangeState<T>; range: ViewCalendarRange });

/**
 * A custom view's data and states, headless (ADR 0019). `<CustomView>` calls it and draws the
 * states; call it yourself only to draw them yourself too, and the doctor's
 * `custom-view-states` rule will ask why.
 *
 * @stability Beta
 */
export function useCustomView<T extends Row = Row>(options: UseCustomViewOptions<T>): CustomViewState<T> {
  const { view, type = "list", can, perPage, sort, search, urlState, board: boardOptions, range: rangeProp, calendar: calendarOptions, ...listOptions } = options;
  // The hooks below depend on the type, so it can't change under them.
  const first = useRef(type);
  if (first.current !== type) throw new Error(`useCustomView(${view.resource}): type changed from "${first.current}" to "${type}"; give the component a key per type`);
  const params = useViewListParams({ view, ...listOptions });
  const permissions = useViewPermissions(view, can);
  const reducedMotion = useReducedMotion();
  const groups = (rows: readonly T[] | undefined, all: readonly T[], o?: GroupRowsOptions) => groupRows(view, (rows ?? all) as readonly (T & DataRow)[], o);
  const base = { view, can: permissions, params, reducedMotion };
  const live = { filters: params.filters, select: params.select, enabled: params.enabled, live: params.live };

  if (type === "board") {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- the type is fixed for the component's life (checked above)
    const board = useViewBoard<T>(view, { ...boardOptions, ...live });
    const rows = board.columns.flatMap((c) => c.items);
    const status: CustomViewStatus = board.error ? "error" : board.loading && rows.length === 0 ? "loading" : rows.length === 0 ? "empty" : "ready";
    return { ...base, type, board, rows, status, error: board.error, retry: () => void board.refresh(), groups: (r, o) => groups(r, rows, o) };
  }
  if (type === "calendar") {
    const zone = calendarOptions?.timeZone;
    const range = rangeProp ?? calendarWindow("month", dayIn(zone ?? deviceTimeZone()), { weekStartsOn: view.definition.calendar?.weekStartsOn ?? 1 });
    // eslint-disable-next-line react-hooks/rules-of-hooks -- the type is fixed for the component's life (checked above)
    const calendar = useViewCalendarRange<T>(view, range, { ...calendarOptions, ...live });
    const rows = calendar.rows;
    const status: CustomViewStatus = calendar.error ? "error" : calendar.loading && rows.length === 0 ? "loading" : rows.length === 0 ? "empty" : "ready";
    return { ...base, type, calendar, range, rows, status, error: calendar.error, retry: calendar.refetch, groups: (r, o) => groups(r, rows, o) };
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- the type is fixed for the component's life (checked above)
  const list = useViewList<T>(view, {
    ...listOptions,
    ...(perPage !== undefined ? { perPage } : {}),
    ...(sort !== undefined ? { sort } : {}),
    ...(search !== undefined ? { search } : {}),
    urlState,
    can,
  });
  const status: CustomViewStatus = list.error ? "error" : list.loading ? "loading" : list.empty ? "empty" : "ready";
  return { ...base, type: "list", list, rows: list.rows, status, error: list.error, retry: list.refetch, groups: (r, o) => groups(r, list.rows, o) };
}

/** @stability Beta */
export interface CustomViewProps<T extends Row = Row> extends UseCustomViewOptions<T> {
  /** Draws the view once there's something to show. Genesis draws loading, empty and error. */
  children: (state: CustomViewState<T>) => ReactNode;
  /** Replaces the loading state. */
  loading?: ReactNode;
  /**
   * Replaces the empty state. `false` hands an empty view to `children` too (a calendar that
   * still draws its days).
   */
  empty?: ReactNode | false;
  /** Replaces the error state; a function gets the error and a retry. */
  error?: ReactNode | ((error: unknown, retry: () => void) => ReactNode);
  className?: string;
  testID?: string;
}

/**
 * A screen an app draws itself over a view (ADR 0019): Genesis loads the view's data with its
 * scope, filters, URL state, live updates and permissions, and draws loading, empty and error;
 * the app draws the rest.
 *
 * ```tsx
 * <CustomView view={playersView} sort={{ field: "points", order: "desc" }} perPage={10} live>
 *   {({ rows, reducedMotion }) => <Leaderboard players={rows} animate={!reducedMotion} />}
 * </CustomView>
 * ```
 *
 * Parts: `custom-view` (with `data-view-type` and `data-state`), `custom-view-loading`,
 * `custom-view-empty` and `custom-view-error`. An app's own parts inside are named `app-…`.
 *
 * @stability Beta
 */
export function CustomView<T extends Row = Row>(props: CustomViewProps<T>) {
  // A new type is a new component, so its hooks start fresh.
  return <CustomViewBody<T> key={props.type ?? "list"} {...props} />;
}

function CustomViewBody<T extends Row>({ children, loading, empty, error, className, testID = "custom-view", ...options }: CustomViewProps<T>) {
  const state = useCustomView<T>(options);
  const m = useUiMessages();
  const copy = options.view.definition.copy?.empty;
  const fetching = state.type === "list" ? state.list.fetching : false;
  const showChildren = state.status === "ready" || (state.status === "empty" && empty === false);
  return (
    <div
      data-slot="custom-view"
      data-view-type={state.type}
      data-state={state.status}
      aria-busy={state.status === "loading" || fetching || undefined}
      className={className}
      data-testid={testID}
    >
      {showChildren ? (
        children(state)
      ) : state.status === "loading" ? (
        (loading ?? (
          <div data-slot="custom-view-loading" role="status" className="space-y-2" data-testid={`${testID}-loading`}>
            <span className="sr-only">{m.common.loading}</span>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ))
      ) : state.status === "error" ? (
        typeof error === "function" ? (
          error(state.error, state.retry)
        ) : (
          (error ?? (
            <Alert variant="destructive" data-slot="custom-view-error" data-testid={`${testID}-error`}>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{state.error instanceof Error && state.error.message ? state.error.message : fillMessage(m.page.errorBody, { entity: options.view.noun })}</span>
                <Button type="button" size="sm" variant="outline" onClick={state.retry} testID={`${testID}-retry`}>
                  {m.page.retry}
                </Button>
              </AlertDescription>
            </Alert>
          ))
        )
      ) : (
        (empty ?? (
          <div data-slot="custom-view-empty" data-testid={`${testID}-empty`}>
            <EmptyState title={copy?.title ?? m.page.noRecords} {...(copy?.body ? { description: copy.body } : {})} />
          </div>
        ))
      )}
    </div>
  );
}
