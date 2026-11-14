"use client";

// What a view declares for its lists, drawn on the web (ADR 0017): segments with counts, declared
// filters, the view-type switcher, saved views, row and bulk actions with their reasons, and CSV
// export. ResourceView composes these onto ResourcePage's own slots and props, so the engine stays
// ResourcePage and DataTable; nothing here is a second list.

import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Filter, Images, Inbox, Kanban, LayoutGrid, List, Sheet, Table2, X, type LucideIcon } from "lucide-react";
import {
  encodeRecordKey,
  resourceKeys,
  useDataProvider,
  useViewer,
  type DataRow,
  type FieldSchema,
  type FilterParam,
  type ResourceContract,
} from "@marktiderman/genesis-core";
import { exportCsv } from "@marktiderman/genesis-core/csv";
import { useSegmentCounts, type ListStateResult } from "@marktiderman/genesis-core/hooks";
import {
  createLocalSavedViewStore,
  type ResolvedFilter,
  type ResolvedViewAction,
  type ResourceView as View,
  type SavedViewStore,
  type ViewFilterValue,
  type ListState,
} from "@marktiderman/genesis-core/resource-view";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { toast } from "../../ui/sonner";
import { cn } from "../../../utils";
import { fillMessage, useUiMessages } from "../../../messages";
import type { SearchParamsAdapter } from "../../../navigation";
import type { ResourceUrlStateOptions } from "../../../hooks/use-resource-url-state";
import type { DataFilterConfig } from "../DataFilters";
import type { ResourceRowMenuItem } from "../RowMenu";
import type { ResourceBulkContext, ResourceListQuery, ResourceRowMenuBuiltIn } from "../ResourcePage";
import { listViewTypes, resolveViewType } from "./view-types";

type Row = Record<string, unknown>;
// Any contract and any row, so a typed view (rows of its own shape) passes in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyView<T extends Row = any> = View<ResourceContract<any>, T & DataRow>;

/** The device store, for a list's current state when the app gives no store of its own. */
let deviceStore: SavedViewStore | undefined;
export function defaultSavedViewStore(): SavedViewStore {
  deviceStore ??= createLocalSavedViewStore();
  return deviceStore;
}


/** A router adapter from ResourcePage's `urlState` shapes. */
export function adapterOf(urlState: SearchParamsAdapter | ResourceUrlStateOptions | false | null | undefined): SearchParamsAdapter | undefined {
  if (!urlState) return undefined;
  return "setSearchParams" in urlState ? urlState : urlState.searchParams;
}

// ─────────────────────────────────────────────────────────────────────────────
// The list's state: segment, declared filters, view type, grouping
// ─────────────────────────────────────────────────────────────────────────────

/** A list's state: core's `useListState` (one for the web and the phone). */
export type ViewListStateResult = ListStateResult;

// ─────────────────────────────────────────────────────────────────────────────
// Segments with counts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The view's segments as one segmented strip, each with its count when it asks for one.
 *
 * @stability Beta
 */
