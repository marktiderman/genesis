// The rows a link's picker offers (docs/RESOURCE-VIEW.md, "Links in forms"): the linked resource
// listed through the data provider, so row-level security decides what the viewer can pick, with
// the picker's filters (the linked view's scope and default filter), searched and paged on the
// server, a page at a time. Web's RelationField and native's link picker both draw it.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDataProvider } from "../provider/context";
import type { BaseRecord, FilterParam, SortParam } from "../provider/types";
import { useInfiniteResource } from "./use-infinite-resource";
import { relationNamingField } from "./use-relation-label";

// Field names only go into `select` and `sort`, so nothing else rides along in the request.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NAMING = /^(name|title|label|full_name|display_name)$/;

export interface LinkTarget {
  /** The linked resource. */
  resource: string;
  /** The linked field the link stores. Default `id`. */
  field?: string | undefined;
  /** The linked field that names a row. Default: the provider's `describe`, else a name-like field. */
  labelField?: string | undefined;
  /** The linked fields a search matches. Default: the naming field. */
  searchFields?: readonly string[] | undefined;
  /**
   * The order rows are listed in (a `position`), then the key. Default: by the naming field, then
   * the key. A view's link passes its `orderBy` (`link.orderBy`, or the linked view's for `"view"`).
   */
  orderBy?: { readonly field: string; readonly direction?: "asc" | "desc" | undefined; readonly nulls?: "first" | "last" | undefined } | undefined;
}

export interface UseLinkOptionsOptions {
  /** Filters every request carries: the linked view's scope and default filter, the link's own. */
  filters?: FilterParam[] | undefined;
  /** What the person typed. Sent to the server (`search`), never matched against loaded rows. */
  search?: string | undefined;
  /** Rows per page. Default 25. */
  perPage?: number | undefined;
  /** Default true. A picker passes false until it opens, so a closed form asks for nothing. */
  enabled?: boolean | undefined;
  /**
   * The words for a row whose naming field is empty: a picker passes its catalogue's
   * (`common.untitled`). Default "Untitled". Never the row's raw key.
   */
  untitled?: string | undefined;
}

/** One row a picker offers: the key it stores and the words it shows. */
export interface LinkOption {
  /** The linked row's key, as the row holds it (text or a number). */
  value: string | number;
  label: string;
}

export interface UseLinkOptionsReturn {
  options: LinkOption[];
  /** The naming field used, once known. */
  labelField: string | undefined;
  /** Whether a search can be sent: false when nothing names the rows. */
  searchable: boolean;
  /** The first page is loading. */
  isLoading: boolean;
  isError: boolean;
  /** More rows than are loaded match. */
  hasMore: boolean;
  /** Loads the next page. Does nothing while one loads or none is left. */
  loadMore: () => void;
  isLoadingMore: boolean;
}

