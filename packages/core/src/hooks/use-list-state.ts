// A list's state (ADR 0017): its segment, declared filters, view type, grouping, column preset and
// a saved view's search and sort, held once for every platform. The web's ResourceView and the
// phone's NativeResourceView both read it; only what they draw differs.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FilterParam } from "../provider/types";
import type { ResourceContract } from "../schema/types";
import type { ResourceView, ResolvedFilter, ViewFilterValue } from "../resource-view/types";
import { isFilterSet, listUrlParams, readListUrl, type ListState } from "../resource-view/list-state";
import { applicableListState, type SavedViewStore } from "../resource-view/saved-views";
import { useOptionalViewerScope, useViewer } from "./viewer-scope";

/**
 * Where a list keeps its state in the address: a router's search params (the web's
 * `SearchParamsAdapter` has this shape). A phone list passes none.
 *
 * @stability Beta
 */
export interface ListUrlAdapter {
  readonly searchParams: URLSearchParams;
  setSearchParams(next: URLSearchParams, options?: { replace?: boolean }): void;
}

/** A list's sort, as a list reports it. @stability Beta */
export interface ListSort {
  readonly field: string;
  readonly order: "asc" | "desc";
}

/** @stability Beta */
export interface UseListStateOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any contract and row
  view: ResourceView<ResourceContract<any>, any>;
  /** Where the URL lives (a page list, once the app registers its adapter). */
  url?: ListUrlAdapter | undefined;
  /** Where the person's current choices are kept: the app's saved-view store. */
  store?: SavedViewStore | undefined;
  /** The key for the person's current choices (the resource, or the screen's key). */
  currentKey?: string | undefined;
  defaultSegment?: string | undefined;
  /** The type the screen opens on, when it names one. */
  defaultType?: string | undefined;
  /** The types a person may switch between; a stored choice must be one. */
  types?: readonly string[] | undefined;
  /** Remember the person's type. Off when the screen fixes the type. */
  rememberType?: boolean | undefined;
  /** How long a text filter waits after the last keystroke before the list asks again. Default 300 ms. */
  textDelayMs?: number | undefined;
}

/** @stability Beta */
export interface ListStateResult {
  segment: string | undefined;
  setSegment: (id: string) => void;
  /** The declared filters' values as the person set them (a text filter's as typed). */
  values: Readonly<Record<string, ViewFilterValue>>;
  setValue: (field: string, value: ViewFilterValue | undefined) => void;
  /** The segment and every filter back to their defaults. */
  clear: () => void;
  /** Something narrows the list beyond the default segment. */
  active: boolean;
  type: string | undefined;
  setType: (type: string) => void;
  groupBy: string | null | undefined;
  setGroupBy: (field: string | null) => void;
  /** Apply a saved view's state: its segment, filters, search, sort, columns, type and grouping. */
  apply: (state: ListState) => void;
  /** A column preset a saved view chose, over the screen's default. */
  columns: string | undefined;
  /** Search and sort a saved view restored: a list starts again (`nonce` changes) with these. */
  restore: { readonly nonce: number; readonly search: string; readonly sort: ListSort | null };
  /** The list's own search and sort as it reports them, for saving. */
  observeQuery: (query: { search: string; sort: ListSort | null }) => void;
  /** The last search and sort the list reported. */
  query: () => { search: string; sort: ListSort | null };
  /** The declared filters' provider filters, on the viewer's clock (what segment counts add to). */
  valueFilters: FilterParam[];
  /** The provider filters the segment and declared filters make. */
  filters: FilterParam[];
  /** The store this viewer's choices and saved views live in (`forViewer` on a shared device). */
  store: SavedViewStore | undefined;
  /** Everything the person set, as a saved view stores it (`columns`: the preset shown, when not the default). */
  snapshot: (columns?: string) => ListState;
}

const isPromise = <V>(v: unknown): v is Promise<V> => !!v && typeof (v as Promise<V>).then === "function";

/** The filters a view starts with: each declared filter's `default`. */
function defaultValues(filters: readonly ResolvedFilter[]): Record<string, ViewFilterValue> {
  return Object.fromEntries(filters.filter((f) => f.default !== undefined && isFilterSet(f.default)).map((f) => [f.field, f.default!]));
}

/** The values that narrow anything, in field order, for comparing. */
const setOnly = (values: Readonly<Record<string, ViewFilterValue>>) =>
  Object.fromEntries(Object.entries(values).filter(([, v]) => isFilterSet(v)).sort(([a], [b]) => a.localeCompare(b)));

