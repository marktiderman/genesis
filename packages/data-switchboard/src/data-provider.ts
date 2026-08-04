// ---------------------------------------------------------------------------
// createSwitchboardProvider — the bridge from the Genesis `DataProvider`
// interface (what @marktiderman/genesis-core's useResource/useOne call) onto
// a Switchboard `ResourceClient`.
//
// Moved here from apps/dashboard/app/lib/switchboard-provider.ts (WC46/U4) so
// any Genesis-core consumer can put a Switchboard behind its data plane, not
// just the dashboard. `@marktiderman/genesis-core` is a peer dependency, used
// type-only (see package.json) — this package stays runnable in Node/Deno/RN
// without it at runtime.
//
// TWO discipline invariants (no ducttape, no silent narrowing):
//   1. FAIL LOUD. `where`/`whereIn` express equality + membership filters,
//      one sort, and a limit/offset window — nothing else. Any request this
//      can't express (a non-eq/in operator, a `select`, a `search`) would be
//      SILENTLY DROPPED if mapped best-effort. Instead we throw a clear Error
//      naming the unsupported feature, so a future consumer that needs it
//      extends the switchboard query API rather than getting wrong data.
//   2. SANITIZE ERRORS. A raw Supabase/Postgrest (or Airtable/Notion) error
//      can leak table, column, or RLS-policy identifiers into the UI. Every
//      delegate call is wrapped: the raw error is `console.error`-logged for
//      the developer, and a generic Error is rethrown so useResource surfaces
//      a clean, non-leaky message.
// ---------------------------------------------------------------------------

import type {
  BaseRecord,
  CreateParams,
  CreateResult,
  DataProvider,
  DeleteParams,
  DeleteResult,
  GetManyParams,
  GetManyResult,
  GetOneParams,
  GetOneResult,
  ListParams,
  ListResult,
  SortParam,
  UpdateParams,
  UpdateResult,
} from "@marktiderman/genesis-core/provider";
import type { Switchboard } from "./resolver";
import type { QueryOptions } from "./types";

/** The single user-facing message every failure collapses to (no raw DB detail). */
const GENERIC_ERROR_MESSAGE = "Couldn't load data. Please retry.";

/**
 * Run a switchboard call, sanitizing any failure. The raw error is logged for
 * the developer; a generic Error is rethrown so the UI never renders a raw
 * Supabase/Postgrest message. Fail-loud MAPPING errors (thrown synchronously by
 * the builders below, before the delegate runs) are NOT caught here — those are
 * programmer-facing contract violations that must surface verbatim.
 */
async function sanitize<T>(op: string, resource: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (rawError) {
    // eslint-disable-next-line no-console -- developer observability; the raw
    // error is intentionally kept OUT of the rethrown (user-facing) message.
    console.error(`[switchboard-data-provider] ${op} failed on "${resource}":`, rawError);
    throw new Error(GENERIC_ERROR_MESSAGE);
  }
}

/**
 * Translate the DataProvider `ListParams` into a switchboard `QueryOptions`,
 * throwing loudly on anything the switchboard query API cannot express. No
 * silent narrowing: an unrepresentable request is a hard error, not wrong data.
 */
function toQueryOptions(resource: string, params: ListParams): QueryOptions {
  const where: Record<string, unknown> = {};
  const whereIn: Record<string, readonly unknown[]> = {};

  for (const filter of params.filters ?? []) {
    if (filter.operator === "eq") {
      where[filter.field] = filter.value;
      continue;
    }
    if (filter.operator === "in") {
      // Repeated `in` filters on the same field AND together (same as any
      // other pair of filters) — intersect rather than overwrite, or a
      // second `in` on a field silently drops the first's constraint.
      const existing = whereIn[filter.field];
      whereIn[filter.field] = existing
        ? existing.filter((v) => filter.value.includes(v as string | number | boolean))
        : filter.value;
      continue;
    }
    throw new Error(
      `switchboard-data-provider: unsupported filter operator "${filter.operator}" on ` +
        `"${resource}" — the switchboard query API expresses equality (eq) and membership (in) ` +
        `filters only. Extend QueryOptions (and the adapters) before using this operator.`,
    );
  }

  // `select` (Supabase select/join syntax) is not expressible via the
  // switchboard — the adapters always `select("*")`. A non-empty select would be
  // silently ignored, so reject it.
  if (params.select) {
    throw new Error(
      `switchboard-data-provider: \`select\` ("${params.select}") is not supported on ` +
        `"${resource}" — the switchboard reads whole rows. Remove the select or extend the adapters.`,
    );
  }

  // Multi-field text search has no switchboard equivalent (QueryOptions has no
  // search primitive). Reject rather than drop it.
  if (params.search && params.search.query) {
    throw new Error(
      `switchboard-data-provider: text \`search\` is not supported on "${resource}" — ` +
        `the switchboard query API has no search primitive. Extend QueryOptions before using search.`,
    );
  }

  const opts: {
    where?: Record<string, unknown>;
    whereIn?: Record<string, readonly unknown[]>;
    orderBy?: string;
    direction?: "asc" | "desc";
    limit?: number;
    offset?: number;
  } = {};

  if (Object.keys(where).length > 0) opts.where = where;
  if (Object.keys(whereIn).length > 0) opts.whereIn = whereIn;

  if (params.sort) {
    const sort: SortParam = params.sort;
    opts.orderBy = sort.field;
    opts.direction = sort.order;
  }

  if (params.pagination) {
    const { page, perPage } = params.pagination;
    // Gitdata markdown tables are meant to load whole folders then paginate in
    // the UI — truncating at useResource's defaultPerPage (25) hides rows.
    if (!resource.startsWith("gitdata_")) {
      opts.limit = perPage;
      if (page > 1) {
        // Postgres/PostgREST make no ordering guarantee absent an explicit
        // ORDER BY — an offset window without one can skip or repeat rows
        // across pages as the incidental row order shifts between requests.
        // Fail loud here (with a resource-aware message) rather than letting
        // an unsorted page-2+ request reach SupabaseAdapter's own guard.
        if (!params.sort) {
          throw new Error(
            `switchboard-data-provider: paginating past page 1 on "${resource}" requires an explicit sort ` +
              `(params.sort) — pagination without a stable order can skip or repeat rows across pages.`,
          );
        }
        opts.offset = (page - 1) * perPage;
      }
    }
  }

  return opts as QueryOptions;
}

