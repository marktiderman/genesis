import type {
  BaseRecord,
  CountMode,
  DataProvider,
  FilterParam,
  Identifier,
  InvalidationKey,
  ListParams,
  ResourceChangeEvent,
  SortParam,
  WriteEvent,
} from "./types";
import { DataWriteError } from "../schema/write-outcome";
import { DataReadError, readFailureMessage } from "../schema/read-outcome";
import type { FilterOperator, ProviderCapabilities } from "../schema/types";
import { readOutcomeFromCode, toDataWriteError } from "./postgrest-errors";

// ---------------------------------------------------------------------------
// Minimal Supabase client shape — no hard dependency on @supabase/supabase-js
// ---------------------------------------------------------------------------

/** A chainable query builder returned by `client.from(table)`. */
interface SupabaseQueryBuilder {
  select(
    columns?: string,
    options?: { count?: "exact" | "planned" | "estimated" },
  ): SupabaseQueryBuilder;
  insert(data: Record<string, unknown> | Record<string, unknown>[]): SupabaseQueryBuilder;
  update(data: Record<string, unknown>): SupabaseQueryBuilder;
  delete(): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  neq(column: string, value: unknown): SupabaseQueryBuilder;
  gt(column: string, value: unknown): SupabaseQueryBuilder;
  lt(column: string, value: unknown): SupabaseQueryBuilder;
  gte(column: string, value: unknown): SupabaseQueryBuilder;
  lte(column: string, value: unknown): SupabaseQueryBuilder;
  ilike(column: string, value: string): SupabaseQueryBuilder;
  in(column: string, values: unknown[]): SupabaseQueryBuilder;
  is(column: string, value: null): SupabaseQueryBuilder;
  not(column: string, operator: string, value: unknown): SupabaseQueryBuilder;
  or(filters: string): SupabaseQueryBuilder;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): SupabaseQueryBuilder;
  range(from: number, to: number): SupabaseQueryBuilder;
  single(): SupabaseQueryBuilder;
  then: Promise<{ data: unknown; error: unknown; count?: number | null }>["then"];
}

/**
 * Minimal Supabase client interface — the public shape this package has
 * always exposed for a caller that wants to type its own client or a
 * wrapper around one. Unchanged: `from()` still returns `SupabaseQueryBuilder`
 * so existing consumers that annotate a variable with this type and chain
 * off it keep type-checking exactly as before.
 */
export interface SupabaseClient {
  from(table: string): SupabaseQueryBuilder;
  /** Another schema's tables, for a resource named `schema.table` outside `public`. */
  schema?(name: string): { from(table: string): SupabaseQueryBuilder };
  /** Supabase Realtime; needed only for `subscribe` (see `SupabaseProviderOptions.realtime`). */
  channel?(name: string): SupabaseRealtimeChannel;
  /** Releases a channel made by `channel()`. */
  removeChannel?(channel: SupabaseRealtimeChannel): unknown;
}

/**
 * One `postgres_changes` message, as Supabase Realtime sends it. Only the
 * fields the provider reads; a real payload has more.
 */
export interface SupabaseRealtimePayload {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  /** The row after an insert or update (empty for a delete). */
  new?: Record<string, unknown>;
  /** For a delete or update: the old row's key (all of it with `REPLICA IDENTITY FULL`). */
  old?: Record<string, unknown>;
}

/**
 * The part of a Supabase `RealtimeChannel` the provider uses. A real
 * `@supabase/supabase-js` channel satisfies it.
 */
export interface SupabaseRealtimeChannel {
  on(
    type: "postgres_changes",
    filter: {
      event: "*" | "INSERT" | "UPDATE" | "DELETE";
      schema: string;
      table: string;
      filter?: string;
    },
    callback: (payload: SupabaseRealtimePayload) => void,
  ): SupabaseRealtimeChannel;
  subscribe(callback?: (status: string, error?: unknown) => void): SupabaseRealtimeChannel;
  unsubscribe?(): unknown;
}

/**
 * What `createSupabaseProvider` actually requires from its `client` argument
 * — deliberately looser than the public `SupabaseClient` above, and used
 * ONLY for that one parameter. A real `@supabase/supabase-js` client's
 * `from()` returns a generic, table-typed `PostgrestQueryBuilder` whose chain
 * methods don't structurally match `SupabaseQueryBuilder`, which used to
 * force callers to pass their client through `as never`. Since `unknown` is
 * a supertype of everything, any real client's `from(table: string)`
 * satisfies THIS shape without a cast; `createSupabaseProvider` narrows to
 * `SupabaseQueryBuilder` internally, once, right after each `from()` call.
 * Loosening only the input here — rather than `SupabaseClient` itself —
 * means a caller relying on `SupabaseClient`'s stricter return type for
 * their own chaining is unaffected.
 */
