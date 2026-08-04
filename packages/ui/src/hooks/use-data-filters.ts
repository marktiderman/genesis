"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useStorage } from "@marktiderman/genesis-core";
import {
  useBrowserSearchParams,
  type SearchParamsAdapter,
} from "../navigation";

type FilterType = "string" | "multi";

export interface FilterDef {
  type: FilterType;
  default: string | string[];
}

export type FilterDefs = Record<string, FilterDef>;

export type FilterValues<T extends FilterDefs> = {
  [K in keyof T]: T[K]["type"] extends "multi" ? string[] : string;
};

function parseArray(val: string | null): string[] {
  if (!val) return [];
  return val.split(",").filter(Boolean);
}

/**
 * @stability Beta
 */
export interface UseDataFiltersOptions {
  /**
   * Injectable URL search-params adapter. Defaults to a browser History-API
   * implementation (no router). Router consumers may pass their own — e.g.
   * React Router's `useSearchParams()` result — for full SPA integration.
   */
  searchParams?: SearchParamsAdapter;
}

export function useDataFilters<T extends FilterDefs>(
  storageKey: string,
  defs: T,
  options?: UseDataFiltersOptions
) {
  // Always call the default hook (rules-of-hooks); use the override if provided.
  const browserAdapter = useBrowserSearchParams();
  const { searchParams, setSearchParams } =
    options?.searchParams ?? browserAdapter;
  const storage = useStorage();
  const initialized = useRef(false);

  // Build initial state from URL -> storage -> defaults
  const getInitial = useCallback((): FilterValues<T> => {
    const result = {} as Record<string, unknown>;
    const localKey = `${storageKey}-filters`;
    let stored: Record<string, unknown> = {};

    try {
      const raw = storage.getItem(localKey);
      if (raw) stored = JSON.parse(raw);
    } catch {
      /* ignore */
    }

    // Check if URL has any of our params
    const hasUrlParams = Object.keys(defs).some((k) => searchParams.has(k));

    for (const [key, def] of Object.entries(defs)) {
      if (def.type === "multi") {
        const urlVal = hasUrlParams ? searchParams.get(key) : null;
        if (urlVal !== null) {
          result[key] = parseArray(urlVal);
        } else if (Array.isArray(stored[key])) {
          result[key] = stored[key];
        } else {
          result[key] = def.default;
        }
      } else {
        const urlVal = hasUrlParams ? searchParams.get(key) : null;
        if (urlVal !== null) {
          result[key] = urlVal;
        } else if (typeof stored[key] === "string") {
          result[key] = stored[key];
        } else {
          result[key] = def.default;
        }
      }
    }

    return result as FilterValues<T>;
  }, [defs, searchParams, storageKey, storage]);

  const [filters, setFilters] = useState<FilterValues<T>>(() => getInitial());

  // Mark as initialized after first render
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
    }
  }, []);

  // Persist to storage + URL whenever filters change
  useEffect(() => {
    if (!initialized.current) return;

    const localKey = `${storageKey}-filters`;
    storage.setItem(localKey, JSON.stringify(filters));

    // Update URL params. When using the DEFAULT browser adapter, seed from the
    // LIVE URL (not the adapter's possibly stale snapshot) so a second
    // useDataFilters instance on the same page can't merge against an old query
    // string and drop params another instance just wrote. When a caller
    // explicitly injects a SearchParamsAdapter (custom router / test double
    // whose URL state may not be synced to the DOM), trust ITS snapshot instead
    // of reading the real DOM location. Also falls back to the adapter snapshot
    // in non-browser envs.
    const newParams = new URLSearchParams(
      !options?.searchParams && typeof window !== "undefined"
        ? window.location.search
        : searchParams.toString(),
    );
    for (const [key, def] of Object.entries(defs)) {
      const val = (filters as Record<string, unknown>)[key];
      const isDefault =
        def.type === "multi"
          ? (val as string[]).length === 0
          : val === def.default;

      if (isDefault) {
        newParams.delete(key);
      } else if (def.type === "multi") {
        newParams.set(key, (val as string[]).join(","));
      } else {
        newParams.set(key, val as string);
      }
    }
    setSearchParams(newParams, { replace: true });
  }, [filters, defs, storageKey, storage]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = useCallback(
    <K extends keyof T>(
      key: K,
      value: T[K]["type"] extends "multi" ? string[] : string
    ) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const resetFilters = useCallback(() => {
    const result = {} as Record<string, unknown>;
    for (const [key, def] of Object.entries(defs)) {
      result[key] = def.default;
    }
    setFilters(result as FilterValues<T>);
  }, [defs]);

  const loadView = useCallback(
    (viewFilters: Record<string, unknown>) => {
      const result = {} as Record<string, unknown>;
      for (const [key, def] of Object.entries(defs)) {
        const v = viewFilters[key];
        if (def.type === "multi" && Array.isArray(v)) {
          result[key] = v;
        } else if (def.type === "string" && typeof v === "string") {
          result[key] = v;
        } else {
          result[key] = def.default;
        }
      }
      setFilters(result as FilterValues<T>);
    },
    [defs]
  );

  const hasActiveFilters = Object.entries(defs).some(([key, def]) => {
    const val = (filters as Record<string, unknown>)[key];
    if (def.type === "multi") return (val as string[]).length > 0;
    return val !== def.default;
  });

  return {
    filters,
    setFilter,
    resetFilters,
    loadView,
    hasActiveFilters,
  };
}