export function ViewSegments({
  view,
  value,
  onChange,
  baseFilters,
  enabled = true,
}: {
  view: AnyView;
  value: string | undefined;
  onChange: (id: string) => void;
  /** The list's other filters (scope, the screen's, the declared filters), which counts include. */
  baseFilters: FilterParam[];
  enabled?: boolean;
}) {
  const m = useUiMessages();
  const segments = view.segments();
  const counts = useSegmentCounts(view, baseFilters, { enabled });
  if (!segments.length) return null;
  return (
    <div data-slot="view-segments" className="flex w-fit max-w-full items-center overflow-x-auto rounded-lg border" role="group" aria-label={m.filters.segments}>
      {segments.map((s) => {
        const pressed = s.id === value;
        return (
          <Button
            key={s.id}
            type="button"
            variant={pressed ? "default" : "ghost"}
            size="sm"
            className="h-8 gap-1.5 rounded-none"
            aria-pressed={pressed}
            onClick={() => onChange(s.id)}
            testID={`view-segment-${s.id}`}
          >
            {s.label}
            {counts[s.id] !== undefined ? <span className="text-[10px] tabular-nums opacity-70">{counts[s.id]!.toLocaleString()}</span> : null}
          </Button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Declared filters: choices as the filter row's comboboxes, ranges and text as popovers
// ─────────────────────────────────────────────────────────────────────────────

/** A view's choice filters as DataFilters' comboboxes (`DataFilterConfig`). */
export function choiceFilterConfigs(view: AnyView, state: Pick<ViewListStateResult, "values" | "setValue">): DataFilterConfig[] {
  return view
    .filters()
    .filter((f) => f.kind === "choice")
    .map((f) => {
      const value = state.values[f.field];
      return {
        key: f.field,
        label: f.label,
        icon: Filter,
        options: f.options.map((o) => ({ value: o.value, label: o.label })),
        selected: Array.isArray(value) ? [...value] : [],
        onChange: (selected: string[]) => state.setValue(f.field, selected),
        labelMap: Object.fromEntries(f.options.map((o) => [o.value, o.label])),
      };
    });
}

function RangeFilter({ filter, value, onChange }: { filter: ResolvedFilter; value: ViewFilterValue | undefined; onChange: (v: ViewFilterValue | undefined) => void }) {
  const m = useUiMessages();
  const range = value && typeof value === "object" && !Array.isArray(value) ? (value as { gte?: string; lte?: string }) : {};
  const set = Boolean(range.gte || range.lte);
  const input = filter.input === "number" ? "number" : filter.input === "date" ? "date" : "datetime-local";
  const summary = set ? `${range.gte ?? "…"} – ${range.lte ?? "…"}` : null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={set ? "secondary" : "outline"} size="sm" className="h-7 gap-1.5 text-xs" data-testid={`view-filter-${filter.field}`}>
          <Filter className="h-3 w-3" aria-hidden="true" />
          {filter.label}
          {summary ? <span className="tabular-nums text-muted-foreground">{summary}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2 p-3">
        {(["gte", "lte"] as const).map((end) => (
          <label key={end} className="flex items-center gap-2 text-xs">
            <span className="w-10 text-muted-foreground">{end === "gte" ? m.filters.from : m.filters.to}</span>
            <Input
              type={input}
              className="h-8 text-xs"
              value={range[end] ?? ""}
              onChange={(e) => {
                const next = { ...range, [end]: e.target.value || undefined };
                onChange(next.gte || next.lte ? (next as ViewFilterValue) : undefined);
              }}
            />
          </label>
        ))}
        {set ? (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange(undefined)}>
            {m.common.clear}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function TextFilter({ filter, value, onChange }: { filter: ResolvedFilter; value: ViewFilterValue | undefined; onChange: (v: ViewFilterValue | undefined) => void }) {
  const text = typeof value === "string" ? value : "";
  return (
    <span className="relative inline-flex items-center">
      <Input
        aria-label={filter.label}
        placeholder={filter.label}
        className="h-7 w-40 pr-7 text-xs"
        value={text}
        onChange={(e) => onChange(e.target.value || undefined)}
        data-testid={`view-filter-${filter.field}`}
      />
      {text ? (
        <button type="button" aria-label={filter.label} className="absolute right-1 inline-flex size-5 items-center justify-center" onClick={() => onChange(undefined)}>
          <X className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        </button>
      ) : null}
    </span>
  );
}

/**
 * A view's range and text filters, for the filter row beside its choice filters.
 *
 * @stability Beta
 */
export function ViewFilterControls({ view, state }: { view: AnyView; state: Pick<ViewListStateResult, "values" | "setValue"> }) {
  const shown = view.filters().filter((f) => f.kind !== "choice");
  if (!shown.length) return null;
  return (
    <>
      {shown.map((f) =>
        f.kind === "range" ? (
          <RangeFilter key={f.field} filter={f} value={state.values[f.field]} onChange={(v) => state.setValue(f.field, v)} />
        ) : (
          <TextFilter key={f.field} filter={f} value={state.values[f.field]} onChange={(v) => state.setValue(f.field, v)} />
        ),
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The view-type switcher
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_ICONS: Readonly<Partial<Record<string, LucideIcon>>> = {
  table: Table2,
  list: List,
  grid: LayoutGrid,
  gallery: Images,
  board: Kanban,
  calendar: CalendarDays,
  inbox: Inbox,
  sheet: Sheet,
};

/**
 * The view types a person may switch between (ADR 0017): Genesis's and registered ones, limited
 * to the ones the view supports. Each button is named by the type's label.
 *
 * @stability Beta
 */
export function ViewTypeSwitcher({ types, value, onChange }: { types: readonly string[]; value: string | undefined; onChange: (type: string) => void }) {
  const m = useUiMessages();
  const known = types.filter((t) => resolveViewType(t));
  if (known.length < 2) return null;
  return (
    <div data-slot="view-type-switcher" className="flex items-center overflow-hidden rounded-lg border" role="group" aria-label={m.view.type}>
      {known.map((t) => {
        const type = resolveViewType(t)!;
        const Icon = TYPE_ICONS[t];
        const pressed = t === value;
        return (
          <Button
            key={t}
            variant={pressed ? "default" : "ghost"}
            size={Icon ? "icon" : "sm"}
            className={cn("h-8 rounded-none", Icon && "w-8")}
            onClick={() => onChange(t)}
            title={type.label}
            aria-label={type.label}
            aria-pressed={pressed}
            testID={`view-type-${t}`}
          >
            {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : type.label}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * Rows a screen holds are drawn by the list page only (table, list, grid, gallery). A type that
 * reads its own rows (board, calendar, inbox, sheet, an app's type) says so rather than show rows
 * other than the screen's, whether ResourceView dispatches to it or the screen renders it directly.
 */
export function refuseHeldRows(resource: string, type: string, rows: unknown): void {
  if (rows === undefined) return;
  throw new Error(`ResourceView(${resource}): rows are drawn by the table, list, grid and gallery only; type "${type}" reads its own rows. Leave rows out, or pick one of those types.`);
}

/** The types the view supports that are registered here, in the view's order. */
export function switchableTypes(view: AnyView, screenTypes: readonly string[] | undefined): readonly string[] {
  const registered = new Set(listViewTypes().map((t) => t.id));
  return (screenTypes ?? view.types()).filter((t) => registered.has(t));
}

// ─────────────────────────────────────────────────────────────────────────────
// Row and bulk actions
// ─────────────────────────────────────────────────────────────────────────────

/** A refusal's words, or undefined when allowed. */
export const reasonOf = (allowed: true | string) => (allowed === true ? undefined : allowed);

/** The actions a provider serves for the resource: all of them when it doesn't say. */
export function useServedActions(view: AnyView): { runnable: boolean; served: ReadonlySet<string> | null } {
  const provider = useDataProvider();
  const described = useQuery({
    queryKey: ["__describe", view.resource],
    queryFn: () => provider.describe!(view.resource),
    enabled: !!provider.describe && view.actions().length > 0,
    staleTime: Infinity,
  });
  const served = described.data?.actions ? new Set(described.data.actions.map((a) => a.name)) : null;
  return { runnable: !!provider.runAction, served };
}

interface Confirming {
  title: string;
  label: string;
  destructive: boolean;
  run: () => Promise<void> | void;
}

export interface ListActionsResult<T extends Row> {
  rowMenu: (row: T, builtIn: ResourceRowMenuBuiltIn) => ResourceRowMenuItem[];
  bulkActions: Array<{
    label: string;
    variant?: "default" | "destructive";
    matching?: boolean;
    reason?: (rows: T[]) => string | undefined;
    onAction: (ids: string[], context: ResourceBulkContext<T>) => void | Promise<void>;
    testId?: string;
  }>;
  confirming: Confirming | null;
  setConfirming: (c: Confirming | null) => void;
  /**
   * Run one of the view's actions on a row as its row menu does: only when it's offered and the
   * row allows it, after its confirm, and not again while it's running. False when it wasn't run.
   */
  run: (name: string, row: T) => boolean;
}

/**
 * The view's actions for a list: a row menu (edit, the actions, delete; refusals with their
 * reasons) and the bulk bar's actions, each run through the provider (or the action's own `run`).
 */
export function useListActions<T extends Row>(
  view: AnyView<T>,
  options: { refusals: "disable" | "hide"; onRun?: ((name: string, row: T) => void | Promise<void>) | undefined },
): ListActionsResult<T> {
  const m = useUiMessages();
  const viewer = useViewer();
  const provider = useDataProvider();
  const queryClient = useQueryClient();
  const { runnable, served } = useServedActions(view as AnyView);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const hide = options.refusals === "hide";

  // An action is offered when something runs it: the screen's `onRun` (the app's executor, which
  // the provider's description doesn't speak for), else the provider, when it runs actions and
  // serves this one. A bulk action with its own `run` needs neither (below).
  const providerRuns = useCallback((name: string) => runnable && (!served || served.has(name)), [runnable, served]);
  const visible = useMemo(() => view.actions().filter((a) => !!options.onRun || providerRuns(a.name)), [view, options.onRun, providerRuns]);
  const bulkable = useMemo(
    () =>
      view.actions().filter((a) => {
        if (!a.bulk) return false;
        const declared = view.definition.actions?.find((d) => d.name === a.name);
        const ownRun = !!declared && typeof declared.bulk === "object" && typeof declared.bulk.run === "function";
        return ownRun || !!options.onRun || providerRuns(a.name);
      }),
    [view, options.onRun, providerRuns],
  );
  // What's running: a second click (or key) while it is would submit it twice.
  const running = useRef(new Set<string>());
  const once = useCallback((key: string, run: () => Promise<void> | void) => async () => {
    if (running.current.has(key)) return;
    running.current.add(key);
    try {
      await run();
    } finally {
      running.current.delete(key);
    }
  }, []);
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: resourceKeys(view.resource).all }), [queryClient, view.resource]);
  const idOf = useCallback((row: T) => encodeRecordKey(view.contract, row as T & DataRow), [view]);

  const runRow = useCallback(
    async (action: ResolvedViewAction, row: T) => {
      try {
        if (options.onRun) await options.onRun(action.name, row);
        else await provider.runAction!(view.resource, { id: idOf(row), action: action.name });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        await refresh();
      }
    },
    [options, provider, view.resource, idOf, refresh],
  );

  const start = useCallback(
    (title: string | undefined, label: string, destructive: boolean, run: () => Promise<void> | void) => {
      if (title) setConfirming({ title, label, destructive, run });
      else void run();
    },
    [],
  );

  const rowMenu = useCallback(
    (row: T, builtIn: ResourceRowMenuBuiltIn): ResourceRowMenuItem[] => {
      const items: ResourceRowMenuItem[] = [];
      const add = (item: ResourceRowMenuItem) => {
        if (hide && item.reason) return;
        items.push(item);
      };
      // The view's words for a refusal first, then the page's (its `can`) without words of its own.
      const refusal = (action: "update" | "delete", refused: boolean | undefined) =>
        reasonOf(view.can(action, row as T & DataRow, viewer)) ?? (refused ? m.table.notAllowed : undefined);
      if (builtIn.edit) add({ key: "edit", label: m.common.edit, onSelect: builtIn.edit, reason: refusal("update", builtIn.refused?.edit) });
      for (const a of visible) {
        add({
          key: a.name,
          label: a.label,
          destructive: a.destructive,
          reason: reasonOf(view.canAction(a.name, row as T & DataRow, viewer)),
          onSelect: () => start(a.confirm, a.label, !!a.destructive, once(`row:${a.name}:${String(idOf(row))}`, () => runRow(a, row))),
        });
      }
      if (builtIn.delete) add({ key: "delete", label: m.common.delete, destructive: true, onSelect: builtIn.delete, reason: refusal("delete", builtIn.refused?.delete) });
      return items;
    },
    [hide, m, view, viewer, visible, start, runRow, once, idOf],
  );

  const bulkActions = useMemo(() => {
    const report = (label: string, done: number, skipped: { count: number; reason: string | undefined }) => {
      if (done > 0) toast.success(fillMessage(m.bulk.done, { label, done }));
      if (skipped.count > 0) toast(fillMessage(m.bulk.skipped, { count: skipped.count, reason: skipped.reason ?? "" }));
    };
    const out: ListActionsResult<T>["bulkActions"] = [];
    for (const a of bulkable) {
      if (!a.bulk) continue;
      const declared = view.definition.actions?.find((d) => d.name === a.name);
      const run = declared && typeof declared.bulk === "object" ? declared.bulk.run : undefined;
      const firstRefusal = (rows: T[]) => {
        const reasons = rows.map((r) => reasonOf(view.canAction(a.name, r as T & DataRow, viewer)));
        return reasons.every(Boolean) && rows.length ? fillMessage(m.bulk.noneAllowed, { reason: reasons[0]! }) : undefined;
      };
      out.push({
        label: a.bulk.label,
        ...(a.destructive ? { variant: "destructive" as const } : {}),
        ...(a.bulk.matching ? { matching: true } : {}),
        testId: `bulk-${a.name}`,
        reason: firstRefusal,
        onAction: (_ids, context) => {
          const total = context.allMatching ? (context.query.total ?? context.rows.length) : context.rows.length;
          const confirm = a.bulk!.confirm ? fillMessage(a.bulk!.confirm, { count: total }) : undefined;
          start(confirm, a.bulk!.label, !!a.destructive, once(`bulk:${a.name}`, async () => {
            try {
              if (context.allMatching && a.bulk!.matching && run) {
                await run(
                  {
                    kind: "matching",
                    filters: context.query.filters,
                    ...(context.query.search ? { search: context.query.search } : {}),
                    total,
                  },
                  viewer,
                );
                report(a.bulk!.label, total, { count: 0, reason: undefined });
                return;
              }
              const allowed = context.rows.filter((r) => view.canAction(a.name, r as T & DataRow, viewer) === true);
              const refused = context.rows.filter((r) => !allowed.includes(r));
              const skipped = { count: refused.length, reason: refused[0] ? reasonOf(view.canAction(a.name, refused[0] as T & DataRow, viewer)) : undefined };
              if (run) {
                await run({ kind: "rows", rows: allowed as never }, viewer);
                report(a.bulk!.label, allowed.length, skipped);
                return;
              }
              let done = 0;
              for (const r of allowed) {
                try {
                  if (options.onRun) await options.onRun(a.name, r);
                  else await provider.runAction!(view.resource, { id: idOf(r), action: a.name });
                  done += 1;
                } catch (error) {
                  skipped.count += 1;
                  skipped.reason ??= error instanceof Error ? error.message : String(error);
                }
              }
              report(a.bulk!.label, done, skipped);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : String(error));
            } finally {
              await refresh();
            }
          }));
        },
      });
    }
    return out;
  }, [bulkable, view, viewer, m, options, provider, idOf, refresh, start, once]);

  const run = useCallback(
    (name: string, row: T) => {
      const a = visible.find((x) => x.name === name);
      if (!a || view.canAction(a.name, row as T & DataRow, viewer) !== true) return false;
      start(a.confirm, a.label, !!a.destructive, once(`row:${a.name}:${String(idOf(row))}`, () => runRow(a, row)));
      return true;
    },
    [visible, view, viewer, start, once, idOf, runRow],
  );

  return { rowMenu, bulkActions, confirming, setConfirming, run };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

/** Save text as a file in the browser. */
function download(name: string, text: string) {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * "Export CSV" for a view's list: every row the list's query matches, paged through the provider
 * by core's `exportCsv` (formula-safe), with the view's words for coded values unless `raw`.
 */
export function useViewExport(view: AnyView, preset: string): ((query: ResourceListQuery) => Promise<void>) | undefined {
  const provider = useDataProvider();
  const m = useUiMessages();
  const plan = view.exportPlan(preset);
  return useMemo(() => {
    if (!plan) return undefined;
    return async (query: ResourceListQuery) => {
      const fields = plan.columns.map((c) => c.field).filter((f): f is FieldSchema => !!f);
      try {
        const result = await exportCsv({
          provider,
          resource: view.resource,
          fields,
          filters: query.filters,
          sorts: query.sorts,
          ...(query.search ? { search: query.search.query, searchFields: query.search.fields } : {}),
          select: fields.map((f) => f.name).join(","),
          maxRows: plan.maxRows,
          format: {
            header: (f) => view.label(f.name),
            ...(plan.raw
              ? {}
              : {
                  value: (f, value) => {
                    if (value === null || value === undefined) return value;
                    if (f.enumValues?.length) return view.valueLabel(f.name, value);
                    if (f.type === "boolean") return value ? m.common.yes : m.common.no;
                    return value;
                  },
                }),
          },
        });
        download(plan.filename, result.csv);
        toast.success(fillMessage(result.truncated ? m.export.truncated : m.export.done, { rows: result.rows.toLocaleString() }));
      } catch (error) {
        toast.error(error instanceof Error && error.message ? error.message : m.export.failed);
      }
    };
  }, [plan, provider, view, m]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Saved views, through the app's store
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ResourcePage's saved-view props from a `SavedViewStore`: list, save (the segment, filters,
 * type, grouping and column preset, plus the search and sort the URL holds) and remove, each
 * stamped with the view's `version`.
 */
export function useViewSavedViews(
  view: AnyView,
  store: SavedViewStore | undefined,
  state: ViewListStateResult,
  extra: { columns: string; url: SearchParamsAdapter | undefined },
) {
  const queryClient = useQueryClient();
  const m = useUiMessages();
  const viewer = useViewer();
  // The app's store, for this viewer: the list state holds it (`forViewer` on a shared device).
  if (store) store = state.store ?? store;
  const key = ["__genesis_saved_views", view.resource, viewer.id];
  const listed = useQuery({
    queryKey: key,
    queryFn: async () => [...(await store!.list(view.resource))],
    enabled: !!store,
  });
  useEffect(() => {
    if (listed.isError) toast.error(m.filters.viewsFailed);
  }, [listed.isError, m]);
  if (!store) return {};
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const version = view.definition.version ?? 1;
  const views = listed.data ?? [];
  return {
    savedViews: views.map((v) => ({ id: v.id, name: v.name, filters: v.state as unknown as Record<string, unknown> })),
    canSaveViews: true,
    onSaveView: (name: string) => {
      // Everything the person set: the list's own search and sort as it reported them.
      const saved = state.snapshot(extra.columns);
      // Deferred, so a store that throws (not only one that rejects) is reported too.
      void Promise.resolve()
        .then(() => store.save({ name, scope: "personal", resource: view.resource, version, state: saved }))
        .then(refresh, () => toast.error(m.filters.viewsFailed));
    },
    onLoadView: (filters: Record<string, unknown>) => state.apply(filters as ListState),
    onDeleteView: (id: string) => {
      void Promise.resolve()
        .then(() => store.remove(id, view.resource))
        .then(refresh, () => toast.error(m.filters.viewsFailed));
    },
  };
}

/**
 * The list's state a root ResourceView holds for every view type below it (segment, declared
 * filters, the view type and grouping), its URL adapter, and the switcher it draws.
 */
export interface ListModel {
  state: ViewListStateResult;
  url: SearchParamsAdapter | undefined;
  switcher: ReactNode;
}
export const ListModelContext = createContext<ListModel | null>(null);
