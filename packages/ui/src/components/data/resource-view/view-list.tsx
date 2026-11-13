// What a list over a view asks for and shows in its peek, built once for the list path
// (useResourceViewProps) and the calendar path (ResourceCalendar) so they can't drift.

import { useMemo, type ReactNode } from "react";
import { useViewer, type DataRow, type FilterParam, type ResourceContract } from "@marktiderman/genesis-core";
import type { LiveOptions } from "@marktiderman/genesis-core/hooks";
import { scopeFilter, type ResourceView as View } from "@marktiderman/genesis-core/resource-view";
import { useDisplayCell } from "./display";

type Row = Record<string, unknown>;
type Scalar = string | number | boolean | null;
export type Filter = Readonly<Record<string, Scalar | readonly (string | number)[]>>;

/** The screen options these read: a subset of ResourceViewProps. @stability Beta */
export interface ViewListOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
  view: View<ResourceContract<any>, any>;
  preset?: string | undefined;
  filter?: Filter | undefined;
  scoped?: boolean | undefined;
  resourceOptions?: { defaultFilters?: FilterParam[] | undefined; select?: string | undefined; enabled?: boolean | undefined; live?: boolean | LiveOptions | undefined } | undefined;
  live?: boolean | LiveOptions | undefined;
}

export function filterParams(filter: Filter | undefined): FilterParam[] {
  return Object.entries(filter ?? {}).map(([field, value]): FilterParam =>
    value === null
      ? { field, operator: "is_null" }
      : Array.isArray(value)
        ? { field, operator: "in", value: [...(value as readonly (string | number)[])] }
        : { field, operator: "eq", value: value as string | number | boolean },
  );
}

/** What a list over a view asks the provider for: shared by every view type so they can't drift. @stability Beta */
export interface ViewListParams {
  /** The scope and the screen's filter, as values (what a new row starts with). */
  filter: Filter | undefined;
  /** The preset's filter, then the scope and the screen's, then `resourceOptions.defaultFilters`. */
  filters: FilterParam[];
  select: string | undefined;
  /** False while the screen waits (on its scope, say): nothing is fetched. */
  enabled: boolean;
  live: boolean | LiveOptions | undefined;
}

/**
 * The filters, select, enabled and live a screen's options make for a view's list: the viewer's
 * scope, the preset's filter and the screen's own, as provider params. Every view type (the
 * table's `useResourceViewProps`, the board, the calendar) and every custom view (`useViewList`,
 * `useViewBoard`, `useViewCalendarRange`, `<CustomView>`) starts from it, so they ask the same.
 *
 * @stability Beta
 */
export function useViewListParams(props: ViewListOptions): ViewListParams & { tab: ReturnType<typeof presetOf> } {
  const { view, preset, filter: screenFilter, scoped = true, resourceOptions, live } = props;
  const viewer = useViewer();
  // The viewer's scope first (the workspace they're in), then the screen's own filter over it.
  const filter: Filter | undefined = scoped ? { ...scopeFilter(view, viewer.scope), ...screenFilter } : screenFilter;
  const tab = presetOf(view, preset);
  // By value, so an inline `filter={{ client_id }}` doesn't make a new list every render.
  const filterKey = JSON.stringify(filter ?? {});
  const filters = useMemo(
    () => [...filterParams(tab?.filter as Filter | undefined), ...filterParams(JSON.parse(filterKey) as Filter), ...(resourceOptions?.defaultFilters ?? [])],
    [tab, filterKey, resourceOptions?.defaultFilters],
  );
  return {
    filter,
    filters,
    tab,
    select: resourceOptions?.select,
    enabled: resourceOptions?.enabled ?? true,
    // As ResourcePage reads them: `resourceOptions.live` wins over the `live` shorthand.
    live: resourceOptions?.live ?? live,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
function presetOf(view: View<ResourceContract<any>, any>, preset: string | undefined) {
  const tab = preset ? view.definition.presets?.[preset] : undefined;
  if (preset && !tab) throw new Error(`ResourceView(${view.resource}): no preset "${preset}"`);
  return tab;
}

/**
 * The peek's fields: the view's full column list, drawn like the cells (so `when` hides there
 * too, and the screen's `cells` apply), never every key of the row. Shared by the list and the calendar.
 */
export function useViewDetailFields<T extends Row>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract
  view: View<ResourceContract<any>, T & DataRow>,
  cells: Partial<Record<string, (row: T) => ReactNode>> | undefined,
) {
  const cell = useDisplayCell();
  return useMemo(
    () =>
      view.columns().map((c) => ({
        key: c.key,
        label: c.label,
        render: (_value: unknown, row: T) => (cells?.[c.key] ? cells[c.key]!(row) : cell(c as never, row)),
      })),
    [view, cell, cells],
  );
}

