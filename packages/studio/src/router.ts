// ---------------------------------------------------------------------------
// Routing and URL state come from the host app (DATA-STUDIO.md decision 23).
//
// The studio never touches `window.location` itself. It reads a
// `StudioLocation` and asks for a new one; the adapter decides how that maps
// onto the app's router, so a link to "clients, page 3, sorted by name" is a
// plain URL the app already knows how to serve.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";

/** Everything the studio keeps in the URL. */
export interface StudioLocation {
  /** `schema.table`, e.g. `public.clients`. */
  resource?: string;
  /** 1-based. */
  page?: number;
  /** `field:asc` or `field:desc`; several, comma-separated, sort by each in turn. */
  sort?: string;
  search?: string;
  /** Filters, as a JSON array of `[field, operator, value?]`. */
  filters?: string;
  /** Group rows by this field. */
  group?: string;
  /** The open record's id (`encodeRecordKey`), for a copyable link to it. */
  record?: string;
  /** `sheet` for the spreadsheet grid; the table otherwise. */
  view?: "sheet";
}

export interface StudioNavigateOptions {
  /** Replace the current history entry instead of pushing one (e.g. while typing a search). */
  replace?: boolean;
}

export interface StudioRouter {
  location: StudioLocation;
  navigate(next: StudioLocation, options?: StudioNavigateOptions): void;
}

/** Query parameter names. Short, and namespaced enough not to collide with an app's own. */
const PARAM = {
  resource: "table",
  page: "page",
  sort: "sort",
  search: "q",
  filters: "filter",
  group: "group",
  record: "record",
  view: "view",
} as const;

export function locationFromSearchParams(params: URLSearchParams): StudioLocation {
  const page = Number(params.get(PARAM.page));
  return {
    ...(params.get(PARAM.resource) ? { resource: params.get(PARAM.resource)! } : {}),
    ...(Number.isInteger(page) && page > 1 ? { page } : {}),
    ...(params.get(PARAM.sort) ? { sort: params.get(PARAM.sort)! } : {}),
    ...(params.get(PARAM.search) ? { search: params.get(PARAM.search)! } : {}),
    ...(params.get(PARAM.filters) ? { filters: params.get(PARAM.filters)! } : {}),
    ...(params.get(PARAM.group) ? { group: params.get(PARAM.group)! } : {}),
    ...(params.get(PARAM.record) ? { record: params.get(PARAM.record)! } : {}),
    ...(params.get(PARAM.view) === "sheet" ? { view: "sheet" as const } : {}),
  };
}

/**
 * The studio's location as query parameters, keeping every parameter in
 * `base` that isn't the studio's own.
 */
export function searchParamsFromLocation(location: StudioLocation, base?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base);
  for (const name of Object.values(PARAM)) params.delete(name);
  if (location.resource) params.set(PARAM.resource, location.resource);
  if (location.page && location.page > 1) params.set(PARAM.page, String(location.page));
  if (location.sort) params.set(PARAM.sort, location.sort);
  if (location.search) params.set(PARAM.search, location.search);
  if (location.filters) params.set(PARAM.filters, location.filters);
  if (location.group) params.set(PARAM.group, location.group);
  if (location.record) params.set(PARAM.record, location.record);
  if (location.view) params.set(PARAM.view, location.view);
  return params;
}

/**
 * An adapter over any router that exposes search params with a setter —
 * React Router's `useSearchParams`, or Next.js's `useSearchParams` plus
 * `router.replace`/`push`.
 *
 * @example React Router
 * const [params, setParams] = useSearchParams();
 * const router = createSearchParamsRouter(params, (next, { replace }) => setParams(next, { replace }));
 */
export function createSearchParamsRouter(
  params: URLSearchParams,
  setParams: (next: URLSearchParams, options: { replace: boolean }) => void,
): StudioRouter {
  return {
    location: locationFromSearchParams(params),
    navigate: (next, options) => setParams(searchParamsFromLocation(next, params), { replace: options?.replace ?? false }),
  };
}

/**
 * For an app with no router: keeps the studio's state in the current page's
 * query string through the History API.
 */
export function useHistoryRouter(): StudioRouter {
  const read = () =>
    typeof window === "undefined" ? {} : locationFromSearchParams(new URLSearchParams(window.location.search));
  const [location, setLocation] = useState<StudioLocation>(read);

  useEffect(() => {
    const onPop = () => setLocation(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((next: StudioLocation, options?: StudioNavigateOptions) => {
    const params = searchParamsFromLocation(next, new URLSearchParams(window.location.search));
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    if (options?.replace) window.history.replaceState(window.history.state, "", url);
    else window.history.pushState(window.history.state, "", url);
    setLocation(next);
  }, []);

  return useMemo(() => ({ location, navigate }), [location, navigate]);
}

/** A router held in memory, for tests and embedded previews. */
export function useMemoryRouter(initial: StudioLocation = {}): StudioRouter {
  const [location, setLocation] = useState<StudioLocation>(initial);
  const navigate = useCallback((next: StudioLocation) => setLocation(next), []);
  return useMemo(() => ({ location, navigate }), [location, navigate]);
}