const sameValues = (a: Readonly<Record<string, ViewFilterValue>>, b: Readonly<Record<string, ViewFilterValue>>) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A list's state, held for one list (ADR 0017): from the URL when it has one, and the person's
 * store. The URL follows each change (replacing the entry: a filter isn't a page) and the state
 * follows the URL back (Back, Forward, a link to the same page with other filters). A text filter
 * reaches the query after a pause. Nothing is read from storage while rendering, so a server
 * render and the first client render agree; the stored view type arrives in an effect.
 *
 * @stability Beta
 */
export function useListState(options: UseListStateOptions): ListStateResult {
  const { view, url, currentKey = view.resource, defaultSegment, defaultType, types = [], rememberType = false, textDelayMs = 300 } = options;
  const viewer = useViewer();
  const zone = useOptionalViewerScope()?.timeZone;
  // A store on a shared device keeps each person's views apart.
  const base = options.store;
  const store = useMemo(() => (base?.forViewer ? base.forViewer(viewer.id) : base), [base, viewer.id]);
  const firstSegment = defaultSegment ?? view.segments()[0]?.id;
  const fromUrl = useCallback(() => (url ? readListUrl(view, (key) => url.searchParams.get(key)) : {}), [url, view]);
  const [seeded] = useState(fromUrl);
  const [segment, setSegmentRaw] = useState<string | undefined>(seeded.segment ?? firstSegment);
  // The declared defaults: what a list starts with, what Clear goes back to, and what the URL
  // means when it names no value for a filter (readListUrl fills them in; an empty one is cleared).
  const defaults = useMemo(() => defaultValues(view.filters()), [view]);
  const [values, setValuesRaw] = useState<Readonly<Record<string, ViewFilterValue>>>(() => (url ? (seeded.filters ?? {}) : defaults));
  // What the query uses: a text filter's value lands here after a pause.
  const [settled, setSettled] = useState(values);
  const [groupBy, setGroupBy] = useState<string | null | undefined>(undefined);
  const [columns, setColumns] = useState<string | undefined>(undefined);
  const [restore, setRestore] = useState<ListStateResult["restore"]>({ nonce: 0, search: "", sort: null });
  const queryRef = useRef<{ search: string; sort: ListSort | null }>({ search: "", sort: null });
  const observeQuery = useCallback((query: { search: string; sort: ListSort | null }) => {
    queryRef.current = { search: query.search, sort: query.sort ? { field: query.sort.field, order: query.sort.order } : null };
  }, []);
  const query = useCallback(() => queryRef.current, []);

  // The person's type: the screen's first (the same on the server and the client's first render),
  // then the store's, once it answers.
  const typeChosen = useRef(false);
  const [type, setTypeRaw] = useState<string | undefined>(defaultType);
  const typesKey = types.join(",");
  // Whose type this is: a new viewer (or another list under the same hook) starts again from the
  // screen's type and reads their own, never keeping the last person's choice.
  const typeOwner = useRef(`${viewer.id ?? ""}\u0000${currentKey}`);
  useEffect(() => {
    const owner = `${viewer.id ?? ""}\u0000${currentKey}`;
    if (typeOwner.current !== owner) {
      typeOwner.current = owner;
      typeChosen.current = false;
      setTypeRaw(defaultType);
    }
    if (!rememberType || !store?.readCurrent) return;
    let live = true;
    const take = (state: ListState | null | undefined) => {
      const t = state && typeof state === "object" ? state.type : undefined;
      if (live && !typeChosen.current && typeof t === "string" && types.includes(t)) setTypeRaw(t);
    };
    try {
      const read = store.readCurrent(currentKey);
      if (isPromise<ListState | null | undefined>(read)) read.then(take, () => undefined);
      else take(read);
    } catch {
      // A store that can't be read leaves the screen's type.
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per list and store
  }, [store, currentKey, rememberType, typesKey, viewer.id]);

  // ── The URL ──
  const urlRef = useRef(url);
  urlRef.current = url;
  const written = useRef<string | null>(null);
  const writeUrl = useCallback(
    (next: { segment?: string | undefined; filters: Readonly<Record<string, ViewFilterValue>>; query?: { search: string; sort: ListSort | null } }) => {
      const adapter = urlRef.current;
      if (!adapter) return;
      const params = new URLSearchParams(adapter.searchParams);
      const state = { ...(next.segment !== undefined ? { segment: next.segment } : {}), filters: next.filters };
      for (const [key, value] of Object.entries(listUrlParams(view, state, firstSegment))) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      // A saved view's search and sort go in the same replacement as its segment and filters: a
      // second one would start from the URL before the first landed.
      if (next.query) {
        if (next.query.search) params.set("q", next.query.search);
        else params.delete("q");
        if (next.query.sort) params.set("sort", `${next.query.sort.field}:${next.query.sort.order}`);
        else params.delete("sort");
      }
      // A new filter is a new list: back to its first page.
      params.delete("page");
      if (params.toString() !== adapter.searchParams.toString()) {
        written.current = params.toString();
        adapter.setSearchParams(params, { replace: true });
      }
    },
    [view, firstSegment],
  );
  // The URL changed from outside (Back, Forward, a link): the state follows it.
  const urlKey = url ? url.searchParams.toString() : "";
  useEffect(() => {
    if (!url) return;
    if (written.current === urlKey) return;
    written.current = urlKey;
    const read = fromUrl();
    const nextSegment = read.segment ?? firstSegment;
    const nextValues = read.filters ?? {};
    setSegmentRaw((before) => (before === nextSegment ? before : nextSegment));
    setValuesRaw((before) => (sameValues(before, nextValues) ? before : nextValues));
    setSettled((before) => (sameValues(before, nextValues) ? before : nextValues));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- by the URL's value
  }, [urlKey]);

  // Text filters settle after a pause; choices and ranges at once.
  const textFields = useMemo(() => new Set(view.filters().filter((f) => f.kind === "text").map((f) => f.field)), [view]);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const segmentRef = useRef(segment);
  segmentRef.current = segment;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const commit = useCallback(
    (next: Readonly<Record<string, ViewFilterValue>>, seg: string | undefined) => {
      setSettled(next);
      writeUrl({ segment: seg, filters: next });
    },
    [writeUrl],
  );

  const setSegment = useCallback(
    (id: string) => {
      setSegmentRaw(id);
      writeUrl({ segment: id, filters: valuesRef.current });
    },
    [writeUrl],
  );
  const setValue = useCallback(
    (field: string, value: ViewFilterValue | undefined) => {
      const next = { ...valuesRef.current };
      if (value === undefined || !isFilterSet(value)) delete next[field];
      else next[field] = value;
      valuesRef.current = next;
      setValuesRaw(next);
      if (timer.current) clearTimeout(timer.current);
      if (textFields.has(field) && textDelayMs > 0) timer.current = setTimeout(() => commit(valuesRef.current, segmentRef.current), textDelayMs);
      else commit(next, segmentRef.current);
    },
    [textFields, textDelayMs, commit],
  );
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setSegmentRaw(firstSegment);
    valuesRef.current = defaults;
    setValuesRaw(defaults);
    commit(defaults, firstSegment);
  }, [firstSegment, commit, defaults]);
  const setType = useCallback(
    (next: string) => {
      typeChosen.current = true;
      setTypeRaw(next);
      if (rememberType && store?.writeCurrent) {
        void Promise.resolve()
          .then(() => store.writeCurrent!(currentKey, { type: next }))
          .catch(() => undefined);
      }
    },
    [rememberType, store, currentKey],
  );
  const apply = useCallback(
    (raw: ListState) => {
      const state = applicableListState(view, raw);
      const seg = state.segment ?? firstSegment;
      if (timer.current) clearTimeout(timer.current);
      setSegmentRaw(seg);
      const filters = state.filters ?? {};
      valuesRef.current = filters;
      setValuesRaw(filters);
      setGroupBy(state.groupBy);
      setColumns(state.columns);
      if (state.type && types.includes(state.type)) setType(state.type);
      // The search and sort: the list starts again with them (and the URL holds them, if it's kept),
      // written with the segment and filters in one replacement.
      const search = state.search ?? "";
      const sort = state.sort ? { field: state.sort.field, order: state.sort.order } : null;
      queryRef.current = { search, sort };
      setSettled(filters);
      writeUrl({ segment: seg, filters, query: { search, sort } });
      setRestore((before) => ({ nonce: before.nonce + 1, search, sort }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- types by value
    [view, firstSegment, typesKey, setType, writeUrl],
  );

  const valueFilters = useMemo(() => view.filterParams(settled, zone), [view, settled, zone]);
  const filters = useMemo(() => [...(segment ? view.segmentFilters(segment, viewer) : []), ...valueFilters], [view, segment, viewer, valueFilters]);
  // Clear has something to do: the segment or a filter isn't where the list starts.
  const active = (segment !== undefined && segment !== firstSegment) || !sameValues(setOnly(values), setOnly(defaults));
  const snapshot = useCallback(
    (shown?: string): ListState => {
      const { search, sort } = queryRef.current;
      return {
        ...(segment ? { segment } : {}),
        ...(Object.keys(values).length ? { filters: values } : {}),
        ...(type ? { type } : {}),
        ...(groupBy !== undefined ? { groupBy } : {}),
        ...(shown && shown !== "default" ? { columns: shown } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(sort ? { sort } : {}),
      };
    },
    [segment, values, type, groupBy],
  );
  return {
    snapshot,
    segment,
    setSegment,
    values,
    setValue,
    clear,
    active,
    type,
    setType,
    groupBy,
    setGroupBy,
    apply,
    filters,
    valueFilters,
    columns,
    restore,
    observeQuery,
    query,
    store,
  };
}

