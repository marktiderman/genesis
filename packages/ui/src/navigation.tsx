"use client";

/**
 * Router-agnostic navigation primitives.
 *
 * genesis-ui does NOT depend on any router. Components that need to render a
 * link or navigate imperatively accept an injectable abstraction defined here,
 * and default to plain browser behavior (`<a>` / `window.location`). Consumers
 * on React Router or Next.js inject a thin adapter that maps these props to
 * their own `<Link>` / router.
 */
import {
  useCallback,
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type ComponentType,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Link abstraction
// ---------------------------------------------------------------------------

/**
 * Props passed to an injectable link component. The contract is a plain anchor
 * (`href`), so the default works with NO router. A React Router consumer maps
 * `href` → `to`; a Next.js consumer passes `next/link` directly (it already
 * accepts `href`, `className`, `children`).
 *
 * @stability Beta
 */
export interface GenesisLinkProps {
  /** Destination path or URL. */
  href: string;
  className?: string;
  onClick?: () => void;
  children?: ReactNode;
  /** Set to "page" when the link points at the active route. */
  "aria-current"?: AnchorHTMLAttributes<HTMLAnchorElement>["aria-current"];
  /** Accessible name — useful when the visible label is hidden (icon rail). */
  "aria-label"?: string;
  /** Native tooltip / title attribute. */
  title?: string;
  /**
   * Stable test/automation selector. {@link DefaultLink} renders it as
   * `data-testid`; injected router adapters (`next/link`, RR `Link`) forward it
   * to the underlying `<a>` too.
   */
  testID?: string;
}

/**
 * A component that renders a navigable link from {@link GenesisLinkProps}.
 *
 * @stability Beta
 */
export type LinkComponent = ComponentType<GenesisLinkProps>;

/**
 * Default link — a plain `<a>`. No router required.
 *
 * @stability Beta
 */
export const DefaultLink: LinkComponent = ({
  href,
  children,
  testID,
  ...rest
}) => (
  <a href={href} data-testid={testID} {...rest}>
    {children}
  </a>
);

/**
 * Default active-path matcher, mirroring React Router's `NavLink` (prefix
 * match, with `/` treated as exact). Consumers can override via an `isActive`
 * prop where components accept one.
 *
 * @stability Beta
 */
export function isPathActive(to: string, activePath?: string): boolean {
  if (activePath == null) return false;
  if (to === activePath) return true;
  if (to !== "/" && activePath.startsWith(to + "/")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Imperative navigation abstraction
// ---------------------------------------------------------------------------

/**
 * Injectable imperative navigation callback.
 *
 * @stability Beta
 */
export type NavigateFn = (path: string) => void;

/**
 * Default navigate — a full-page navigation. No router required.
 *
 * @stability Beta
 */
export const defaultNavigate: NavigateFn = (path) => {
  if (typeof window !== "undefined") window.location.assign(path);
};

// ---------------------------------------------------------------------------
// Search-params abstraction (for URL-synced hooks)
// ---------------------------------------------------------------------------

/**
 * Minimal, router-agnostic replacement for React Router's `useSearchParams`
 * return shape. Consumers may inject their router's implementation for full
 * SPA integration; otherwise the browser History API is used.
 *
 * @stability Beta
 */
export interface SearchParamsAdapter {
  searchParams: URLSearchParams;
  setSearchParams: (
    next: URLSearchParams,
    options?: { replace?: boolean },
  ) => void;
}

/**
 * Browser-native {@link SearchParamsAdapter} built on the History API. Reads
 * the current query string and writes updates via `pushState`/`replaceState`,
 * staying reactive to `popstate` events. No router required.
 *
 * @stability Beta
 */
export function useBrowserSearchParams(): SearchParamsAdapter {
  const read = () =>
    new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );

  const [searchParams, setLocal] = useState<URLSearchParams>(read);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => setLocal(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setSearchParams = useCallback<SearchParamsAdapter["setSearchParams"]>(
    (next, options) => {
      if (typeof window === "undefined") return;
      const qs = next.toString();
      const url =
        window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      if (options?.replace) {
        window.history.replaceState(window.history.state, "", url);
      } else {
        window.history.pushState(window.history.state, "", url);
      }
      setLocal(new URLSearchParams(next));
    },
    [],
  );

  return { searchParams, setSearchParams };
}
