"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { DataTableColumn } from "../components/data/DataTable";
import type { DataFilterConfig } from "../components/data/DataFilters";
import type { ViewMode } from "../components/patterns/view-toggle";
import type { Identifier, FilterParam, SortParam } from "@marktiderman/genesis-core/provider";
import { useViewPreference } from "./use-view-preference";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Actions available inside column render functions. */
export interface ResourceActions<T> {
  update: (id: Identifier, data: Partial<T>) => Promise<T>;
  remove: (id: Identifier) => Promise<void>;
  refetch: () => void;
}

/** Column definition — full config form. */
export interface ResourceColumnDef<T> {
  key: string;
  header?: string;
  sortable?: boolean;
  hideBelow?: "sm" | "md" | "lg" | "xl";
  render?: (
    item: T,
    value: unknown,
    actions: ResourceActions<T>,
  ) => ReactNode;
}

export interface UseResourcePageProps<T> {
  /** Resource name — used for view-preference storage key. */
  resource?: string;
  /** The data to display (pre-fetched or from useResource). */
  data: T[];
  /** Total count of records (before client-side filtering). */
  total: number;
  /** Column definitions. Strings are expanded to `{ key, header, sortable }`. Omit to auto-generate from data keys. */
  columns?: Array<string | ResourceColumnDef<T>>;
  /** Status filter config. String = field name (options auto-derived). Object = explicit field + options. */
  statusFilter?: string | { field: string; options?: string[] };
  /** Fields to search across. Defaults to all string-valued fields in data. */
  searchFields?: string[];
  /** Initial filter params applied on mount. */
  initialFilters?: FilterParam[];
  /** Callback when filters change. */
  onFiltersChange?: (filters: FilterParam[]) => void;
  /** Default view mode. */
  defaultView?: ViewMode;
  /** Detail interaction mode. */
  detail?: "panel" | "modal" | "route" | "none";
  /** Field used for the detail title. Defaults to first column key. */
  titleField?: string;
  /** Field used for the detail subtitle. Defaults to second column key. */
  subtitleField?: string;
  /**
   * Server-controlled mode. The `data` handed in has ALREADY been searched,
   * sorted and paginated by the server, so this hook must not do any of it a
   * second time — `data` is returned untouched and `total` is the server's
   * `total` rather than the length of a client-filtered slice.
   *
   * Search / sort / status state is still tracked (the filter UI stays
   * controlled and `onFiltersChange` still fires) — only the client-side
   * transform of `data` is skipped. Defaults to `false`, so every existing
   * caller keeps its current client-side behavior.
   */
  controlled?: boolean;
}

