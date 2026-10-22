"use client";

import { useCallback, useMemo } from "react";
import type { SearchParamsAdapter } from "../navigation";
import type { SortParam } from "@marktiderman/genesis-core/provider";

/**
 * The query-string names a list keeps its state under. Rename one when two
 * lists share a page, or when `id` already means something in your routes.
 *
 * @stability Beta
 */
export interface ResourceUrlParams {
  /** The open record's key. Default `"id"`. */
  detail?: string;
  /** The page number (from 1). Default `"page"`. */
  page?: string;
  /** `field:asc` or `field:desc`. Default `"sort"`. */
  sort?: string;
  /** The search text. Default `"q"`. */
  q?: string;
}

/**
 * Where a list's state lives in the URL: the router's search params, plus
 * optional names for each value.
 *
 * @stability Beta
 */
export interface ResourceUrlStateOptions {
  searchParams: SearchParamsAdapter;
  params?: ResourceUrlParams;
}

/** @stability Beta */
export interface ResourceUrlState {
  /** The open record's key, or null when no record is open. */
  detailId: string | null;
  /** Open a record (a new history entry, so Back closes it) or close it (null; replaces). */
  setDetailId: (id: string | null) => void;
  /** The page from the URL, or null when absent or not a positive integer. */
  page: number | null;
  /** The sort from the URL, or null. */
  sort: SortParam | null;
  /** The search text from the URL ("" when absent). */
  q: string;
  /**
   * Write page, sort and search. Replaces the history entry (typing a search
   * shouldn't fill Back with every keystroke). A default value (page 1, no
   * sort, empty search) is dropped from the URL; `undefined` leaves a value as is.
   */
  write: (next: { page?: number | null; sort?: SortParam | null; q?: string }) => void;
}

const DEFAULTS: Required<ResourceUrlParams> = { detail: "id", page: "page", sort: "sort", q: "q" };

function parseSort(raw: string | null): SortParam | null {
  if (!raw) return null;
  const at = raw.lastIndexOf(":");
  const field = at > 0 ? raw.slice(0, at) : "";
  const order = raw.slice(at + 1);
  return field && (order === "asc" || order === "desc") ? { field, order } : null;
}

/**
 * A list's peek, page, sort and search, kept in the URL through any
 * {@link SearchParamsAdapter} (the browser's, React Router's or TanStack
 * Router's). The URL is the source of truth: a copied link reopens the same
 * record on the same page, and Back closes a record that was opened.
 *
 * `ResourcePage` uses it when given `urlState`; a server-controlled page
 * that owns its own page/sort/search can call it directly.
 *
 * @stability Beta
 */
export function useResourceUrlState(options: ResourceUrlStateOptions): ResourceUrlState;
export function useResourceUrlState(options: ResourceUrlStateOptions | undefined): ResourceUrlState | undefined;
export function useResourceUrlState(options: ResourceUrlStateOptions | undefined): ResourceUrlState | undefined {
  const adapter = options?.searchParams;
  const names = { ...DEFAULTS, ...options?.params };
  const sp = adapter?.searchParams;
  const setSearchParams = adapter?.setSearchParams;

  const detailId = sp?.get(names.detail) || null;
  const rawPage = sp?.get(names.page);
  const pageNum = rawPage && /^\d+$/.test(rawPage) ? Number(rawPage) : null;
  // A positive safe integer only: hundreds of digits parse to Infinity.
  const page = pageNum !== null && Number.isSafeInteger(pageNum) && pageNum > 0 ? pageNum : null;
  const sortRaw = sp?.get(names.sort) ?? null;
  const q = sp?.get(names.q) ?? "";

  const setDetailId = useCallback(
    (id: string | null) => {
      if (!sp || !setSearchParams) return;
      const next = new URLSearchParams(sp);
      if (id) next.set(names.detail, id);
      else next.delete(names.detail);
      if (next.toString() === sp.toString()) return;
      // Opening adds an entry so Back closes the record; closing replaces.
      setSearchParams(next, { replace: !id });
    },
    [sp, setSearchParams, names.detail],
  );

  const write = useCallback<ResourceUrlState["write"]>(
    (values) => {
      if (!sp || !setSearchParams) return;
      const next = new URLSearchParams(sp);
      const put = (key: string, value: string | null) => {
        if (value) next.set(key, value);
        else next.delete(key);
      };
      if (values.page !== undefined) put(names.page, values.page && values.page > 1 ? String(values.page) : null);
      if (values.sort !== undefined) put(names.sort, values.sort ? `${values.sort.field}:${values.sort.order}` : null);
      if (values.q !== undefined) put(names.q, values.q || null);
      if (next.toString() === sp.toString()) return;
      setSearchParams(next, { replace: true });
    },
    [sp, setSearchParams, names.page, names.sort, names.q],
  );

  const sort = useMemo(() => parseSort(sortRaw), [sortRaw]);

  if (!adapter) return undefined;
  return { detailId, setDetailId, page, sort, q, write };
}
