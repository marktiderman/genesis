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
  /**
   * The zone this node and its descendants sit in (ADR 0003): a kind of work
   * the viewer enters (their own work, training, admin). A descendant that
   * names no zone of its own is in its nearest ancestor's; a node with none
   * above it is global (settings, messages, help). `resolveNavigation`
   * reports the current zone as `zone`, so an app can key a theme on it;
   * `resolveNavigationZones` groups the tree by zone.
   *
   * @stability Beta
   */
  zone?: string;
}

/**
 * One zone of an app's navigation (ADR 0003 §1): an ordered entry with an id
 * the tree's `zone` names, a label and an optional icon (the app's own icon
 * type, `I`).
 *
 * @stability Beta
 */
export interface NavigationZone<I = unknown> {
  id: string;
  label: string;
  icon?: I;
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
  /**
   * The zone the location is in: the `zone` of the nearest node in `trail`
   * that names one, so a page opened from a zone's list keeps that zone
   * through its logical parents. `undefined` on a global page.
   *
   * @stability Beta
   */
  zone?: string;
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
  const zone = [...trail].reverse().find((node) => node.zone !== undefined)?.zone;
  return {
    current,
    parent: trail.length > 1 ? trail[trail.length - 2] : undefined,
    items: current.items,
    trail,
    params,
    ...(zone !== undefined ? { zone } : {}),
  };
}

/**
 * Result of {@link resolveNavigationZones}.
 *
 * @stability Beta
 */
export interface ResolvedNavigationZones<T, I = unknown> {
  /** The tree resolved against the location, as `resolveNavigation` returns it. */
  navigation: ResolvedNavigation<T>;
  /** The zone the location is in (`navigation.zone`'s entry), or `undefined` on a global page or the roll-up. */
  zone?: NavigationZone<I>;
  /**
   * The zones that have a page, in the order given, each with the top nodes
   * of its pages (a node whose parent is in another zone or none). A zone
   * with no page in the tree is left out: filter the tree for the viewer
   * first, and access decides which zones show (ADR 0003 §1).
   */
  zones: Array<{ zone: NavigationZone<I>; nodes: NavigationNode<T>[] }>;
  /** The root's children in no zone: pages shown in every zone (settings, messages, help). */
  global: NavigationNode<T>[];
  /** The roll-up page above the zones, when `options.rollUp` names one that is in the tree. */
  rollUp?: NavigationNode<T>;
}

/**
 * Lay an app's zones over its navigation tree (ADR 0003 §1 and §4): which zone
 * the location is in, each zone's pages, the global pages and the roll-up.
 * Pure, so web and native shells use the same answer; an app with no zones
 * gets every top page in `global` and no `zone`.
 *
 * ```ts
 * const { zone } = resolveNavigationZones(tree, pathname, { zones: ZONES });
 * const theme = THEMES[zone?.id ?? "home"]; // a theme per zone
 * ```
 *
 * A zone id the tree names but `zones` doesn't list is ignored (its pages
 * read as global), so a stale id never invents a zone.
 *
 * @stability Beta
 */
export function resolveNavigationZones<T, I = unknown>(
  tree: NavigationNode<T>,
  pathname: string,
  options: { zones: readonly NavigationZone<I>[]; rollUp?: string } = { zones: [] },
): ResolvedNavigationZones<T, I> {
  const known = new Map(options.zones.map((z) => [z.id, z] as const));
  const effective = (own: string | undefined, inherited: string | undefined) =>
    own !== undefined && known.has(own) ? own : inherited;
  const byZone = new Map<string, NavigationNode<T>[]>();
  const global: NavigationNode<T>[] = [];
  let rollUp: NavigationNode<T> | undefined;
  const visit = (node: NavigationNode<T>, parentZone: string | undefined, depth: number) => {
    const zone = effective(node.zone, parentZone);
    if (depth > 0 && options.rollUp !== undefined && node.id === options.rollUp) rollUp = node;
    else if (depth > 0 && zone !== undefined && zone !== parentZone) {
      const list = byZone.get(zone) ?? [];
      list.push(node);
      byZone.set(zone, list);
    } else if (depth === 1 && zone === undefined) global.push(node);
    for (const child of node.children ?? []) visit(child, zone, depth + 1);
  };
  visit(tree, effective(tree.zone, undefined), 0);
  const navigation = resolveNavigation(tree, pathname);
  const currentId = [...navigation.trail].reverse().find((node) => node.zone !== undefined && known.has(node.zone))?.zone;
  const current = currentId !== undefined ? known.get(currentId) : undefined;
  return {
    navigation,
    ...(current ? { zone: current } : {}),
    zones: options.zones.filter((z) => byZone.has(z.id)).map((zone) => ({ zone, nodes: byZone.get(zone.id)! })),
    global,
    ...(rollUp ? { rollUp } : {}),
  };
}

/**
 * Most slots a phone bottom tab bar shows before the rest go under "More".
 *
 * @stability Beta
 */
export const TAB_BAR_MAX = 5;

/**
 * A phone bottom tab bar's split: up to `max` items fit; beyond that, the first `max - 1` show
 * and the rest go under "More" in the last slot. Pure, so the web `TabBar`, AppShell's phone
 * bottom nav and genesis-ui-native's `NativeTabBar` all split the same way.
 *
 * @stability Beta
 */
export function splitTabBarItems<T>(items: readonly T[], max: number = TAB_BAR_MAX): { shown: T[]; more: T[] } {
  const slots = Math.max(1, max);
  if (items.length <= slots) return { shown: [...items], more: [] };
  return { shown: items.slice(0, slots - 1), more: items.slice(slots - 1) };
}
