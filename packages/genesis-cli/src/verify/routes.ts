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

const clean = (path: string) => `/${path.split("/").filter(Boolean).join("/")}`;
/** A child's full path: an absolute child path (`/products/:id` under `products`) is already full. */
const join = (base: string, path: string) => (path.startsWith("/") ? clean(path) : clean(`${base}/${path}`));

/**
 * Every route that renders a page, with its full pattern: leaves, index routes, and a parent with a
 * path of its own and no index child (it renders at its own path too, around an empty outlet).
 */
export function flattenReactRouterRoutes(routes: ReactRouterRoute[], base = ""): RoutePattern[] {
  const out: RoutePattern[] = [];
  for (const r of routes) {
    const full = r.path !== undefined ? join(base, r.path) : base || "/";
    if (r.children?.length) {
      if (r.path && !r.children.some((c) => c.index)) out.push({ pattern: full, id: r.id });
      out.push(...flattenReactRouterRoutes(r.children, full));
    } else out.push({ pattern: full || "/", id: r.id });
  }
  return out;
}

/** A pattern segment as a regular expression: `:id` and `$id` match one segment, with any static prefix or suffix (`:name.json`). */
function segmentRegex(seg: string): RegExp {
  const parts = seg.split(/([:$][A-Za-z_][\w-]*)/);
  const body = parts.map((part) => (/^[:$][A-Za-z_]/.test(part) ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("");
  return new RegExp(`^${body}$`);
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
    if (j < parts.length && segmentRegex(name).test(parts[j]) && walk(i + 1, j + 1)) return true;
    return optional && walk(i + 1, j);
  };
  return walk(0, 0);
}

/**
 * React Router's route ranking (`computeScore`): more segments rank higher; a static segment
 * counts 10, a parameter 3, a parameter with a static part (`:name.json`) 3.5, an empty segment 1,
 * and a splat takes 2 off. An optional segment (`:section?`) scores as its parameter.
 */
function rank(pattern: string): number {
  const segs = pattern.split("/");
  let score = segs.length;
  if (segs.includes("*") || segs.includes("$")) score -= 2;
  for (const raw of segs) {
    if (raw === "*" || raw === "$") continue;
    const seg = raw.endsWith("?") ? raw.slice(0, -1) : raw;
    if (seg === "") score += 1;
    else if (/^[:$][A-Za-z_][\w-]*$/.test(seg)) score += 3;
    else if (/[:$][A-Za-z_]/.test(seg)) score += 3.5;
    else score += 10;
  }
  return score;
}

/** The pattern a path matches that React Router would pick: the highest-ranked one. */
export function patternFor(path: string, patterns: RoutePattern[]): RoutePattern | undefined {
  return patterns.filter((p) => matchesPattern(p.pattern, path)).sort((a, b) => rank(b.pattern) - rank(a.pattern))[0];
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