function words(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

/**
 * The rows a link can point at, for a picker: listed through the data provider with `filters`,
 * searched on the server with `search` across `searchFields` (else the naming field), sorted by
 * `orderBy` (else the naming field) then the key, `perPage` at a time (`loadMore` for the next). A large table is
 * never loaded whole. Each option is the row's key and its words; a row with no words shows
 * `untitled`, never its key.
 */
export function useLinkOptions(target: LinkTarget, options: UseLinkOptionsOptions = {}): UseLinkOptionsReturn {
  const { filters, search = "", perPage = 25, enabled = true, untitled = "Untitled" } = options;
  const provider = useDataProvider();
  const field = target.field ?? "id";

  // The naming field: the target's, else `describe`'s (shared with a link's words).
  const named = useQuery({
    queryKey: [target.resource, "naming-field"],
    enabled: enabled && !target.labelField,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => (await relationNamingField(provider, target.resource)) ?? null,
  });
  const labelField = target.labelField ?? named.data ?? undefined;
  const settled = Boolean(target.labelField) || named.isFetched;
  const naming = labelField && IDENTIFIER.test(labelField) ? labelField : undefined;
  const searchFields = useMemo(
    () => (target.searchFields?.length ? [...target.searchFields] : naming ? [naming] : []).filter((f) => IDENTIFIER.test(f)),
    // By value: a caller's inline list is one list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(target.searchFields ?? null), naming],
  );

  // The naming field the list is sorted by: known at once when the target names it, else set
  // below once `describe` answers, before the first request goes.
  // Then by the key: rows that share a name keep one order across pages, so offset paging never
  // skips or repeats one (a provider without `multiSort` sorts by the name only).
  // A caller's own order (a `position`) wins over the name: known at once, so it never waits on
  // `describe` to sort.
  const ordered = target.orderBy && IDENTIFIER.test(target.orderBy.field) ? target.orderBy : undefined;
  const orderField = ordered?.field;
  const orderDirection = ordered?.direction === "desc" ? "desc" : "asc";
  const orderNulls = ordered?.nulls === "first" || ordered?.nulls === "last" ? ordered.nulls : undefined;
  const sortsFor = (by: string, order: "asc" | "desc" = "asc", nulls?: "first" | "last"): SortParam[] => {
    const first: SortParam = { field: by, order, ...(nulls ? { nulls } : {}) };
    return by === field || !IDENTIFIER.test(field) ? [first] : [first, { field, order: "asc" }];
  };
  const sortBy = orderField ?? naming;
  const sortKey = sortBy ? `${sortBy}:${orderField ? orderDirection : "asc"}:${(orderField && orderNulls) || ""}` : undefined;
  const sorts = sortBy ? sortsFor(sortBy, orderField ? orderDirection : "asc", orderField ? orderNulls : undefined) : undefined;
  const [sortedBy, setSortedBy] = useState<string | undefined>(sortKey);
  const list = useInfiniteResource<BaseRecord>(target.resource, {
    ...(filters ? { defaultFilters: filters } : {}),
    perPage,
    ...(naming && IDENTIFIER.test(field) ? { select: `${field},${naming}` } : {}),
    ...(sorts ? { defaultSorts: sorts } : {}),
    searchFields,
    // Not before the naming field is known, so the first request is already sorted and narrowed.
    enabled: enabled && settled && (!sortKey || sortedBy === sortKey),
  });

  // The sort and the search follow the order (the caller's, else the naming field) and what the
  // person typed.
  const { setSorts, setSearch } = list;
  useEffect(() => {
    if (!sortBy) return;
    setSorts(sortsFor(sortBy, orderField ? orderDirection : "asc", orderField ? orderNulls : undefined));
    setSortedBy(sortKey);
    // sortsFor reads only `field`; sortKey follows sortBy, the direction and where empty values go.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, field, setSorts]);
  useEffect(() => {
    setSearch(searchFields.length ? search.trim() : "");
  }, [search, searchFields.length, setSearch]);

  const rows = list.rows;
  const linkOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: LinkOption[] = [];
    for (const row of rows as Record<string, unknown>[]) {
      const key = row[field];
      if (typeof key !== "string" && !(typeof key === "number" && Number.isFinite(key))) continue;
      if (seen.has(String(key))) continue;
      seen.add(String(key));
      const name = naming ? row[naming] : row[Object.keys(row).find((k) => NAMING.test(k)) ?? ""];
      // A row with no words shows `untitled`, never its raw key.
      out.push({ value: key, label: words(name) ?? untitled });
    }
    return out;
  }, [rows, field, naming, untitled]);

  return {
    options: linkOptions,
    labelField: naming,
    searchable: searchFields.length > 0,
    isLoading: enabled && (!settled || list.query.isPending),
    isError: list.query.isError,
    hasMore: list.hasNextPage,
    loadMore: list.fetchNextPage,
    isLoadingMore: list.isFetchingNextPage,
  };
}
