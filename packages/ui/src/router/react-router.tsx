"use client";

/**
 * React Router (v7, library or framework mode) adapters for genesis-ui's
 * router-agnostic navigation contract.
 *
 * Import from `@marktiderman/genesis-ui/router/react-router`. This is the only
 * genesis-ui entry that imports `react-router`, and `react-router` is an
 * OPTIONAL peer: apps on another router never install it, and apps that do
 * not import this subpath never load it.
 *
 * ```tsx
 * import { AppShell } from "@marktiderman/genesis-ui/layout";
 * import {
 *   ReactRouterLink,
 *   useReactRouterActivePath,
 * } from "@marktiderman/genesis-ui/router/react-router";
 *
 * <AppShell linkComponent={ReactRouterLink} activePath={useReactRouterActivePath()} … />
 * ```
 */
import { useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import type {
  LinkComponent,
  NavigateFn,
  SearchParamsAdapter,
} from "../navigation";
import { isExternalHref } from "./utils";

/**
 * {@link LinkComponent} for React Router. Pass it as `linkComponent` to
 * `AppShell`, `StatCard` and anything else that takes one. `href` maps to
 * React Router's `to` (query and hash included), and `testID` is forwarded as
 * `data-testid`, as `DefaultLink` does.
 *
 * Genesis decides the active state and passes `aria-current` itself. This is
 * a plain `Link`, not a `NavLink`, so the router never adds a second opinion.
 * It forwards `ref` and unknown props, so it works as the child of a Radix
 * `asChild` (`<Button asChild>`).
 *
 * @stability Beta
 */
export const ReactRouterLink: LinkComponent = ({ href, testID, ...props }) => (
  // `props` carries `ref` and anything a Radix `asChild` parent merges in;
  // React Router's `Link` forwards both to the anchor. `testID` wins over a
  // `data-testid` in `props` (a parent's may be `undefined`), but only when
  // given, so a parent's real one survives.
  <Link to={href} {...props} {...(testID !== undefined ? { "data-testid": testID } : null)} />
);

/**
 * {@link NavigateFn} backed by React Router's `useNavigate()`. Pass it as
 * `ResourcePage`'s `onNavigate` (or anywhere a `NavigateFn` is accepted) for
 * client-side navigation instead of a full page load. Absolute URLs
 * (`https://…`, `mailto:…`, `//host/…`) leave the app with a document
 * navigation, as `defaultNavigate` does.
 *
 * @stability Beta
 */
export function useReactRouterNavigate(): NavigateFn {
  const navigate = useNavigate();
  return useCallback<NavigateFn>(
    (path) => {
      if (isExternalHref(path)) {
        if (typeof window !== "undefined") window.location.assign(path);
        return;
      }
      void navigate(path);
    },
    [navigate],
  );
}

/**
 * {@link SearchParamsAdapter} backed by React Router's location. Pass it as
 * `useDataFilters(key, defs, { searchParams })` so URL-synced filters go
 * through the router (loaders re-run, back/forward stays in sync) instead of
 * the raw History API. Like the default browser adapter, an update keeps the
 * current `#hash`.
 *
 * @stability Beta
 */
export function useReactRouterSearchParams(): SearchParamsAdapter {
  const [searchParams] = useSearchParams();
  const { hash } = useLocation();
  const navigate = useNavigate();

  const setSearchParams = useCallback<SearchParamsAdapter["setSearchParams"]>(
    (next, options) => {
      const qs = next.toString();
      void navigate(
        { search: qs ? `?${qs}` : "", hash },
        { replace: options?.replace },
      );
    },
    [navigate, hash],
  );

  return useMemo(
    () => ({ searchParams, setSearchParams }),
    [searchParams, setSearchParams],
  );
}

/**
 * The current location as `pathname + search + hash`, the shape `AppShell`'s
 * `activePath` expects, so nav items whose `to` names a query or hash
 * (`/admin?tab=users`, `/settings#profile`) highlight correctly.
 *
 * @stability Beta
 */
export function useReactRouterActivePath(): string {
  const { pathname, search, hash } = useLocation();
  return `${pathname}${search}${hash}`;
}
