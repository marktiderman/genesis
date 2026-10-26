// ---------------------------------------------------------------------------
// Query keys (README "Query keys")
//
// One place that builds every cache key, so a write invalidates what it made
// stale and nothing shows across people. Keys are `[domain, kind, fields]`:
// TanStack matches keys by prefix and matches objects by their fields, so
// `[domain]` and `[domain, kind]` invalidate everything under them, and
// `where({...})` reaches keys by any field, including one person inside a
// multi-person key.
//
// App keys are scoped to the signed-in viewer by default: `for({ viewer })`
// is the only way to build one, and the scope (viewer, group, day) is part of
// the fields.
// ---------------------------------------------------------------------------

import type { Query } from "@tanstack/react-query";
import type { Identifier, ListParams } from "./provider/types";

/** Who and when a key is for. `viewer` is required; null means signed out. */
export interface KeyScope {
  viewer: string | null;
  /** The group, practice or space the screen is filtered to. */
  group?: string | null;
  /** The person-day (YYYY-MM-DD) a "today" read is for. */
  day?: string | null;
}

type Fields = Record<string, unknown>;
type QueryDefs = Record<string, (...args: never[]) => Fields>;

export type ScopedKey<D extends string, K> = readonly [D, K, Fields];

/** A filter for `invalidateQueries` / `removeQueries` / `getQueriesData`. */
export interface KeyFilter {
  predicate: (query: Query) => boolean;
}

export type QueryKeys<D extends string, Q extends QueryDefs> = {
  /** Every key in the domain: `[domain]`. */
  readonly all: readonly [D];
  /** Builds keys for one scope. */
  for(scope: KeyScope): { [K in keyof Q]: (...args: Parameters<Q[K]>) => ScopedKey<D, K> };
  /**
   * Keys whose fields match: an equal value, or an array field containing the
   * value (`where({ people: id })` finds every multi-person key with `id`).
   * Narrow to one kind with `{ kind }`.
   */
  where(match: Fields & { kind?: keyof Q }): KeyFilter;
} & { readonly [K in keyof Q]: { readonly all: readonly [D, K] } };

function scopeFields(scope: KeyScope): Fields {
  const out: Fields = { viewer: scope.viewer };
  if (scope.group !== undefined) out.group = scope.group;
  if (scope.day !== undefined) out.day = scope.day;
  return out;
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * The keys of one domain. Each query maps its arguments to the fields that
 * make it distinct (sort arrays so order never makes two keys):
 *
 * ```ts
 * export const worksheetKeys = defineQueryKeys("worksheet-items", {
 *   lessonParts: (people: string[]) => ({ people: [...people].sort() }),
 *   byEntry: (entryId: string) => ({ entryId }),
 * });
 * useQuery({ queryKey: worksheetKeys.for({ viewer }).lessonParts(people), … });
 * queryClient.invalidateQueries(worksheetKeys.where({ people: personId }));
 * queryClient.invalidateQueries({ queryKey: worksheetKeys.lessonParts.all });
 * ```
 */
export function defineQueryKeys<const D extends string, Q extends QueryDefs>(domain: D, queries: Q): QueryKeys<D, Q> {
  const keys: Record<string, unknown> = {
    all: [domain] as const,
    for(scope: KeyScope) {
      if (!scope || !("viewer" in scope)) throw new Error(`[genesis-core] ${domain} keys need a scope with a viewer`);
      const scoped = scopeFields(scope);
      return Object.fromEntries(
        Object.entries(queries).map(([kind, fields]) => [
          kind,
          (...args: never[]) => {
            const own = fields(...args);
            for (const name of Object.keys(scoped)) {
              if (name in own) throw new Error(`[genesis-core] ${domain}.${kind} can't name a field "${name}": it's the scope's`);
            }
            return [domain, kind, { ...own, ...scoped }] as const;
          },
        ]),
      );
    },
    where(match: Fields & { kind?: string }): KeyFilter {
      const { kind, ...fields } = match;
      return {
        predicate: (query) => {
          const [d, k, f] = query.queryKey as readonly unknown[];
          if (d !== domain || (kind !== undefined && k !== kind)) return false;
          if (!f || typeof f !== "object") return Object.keys(fields).length === 0;
          return Object.entries(fields).every(([name, want]) => {
            const have = (f as Fields)[name];
            return same(have, want) || (Array.isArray(have) && have.some((v) => same(v, want)));
          });
        },
      };
    },
  };
  for (const kind of Object.keys(queries)) {
    if (kind in keys) throw new Error(`[genesis-core] ${domain} can't have a query named "${kind}"`);
    keys[kind] = { all: [domain, kind] as const };
  }
  return keys as QueryKeys<D, Q>;
}

/**
 * The keys Genesis's own hooks cache a resource under, for writing into or
 * invalidating them by hand: `[resource]` covers them all.
 */
export function resourceKeys(resource: string) {
  return {
    all: [resource] as const,
    lists: [resource, "list"] as const,
    list: (params: ListParams) => [resource, "list", params] as const,
    details: [resource, "detail"] as const,
    detail: (id: Identifier | null | undefined, select?: string) => [resource, "detail", id, select] as const,
    infinite: (params: unknown) => [resource, "infinite", params] as const,
  };
}