/**
 * Build a `DataProvider` backed by a `Switchboard`. Reads route to the resolved
 * backing (Supabase live, Code mock); a Genesis-core consumer needs no change —
 * only the data plane beneath `useResource` is swapped.
 */
export function createSwitchboardProvider(sb: Switchboard): DataProvider {
  return {
    async getList<T extends BaseRecord = BaseRecord>(
      resource: string,
      params: ListParams,
    ): Promise<ListResult<T>> {
      // toQueryOptions may throw (fail-loud contract violation) — intentionally
      // OUTSIDE sanitize() so a programmer error surfaces verbatim, not as the
      // generic message.
      const opts = toQueryOptions(resource, params);
      if (typeof opts.offset === "number") {
        // Tier-B MERGE plans forward the SAME offset/limit to every source,
        // then union the per-source results — each source independently
        // skips `perPage` rows of ITS OWN data, which has no relationship to
        // the merged view's global page boundary. Reject rather than return
        // a page that's silently missing or duplicating rows; a merge-aware
        // rewrite (apply offset/limit after merging, not before) would need
        // to live in the resolver, not this translation layer.
        const plan = sb.resource(resource).plan();
        if (plan.mergeSources) {
          throw new Error(
            `switchboard-data-provider: pagination past page 1 is not supported on "${resource}" — it's a ` +
              `Tier-B merge plan (sources: ${plan.mergeSources.join(", ")}), and offset/limit forwarded to ` +
              `each source independently would not correspond to the merged view's global page boundary.`,
          );
        }
      }
      const rows = await sanitize("getList", resource, () => sb.resource(resource).query(opts));
      // The switchboard query API returns ROWS only — it has no server-side count
      // primitive (unlike PostgREST's `count: "exact"`). When this page came back
      // short of `perPage` (or there was no pagination at all), `rows.length`
      // offset-adjusted IS the true total — there's nothing more to fetch. When
      // the page came back FULL, we cannot tell whether more rows exist without a
      // second, unbounded query; `total` in that case is a LOWER BOUND (this
      // page's absolute row count), not a reliable "no more pages" signal. A
      // caller that needs an exact count on a full final page must extend
      // QueryOptions with a count-capable query.
      const total = params.pagination
        ? (params.pagination.page - 1) * params.pagination.perPage + rows.length
        : rows.length;
      return { data: rows as T[], total };
    },

    async getOne<T extends BaseRecord = BaseRecord>(
      resource: string,
      params: GetOneParams,
    ): Promise<GetOneResult<T>> {
      if (params.select) {
        throw new Error(
          `switchboard-data-provider: \`select\` ("${params.select}") is not supported on getOne ` +
            `for "${resource}" — the switchboard reads whole rows. Remove the select or extend the adapters.`,
        );
      }
      const row = await sanitize("getOne", resource, () =>
        sb.resource(resource).get(String(params.id)),
      );
      if (row === null) {
        throw new Error(`switchboard-data-provider: no "${resource}" row with id "${params.id}".`);
      }
      return { data: row as T };
    },

    async getMany<T extends BaseRecord = BaseRecord>(
      resource: string,
      params: GetManyParams,
    ): Promise<GetManyResult<T>> {
      if (params.ids.length === 0) return { data: [] };
      const rows = await sanitize("getMany", resource, () =>
        sb.resource(resource).query({ whereIn: { id: params.ids } }),
      );
      return { data: rows as T[] };
    },

    async create<T extends BaseRecord = BaseRecord>(
      resource: string,
      params: CreateParams<T>,
    ): Promise<CreateResult<T>> {
      const created = await sanitize("create", resource, () =>
        sb.resource(resource).create(params.data as Record<string, unknown>),
      );
      return { data: created as T };
    },

    async update<T extends BaseRecord = BaseRecord>(
      resource: string,
      params: UpdateParams<T>,
    ): Promise<UpdateResult<T>> {
      const updated = await sanitize("update", resource, () =>
        sb.resource(resource).update(String(params.id), params.data as Record<string, unknown>),
      );
      return { data: updated as T };
    },

    async deleteOne(resource: string, params: DeleteParams): Promise<DeleteResult> {
      await sanitize("deleteOne", resource, () => sb.resource(resource).delete(String(params.id)));
      return { data: { id: params.id } };
    },
  };
}