export interface UseResourcePageReturn<T> {
  /** Filtered and sorted data for display. */
  data: T[];
  /** Total count (of the filtered set; the server's `total` when `controlled`). */
  total: number;
  /** Resolved column definitions. */
  columns: ResourceColumnDef<T>[];
  /** Columns mapped to DataTable format. */
  tableColumns: DataTableColumn<T>[];
  /** Ready-to-spread filter config for DataFilters. */
  filterConfig: {
    search: string;
    onSearchChange: (value: string) => void;
    sort: string;
    onSortChange: (sort: string) => void;
    sortOptions: Array<{ value: string; label: string }>;
    statusChips?: {
      options: string[];
      selected: string[];
      onChange: (values: string[]) => void;
    };
  };
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  search: string;
  setSearch: (value: string) => void;
  sort: SortParam | null;
  setSort: (sort: SortParam | null) => void;
  statusValue: string[];
  setStatusValue: (values: string[]) => void;
  selectedItem: T | null;
  setSelectedItem: (item: T | null) => void;
  detailOpen: boolean;
  setDetailOpen: (open: boolean) => void;
  handleRowClick: (item: T) => void;
  titleField: string;
  subtitleField: string;
  statusOptions: string[];
  hasActiveFilters: boolean;
  clearFilters: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a key string to title case.
 *   "created_at" → "Created At"
 *   "firstName"  → "First Name"
 */
export function titleCase(str: string): string {
  // Split on underscores, hyphens, and camelCase boundaries
  const words = str
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase → camel Case
    .replace(/[_-]/g, " ") // snake_case / kebab-case → spaces
    .split(/\s+/)
    .filter(Boolean);

  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Resolve column shorthand into full ResourceColumnDef objects.
 * - undefined + data present → auto-generate from Object.keys(data[0]), skip "id"
 * - undefined + empty data  → empty array
 * - string items            → { key, header: titleCase(key), sortable: true }
 * - object items            → defaults applied
 */
function resolveColumns<T>(
  columns: Array<string | ResourceColumnDef<T>> | undefined,
  data: T[],
): ResourceColumnDef<T>[] {
  if (columns === undefined) {
    if (data.length === 0) return [];
    const keys = Object.keys(data[0] as Record<string, unknown>).filter(
      (k) => k !== "id",
    );
    return keys.map((key) => ({
      key,
      header: titleCase(key),
      sortable: true,
    }));
  }

  return columns.map((col) => {
    if (typeof col === "string") {
      return { key: col, header: titleCase(col), sortable: true };
    }
    return {
      ...col,
      header: col.header ?? titleCase(col.key),
      sortable: col.sortable ?? true,
    };
  });
}

/**
 * Derive the list of string fields in a data set (for default search).
 */
function deriveStringFields<T>(data: T[]): string[] {
  if (data.length === 0) return [];
  const first = data[0] as Record<string, unknown>;
  return Object.keys(first).filter((k) => typeof first[k] === "string");
}

/**
 * Derive unique status options from a data array.
 */
function deriveStatusOptions<T>(data: T[], field: string): string[] {
  const values = new Set<string>();
  for (const item of data) {
    const val = (item as Record<string, unknown>)[field];
    if (val != null) values.add(String(val));
  }
  return Array.from(values).sort();
}

/**
 * Client-side text search across multiple fields.
 */
function matchesSearch<T>(
  item: T,
  query: string,
  fields: string[],
): boolean {
  if (!query) return true;
  const lower = query.toLowerCase();
  const record = item as Record<string, unknown>;
  return fields.some((f) => {
    const val = record[f];
    return val != null && String(val).toLowerCase().includes(lower);
  });
}

/**
 * Client-side sort comparator.
 */
function compareItems<T>(a: T, b: T, sort: SortParam): number {
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const va = ra[sort.field];
  const vb = rb[sort.field];
  const sa = va == null ? "" : String(va);
  const sb = vb == null ? "" : String(vb);
  const cmp = sa.localeCompare(sb, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return sort.order === "asc" ? cmp : -cmp;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useResourcePage<T = Record<string, unknown>>(
  props: UseResourcePageProps<T>,
): UseResourcePageReturn<T> {
  const {
    resource,
    data: rawData,
    total: rawTotal,
    columns: columnsProp,
    statusFilter: statusFilterProp,
    searchFields: searchFieldsProp,
    defaultView = "table",
    detail = "panel",
    titleField: titleFieldProp,
    subtitleField: subtitleFieldProp,
    initialFilters,
    onFiltersChange,
    controlled = false,
  } = props;

  // -- View mode --
  const [viewMode, setViewMode] = useViewPreference(
    resource ?? "resource-page",
    defaultView,
  );

  // -- Derive initial values from initialFilters --
  const initialSearch = useMemo(() => {
    if (!initialFilters) return "";
    const searchFilter = initialFilters.find(
      (f) => f.operator === "contains" && f.field === "__search__",
    );
    return searchFilter && "value" in searchFilter ? String(searchFilter.value ?? "") : "";
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

  const initialSort = useMemo(() => {
    if (!initialFilters) return null;
    const sortFilter = initialFilters.find(
      (f) => f.field === "__sort__",
    );
    if (!sortFilter || !("value" in sortFilter) || typeof sortFilter.value !== "string") return null;
    const [field, order] = sortFilter.value.split(":");
    if (!field || (order !== "asc" && order !== "desc")) return null;
    return { field, order } as SortParam;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

  const initialStatus = useMemo(() => {
    if (!initialFilters) return [];
    const statusFilter = initialFilters.find(
      (f) => f.operator === "in" && f.field === "__status__",
    );
    if (!statusFilter || statusFilter.operator !== "in") return [];
    return statusFilter.value.map((v) => String(v));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

  // -- Search --
  const [search, setSearch] = useState(initialSearch);

  // -- Sort --
  const [sort, setSort] = useState<SortParam | null>(initialSort);

  // -- Status filter --
  const [statusValue, setStatusValue] = useState<string[]>(initialStatus);

  // -- Detail panel --
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // -- Resolve columns --
  const resolvedColumns = useMemo(
    () => resolveColumns(columnsProp, rawData),
    [columnsProp, rawData],
  );

  // -- Title / subtitle fields --
  const titleField =
    titleFieldProp ?? resolvedColumns[0]?.key ?? "name";
  const subtitleField =
    subtitleFieldProp ?? resolvedColumns[1]?.key ?? "";

  // -- Status filter config --
  const statusFieldName = useMemo(() => {
    if (!statusFilterProp) return null;
    return typeof statusFilterProp === "string"
      ? statusFilterProp
      : statusFilterProp.field;
  }, [statusFilterProp]);

  const statusOptions = useMemo(() => {
    if (!statusFilterProp) return [];
    if (typeof statusFilterProp === "object" && statusFilterProp.options) {
      return statusFilterProp.options;
    }
    if (!statusFieldName) return [];
    return deriveStatusOptions(rawData, statusFieldName);
  }, [statusFilterProp, statusFieldName, rawData]);

  // -- Search fields --
  const searchFields = useMemo(
    () => searchFieldsProp ?? deriveStringFields(rawData),
    [searchFieldsProp, rawData],
  );

  // -- Client-side filtering + sorting --
  // Skipped entirely in controlled mode: the server already applied the
  // search, the sort and the page window, so re-running them here would
  // filter the current page against a query the server has already honoured
  // (and re-sort a slice of rows that is not the full result set).
  const filteredData = useMemo(() => {
    if (controlled) return rawData;

    let result = rawData;

    // Text search
    if (search) {
      result = result.filter((item) =>
        matchesSearch(item, search, searchFields),
      );
    }

    // Status filter
    if (statusFieldName && statusValue.length > 0) {
      result = result.filter((item) => {
        const val = (item as Record<string, unknown>)[statusFieldName];
        return val != null && statusValue.includes(String(val));
      });
    }

    // Sort
    if (sort) {
      result = [...result].sort((a, b) => compareItems(a, b, sort));
    }

    return result;
  }, [controlled, rawData, search, searchFields, statusFieldName, statusValue, sort]);

  // -- Sort options (built from resolved columns) --
  const sortOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [];
    for (const col of resolvedColumns) {
      if (col.sortable !== false) {
        opts.push({
          value: `${col.key}:asc`,
          label: `${col.header ?? titleCase(col.key)} (A-Z)`,
        });
        opts.push({
          value: `${col.key}:desc`,
          label: `${col.header ?? titleCase(col.key)} (Z-A)`,
        });
      }
    }
    return opts;
  }, [resolvedColumns]);

  // -- Sort string for DataFilters select --
  const sortString = sort ? `${sort.field}:${sort.order}` : "";

  const handleSortChange = useCallback((value: string) => {
    if (!value) {
      setSort(null);
      return;
    }
    const [field, order] = value.split(":");
    setSort({ field, order: order as "asc" | "desc" });
  }, []);

  // -- Map to DataTableColumn --
  const tableColumns: DataTableColumn<T>[] = useMemo(
    () =>
      resolvedColumns.map((col) => ({
        key: col.key,
        header: col.header ?? titleCase(col.key),
        sortable: col.sortable ?? true,
        hideBelow: col.hideBelow,
        render: col.render
          ? (item: T, value: unknown) =>
              col.render!(item, value, {
                update: async () => {
                  throw new Error(
                    "ResourceActions.update not available in server-data mode",
                  );
                },
                remove: async () => {
                  throw new Error(
                    "ResourceActions.remove not available in server-data mode",
                  );
                },
                refetch: () => {
                  /* no-op in server-data mode */
                },
              })
          : undefined,
      })),
    [resolvedColumns],
  );

  // -- Active filters check --
  const hasActiveFilters =
    search !== "" || statusValue.length > 0 || sort !== null;

  const clearFilters = useCallback(() => {
    setSearch("");
    setStatusValue([]);
    setSort(null);
  }, []);

  // -- Notify parent of filter changes --
  const onFiltersChangeRef = useRef(onFiltersChange);
  onFiltersChangeRef.current = onFiltersChange;

  useEffect(() => {
    if (!onFiltersChangeRef.current) return;
    const filters: FilterParam[] = [];
    if (search) {
      filters.push({ field: "__search__", operator: "contains", value: search });
    }
    if (sort) {
      filters.push({ field: "__sort__", operator: "eq", value: `${sort.field}:${sort.order}` });
    }
    if (statusValue.length > 0) {
      filters.push({ field: "__status__", operator: "in", value: statusValue });
    }
    onFiltersChangeRef.current(filters);
  }, [search, sort, statusValue]);

  // -- Row click --
  const handleRowClick = useCallback(
    (item: T) => {
      if (detail === "none") return;
      setSelectedItem(item);
      setDetailOpen(true);
    },
    [detail],
  );

  // -- Filter config (ready to spread into DataFilters) --
  const filterConfig = useMemo(
    () => ({
      search,
      onSearchChange: setSearch,
      sort: sortString,
      onSortChange: handleSortChange,
      sortOptions,
      ...(statusFieldName && statusOptions.length > 0
        ? {
            statusChips: {
              options: statusOptions,
              selected: statusValue,
              onChange: setStatusValue,
            },
          }
        : {}),
    }),
    [
      search,
      sortString,
      handleSortChange,
      sortOptions,
      statusFieldName,
      statusOptions,
      statusValue,
    ],
  );

  return {
    data: filteredData,
    // Controlled mode: `filteredData` is one server page, so its length is
    // not the record count — the server's total is.
    total: controlled ? rawTotal : filteredData.length,
    columns: resolvedColumns,
    tableColumns,
    filterConfig,
    viewMode,
    setViewMode,
    search,
    setSearch,
    sort,
    setSort,
    statusValue,
    setStatusValue,
    selectedItem,
    setSelectedItem,
    detailOpen,
    setDetailOpen,
    handleRowClick,
    titleField,
    subtitleField,
    statusOptions,
    hasActiveFilters,
    clearFilters,
  };
}
