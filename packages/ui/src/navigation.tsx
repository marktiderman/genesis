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

/** Split a href into its path, query (no `?`) and hash (no `#`). */
function splitHref(href: string): { path: string; search: string; hash: string } {
  const hashAt = href.indexOf("#");
  const hash = hashAt === -1 ? "" : href.slice(hashAt + 1);
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const searchAt = beforeHash.indexOf("?");
  return {
    path: searchAt === -1 ? beforeHash : beforeHash.slice(0, searchAt),
    search: searchAt === -1 ? "" : beforeHash.slice(searchAt + 1),
    hash,
  };
}

/**
 * Options for {@link isPathActive}.
 *
 * @stability Beta
 */
export interface IsPathActiveOptions {
  /** Require an exact path match instead of a prefix match (like `NavLink end`). */
  end?: boolean;
}

/**
 * Default active-path matcher, mirroring React Router's `NavLink` (prefix
 * match, with `/` treated as exact). Consumers can override via an `isActive`
 * prop where components accept one.
 *
 * `activePath` may carry a query and hash (`pathname + search + hash`). An
 * item whose `to` has neither compares against the path part only, exactly as
 * before. An item that opts in by putting a query or hash in its `to`
 * (`/admin?tab=users`, `/settings#profile`) is active only when the path
 * matches exactly AND every query param it names has the same value in
 * `activePath` (extra params such as `&page=2` are ignored) AND, if it names a
 * hash, the hash is equal.
 *
 * @stability Beta
 */
export function isPathActive(
  to: string,
  activePath?: string,
  options?: IsPathActiveOptions,
): boolean {
  if (activePath == null) return false;
  if (to === activePath) return true;
  const target = splitHref(to);
  const current = splitHref(activePath);

  if (!target.search && !target.hash) {
    if (target.path === current.path) return true;
    if (options?.end) return false;
    return target.path !== "/" && current.path.startsWith(target.path + "/");
  }

  if (target.path !== current.path) return false;
  if (target.hash && target.hash !== current.hash) return false;
  if (target.search) {
    const want = new URLSearchParams(target.search);
    const have = new URLSearchParams(current.search);
    for (const key of new Set(want.keys())) {
      const wanted = want.getAll(key);
      const had = have.getAll(key);
      if (!wanted.every((value) => had.includes(value))) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Hierarchical navigation resolver
// ---------------------------------------------------------------------------

/**
 * One node of a logical navigation hierarchy. `path` is a route pattern whose
 * segments are either static (`clients`) or named params (`$clientId`). A
 * node's place in the tree is its LOGICAL parent, which need not share its URL
 * prefix — `/clients/$clientId` can sit under `/dashboard`.
 *
 * @stability Beta
 */
export interface NavigationNode<T> {
  id: string;
  path: string;
  label: string;
  /** Contextual nav items to show while this node is current. */
  items: T[];
  children?: NavigationNode<T>[];
}

/**
 * Result of {@link resolveNavigation}. `current`, `parent` and every `trail`
 * entry are shallow copies of their tree nodes with `path` interpolated from
 * `params` (a param the URL did not supply stays as `$name`).
 *
 * @stability Beta
 */
export interface ResolvedNavigation<T> {
  /** The best-matching node — the root when nothing else matches. */
  current: NavigationNode<T>;
  /** `current`'s logical parent, for an "up" / back-to-parent link. */
  parent?: NavigationNode<T>;
  /** `current.items`. */
  items: T[];
  /** Root → `current`, inclusive. */
  trail: NavigationNode<T>[];
  /** Params captured by `current.path`, URL-decoded. */
  params: Record<string, string>;
}

function pathSegments(path: string): string[] {
  return splitHref(path).path.split("/").filter(Boolean);
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Resolve where `pathname` sits in a logical navigation tree. Pure: it never
 * reads browser history or `window`.
 *
 * A node matches when its pattern matches a leading run of WHOLE path
 * segments (`/my` matches `/my/tasks`, never `/my-other`). Among matches the
 * winner is the one matching the most segments; on a tie, the one whose first
 * differing segment is static rather than `$param` (so `/clients/new` beats
 * `/clients/$clientId` whatever the sibling order); then the deeper tree node.
 * Non-matching nodes are still searched, so a match keeps its logical
 * ancestors even when their URLs differ.
 *
 * @stability Beta
 */
export function resolveNavigation<T>(
  tree: NavigationNode<T>,
  pathname: string,
): ResolvedNavigation<T> {
  const segments = pathSegments(pathname);

  type Match = { trail: NavigationNode<T>[]; pattern: string[] };
  const matches = (pattern: string[]) =>
    pattern.length <= segments.length &&
    pattern.every((part, i) => part.startsWith("$") || part === segments[i]);

  // > 0 when `a` should win over `b`.
  const compare = (a: Match, b: Match): number => {
    if (a.pattern.length !== b.pattern.length) {
      return a.pattern.length - b.pattern.length;
    }
    for (let i = 0; i < a.pattern.length; i++) {
      const aParam = a.pattern[i]!.startsWith("$");
      const bParam = b.pattern[i]!.startsWith("$");
      if (aParam !== bParam) return aParam ? -1 : 1;
    }
    return a.trail.length - b.trail.length;
  };

  let best: Match | undefined;
  const visit = (node: NavigationNode<T>, ancestors: NavigationNode<T>[]) => {
    const trail = [...ancestors, node];
    const pattern = pathSegments(node.path);
    if (matches(pattern)) {
      const candidate = { trail, pattern };
      if (!best || compare(candidate, best) > 0) best = candidate;
    }
    for (const child of node.children ?? []) visit(child, trail);
  };
  visit(tree, []);

  const winner: Match = best ?? { trail: [tree], pattern: [] };
  const params: Record<string, string> = {};
  winner.pattern.forEach((part, i) => {
    if (part.startsWith("$")) params[part.slice(1)] = decodeSegment(segments[i]!);
  });

  const interpolate = (node: NavigationNode<T>): NavigationNode<T> => ({
    ...node,
    path: node.path
      .split("/")
      .map((part) => {
        if (!part.startsWith("$")) return part;
        const value = params[part.slice(1)];
        return value == null ? part : encodeURIComponent(value);
      })
      .join("/"),
  });

  const trail = winner.trail.map(interpolate);
  const current = trail[trail.length - 1]!;
  return {
    current,
    parent: trail.length > 1 ? trail[trail.length - 2] : undefined,
    items: current.items,
    trail,
    params,
  };
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
