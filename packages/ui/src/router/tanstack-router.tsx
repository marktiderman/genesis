"use client";

/**
 * TanStack Router adapters for genesis-ui's router-agnostic navigation
 * contract.
 *
 * Import from `@marktiderman/genesis-ui/router/tanstack-router`. This is the
 * only genesis-ui entry that imports `@tanstack/react-router`, and that
 * package is an OPTIONAL peer: apps on another router never install it, and
 * apps that do not import this subpath never load it.
 *
 * Genesis hands links a plain string `href` (`/admin?tab=users#top`), while
 * TanStack Router wants `to`, `search` and `hash` separately. These adapters
 * do that split, and they parse the query with the router's OWN
 * `parseSearch`, so a custom search serializer and `validateSearch` see the
 * same values a typed `<Link search={…}>` would produce.
 *
 * ```tsx
 * import { AppShell } from "@marktiderman/genesis-ui/layout";
 * import {
 *   TanStackRouterLink,
 *   useTanStackRouterActivePath,
 * } from "@marktiderman/genesis-ui/router/tanstack-router";
 *
 * <AppShell linkComponent={TanStackRouterLink} activePath={useTanStackRouterActivePath()} … />
 * ```
 */
import { useCallback, useMemo, type AnchorHTMLAttributes, type Ref } from "react";
import {
  useLinkProps,
  useRouter,
  useRouterState,
  type AnyRouter,
} from "@tanstack/react-router";
import {
  DefaultLink,
  type GenesisLinkProps,
  type LinkComponent,
  type NavigateFn,
  type SearchParamsAdapter,
} from "../navigation";
import { isExternalHref, splitNavigationHref } from "./utils";

// Genesis owns the active state (it passes `aria-current` itself, computed by
// `isPathActive` or the app's `isActive`). TanStack's Link adds its own —
// `aria-current="page"`, `data-status="active"` and an `active` class —
// whenever ITS prefix match passes, which can disagree with Genesis (an
// exact-match `/app` item, or a `?tab=` item) and would leave two items
// announced as the current page. An empty `activeProps` stops the class;
// the attributes are overridden below.
const NO_ACTIVE_PROPS = {};

/**
 * The navigation target for a Genesis href, with the query parsed by the
 * router's own `parseSearch` (what `<Link search>` expects).
 */
function toLocation(router: AnyRouter, href: string) {
  const { pathname, search, hash } = splitNavigationHref(href);
  return {
    // `""` (a bare `?q=1` or `#x`) means "this page" — TanStack's `.`.
    to: pathname || ".",
    search: search ? router.options.parseSearch(`?${search}`) : undefined,
    hash: hash || undefined,
  };
}

function InAppLink({
  href,
  testID,
  children,
  "aria-current": ariaCurrent,
  ref,
  ...rest
}: GenesisLinkProps & { ref?: Ref<HTMLAnchorElement> }) {
  const router = useRouter();
  const target = useMemo(() => toLocation(router, href), [router, href]);
  // `useLinkProps` is the hook behind TanStack's `<Link>`: client-side
  // navigation on click, `href` built through the router (basepath, rewrites,
  // masks), preloading per the router's `defaultPreload`. Props it does not
  // know (anything a Radix `asChild` parent merges in) pass through to the
  // anchor, and `ref` is merged with the one it needs for preloading.
  const linkProps = useLinkProps(
    {
      ...target,
      ...rest,
      activeProps: NO_ACTIVE_PROPS,
      // The adapter is route-tree agnostic, so it cannot satisfy the generated
      // route types; the target is checked at runtime by the router instead.
    } as Parameters<typeof useLinkProps>[0],
    ref as Parameters<typeof useLinkProps>[1],
  ) as AnchorHTMLAttributes<HTMLAnchorElement> & {
    "data-status"?: string;
    ref?: Ref<HTMLAnchorElement>;
  };
  const { "data-status": _status, ...anchorProps } = linkProps;
  return (
    <a
      {...anchorProps}
      aria-current={ariaCurrent}
      // Only when given, so a `data-testid` merged in by an `asChild` parent survives.
      {...(testID !== undefined ? { "data-testid": testID } : null)}
    >
      {children}
    </a>
  );
}

