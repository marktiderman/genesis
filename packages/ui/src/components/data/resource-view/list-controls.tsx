"use client";

// What a view declares for its lists, drawn on the web (ADR 0017): segments with counts, declared
// filters, the view-type switcher, saved views, row and bulk actions with their reasons, and CSV
// export. ResourceView composes these onto ResourcePage's own slots and props, so the engine stays
// ResourcePage and DataTable; nothing here is a second list.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Filter, Images, Kanban, LayoutGrid, List, Table2, X, type LucideIcon } from "lucide-react";
import {
  encodeRecordKey,
  resourceKeys,
  useAggregate,
  useDataProvider,
  useViewer,
  type DataRow,
  type FieldSchema,
  type FilterParam,
  type ResourceContract,
} from "@marktiderman/genesis-core";
import { exportCsv } from "@marktiderman/genesis-core/csv";
import {
  applicableListState,
  createLocalSavedViewStore,
  isFilterSet,
  listUrlParams,
  readListUrl,
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
import type { ResourceBulkContext, ResourceListQuery } from "../ResourcePage";
import { listViewTypes, resolveViewType } from "./view-types";

type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract; Row is what matters here
type AnyView<T extends Row = Row> = View<ResourceContract<any>, T & DataRow>;

/** The device store, for a list's current state when the app gives no store of its own. */
let deviceStore: SavedViewStore | undefined;
export function defaultSavedViewStore(): SavedViewStore {
  deviceStore ??= createLocalSavedViewStore();
  return deviceStore;
}

const isPromise = <V,>(v: unknown): v is Promise<V> => !!v && typeof (v as Promise<V>).then === "function";

/** A router adapter from ResourcePage's `urlState` shapes. */
export function adapterOf(urlState: SearchParamsAdapter | ResourceUrlStateOptions | false | null | undefined): SearchParamsAdapter | undefined {
  if (!urlState) return undefined;
  return "setSearchParams" in urlState ? urlState : urlState.searchParams;
}

// ─────────────────────────────────────────────────────────────────────────────
// The list's state: segment, declared filters, view type, grouping
// ─────────────────────────────────────────────────────────────────────────────

export interface ViewListStateOptions {
  view: AnyView;
  /** Where the URL lives (page lists, once the app registers its adapter). */
  url: SearchParamsAdapter | undefined;
  /** Where the person's current choices are kept. */
  store: SavedViewStore;
  /** The key for the person's current choices (the resource, or the screen's key). */
  currentKey: string;
  defaultSegment: string | undefined;
  /** The type the screen opens on, when it names one. */
  defaultType: string | undefined;
  /** The types a person may switch between; the stored choice must be one. */
  types: readonly string[];
  /** Remember the person's type. Off when the screen fixes the type. */
  rememberType: boolean;
}

export interface ViewListStateResult {
  segment: string | undefined;
  setSegment: (id: string) => void;
  values: Readonly<Record<string, ViewFilterValue>>;
  setValue: (field: string, value: ViewFilterValue | undefined) => void;
  /** The segment and every filter back to their defaults. */
  clear: () => void;
  /** Something narrows the list beyond the default segment. */
  active: boolean;
  type: string | undefined;
  setType: (type: string) => void;
  groupBy: string | null | undefined;
  /** Apply a saved view's state. */
  apply: (state: ListState) => void;
  /** The provider filters the segment and declared filters make. */
  filters: FilterParam[];
}

/** The filters a view starts with: each declared filter's `default`. */
function defaultValues(filters: readonly ResolvedFilter[]): Record<string, ViewFilterValue> {
  return Object.fromEntries(filters.filter((f) => f.default !== undefined && isFilterSet(f.default)).map((f) => [f.field, f.default!]));
}

/** A segment, its declared filters and a type, held for one list, from the URL and the person's store. */
export function useViewListState(options: ViewListStateOptions): ViewListStateResult {
  const { view, url, store, currentKey, defaultSegment, defaultType, types, rememberType } = options;
  const viewer = useViewer();
  const firstSegment = defaultSegment ?? view.segments()[0]?.id;
  const [seeded] = useState(() => (url ? readListUrl(view, (key) => url.searchParams.get(key)) : {}));
  const [segment, setSegmentRaw] = useState<string | undefined>(seeded.segment ?? firstSegment);
  const [values, setValues] = useState<Readonly<Record<string, ViewFilterValue>>>(() => seeded.filters ?? defaultValues(view.filters()));
  const [groupBy, setGroupBy] = useState<string | null | undefined>(undefined);
  // The person's type: the store's current state, read once (it may answer later).
  const typeChosen = useRef(false);
  const [type, setTypeRaw] = useState<string | undefined>(() => {
    if (!rememberType || !store.readCurrent) return defaultType;
    const read = store.readCurrent(currentKey);
    if (isPromise(read)) return defaultType;
    const t = read?.type;
    return t && types.includes(t) ? t : defaultType;
  });
  useEffect(() => {
    if (!rememberType || !store.readCurrent) return;
    const read = store.readCurrent(currentKey);
    if (!isPromise<ListState | null | undefined>(read)) return;
    let live = true;
    read.then(
      (state) => {
        const t = state?.type;
        if (live && !typeChosen.current && t && types.includes(t)) setTypeRaw(t);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per list
  }, [store, currentKey]);

  // The URL follows the segment and filters (replacing the entry: a filter isn't a page).
  const urlRef = useRef(url);
  urlRef.current = url;
  const writeUrl = useCallback(
    (next: { segment?: string | undefined; filters: Readonly<Record<string, ViewFilterValue>> }) => {
      const adapter = urlRef.current;
      if (!adapter) return;
      const params = new URLSearchParams(adapter.searchParams);
      const state = { ...(next.segment !== undefined ? { segment: next.segment } : {}), filters: next.filters };
      for (const [key, value] of Object.entries(listUrlParams(view, state, firstSegment))) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      // A new filter is a new list: back to its first page.
      params.delete("page");
      if (params.toString() !== adapter.searchParams.toString()) adapter.setSearchParams(params, { replace: true });
    },
    [view, firstSegment],
  );

  const setSegment = useCallback(
    (id: string) => {
      setSegmentRaw(id);
      writeUrl({ segment: id, filters: values });
    },
    [values, writeUrl],
  );
  const setValue = useCallback(
    (field: string, value: ViewFilterValue | undefined) => {
      setValues((prev) => {
        const next = { ...prev };
        if (value === undefined || !isFilterSet(value)) delete next[field];
        else next[field] = value;
        writeUrl({ segment, filters: next });
        return next;
      });
    },
    [segment, writeUrl],
  );
  const clear = useCallback(() => {
    setSegmentRaw(firstSegment);
    setValues({});
    writeUrl({ segment: firstSegment, filters: {} });
  }, [firstSegment, writeUrl]);
  const setType = useCallback(
    (next: string) => {
      typeChosen.current = true;
      setTypeRaw(next);
      if (rememberType && store.writeCurrent) {
        void Promise.resolve(store.writeCurrent(currentKey, { type: next })).catch(() => undefined);
      }
    },
    [rememberType, store, currentKey],
  );
  const apply = useCallback(
    (raw: ListState) => {
      const state = applicableListState(view, raw);
      const seg = state.segment ?? firstSegment;
      setSegmentRaw(seg);
      setValues(state.filters ?? {});
      if (state.groupBy !== undefined) setGroupBy(state.groupBy);
      if (state.type && types.includes(state.type)) setType(state.type);
      writeUrl({ segment: seg, filters: state.filters ?? {} });
    },
    [view, firstSegment, types, setType, writeUrl],
  );

  const filters = useMemo(
    () => [...(segment ? view.segmentFilters(segment, viewer) : []), ...view.filterParams(values)],
    [view, segment, values, viewer],
  );
  const active = (segment !== undefined && segment !== firstSegment) || Object.values(values).some(isFilterSet);
  return { segment, setSegment, values, setValue, clear, active, type, setType, groupBy, apply, filters };
}

// ─────────────────────────────────────────────────────────────────────────────
// Segments with counts
// ─────────────────────────────────────────────────────────────────────────────

function SegmentCount({ view, filters, enabled }: { view: AnyView; filters: FilterParam[]; enabled: boolean }) {
  const counted = useAggregate(view.resource, { metrics: { n: { fn: "count" } }, filters, count: "estimated" }, { enabled });
  const n = counted.data?.values["n"];
  if (n === undefined || n === null) return null;
  return <span className="text-[10px] tabular-nums opacity-70">{n.toLocaleString()}</span>;
}

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
  const viewer = useViewer();
  const segments = view.segments();
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
            {s.count ? <SegmentCount view={view} filters={[...baseFilters, ...view.segmentFilters(s.id, viewer)]} enabled={enabled} /> : null}
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

/** The types the view supports that are registered here, in the view's order. */
export function switchableTypes(view: AnyView, screenTypes: readonly string[] | undefined): readonly string[] {
  const registered = new Set(listViewTypes().map((t) => t.id));
  return (screenTypes ?? view.types()).filter((t) => registered.has(t));
}

// ─────────────────────────────────────────────────────────────────────────────
// Row and bulk actions
// ─────────────────────────────────────────────────────────────────────────────

/** A refusal's words, or undefined when allowed. */
const reasonOf = (allowed: true | string) => (allowed === true ? undefined : allowed);

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
  rowMenu: (row: T, builtIn: { edit?: () => void; delete?: () => void }) => ResourceRowMenuItem[];
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
}

/**
 * The view's actions for a list: a row menu (edit, the actions, delete; refusals with their
 * reasons) and the bulk bar's actions, each run through the provider (or the action's own `run`).
 */
export function useListActions<T extends Row>(
  view: AnyView<T>,
  options: { refusals: "disable" | "hide"; allowDelete: boolean; onRun?: ((name: string, row: T) => void | Promise<void>) | undefined },
): ListActionsResult<T> {
  const m = useUiMessages();
  const viewer = useViewer();
  const provider = useDataProvider();
  const queryClient = useQueryClient();
  const { runnable, served } = useServedActions(view as AnyView);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const hide = options.refusals === "hide";

  const visible = useMemo(
    () => view.actions().filter((a) => (options.onRun || runnable) && (!served || served.has(a.name))),
    [view, options.onRun, runnable, served],
  );
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
    (row: T, builtIn: { edit?: () => void; delete?: () => void }): ResourceRowMenuItem[] => {
      const items: ResourceRowMenuItem[] = [];
      const add = (item: ResourceRowMenuItem) => {
        if (hide && item.reason) return;
        items.push(item);
      };
      if (builtIn.edit) add({ key: "edit", label: m.common.edit, onSelect: builtIn.edit, reason: reasonOf(view.can("update", row as T & DataRow, viewer)) });
      for (const a of visible) {
        add({
          key: a.name,
          label: a.label,
          destructive: a.destructive,
          reason: reasonOf(view.canAction(a.name, row as T & DataRow, viewer)),
          onSelect: () => start(a.confirm, a.label, !!a.destructive, () => runRow(a, row)),
        });
      }
      if (builtIn.delete) add({ key: "delete", label: m.common.delete, destructive: true, onSelect: builtIn.delete, reason: reasonOf(view.can("delete", row as T & DataRow, viewer)) });
      return items;
    },
    [hide, m, view, viewer, visible, start, runRow],
  );

  const bulkActions = useMemo(() => {
    const report = (label: string, done: number, skipped: { count: number; reason: string | undefined }) => {
      if (done > 0) toast.success(fillMessage(m.bulk.done, { label, done }));
      if (skipped.count > 0) toast(fillMessage(m.bulk.skipped, { count: skipped.count, reason: skipped.reason ?? "" }));
    };
    const out: ListActionsResult<T>["bulkActions"] = [];
    for (const a of visible) {
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
          start(confirm, a.bulk!.label, !!a.destructive, async () => {
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
          });
        },
      });
    }
    // A view that runs actions on many rows deletes many too, when it allows delete.
    if (out.length && options.allowDelete) {
      out.push({
        label: m.common.delete,
        variant: "destructive",
        testId: "bulk-delete",
        reason: (rows) => {
          const reasons = rows.map((r) => reasonOf(view.can("delete", r as T & DataRow, viewer)));
          return reasons.every(Boolean) && rows.length ? fillMessage(m.bulk.noneAllowed, { reason: reasons[0]! }) : undefined;
        },
        onAction: (_ids, context) => {
          start(fillMessage(m.confirmDelete.title, {}), m.common.delete, true, async () => {
            const allowed = context.rows.filter((r) => view.can("delete", r as T & DataRow, viewer) === true);
            const refused = context.rows.filter((r) => !allowed.includes(r));
            const skipped = { count: refused.length, reason: refused[0] ? reasonOf(view.can("delete", refused[0] as T & DataRow, viewer)) : undefined };
            let done = 0;
            for (const r of allowed) {
              try {
                await provider.deleteOne(view.resource, { id: idOf(r) });
                done += 1;
              } catch (error) {
                skipped.count += 1;
                skipped.reason ??= error instanceof Error ? error.message : String(error);
              }
            }
            report(m.common.delete, done, skipped);
            await refresh();
          });
        },
      });
    }
    return out;
  }, [visible, view, viewer, m, options, provider, idOf, refresh, start]);

  return { rowMenu, bulkActions, confirming, setConfirming };
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
  const key = ["__genesis_saved_views", view.resource];
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
      const url = extra.url?.searchParams;
      const sort = url?.get("sort")?.split(":");
      const saved: ListState = {
        ...(state.segment ? { segment: state.segment } : {}),
        ...(Object.keys(state.values).length ? { filters: state.values } : {}),
        ...(state.type ? { type: state.type } : {}),
        ...(state.groupBy !== undefined ? { groupBy: state.groupBy } : {}),
        ...(extra.columns !== "default" ? { columns: extra.columns } : {}),
        ...(url?.get("q") ? { search: url.get("q")! } : {}),
        ...(sort && sort[0] && (sort[1] === "asc" || sort[1] === "desc") ? { sort: { field: sort[0], order: sort[1] } } : {}),
      };
      void Promise.resolve(store.save({ name, scope: "personal", resource: view.resource, version, state: saved })).then(refresh, () => toast.error(m.filters.viewsFailed));
    },
    onLoadView: (filters: Record<string, unknown>) => state.apply(filters as ListState),
    onDeleteView: (id: string) => {
      void Promise.resolve(store.remove(id, view.resource)).then(refresh, () => toast.error(m.filters.viewsFailed));
    },
  };
}
