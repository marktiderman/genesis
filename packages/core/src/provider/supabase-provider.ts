import type {
  DataProvider,
  FilterParam,
} from "./types";

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

function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

export function createSupabaseProvider(client: SupabaseClientInput): DataProvider {
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

  function throwIfError(result: { error: unknown }): void {
    if (result.error) {
      const pgError = result.error as { message?: string; code?: string; hint?: string };
      const message = pgError.message ?? String(result.error);
      const err = new Error(message, { cause: result.error });
      Object.assign(err, { code: pgError.code, hint: pgError.hint });
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // DataProvider implementation
  // ---------------------------------------------------------------------------

  const provider: DataProvider = {
    async getList(resource, params) {
      let query = (client.from(resource) as SupabaseQueryBuilder).select(
        params.select ?? "*",
        { count: "exact" },
      );

      query = applyFilters(query, params.filters);

      // Search — convert to OR of ilike.
      if (params.search && params.search.query && params.search.fields.length > 0) {
        const escaped = escapeIlike(params.search.query);
        const safeFieldPattern = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;
        const clauses = params.search.fields
          .filter((f) => safeFieldPattern.test(f))
          .map((f) => `${f}.ilike.%${escaped}%`)
          .join(",");
        if (clauses) {
          query = query.or(clauses);
        }
      }

      // Sort.
      if (params.sort) {
        query = query.order(params.sort.field, {
          ascending: params.sort.order === "asc",
        });
      }

      // Pagination (offset).
      if (params.pagination) {
        const { page, perPage } = params.pagination;
        const from = (page - 1) * perPage;
        const to = from + perPage - 1;
        query = query.range(from, to);
      }

      const result = (await query) as {
        data: unknown[];
        error: unknown;
        count?: number | null;
      };
      throwIfError(result);

      return { data: result.data ?? [], total: result.count ?? 0 } as never;
    },

    async getOne(resource, params) {
      const result = (await (client.from(resource) as SupabaseQueryBuilder)
        .select(params.select ?? "*")
        .eq("id", params.id)
        .single()) as { data: unknown; error: unknown };
      throwIfError(result);
      return { data: result.data } as never;
    },

    async getMany(resource, params) {
      if (params.ids.length === 0) return { data: [] } as never;
      const result = (await (client.from(resource) as SupabaseQueryBuilder)
        .select("*")
        .in("id", params.ids)) as { data: unknown[]; error: unknown };
      throwIfError(result);
      return { data: result.data ?? [] } as never;
    },

    async create(resource, params) {
      const result = (await (client.from(resource) as SupabaseQueryBuilder)
        .insert(params.data as Record<string, unknown>)
        .select("*")
        .single()) as { data: unknown; error: unknown };
      throwIfError(result);
      return { data: result.data } as never;
    },

    async update(resource, params) {
      const result = (await (client.from(resource) as SupabaseQueryBuilder)
        .update(params.data as Record<string, unknown>)
        .eq("id", params.id)
        .select("*")
        .single()) as { data: unknown; error: unknown };
      throwIfError(result);
      return { data: result.data } as never;
    },

    async deleteOne(resource, params) {
      const result = (await (client.from(resource) as SupabaseQueryBuilder)
        .delete()
        .eq("id", params.id)
        .select("id")
        .single()) as { data: { id: string | number } | null; error: unknown };
      throwIfError(result);
      if (!result.data) {
        throw new Error(`[SupabaseProvider] Delete failed: no row found with id "${params.id}" in "${resource}"`);
      }
      return { data: result.data };
    },
  };

  return provider;
}