/**
 * {@link LinkComponent} for TanStack Router. Pass it as `linkComponent` to
 * `AppShell`, `StatCard` and anything else that takes one. In-app hrefs
 * navigate client-side (query and hash included, parsed by the router's
 * `parseSearch`); absolute URLs render a plain anchor. `testID` is forwarded
 * as `data-testid`, as `DefaultLink` does, and the active state stays the one
 * Genesis passes: TanStack's own `aria-current` / `active` class are not
 * applied. It forwards `ref` and unknown props, so it works as the child of a
 * Radix `asChild` (`<Button asChild>`).
 *
 * @stability Beta
 */
export const TanStackRouterLink: LinkComponent = (props) =>
  isExternalHref(props.href) ? <DefaultLink {...props} /> : <InAppLink {...props} />;

/**
 * {@link NavigateFn} backed by the TanStack router. Pass it as
 * `ResourcePage`'s `onNavigate` (or anywhere a `NavigateFn` is accepted) for
 * client-side navigation instead of a full page load. Absolute URLs
 * (`https://…`, `mailto:…`, `//host/…`) leave the app with a document
 * navigation, as `defaultNavigate` does.
 *
 * @stability Beta
 */
export function useTanStackRouterNavigate(): NavigateFn {
  const router = useRouter();
  return useCallback<NavigateFn>(
    (path) => {
      if (isExternalHref(path)) {
        if (typeof window !== "undefined") window.location.assign(path);
        return;
      }
      void router.navigate(
        toLocation(router, path) as Parameters<AnyRouter["navigate"]>[0],
      );
    },
    [router],
  );
}

/**
 * {@link SearchParamsAdapter} backed by the TanStack router's location. Pass
 * it as `useDataFilters(key, defs, { searchParams })` so URL-synced filters go
 * through the router (loaders and `validateSearch` run, back/forward stays in
 * sync) instead of the raw History API. Like the default browser adapter, an
 * update keeps the current path and `#hash`.
 *
 * @stability Beta
 */
export function useTanStackRouterSearchParams(): SearchParamsAdapter {
  const router = useRouter();
  const searchStr = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const searchParams = useMemo(
    () => new URLSearchParams(searchStr),
    [searchStr],
  );

  const setSearchParams = useCallback<SearchParamsAdapter["setSearchParams"]>(
    (next, options) => {
      const qs = next.toString();
      void router.navigate({
        // The current URL path, not `.`: `.` resolves against the matched
        // route's template, which is not this URL under a splat or
        // not-found route.
        to: router.state.location.pathname,
        search: router.options.parseSearch(qs ? `?${qs}` : ""),
        hash: true,
        replace: options?.replace,
      } as Parameters<AnyRouter["navigate"]>[0]);
    },
    [router],
  );

  return useMemo(
    () => ({ searchParams, setSearchParams }),
    [searchParams, setSearchParams],
  );
}

/**
 * The current location as `pathname + search + hash`, the shape `AppShell`'s
 * `activePath` expects, so nav items whose `to` names a query or hash
 * (`/admin?tab=users`, `/settings#profile`) highlight correctly. Paths are the
 * router's (basepath removed), matching the `to` your nav items use.
 *
 * @stability Beta
 */
export function useTanStackRouterActivePath(): string {
  return useRouterState({
    select: ({ location }) => {
      const search =
        location.searchStr && !location.searchStr.startsWith("?")
          ? `?${location.searchStr}`
          : location.searchStr;
      return `${location.pathname}${search}${location.hash ? `#${location.hash}` : ""}`;
    },
  });
}
