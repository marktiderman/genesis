import type {
  BaseRecord,
  DataProvider,
  FilterParam,
  Identifier,
  InvalidationKey,
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
  order(column: string, options?: { ascending?: boolean }): SupabaseQueryBuilder;
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
}

/** Options for `createSupabaseProvider`. All optional; none changes reads. */
export interface SupabaseProviderOptions {
  /**
   * Recycle-bin tables: their delete trigger turns a delete into a "binned"
   * mark and the binned row drops out of the caller's view (RLS or a view
   * filter). The database reports such a delete as zero rows, so for these
   * the provider checks the row is visible, deletes it, and reads it back:
   * gone from view is success, still visible is `forbidden`. A row that was
   * not visible beforehand is `gone`.
   */
  binTables?: readonly string[] | ((resource: string) => boolean);
  /** Per-resource rules, keyed by resource (table) name. */
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
}

/** A PostgREST "undefined column" error (42703) naming `column`. */
function isMissingColumn(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code !== "42703" || typeof message !== "string") return false;
  return new RegExp(`(^|[^A-Za-z0-9_])${column}([^A-Za-z0-9_]|$)`).test(message);
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

  const from = (resource: string) => client.from(resource) as SupabaseQueryBuilder;
  const configFor = (resource: string): SupabaseResourceConfig =>
    options.resources?.[resource] ?? {};
  const nounFor = (resource: string) => configFor(resource).noun ?? "record";

  function isBinTable(resource: string): boolean {
    const mode = configFor(resource).deleteMode;
    if (mode) return mode === "bin";
    const bin = options.binTables;
    if (!bin) return false;
    return typeof bin === "function" ? bin(resource) : bin.includes(resource);
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
      const run = (key: string | false) => {
        let query = (client.from(resource) as SupabaseQueryBuilder).select(
          params.select ?? "*",
          { count: "exact" },
        );

        query = applyFilters(query, params.filters);

        // Search — convert to OR of ilike. A resource's configured
        // `searchFields` win over the caller's.
        const searchFields = configFor(resource).searchFields ?? params.search?.fields ?? [];
        if (params.search && params.search.query && searchFields.length > 0) {
          const escaped = escapeIlike(params.search.query);
          const safeFieldPattern = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
          const clauses = searchFields
            .filter((f) => safeFieldPattern.test(f))
            .map((f) => `${f}.ilike.%${escaped}%`)
            .join(",");
          if (clauses) {
            query = query.or(clauses);
          }
        }

        // Sort, then the key column, so equal sort values keep one order
        // across pages (otherwise a row can repeat on page 2 or be skipped).
        // An unsorted page is ordered by the key alone: without an ORDER BY
        // the database may return pages in any order.
        if (params.sort) {
          query = query.order(params.sort.field, {
            ascending: params.sort.order === "asc",
          });
          if (key && key !== params.sort.field) query = query.order(key, { ascending: true });
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
      if (guessKey && isMissingColumn(result.error, "id")) {
        keylessResources.add(resource);
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[SupabaseProvider] "${resource}" has no "id" column, so its pages have no stable order. Set resources.${resource}.orderKey to a unique column (or false to silence this).`,
          );
        }
        result = await run(false);
      }
      await throwIfReadError(result, resource, "getList");

      return { data: result.data ?? [], total: result.count ?? 0 } as never;
    },

    async getOne(resource, params) {
      const result = (await (client.from(resource) as SupabaseQueryBuilder)
        .select(params.select ?? "*")
        .eq("id", params.id)
        .single()) as { data: unknown; error: unknown };
      await throwIfReadError(result, resource, "getOne");
      return { data: result.data } as never;
    },

    async getMany(resource, params) {
      if (params.ids.length === 0) return { data: [] } as never;
      const result = (await (client.from(resource) as SupabaseQueryBuilder)
        .select("*")
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
        multiSort: false,
        create: true,
        delete: true,
        maxPerPage,
        softDelete: resource ? isBinTable(resource) : false,
      };
    },

    async create(resource, params) {
      const row = await prepare(resource, params.data as Record<string, unknown>, {
        resource,
        action: "create",
      });
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
      const row = await prepare(resource, params.data as Record<string, unknown>, {
        resource,
        action: "update",
        id,
      });
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

  return provider;
}
