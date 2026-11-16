/**
 * Route patterns, so a run visits one page per route rather than every value of a parameter.
 * React Router's own manifest (`react-router routes --json`) gives the patterns; a concrete path
 * (from a sitemap or a link) is matched to its pattern.
 */

export interface ReactRouterRoute {
  id: string;
  path?: string;
  index?: boolean;
  file?: string;
  children?: ReactRouterRoute[];
}

export interface RoutePattern {
  /** The full pattern, `/demo/:ws/clients/:id/:section?`. */
  pattern: string;
  /** The route's id (React Router) or file. */
  id: string;
}

const join = (base: string, path: string) => `/${[base, path].join("/").split("/").filter(Boolean).join("/")}`;

/** Every route that renders a page: leaves and index routes, with their full patterns. */
export function flattenReactRouterRoutes(routes: ReactRouterRoute[], base = ""): RoutePattern[] {
  const out: RoutePattern[] = [];
  for (const r of routes) {
    const full = r.path !== undefined ? join(base, r.path) : base || "/";
    if (r.children?.length) out.push(...flattenReactRouterRoutes(r.children, full));
    else out.push({ pattern: full || "/", id: r.id });
  }
  return out;
}

/** Whether a concrete path matches a pattern (`:param`, `:optional?`, `*` splat, `$param` too). */
export function matchesPattern(pattern: string, path: string): boolean {
  const segs = pattern.split("/").filter(Boolean);
  const parts = path.split("/").filter(Boolean);
  const walk = (i: number, j: number): boolean => {
    if (i === segs.length) return j === parts.length;
    const seg = segs[i];
    if (seg === "*" || seg === "$") return true;
    const optional = seg.endsWith("?");
    const name = optional ? seg.slice(0, -1) : seg;
    const isParam = name.startsWith(":") || name.startsWith("$");
    if (j < parts.length && (isParam || name === parts[j]) && walk(i + 1, j + 1)) return true;
    return optional && walk(i + 1, j);
  };
  return walk(0, 0);
}

/** The most specific pattern a path matches: fewest parameters, then the longest. */
export function patternFor(path: string, patterns: RoutePattern[]): RoutePattern | undefined {
  const score = (p: string) => (p.match(/[:$*]/g)?.length ?? 0) * 1000 - p.length;
  return patterns.filter((p) => matchesPattern(p.pattern, path)).sort((a, b) => score(a.pattern) - score(b.pattern))[0];
}

/** One path per pattern, the first seen; a path that matches no pattern is kept as its own. */
export function onePathPerPattern(paths: string[], patterns: RoutePattern[]): string[] {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const key = patternFor(path, patterns)?.pattern ?? path;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