export interface SupabaseClientInput {
  from(table: string): unknown;
  /** Another schema's tables, for a resource named `schema.table` outside `public`. Any real client's `schema` fits. */
  schema?(name: string): { from(table: string): unknown };
  /** Database functions, for a resource whose `source` is an `rpc`. Any real client's `rpc` fits. */
  rpc?(fn: string, args?: Record<string, unknown>, options?: { count?: "exact" | "planned" | "estimated" }): unknown;
  /** Supabase Realtime, for `subscribe`. Any real client's `channel` fits. */
  channel?(name: string): unknown;
  removeChannel?(channel: unknown): unknown;
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

/** What a write hook is told about the write it is part of. */
export interface SupabaseWriteContext {
  resource: string;
  action: "create" | "update";
  /** The row's id, for an update. */
  id?: Identifier;
}

/** Per-resource rules for `createSupabaseProvider`. Every field is optional. */
export interface SupabaseResourceConfig {
  /** Singular noun for failure messages, e.g. "project". Defaults to "record". */
  noun?: string;
  /** Plural for list messages, when it isn't `noun` + "s" ("categories"). */
  nounPlural?: string;
  /**
   * The columns a search covers. `[]` means the resource can't be searched,
   * and `capabilities(resource).search` reports false so a UI hides the box.
   * Set, they replace the caller's `search.fields`; omitted, those are used
   * as given.
   */
  searchFields?: readonly string[];
  /**
   * The column a sorted list orders by last, so rows with equal sort values
   * keep one order from page to page (none repeats, none is skipped).
   * Default `"id"`; `false` for a table or view without one. With the
   * default, a view that turns out to have no `id` column is read as before
   * (without the key order) and a development warning suggests setting this.
   */
  orderKey?: string | false;
  /**
   * `"bin"` for a table whose delete trigger moves the row to a recycle bin
   * instead of removing it (see `SupabaseProviderOptions.binTables`).
   * `"hard"` forces a plain delete even when `binTables` lists the table.
   */
  deleteMode?: "hard" | "bin";
  /**
   * Turns submitted values into the row to write: trim, drop read-only keys,
   * validate. Runs before every create and update, including the `create`
   * and `update` overrides. Throw (ideally `DataWriteError("invalid", ...)`)
   * to refuse the write; nothing is sent.
   */
  prepare?: (
    values: Record<string, unknown>,
    context: SupabaseWriteContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /**
   * Creates the row some other way than an insert, e.g. a security-definer
   * RPC. Return the new row, or its id and the provider reads the row back
   * (if the read-back fails, the create is still reported as saved, with
   * just the id, so the user does not retry and make a second one). Throw to
   * fail; a Supabase `{ message, code }` error is mapped like any other.
   */
  create?: (row: Record<string, unknown>) => Promise<BaseRecord | Identifier>;
  /**
   * Updates the row some other way than an update, e.g. an RPC. Return the
   * updated row, or its id (or `true`) and the provider reads it back.
   * Returning nothing (`undefined`/`null`/`false`) means no row changed: the provider then reads the
   * row to say why (`forbidden` or `gone`), exactly as for a plain update,
   * so a function that silently skips a row never reports a save.
   */
  update?: (
    id: Identifier,
    row: Record<string, unknown>,
  ) => Promise<BaseRecord | Identifier | boolean | null | undefined | void>;
  /** Maps a stored row to edit-form values; see `DataProvider.toFormValues`. */
  toFormValues?: (record: Record<string, unknown>) => Record<string, unknown>;
  /**
   * Other cache keys a committed write to this resource makes stale, e.g.
   * `[["staff"], ["me"]]`. Served through `DataProvider.invalidates`, which
   * `useResource` and `useResourceForm` invalidate after their writes.
   */
  invalidates?: InvalidationKey[] | ((event: WriteEvent) => InvalidationKey[]);
  /**
   * Serve `subscribe` for this resource through Supabase Realtime
   * (`postgres_changes`), so `live` lists and records refresh when the table
   * changes. The table must be in the `supabase_realtime` publication, with
   * RLS on. `false` turns it off even when `SupabaseProviderOptions.realtime`
   * covers the resource.
   */
  realtime?: boolean;
  /**
   * Read this resource from somewhere else than its table: a view (joins,
   * counts, aggregations) or a database function that returns rows. Writes
   * still go to the table. Lists keep paging, filters, search, sort, totals
   * and cursors, because PostgREST filters a view or a set-returning function
   * like a table. Realtime still watches the table.
   *
   * Row-level security: a plain view runs as its owner and a SECURITY DEFINER
   * function as its definer, so either one reads past RLS. Create the view
   * `with (security_invoker = true)` and the function `security invoker` (or
   * have it filter by `auth.uid()` itself), or this exposes every row.
   *
   * ```ts
   * resources: {
   *   tasks: { source: "tasks_with_people" },
   *   course_progress: { source: { rpc: "group_progress", args: () => ({ group_id: currentGroup() }) } },
   * }
   * ```
   */
  source?: string | { rpc: string; args?: () => Record<string, unknown> };
  /**
   * How lists of this resource count their total (default `exact`). Use
   * `estimated` for large tables, or `none` when no screen shows a count.
   */
  count?: CountMode;
  /** The columns read when the caller names none, e.g. embedded joins: `"*, person:people(full_name)"`. Default `"*"`. */
  select?: string;
  /**
   * With a `source` (or a `select` that embeds other tables), the table's own
   * columns: creates and updates write only these, so a form built from the
   * richer read row never sends its joined or computed columns to the table.
   * Without it, an update writes only the columns the table's row has.
   */
  writeColumns?: readonly string[];
}

/** Options for `createSupabaseProvider`. All optional; none changes reads. */
export interface SupabaseProviderOptions {
  /**
   * Recycle-bin tables: their delete trigger turns a delete into a "binned"
   * mark and the binned row drops out of the caller's view (RLS or a view
   * filter). The database reports such a delete as zero rows, so for these
   * the provider checks the row is visible, deletes it, and reads it back:
   * gone from view is success, still visible is `forbidden`. A row that was
   * not visible beforehand is `gone`. A `public` table matches either
   * spelling; a test is asked with the bare name, then `public.name`.
   */
  binTables?: readonly string[] | ((resource: string) => boolean);
  /**
   * Per-resource rules, keyed by resource name. A `public` resource may be keyed either way
   * (`goals` or `public.goals`). The key spelled exactly as the caller names the resource wins;
   * the other spelling is used only when that key is absent. Rules are never merged.
   */
  resources?: Record<string, SupabaseResourceConfig>;
  /**
   * Called after every committed create, update and delete, e.g. to
   * invalidate caches the Genesis hooks don't know about. Awaited, but a
   * failure is logged and never turns a committed write into a failed one.
   */
  onWrite?: (event: WriteEvent) => void | Promise<void>;
  /**
   * The most rows one list page may ask for (PostgREST's `max-rows` caps
   * reads anyway; default 1000). A larger request is refused with an
   * `invalid` `DataReadError` (its `cause` says why) rather than cut short,
   * so page boundaries never disagree with the caller's `perPage`.
   * `capabilities().maxPerPage` reports it.
   */
  maxPerPage?: number;
  /**
   * Called with every failed read, before it is thrown. The thrown
   * `DataReadError` carries a plain message for users; the store's own
   * error (its raw text and code) is its `cause`, for logging here.
   */
  onReadError?: (
    error: DataReadError,
    context: { resource: string; operation: "getList" | "getOne" | "getMany" },
  ) => void | Promise<void>;
  /**
   * Which resources `subscribe` serves through Supabase Realtime: `true` for
   * all, a list of names, or a test. Off by default; a resource's own
   * `resources[name].realtime` wins. Needs a client with `channel()` (any
   * `@supabase/supabase-js` client). A `public` resource matches either
   * spelling; a test is asked with the bare name, then `public.name`.
   */
  realtime?: boolean | readonly string[] | ((resource: string) => boolean);
}

/** A PostgREST "undefined column" error (42703) naming `column`. */
/**
 * A PostgreSQL "undefined column" error (42703) for `table`'s own `column`:
 * `column "id" does not exist` or `column <table>.id does not exist`. Not a
 * related table's column (`author.id`) or any other message mentioning it.
 */
function isMissingColumn(error: unknown, table: string, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code !== "42703" || typeof message !== "string") return false;
  const match = /^column (?:"?([^."\s]+)"?\.)?"?([^."\s]+)"? does not exist$/.exec(message.trim());
  if (!match || match[2] !== column) return false;
  const ownTable = table.split(".").pop()?.replace(/"/g, "");
  return match[1] === undefined || match[1] === ownTable;
}

const SERVED_OPERATORS: readonly FilterOperator[] = [
  "eq", "neq", "gt", "lt", "gte", "lte", "contains", "in", "between", "is_null", "is_not_null",
];

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

function isIdentifier(value: unknown): value is Identifier {
  return typeof value === "string" || typeof value === "number";
}

// ---------------------------------------------------------------------------
// Cursor (keyset) paging
// ---------------------------------------------------------------------------

type CursorValue = string | number | boolean | null;

/** One sort column a cursor was made for. */
interface CursorColumn {
  s: string;
  o: "asc" | "desc";
}

/**
 * What a cursor holds: the sort it was made for, and the last row's values.
 * A cursor for one sort column is written as `s`/`o`/`v`; for several, as
 * `c` (the columns) and `vs` (their values, in order).
 */
interface CursorState {
  /** Sort field, or null when ordered by the key alone (or by several columns, in `c`). */
  s: string | null;
  /** The sort's order; the key's own order when `s` is null and there is no `c`. */
  o: "asc" | "desc";
  /** The key column. */
  k: string;
  /** The last row's sort value (absent when `s` is null). */
  v?: CursorValue;
  /** Several sort columns, first one first. */
  c?: CursorColumn[];
  /** The last row's values for `c`. */
  vs?: CursorValue[];
  /** The last row's key value (the first row's, for a cursor going back). */
  id: string | number;
  /** "b": the rows before this one (a previous page). Absent: the rows after it. */
  d?: "b";
}

const PLAIN_COLUMN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function encodeCursor(state: CursorState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCursor(cursor: string): CursorState | undefined {
  try {
    const binary = atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const state = JSON.parse(new TextDecoder().decode(bytes)) as CursorState;
    if (!state || typeof state !== "object" || typeof state.k !== "string" || !isIdentifier(state.id)) return undefined;
    if (state.o !== "asc" && state.o !== "desc") return undefined;
    if (state.d !== undefined && state.d !== "b") return undefined;
    if (state.c !== undefined) {
      if (!Array.isArray(state.c) || !Array.isArray(state.vs) || state.c.length !== state.vs.length) return undefined;
      if (!state.c.every((col) => col && typeof col.s === "string" && (col.o === "asc" || col.o === "desc"))) return undefined;
    }
    return state;
  } catch {
    return undefined;
  }
}

/** A value quoted for a PostgREST filter, so commas, dots and parens are literal. */
function quoteFilterValue(value: string | number | boolean): string {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** A cursor's sort columns with the row's values, and the key's order. */
function cursorColumns(state: CursorState): { cols: (CursorColumn & { v: CursorValue })[]; keyOrder: "asc" | "desc" } {
  if (state.c) return { cols: state.c.map((col, i) => ({ ...col, v: state.vs![i] ?? null })), keyOrder: "asc" };
  if (state.s === null) return { cols: [], keyOrder: state.o };
  return { cols: [{ s: state.s, o: state.o, v: state.v ?? null }], keyOrder: "asc" };
}

/**
 * The columns a list is ordered by, first one first, before the key: `sorts`
 * when given, else `sort`. A sort on the key ends the list there (the key is
 * unique, so nothing after it can matter) and sets the key's own order;
 * otherwise the key comes last, ascending. A repeated column counts once.
 */
function sortColumns(params: ListParams, key: string): { columns: SortParam[]; keyOrder: "asc" | "desc" } {
  const requested = params.sorts && params.sorts.length > 0 ? params.sorts : params.sort ? [params.sort] : [];
  const columns: SortParam[] = [];
  for (const sort of requested) {
    if (sort.field === key) return { columns, keyOrder: sort.order ?? "asc" };
    if (!columns.some((c) => c.field === sort.field)) columns.push({ field: sort.field, order: sort.order ?? "asc" });
  }
  return { columns, keyOrder: "asc" };
}

/**
 * The PostgREST `or` clauses selecting the rows after `state` (before it, for
 * a cursor going back), for a list ordered by each sort column (nulls last
 * when ascending and first when descending, as Postgres orders them by
 * default) and then by the key. Spelled out one column at a time: Postgres's
 * row comparison `(a, b) > (x, y)` doesn't follow that null placement, and
 * PostgREST's filters can't express it anyway.
 * @internal Exported for tests.
 */
export function keysetClauses(state: CursorState): string {
  const back = state.d === "b";
  const k = state.k;
  const K = quoteFilterValue(state.id);
  const { cols, keyOrder } = cursorColumns(state);
  // The key is unique: within ties on every column, the rows after (or before) by the key.
  const keyAhead = `${k}.${(keyOrder === "asc") !== back ? "gt" : "lt"}.${K}`;
  if (cols.length === 0) return keyAhead;
  // Rows that come later on one column, given equal values on the columns before it. The
  // `is.null` pieces go last, so a one-column cursor reads as it always has.
  const main: string[] = [];
  const tail: string[] = [];
  const equal: string[] = [];
  const within = (piece: string) => (equal.length ? `and(${equal.join(",")},${piece})` : piece);
  for (const { s, o, v } of cols) {
    // Ascending puts nulls last; going back mirrors which side is "ahead".
    const nullsAhead = (o === "asc") !== back;
    if (v === null) {
      if (!nullsAhead) main.push(within(`${s}.not.is.null`));
      equal.push(`${s}.is.null`);
    } else {
      const V = quoteFilterValue(v);
      main.push(within(`${s}.${(o === "asc") !== back ? "gt" : "lt"}.${V}`));
      if (nullsAhead) tail.push(within(`${s}.is.null`));
      equal.push(`${s}.eq.${V}`);
    }
  }
  return [...main, `and(${equal.join(",")},${keyAhead})`, ...tail].join(",");
}

/**
 * `"schema.table"` or `"table"` (schema `public`): the name a generated
 * contract gives a resource, split the way PostgREST and Realtime name it.
 */
export function splitRelation(resource: string): { schema: string; table: string } {
  const dot = schemaDot(resource);
  return dot < 0
    ? { schema: "public", table: unquote(resource) }
    : { schema: unquote(resource.slice(0, dot)), table: unquote(resource.slice(dot + 1)) };
}

/** Where the schema ends: the first dot outside double quotes (`"my.s"."we.ird"`), or -1. */
function schemaDot(resource: string): number {
  let quoted = false;
  for (let i = 0; i < resource.length; i++) {
    const c = resource[i];
    if (c === '"') quoted = !quoted;
    else if (c === "." && !quoted) return i;
  }
  return -1;
}

/** A name part without its quotes: `"we.ird"` → `we.ird`, `"a""b"` → `a"b`. */
function unquote(part: string): string {
  return part.length >= 2 && part.startsWith('"') && part.endsWith('"') ? part.slice(1, -1).replace(/""/g, '"') : part.replace(/"/g, "");
}

/** A name part as a resource name spells it: quoted when it holds a dot or a quote. */
function quotePart(part: string): string {
  return /[."]/.test(part) ? `"${part.replace(/"/g, '""')}"` : part;
}

/** The same `public` resource named the other way: `public.goals` ↔ `goals`; other schemas have one spelling. */
function otherSpelling(resource: string): string {
  const { schema, table } = splitRelation(resource);
  if (schema !== "public") return resource;
  return schemaDot(resource) < 0 ? `public.${quotePart(table)}` : quotePart(table);
}

/** Every spelling of a resource, for a list or test given either: a `public` one bare first, then qualified. */
function spellings(resource: string): string[] {
  const { schema } = splitRelation(resource);
  if (schema !== "public") return [resource];
  const other = otherSpelling(resource);
  return schemaDot(resource) < 0 ? [resource, other] : [other, resource];
}

let realtimeChannelSeq = 0;

/** How long after this client's own write a realtime event for that row is taken as its echo. */
export const REALTIME_ECHO_MS = 2000;

/** The realtime filter for a list's first equality filter on a plain column, or undefined. */
function realtimeFilter(filters: FilterParam[] | undefined): string | undefined {
  for (const f of filters ?? []) {
    if (f.operator !== "eq" || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(f.field)) continue;
    const v = f.value;
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
    // Realtime's filter grammar has no quoting: skip a value it would misread, or an empty one.
    if (typeof v === "string" && (v === "" || /[,()]/.test(v))) continue;
    return `${f.field}=eq.${String(v)}`;
  }
  return undefined;
}
const warnedRealtime = new Set<string>();

/**
 * The Supabase data provider. Reads and writes go through the client you
 * pass, under that client's session and RLS.
 *
 * Writes never report a save that did not happen:
 * - `update` and `deleteOne` ask for the affected rows. Zero rows is a
 *   `DataWriteError`: the row is read back, and still visible means
 *   `forbidden` (RLS or a trigger refused the change), no longer visible
 *   means `gone`.
 * - Database errors on writes are thrown as `DataWriteError` with the
 *   outcome their code means (`writeOutcomeFromCode`) and the code kept on
 *   `error.code`.
 * - Recycle-bin tables (`binTables`) succeed when the row leaves the
 *   caller's view.
 *
 * Reads are unchanged: errors are thrown as an `Error` carrying `code`.
 */
export function createSupabaseProvider(
  client: SupabaseClientInput,
  options: SupabaseProviderOptions = {},
): DataProvider {
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function applyFilters(
    query: SupabaseQueryBuilder,
    filters: FilterParam[] | undefined,
  ): SupabaseQueryBuilder {
    if (!filters) return query;
    for (const f of filters) {
      switch (f.operator) {
        case "eq":
          query = query.eq(f.field, f.value);
          break;
        case "neq":
          query = query.neq(f.field, f.value);
          break;
        case "gt":
          query = query.gt(f.field, f.value);
          break;
        case "lt":
          query = query.lt(f.field, f.value);
          break;
        case "gte":
          query = query.gte(f.field, f.value);
          break;
        case "lte":
          query = query.lte(f.field, f.value);
          break;
        case "contains":
          query = query.ilike(f.field, `%${escapeIlike(String(f.value))}%`);
          break;
        case "in":
          query = query.in(f.field, f.value);
          break;
        case "is_null":
          query = query.is(f.field, null);
          break;
        case "is_not_null":
          query = query.not(f.field, "is", null);
          break;
        case "between": {
          const [lo, hi] = f.value;
          query = query.gte(f.field, lo).lte(f.field, hi);
          break;
        }
        default:
          throw new Error(`[SupabaseProvider] Unknown filter operator "${(f as FilterParam).operator}"`);
          break;
      }
    }
    return query;
  }

  const maxPerPage = options.maxPerPage ?? 1000;
  // Resources found to have no "id" column for the default orderKey.
  const keylessResources = new Set<string>();

  /** Tell `onReadError` (sync or async; its failure is swallowed), then throw. */
  async function reportReadError(
    error: DataReadError,
    resource: string,
    operation: "getList" | "getOne" | "getMany",
  ): Promise<never> {
    try {
      await Promise.resolve(options.onReadError?.(error, { resource, operation }));
    } catch {
      // A logging hook never changes what the caller is told.
    }
    throw error;
  }

  /** A failed read, as a `DataReadError` with a message users can be shown. */
  async function throwIfReadError(
    result: { error: unknown },
    resource: string,
    operation: "getList" | "getOne" | "getMany",
  ): Promise<void> {
    if (!result.error) return;
    const raw = result.error as { message?: string; code?: string };
    const code = typeof raw.code === "string" ? raw.code : undefined;
    const outcome = readOutcomeFromCode(code);
    const error = new DataReadError(
      outcome,
      readFailureMessage(outcome, nounFor(resource), operation === "getOne", configFor(resource).nounPlural),
      { code, cause: result.error },
    );
    await reportReadError(error, resource, operation);
  }

  // ---------------------------------------------------------------------------
  // Write helpers
  // ---------------------------------------------------------------------------

  /** The table or view `name` names, in its schema: `public` through `from(table)`, any other through `schema(s).from(table)`. */
  function relation(name: string): SupabaseQueryBuilder {
    const { schema, table } = splitRelation(name);
    if (schema === "public") return client.from(table) as SupabaseQueryBuilder;
    // A client without schema() (not supabase-js) gets the name as given, as before.
    if (typeof client.schema !== "function") return client.from(name) as SupabaseQueryBuilder;
    return client.schema(schema).from(table) as SupabaseQueryBuilder;
  }

  const from = (resource: string) => relation(resource);

  /** How a list of `resource` counts its total: the caller's, else the resource's, else exact. */
  function countMode(resource: string, params: ListParams): CountMode {
    return params.count ?? configFor(resource).count ?? "exact";
  }

  /** The relation PostgREST names in errors about a read of `resource`: its view, function or table. */
  function readName(resource: string): string {
    const source = configFor(resource).source;
    return typeof source === "string" ? source : source ? source.rpc : resource;
  }

  /**
   * The values a create or update sends to the table: with `writeColumns`,
   * only those; for an update of a sourced resource without them, only the
   * columns the table's row has, so read-only columns from a view never go out.
   */
  async function tableValues(
    resource: string,
    values: Record<string, unknown>,
    id?: Identifier,
  ): Promise<Record<string, unknown>> {
    const config = configFor(resource);
    if (config.writeColumns) {
      const allowed = new Set(config.writeColumns);
      return Object.fromEntries(Object.entries(values).filter(([key]) => allowed.has(key)));
    }
    if (!config.source || id === undefined) return values;
    const row = await readBack(resource, id);
    if (!row) return values;
    return Object.fromEntries(Object.entries(values).filter(([key]) => key in row));
  }

  /** A read of `resource` from its configured source (table, view or function), with its default columns. */
  function read(
    resource: string,
    columns: string | undefined,
    count?: "exact" | "estimated" | "planned",
  ): SupabaseQueryBuilder {
    const config = configFor(resource);
    const cols = columns ?? config.select ?? "*";
    const source = config.source;
    if (source && typeof source === "object") {
      if (!client.rpc) {
        throw new DataReadError("error", `[SupabaseProvider] "${resource}" reads from ${source.rpc}(), but the client has no rpc.`);
      }
      const builder = client.rpc(source.rpc, source.args?.() ?? {}, count ? { count } : undefined) as SupabaseQueryBuilder;
      return builder.select(cols);
    }
    const table = relation(source ?? resource);
    return count ? table.select(cols, { count }) : table.select(cols);
  }
  /** A resource's rules, keyed either way: `"public.goals"` finds `goals`, and `goals` finds `"public.goals"`. */
  const configFor = (resource: string): SupabaseResourceConfig =>
    options.resources?.[resource] ?? options.resources?.[otherSpelling(resource)] ?? {};
  const nounFor = (resource: string) => configFor(resource).noun ?? "record";

  /**
   * Rows this client wrote just now, `${resource}\0${id}` → the realtime event their write sends
   * and when. Each channel (one per filter) skips the first matching event once, so a later change
   * to the same row (a trigger, a job, another person) is still heard.
   */
  const recentWrites = new Map<
    string,
    { eventType: "INSERT" | "UPDATE" | "DELETE"; at: number; heardOn: Set<string>; openChannels: Set<object> }
  >();

  function noteWrite(event: WriteEvent): void {
    const now = Date.now();
    for (const [key, mark] of recentWrites) if (now - mark.at > REALTIME_ECHO_MS) recentWrites.delete(key);
    const eventType = event.kind === "create" ? "INSERT" : event.kind === "delete" ? "DELETE" : "UPDATE";
    // Only the channels open now carry this write's echo; one opened later never saw the write.
    const openChannels = new Set(
      [...sharedChannels.entries()].filter(([t]) => t.startsWith(`${event.resource}\u0000`)).map(([, c]) => c as object),
    );
    recentWrites.set(`${event.resource}\u0000${String(event.id)}`, { eventType, at: now, heardOn: new Set(), openChannels });
  }
  /** One realtime channel per resource and server filter, shared by every subscriber to it. */
  const sharedChannels = new Map<
    string,
    { listeners: Set<{ emit: (event: ResourceChangeEvent) => void; id?: Identifier }>; close: () => void }
  >();

  function isEcho(
    resource: string,
    id: unknown,
    eventType: SupabaseRealtimePayload["eventType"],
    topic: string,
    channelObject: object | undefined,
  ): boolean {
    if (!isIdentifier(id)) return false;
    const key = `${resource}\u0000${String(id)}`;
    const mark = recentWrites.get(key);
    // Only a channel that was open at the write carries its echo: one reopened on the same topic
    // since then is a different object and never saw it.
    if (!mark || mark.eventType !== eventType || mark.heardOn.has(topic) || !channelObject || !mark.openChannels.has(channelObject)) return false;
    if (Date.now() - mark.at > REALTIME_ECHO_MS) {
      recentWrites.delete(key);
      return false;
    }
    mark.heardOn.add(topic);
    return true;
  }

  function realtimeEnabled(resource: string): boolean {
    if (typeof client.channel !== "function") return false;
    const own = configFor(resource).realtime;
    if (own !== undefined) return own;
    const all = options.realtime;
    if (!all) return false;
    if (all === true) return true;
    return spellings(resource).some((name) => (typeof all === "function" ? all(name) : all.includes(name)));
  }

  function isBinTable(resource: string): boolean {
    const mode = configFor(resource).deleteMode;
    if (mode) return mode === "bin";
    const bin = options.binTables;
    if (!bin) return false;
    return spellings(resource).some((name) => (typeof bin === "function" ? bin(name) : bin.includes(name)));
  }

  /** Awaits a write-path query: its rows, or a `DataWriteError`. */
  async function run(query: SupabaseQueryBuilder): Promise<unknown[]> {
    let result: { data: unknown; error: unknown };
    try {
      result = (await query) as { data: unknown; error: unknown };
    } catch (error) {
      throw toDataWriteError(error);
    }
    if (result.error) throw toDataWriteError(result.error);
    if (Array.isArray(result.data)) return result.data;
    return result.data == null ? [] : [result.data];
  }

  async function isVisible(resource: string, id: Identifier): Promise<boolean> {
    return (await run(from(resource).select("id").eq("id", id))).length > 0;
  }

  async function readBack(resource: string, id: Identifier): Promise<BaseRecord | undefined> {
    return (await run(from(resource).select("*").eq("id", id)))[0] as BaseRecord | undefined;
  }

  function goneError(resource: string): DataWriteError {
    return new DataWriteError(
      "gone",
      `This ${nounFor(resource)} no longer exists, or you can no longer see it.`,
    );
  }

  /**
   * A write matched no rows: read the row back to say why. Still visible
   * means the change was refused; not visible means it is gone (deleted, or
   * hidden from this user — the two can't be told apart under RLS).
   */
  async function noRowsError(
    resource: string,
    id: Identifier,
    verb: "change" | "delete",
  ): Promise<DataWriteError> {
    let visible: boolean;
    try {
      visible = await isVisible(resource, id);
    } catch (error) {
      const cause = toDataWriteError(error);
      return new DataWriteError(
        cause.outcome === "unauthenticated" ? "unauthenticated" : "error",
        `This ${nounFor(resource)} was not ${verb === "change" ? "changed" : "deleted"}, and reading it back failed (${cause.message}).`,
        { code: cause.code, cause: error },
      );
    }
    if (visible) {
      return new DataWriteError("forbidden", `You can't ${verb} this ${nounFor(resource)}.`);
    }
    return goneError(resource);
  }

  async function prepare(
    resource: string,
    values: Record<string, unknown>,
    context: SupabaseWriteContext,
  ): Promise<Record<string, unknown>> {
    const rule = configFor(resource).prepare;
    if (!rule) return values;
    try {
      return await rule({ ...values }, context);
    } catch (error) {
      throw toDataWriteError(error);
    }
  }

  /** After a committed write. Never turns it into a failure. */
  async function committed(event: WriteEvent): Promise<void> {
    // Its realtime echo is this client's own write: it already refreshes through the write path.
    if (event.id != null) noteWrite(event);
    if (!options.onWrite) return;
    try {
      await options.onWrite(event);
    } catch (error) {
      console.error(`[SupabaseProvider] onWrite failed for "${event.resource}":`, error);
    }
  }

  // ---------------------------------------------------------------------------
  // DataProvider implementation
  // ---------------------------------------------------------------------------

  /** The search as PostgREST `or` clauses, or "" for none. */
  function searchClauses(resource: string, params: ListParams): string {
    const searchFields = configFor(resource).searchFields ?? params.search?.fields ?? [];
    if (!params.search || !params.search.query || searchFields.length === 0) return "";
    const escaped = escapeIlike(params.search.query);
    const safeFieldPattern = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
    return searchFields
      .filter((f) => safeFieldPattern.test(f))
      // Quoted, so commas, dots and parens in the query stay literal (also
      // when nested inside the keyset's `and(or(…))`).
      .map((f) => `${f}.ilike.${quoteFilterValue(`%${escaped}%`)}`)
      .join(",");
  }

  /** A cursor request this provider can't serve: `invalid`, with why as the cause. */
  function refuseCursor(resource: string, why: string): Promise<never> {
    return reportReadError(
      new DataReadError(
        "invalid",
        readFailureMessage("invalid", nounFor(resource), false, configFor(resource).nounPlural),
        { cause: new Error(`[SupabaseProvider] "${resource}": ${why}`) },
      ),
      resource,
      "getList",
    );
  }

  /**
   * One page by keyset: ordered by the sort column and then the key, the
   * rows after the cursor's row, plus one more to tell whether a next page
   * exists. Counted only on the first page.
   */
  async function getCursorPage(
    resource: string,
    params: ListParams,
    key: string | false,
  ): Promise<{ data: unknown[]; total: number; nextCursor: string | null; prevCursor: string | null }> {
    const { cursor } = params.pagination!;
    // The look-ahead row must fit under PostgREST's max-rows (maxPerPage), or
    // it is dropped and the list would end after one page. A keyset page can
    // be shorter than asked without skipping or repeating rows.
    const perPage = Math.max(1, Math.min(params.pagination!.perPage, maxPerPage - 1));
    if (!key) {
      return refuseCursor(resource, "cursor paging needs a unique key column to order by; its orderKey is false. Set orderKey to a unique, non-null column, or page by offset.");
    }
    if (!PLAIN_COLUMN.test(key)) return refuseCursor(resource, `the key column "${key}" can't be used in a cursor.`);
    const { columns, keyOrder } = sortColumns(params, key);
    const unplain = columns.find((c) => !PLAIN_COLUMN.test(c.field));
    if (unplain) return refuseCursor(resource, `cursor paging can sort only by a plain column, not "${unplain.field}".`);
    const sortFields = columns.map((c) => c.field);
    // One column keeps the cursor's original shape; several use `c`/`vs`.
    const shape = (values: CursorValue[]): Pick<CursorState, "s" | "o" | "v" | "c" | "vs"> =>
      columns.length === 0
        ? { s: null, o: keyOrder }
        : columns.length === 1
          ? { s: columns[0]!.field, o: columns[0]!.order, v: values[0] ?? null }
          : { s: null, o: "asc", c: columns.map((c) => ({ s: c.field, o: c.order })), vs: values };
    const sortId = JSON.stringify([columns.map((c) => [c.field, c.order]), keyOrder]);

    let after: CursorState | undefined;
    if (cursor) {
      after = decodeCursor(cursor);
      if (!after) return refuseCursor(resource, "the cursor is not one this provider made.");
      const made = cursorColumns(after);
      if (JSON.stringify([made.cols.map((c) => [c.s, c.o]), made.keyOrder]) !== sortId || after.k !== key) {
        return refuseCursor(resource, "the cursor was made for a different sort; start again from the first page (cursor: null).");
      }
    }

    const mode = countMode(resource, params);
    let query = read(resource, params.select, cursor || mode === "none" ? undefined : mode);
    query = applyFilters(query, params.filters);
    const search = searchClauses(resource, params);
    const keyset = after ? keysetClauses(after) : "";
    // Both are OR groups that must hold together: nest them in one `or`.
    if (search && keyset) query = query.or(`and(or(${search}),or(${keyset}))`);
    else if (search || keyset) query = query.or(search || keyset);

    // Going back reads the rows before the cursor in the reverse order (nearest first), then
    // turns them around.
    const back = after?.d === "b";
    for (const { field, order } of columns) {
      // Pinned to Postgres's default null placement, which the keyset assumes.
      const ascending = (order === "asc") !== back;
      query = query.order(field, { ascending, nullsFirst: !ascending });
    }
    query = query.order(key, { ascending: (keyOrder === "asc") !== back });
    query = query.range(0, perPage);

    const result = (await query) as unknown as { data: unknown[] | null; error: unknown; count?: number | null };
    await throwIfReadError(result, resource, "getList");
    const rows = (result.data ?? []) as Record<string, unknown>[];
    const more = rows.length > perPage;
    const page = rows.slice(0, perPage);
    if (back) page.reverse();
    // A cursor for the rows after or before `row`.
    const cursorAt = (row: Record<string, unknown> | undefined, direction?: "b"): string | null | false => {
      if (!row) return null;
      const id = row[key];
      if (!isIdentifier(id) || sortFields.some((f) => !(f in row))) return false;
      const values = sortFields.map((f) => row[f] ?? null);
      if (values.some((v) => v !== null && typeof v === "object")) return false;
      return encodeCursor({ ...shape(values as CursorValue[]), k: key, id, ...(direction ? { d: direction } : {}) });
    };
    // Forward: more after the last row when the look-ahead found one; rows before the first
    // whenever this wasn't the first page. Back: the mirror.
    const next = back ? cursorAt(page[page.length - 1]) : more ? cursorAt(page[page.length - 1]) : null;
    const prev = back ? (more ? cursorAt(page[0], "b") : null) : cursor ? cursorAt(page[0], "b") : null;
    if (next === false || prev === false) {
      const objectValued = sortFields.find((f) =>
        page.some((row) => f in row && row[f] !== null && typeof row[f] === "object"),
      );
      if (objectValued) {
        return refuseCursor(resource, `cursor paging can't sort by "${objectValued}": its values aren't plain (text, number, date, boolean).`);
      }
      const needed = [key, ...sortFields].map((f) => `"${f}"`);
      const list = needed.length === 1 ? needed[0] : `${needed.slice(0, -1).join(", ")} and ${needed[needed.length - 1]}`;
      return refuseCursor(resource, `the selected columns must include ${list} to page by cursor.`);
    }
    return {
      data: page,
      total: cursor || mode === "none" ? -1 : (result.count ?? 0),
      ...(!cursor && (mode === "estimated" || mode === "planned") ? { totalIsEstimate: true } : {}),
      nextCursor: next,
      prevCursor: prev,
    };
  }

  const provider: DataProvider = {
    async getList(resource, params) {
      // Refused, not cut short: a shorter page than the caller asked for
      // would shift every later page's boundary and skip or repeat rows.
      if (params.pagination && params.pagination.perPage > maxPerPage) {
        const { perPage } = params.pagination;
        await reportReadError(
          new DataReadError(
            "invalid",
            readFailureMessage("invalid", nounFor(resource), false, configFor(resource).nounPlural),
            {
              cause: new Error(
                `[SupabaseProvider] "${resource}" asked for ${perPage} rows per page; the most is ${maxPerPage} (maxPerPage). Ask for at most ${maxPerPage} and page through the rest.`,
              ),
            },
          ),
          resource,
          "getList",
        );
      }

      const configuredKey = configFor(resource).orderKey;
      if (params.pagination && params.pagination.cursor !== undefined) {
        return getCursorPage(resource, params, configuredKey === undefined ? "id" : configuredKey) as never;
      }
      const mode = countMode(resource, params);
      const run = (key: string | false) => {
        let query = read(resource, params.select, mode === "none" ? undefined : mode);

        query = applyFilters(query, params.filters);

        // Search — convert to OR of ilike. A resource's configured
        // `searchFields` win over the caller's.
        const clauses = searchClauses(resource, params);
        if (clauses) {
          query = query.or(clauses);
        }

        // Each sort column, then the key column, so equal sort values keep
        // one order across pages (otherwise a row can repeat on page 2 or be
        // skipped). An unsorted page is ordered by the key alone: without an
        // ORDER BY the database may return pages in any order.
        const requested = params.sorts && params.sorts.length > 0 ? params.sorts : params.sort ? [params.sort] : [];
        if (requested.length > 0 && key) {
          const { columns, keyOrder } = sortColumns(params, key);
          for (const { field, order } of columns) query = query.order(field, { ascending: order === "asc" });
          query = query.order(key, { ascending: keyOrder === "asc" });
        } else if (requested.length > 0) {
          for (const { field, order } of requested) query = query.order(field, { ascending: order === "asc" });
        } else if (params.pagination && key) {
          query = query.order(key, { ascending: true });
        }

        if (params.pagination) {
          const { page, perPage } = params.pagination;
          const from = (page - 1) * perPage;
          const to = from + perPage - 1;
          query = query.range(from, to);
        }

        return query as unknown as Promise<{
          data: unknown[];
          error: unknown;
          count?: number | null;
        }>;
      };

      // The default key ("id") is a guess: a view without that column reads
      // as before, without the key order, and is not ordered by it again.
      const guessKey = configuredKey === undefined && !keylessResources.has(resource);
      let result = await run(configuredKey ?? (keylessResources.has(resource) ? false : "id"));
      if (guessKey && isMissingColumn(result.error, readName(resource), "id")) {
        keylessResources.add(resource);
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[SupabaseProvider] "${resource}" has no "id" column, so its pages have no stable order. Set resources.${resource}.orderKey to a unique column (or false to silence this).`,
          );
        }
        result = await run(false);
      }
      await throwIfReadError(result, resource, "getList");

      return {
        data: result.data ?? [],
        total: mode === "none" ? -1 : (result.count ?? 0),
        ...(mode === "estimated" || mode === "planned" ? { totalIsEstimate: true } : {}),
      } as never;
    },

    async getOne(resource, params) {
      const result = (await read(resource, params.select)
        .eq("id", params.id)
        .single()) as { data: unknown; error: unknown };
      await throwIfReadError(result, resource, "getOne");
      return { data: result.data } as never;
    },

    async getMany(resource, params) {
      if (params.ids.length === 0) return { data: [] } as never;
      const result = (await read(resource, undefined)
        .in("id", params.ids)) as { data: unknown[]; error: unknown };
      await throwIfReadError(result, resource, "getMany");
      return { data: result.data ?? [] } as never;
    },

    async capabilities(resource?: string): Promise<ProviderCapabilities> {
      return {
        search: resource ? configFor(resource).searchFields?.length !== 0 : true,
        sort: true,
        filterOperators: SERVED_OPERATORS,
        bulkWrites: false,
        versionedWrites: false,
        compositeKeys: false,
        multiSort: true,
        create: true,
        delete: true,
        maxPerPage,
        softDelete: resource ? isBinTable(resource) : false,
        cursorPagination: resource ? configFor(resource).orderKey !== false : true,
        realtime: resource
          ? realtimeEnabled(resource)
          : typeof client.channel === "function" &&
            (!!options.realtime ||
              Object.values(options.resources ?? {}).some((r) => r.realtime === true)),
      };
    },

    subscribe(resource, params, callback) {
      if (!realtimeEnabled(resource)) {
        if (process.env.NODE_ENV !== "production" && !warnedRealtime.has(resource)) {
          warnedRealtime.add(resource);
          console.warn(
            typeof client.channel !== "function"
              ? `[SupabaseProvider] "${resource}" was subscribed to, but the client has no channel() (Supabase Realtime), so nothing will be reported.`
              : `[SupabaseProvider] "${resource}" was subscribed to, but realtime is off for it. Set resources.${resource}.realtime (or the realtime option) to true.`,
          );
        }
        return () => {};
      }
      const { schema, table } = splitRelation(resource);
      // One record is matched below, not with a server-side `id=eq.` filter, so it can share the
      // resource's channel. A list's first equality filter narrows the channel on the server.
      // Not for a resource read from a view or function: the filter may name a column only the view
      // has, and the channel watches the table.
      const serverFilter =
        params.id != null || configFor(resource).source !== undefined ? undefined : realtimeFilter(params.filters);
      const topic = `${resource}\u0000${serverFilter ?? ""}`;
      // The row is passed on only where it is the resource's own row: a resource read from a view
      // or function shows other columns, so its listeners refetch instead.
      const sendRecord = configFor(resource).source === undefined;
      let shared = sharedChannels.get(topic);
      if (!shared) {
        const listeners = new Set<{ emit: (event: ResourceChangeEvent) => void; id?: Identifier }>();
        // A unique topic: supabase-js hands back an existing channel for a topic already open.
        const channel = client.channel!(`genesis:${resource}:${++realtimeChannelSeq}`) as SupabaseRealtimeChannel;
        let subscribedOnce = false;
        let interrupted = false;
        const broadcast = (event: ResourceChangeEvent, rowId?: unknown) => {
          for (const l of listeners) {
            if (l.id != null && isIdentifier(rowId) && String(rowId) !== String(l.id)) continue;
            l.emit(event);
          }
        };
        const onChange = (payload: SupabaseRealtimePayload) => {
          // Realtime applies RLS to inserts and updates; a delete's old key goes to every
          // subscriber, so a delete passes on only its id.
          const row = payload.eventType === "DELETE" ? payload.old : payload.new;
          const id = row?.["id"];
          if (isEcho(resource, id, payload.eventType, topic, sharedChannels.get(topic))) return;
          const type =
            payload.eventType === "INSERT" ? "created" : payload.eventType === "UPDATE" ? "updated" : "deleted";
          const event: ResourceChangeEvent = isIdentifier(id)
            ? sendRecord && type !== "deleted" && row
              ? { type, id, record: row as BaseRecord }
              : { type, id }
            : { type };
          broadcast(event, id);
        };
        if (serverFilter) {
          // Only inserts are filtered. Realtime filters on the new row, so a filtered update would
          // never report a row leaving the list (status open → closed); and it never delivers
          // deletes through a filter. Both come unfiltered.
          channel.on("postgres_changes", { event: "INSERT", schema, table, filter: serverFilter }, onChange);
          channel.on("postgres_changes", { event: "UPDATE", schema, table }, onChange);
          channel.on("postgres_changes", { event: "DELETE", schema, table }, onChange);
        } else {
          channel.on("postgres_changes", { event: "*", schema, table }, onChange);
        }
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            // Back after a drop: changes made meanwhile were not sent.
            if (subscribedOnce && interrupted) broadcast({ type: "changed" });
            subscribedOnce = true;
            interrupted = false;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            interrupted = true;
          }
        });
        shared = {
          listeners,
          close: () => {
            try {
              const done =
                typeof client.removeChannel === "function" ? client.removeChannel(channel) : channel.unsubscribe?.();
              // A failed removal (socket already gone) is nothing to report.
              if (done && typeof (done as Promise<unknown>).catch === "function") {
                (done as Promise<unknown>).catch(() => {});
              }
            } catch {
              // As above.
            }
          },
        };
        sharedChannels.set(topic, shared);
      }
      let closed = false;
      const listener = {
        id: params.id,
        emit: (event: ResourceChangeEvent) => {
          if (closed) return;
          try {
            callback(event);
          } catch (error) {
            console.error(`[SupabaseProvider] a realtime callback for "${resource}" threw:`, error);
          }
        },
      };
      shared.listeners.add(listener);
      const mine = shared;
      return () => {
        if (closed) return;
        closed = true;
        mine.listeners.delete(listener);
        if (mine.listeners.size === 0 && sharedChannels.get(topic) === mine) {
          sharedChannels.delete(topic);
          mine.close();
        }
      };
    },

    async create(resource, params) {
      const row = await tableValues(
        resource,
        await prepare(resource, params.data as Record<string, unknown>, { resource, action: "create" }),
      );
      const override = configFor(resource).create;
      let record: BaseRecord;
      if (override) {
        let returned: BaseRecord | Identifier;
        try {
          returned = await override(row);
        } catch (error) {
          throw toDataWriteError(error);
        }
        if (isIdentifier(returned)) {
          // The row exists from here on. A failed read-back must not report
          // the create as failed: the user would retry and make a second one.
          record = (await readBack(resource, returned).catch(() => undefined)) ?? { id: returned };
        } else if (returned && typeof returned === "object" && isIdentifier(returned.id)) {
          record = returned;
        } else {
          throw new DataWriteError(
            "error",
            `[SupabaseProvider] The create rule for "${resource}" returned neither the new row nor its id.`,
          );
        }
      } else {
        const rows = await run(from(resource).insert(row).select("*").single());
        record = rows[0] as BaseRecord;
      }
      await committed({ resource, kind: "create", id: record.id, record });
      return { data: record } as never;
    },

    async update(resource, params) {
      const { id } = params;
      const row = await tableValues(
        resource,
        await prepare(resource, params.data as Record<string, unknown>, { resource, action: "update", id }),
        id,
      );
      const override = configFor(resource).update;
      let record: BaseRecord;
      if (override) {
        let returned: BaseRecord | Identifier | boolean | null | undefined | void;
        try {
          returned = await override(id, row);
        } catch (error) {
          throw toDataWriteError(error);
        }
        const result: unknown = returned;
        if (result == null || result === false) throw await noRowsError(resource, id, "change");
        if (isIdentifier(result) || result === true) {
          // The change committed; a failed read-back still reports it saved.
          const readId = result === true ? id : result;
          record = (await readBack(resource, readId).catch(() => undefined)) ?? { ...row, id: readId };
        } else if (typeof result === "object") {
          record = { id, ...(result as Record<string, unknown>) } as BaseRecord;
        } else {
          throw new DataWriteError(
            "error",
            `[SupabaseProvider] The update rule for "${resource}" returned neither the row, its id, nor nothing.`,
          );
        }
      } else {
        const rows = await run(from(resource).update(row).eq("id", id).select("*"));
        if (rows.length === 0) throw await noRowsError(resource, id, "change");
        record = rows[0] as BaseRecord;
      }
      await committed({ resource, kind: "update", id, record });
      return { data: record } as never;
    },

    async deleteOne(resource, params) {
      const { id } = params;
      let deletedId: Identifier = id;
      if (isBinTable(resource)) {
        // A binned delete reports zero rows whether or not it worked, so the
        // answer comes from visibility before and after.
        if (!(await isVisible(resource, id))) throw goneError(resource);
        await run(from(resource).delete().eq("id", id));
        let stillVisible: boolean;
        try {
          stillVisible = await isVisible(resource, id);
        } catch (error) {
          const cause = toDataWriteError(error);
          throw new DataWriteError(
            "error",
            `The ${nounFor(resource)} may not have been deleted: checking it failed (${cause.message}).`,
            { code: cause.code, cause: error },
          );
        }
        if (stillVisible) {
          throw new DataWriteError("forbidden", `You can't delete this ${nounFor(resource)}.`);
        }
      } else {
        const rows = await run(from(resource).delete().eq("id", id).select("id"));
        if (rows.length === 0) throw await noRowsError(resource, id, "delete");
        const returnedId = (rows[0] as { id?: unknown }).id;
        if (isIdentifier(returnedId)) deletedId = returnedId;
      }
      await committed({ resource, kind: "delete", id: deletedId });
      return { data: { id: deletedId } };
    },

    toFormValues(resource, record) {
      const map = configFor(resource).toFormValues;
      return map ? map(record) : record;
    },

    invalidates(event) {
      const keys = configFor(event.resource).invalidates;
      if (!keys) return [];
      return typeof keys === "function" ? keys(event) : keys;
    },
  };

  // How many write marks are held, for tests of the pruning. Not part of the provider contract.
  Object.defineProperty(provider, "__recentWriteCount", { value: () => recentWrites.size, enumerable: false });
  return provider;
}
