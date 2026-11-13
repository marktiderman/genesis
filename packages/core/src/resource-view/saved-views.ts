// Saved views (ADR 0017 §4): a person's or a team's stored list state, kept by a store the app
// provides. Genesis ships a device store; an app supplies a server one over its own table under
// row-level security. Genesis keeps no table for it.

import type { StorageAdapter } from "../storage/types";
import type { ResolvedFilter } from "./types";
import { isFilterSet, type ListState } from "./list-state";

/**
 * One saved view: a name, who it's for, and the list state it restores, stamped with the view's
 * `version` when it was saved.
 *
 * @stability Beta
 */
export interface SavedView {
  readonly id: string;
  readonly name: string;
  /** `personal` (the person's own) or `team` (shared, as the app's store decides). */
  readonly scope: "personal" | "team";
  /** The view's resource. */
  readonly resource: string;
  /** The view's `version` when it was saved (1 when the view has none). */
  readonly version: number;
  readonly state: ListState;
}

/** A saved view to store: the store gives it its id. @stability Beta */
export type SavedViewInput = Omit<SavedView, "id"> & { readonly id?: string };

/**
 * Where saved views live (ADR 0017 §4). Passed once to genesis-ui's `ResourceViewDefaultsProvider`
 * (`savedViews`). Every method may be async. `readCurrent` and `writeCurrent`, when the store has
 * them, keep each person's current choices for a list (its view type, say), so they follow the
 * person the way saved views do.
 *
 * @stability Beta
 */
export interface SavedViewStore {
  list(resource: string): readonly SavedView[] | Promise<readonly SavedView[]>;
  save(view: SavedViewInput): SavedView | Promise<SavedView>;
  remove(id: string, resource: string): void | Promise<void>;
  /** Which scopes this store can save to. Default `["personal"]`. */
  readonly scopes?: readonly ("personal" | "team")[];
  /** The person's current state for a list (its key: the resource, or a screen's own key). */
  readCurrent?(key: string): ListState | null | undefined | Promise<ListState | null | undefined>;
  writeCurrent?(key: string, state: ListState): void | Promise<void>;
}

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function parse<T>(raw: string | null, check: (v: unknown) => v is T): T | undefined {
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    return check(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

const isSaved = (v: unknown): v is SavedView =>
  isObject(v) && typeof v.id === "string" && typeof v.name === "string" && typeof v.resource === "string" && isObject(v.state) && (v.scope === "personal" || v.scope === "team");

function defaultStorage(): StorageAdapter | undefined {
  try {
    const storage = (globalThis as { localStorage?: StorageAdapter }).localStorage;
    if (!storage) return undefined;
    // Reading can throw (a private window, storage turned off): such a store keeps nothing.
    storage.getItem("__genesis_probe__");
    return storage;
  } catch {
    return undefined;
  }
}

/**
 * The default saved-view store: this device only, personal views, under `<prefix>:<resource>`
 * in the browser's localStorage (or the storage you pass, such as a phone's adapter). Without
 * storage it keeps views in memory for the page's life.
 *
 * ```ts
 * <ResourceViewDefaultsProvider savedViews={createLocalSavedViewStore()} />
 * ```
 *
 * @stability Beta
 */
export function createLocalSavedViewStore(options: { storage?: StorageAdapter; prefix?: string } = {}): SavedViewStore {
  const prefix = options.prefix ?? "genesis-saved-views";
  const memory = new Map<string, string>();
  const storage = (): StorageAdapter =>
    options.storage ??
    defaultStorage() ?? { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: (k) => void memory.delete(k) };
  const read = (resource: string): SavedView[] =>
    parse(storage().getItem(`${prefix}:${resource}`), (v): v is unknown[] => Array.isArray(v))?.filter(isSaved) ?? [];
  const write = (resource: string, views: readonly SavedView[]) => {
    try {
      if (views.length) storage().setItem(`${prefix}:${resource}`, JSON.stringify(views));
      else storage().removeItem(`${prefix}:${resource}`);
    } catch {
      // Storage refused (full, or turned off): the view lasts for this page only.
    }
  };
  let seq = 0;
  return Object.freeze({
    scopes: Object.freeze(["personal" as const]),
    list: (resource: string) => read(resource),
    save: (input: SavedViewInput): SavedView => {
      const id = input.id ?? `view-${Date.now().toString(36)}-${(seq++).toString(36)}`;
      const saved: SavedView = Object.freeze({ ...input, id, scope: "personal" as const });
      write(input.resource, [...read(input.resource).filter((v) => v.id !== id), saved]);
      return saved;
    },
    remove: (id: string, resource: string) => write(resource, read(resource).filter((v) => v.id !== id)),
    readCurrent: (key: string) => parse(storage().getItem(`${prefix}:current:${key}`), isObject) as ListState | undefined,
    writeCurrent: (key: string, state: ListState) => {
      try {
        storage().setItem(`${prefix}:current:${key}`, JSON.stringify(state));
      } catch {
        // As above: kept for this page only.
      }
    },
  });
}

/**
 * The part of a stored list state that still applies to a view: a segment it still has, filters
 * it still declares, a column preset and view type it still offers, a field it can still group by.
 * A saved view from an older `version` is offered as far as it applies, never refused whole.
 *
 * @stability Beta
 */
export function applicableListState(
  view: {
    filters(): readonly ResolvedFilter[];
    segments(): readonly { id: string }[];
    presets: readonly string[];
    types(): readonly string[];
    field(name: string): unknown;
  },
  state: ListState | null | undefined,
): ListState {
  if (!state || !isObject(state)) return {};
  const out: { -readonly [K in keyof ListState]: ListState[K] } = {};
  if (typeof state.segment === "string" && view.segments().some((s) => s.id === state.segment)) out.segment = state.segment;
  if (isObject(state.filters)) {
    const declared = new Set(view.filters().map((f) => f.field));
    const kept = Object.fromEntries(Object.entries(state.filters).filter(([field, value]) => declared.has(field) && isFilterSet(value as never)));
    if (Object.keys(kept).length) out.filters = kept as ListState["filters"];
  }
  if (typeof state.search === "string" && state.search.trim()) out.search = state.search.slice(0, 200);
  if (isObject(state.sort) && typeof state.sort.field === "string" && view.field(state.sort.field) && (state.sort.order === "asc" || state.sort.order === "desc")) {
    out.sort = { field: state.sort.field, order: state.sort.order };
  }
  if (typeof state.columns === "string" && view.presets.includes(state.columns)) out.columns = state.columns;
  if (typeof state.type === "string" && view.types().includes(state.type)) out.type = state.type;
  if (state.groupBy === null) out.groupBy = null;
  else if (typeof state.groupBy === "string" && view.field(state.groupBy)) out.groupBy = state.groupBy;
  return out;
}
