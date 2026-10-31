/**
 * Router-free, DOM-free navigation: the logical navigation tree and the
 * active-path matcher, shared by the web app shell and native shells.
 * `resolveNavigation` never reads browser history or `window`.
 */

/** `path` without its trailing slashes, in one linear pass (a regex can backtrack on many slashes). */
function trimTrailingSlashes(path: string): string {
  let end = path.length;
  while (end > 0 && path.charCodeAt(end - 1) === 47) end--;
  return path.slice(0, end);
}

/**
 * Split a href into its path (trailing slash dropped, except for `/`), query
 * (no `?`) and hash (no `#`).
 */
function splitHref(href: string): { path: string; search: string; hash: string } {
  const hashAt = href.indexOf("#");
  const hash = hashAt === -1 ? "" : href.slice(hashAt + 1);
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const searchAt = beforeHash.indexOf("?");
  const rawPath = searchAt === -1 ? beforeHash : beforeHash.slice(0, searchAt);
  return {
    path: rawPath.length > 1 ? trimTrailingSlashes(rawPath) || "/" : rawPath,
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
  /**
   * Ask the app shell to open its desktop sidebar collapsed (icon rail) while
   * this node, or a descendant that doesn't set its own value, is current.
   * The nearest node in the resolved trail that sets it wins, so
   * `defaultCollapsed: false` on a child re-opens it under a collapsed
   * parent. Only a default: once the user has toggled the sidebar, their
   * choice wins everywhere. `AppShell` reads it; `resolveNavigation` copies
   * it through untouched.
   *
   * @stability Beta
   */
  defaultCollapsed?: boolean;
  /**
   * How the app shell shows this node's `items` (its child pages, e.g. a
   * form's Questions / Logic / Responses / Settings). `"tabs"` (across the
   * top of the content) or `"sidebar"` (nested under the active item) turn
   * shell sub-navigation on, which also gives phones a back item plus the
   * children in the bottom bar. `"section"` is the legacy rendering (the
   * shell's default) and `"off"` hides them. The nearest node in the trail
   * that sets it wins over the shell's `options.subNav`.
   *
   * @stability Beta
   */
  subNav?: "section" | "tabs" | "sidebar" | "off";
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
 * winner is decided by positional specificity: at the first position where
 * one pattern is static and the other a `$param`, the static one wins (so
 * `/clients/new` beats `/clients/$clientId` whatever the sibling order, and
 * `/my` beats `/$space/tasks` for `/my/tasks`). Otherwise the pattern matching
 * more segments wins, then the deeper tree node.
 * Non-matching nodes are still searched, so a match keeps its logical
 * ancestors even when their URLs differ.
 *
 * @stability Beta
 */
export function resolveNavigation<T>(
  tree: NavigationNode<T>,
  pathname: string,
): ResolvedNavigation<T> {
  // Compare decoded forms on both sides, so `/caf%C3%A9` matches a `/café`
  // node (and an encoded pattern matches a decoded pathname).
  const segments = pathSegments(pathname).map(decodeSegment);

  type Match = { trail: NavigationNode<T>[]; pattern: string[] };
  const matches = (pattern: string[]) =>
    pattern.length <= segments.length &&
    pattern.every(
      (part, i) => part.startsWith("$") || decodeSegment(part) === segments[i],
    );

  // > 0 when `a` should win over `b`.
  // Positional specificity, as TanStack Router and React Router rank routes:
  // walking left to right, the first position where one pattern is static and
  // the other a `$param` decides. Only then does the longer match win.
  const compare = (a: Match, b: Match): number => {
    const shared = Math.min(a.pattern.length, b.pattern.length);
    for (let i = 0; i < shared; i++) {
      const aParam = a.pattern[i]!.startsWith("$");
      const bParam = b.pattern[i]!.startsWith("$");
      if (aParam !== bParam) return aParam ? -1 : 1;
    }
    if (a.pattern.length !== b.pattern.length) {
      return a.pattern.length - b.pattern.length;
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
    if (part.startsWith("$")) params[part.slice(1)] = segments[i]!;
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
