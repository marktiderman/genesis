/**
 * Routes a report carries (the reporter's, so untrusted). Kept out of `contract.ts`, which is
 * byte-identical with the intake function's copy.
 */

/**
 * Whether a report's route is a path on this site, safe to link: one leading "/", not "//" or
 * "/\\" (another host), no scheme, no whitespace or control characters, and no placeholder
 * segment (":id") where cleanRoute took an id out.
 */
export function isSitePath(route: string | null | undefined): route is string {
  if (typeof route !== "string" || !/^\/(?![/\\])/.test(route)) return false;
  // A route with its ids taken out (/products/:id) names no real page: never a link.
  if (route.split("/").some((segment) => segment.startsWith(":"))) return false;
  // A char-code check: a control-character regex trips lint.
  for (let i = 0; i < route.length; i++) if (route.charCodeAt(i) <= 0x20 || route.charCodeAt(i) === 0x7f) return false;
  return true;
}

// Native route mounting: one place, aware of the app's navigation zones -------------------------

/**
 * A support screen, as a path under the block's `basePath` names it. `supportScreenOf` reads one
 * from a path; `SupportRoute` (`/native`) renders it.
 *
 * @stability Beta
 */
export type SupportScreen =
  | { name: "inbox" }
  | { name: "feedback" }
  | { name: "thread"; id: string }
  | { name: "ideas" }
  | { name: "shipped" }
  | { name: "home" }
  | { name: "message" }
  | { name: "help" }
  | { name: "article"; slug: string }
  | { name: "agent" }
  | { name: "agentThread"; id: string };

/** The screens' names, for a `screens` override map. @stability Beta */
export type SupportScreenName = SupportScreen["name"];

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/**
 * The navigation zone a path is in: the longest of `zones` (route prefixes like `/admin`, `/coach`;
 * expo-router groups such as `(tabs)` aren't in a path) that starts it, else "" (no zone).
 *
 * @stability Beta
 */
export function zoneOf(path: string, zones: readonly string[] = []): string {
  const clean = trimSlash(path.split(/[?#]/)[0] ?? "");
  let best = "";
  for (const z of zones) {
    const zone = trimSlash(z.startsWith("/") ? z : `/${z}`);
    if (zone !== "/" && zone.length > best.length && under(clean, zone)) best = zone;
  }
  return best;
}

/** The path without its zone: `/admin/account/support/new` → `/account/support/new`. @stability Beta */
export function stripZone(path: string, zones: readonly string[] = []): string {
  const zone = zoneOf(path, zones);
  return zone ? path.slice(zone.length) || "/" : path;
}

/**
 * A support path in a zone: `/account/support/ideas` in `/admin` is `/admin/account/support/ideas`.
 * A path already in the zone, or "" for no zone, stays as it is.
 *
 * @stability Beta
 */
export function inZone(href: string, zone: string): string {
  if (!zone || !href.startsWith("/") || under(href.split(/[?#]/)[0] ?? "", zone)) return href;
  return `${zone}${href}`;
}

const STATIC: Record<string, SupportScreen> = {
  new: { name: "feedback" },
  ideas: { name: "ideas" },
  shipped: { name: "shipped" },
  home: { name: "home" },
  message: { name: "message" },
  help: { name: "help" },
  agent: { name: "agent" },
};

/**
 * Which support screen a path is: the path (with or without its zone and query) under `basePath`,
 * or null when it isn't a support path. The paths are `supportPaths(basePath)`'s.
 *
 * ```ts
 * supportScreenOf("/admin/account/support/help/reset", "/account/support", ["/admin"]);
 * // { name: "article", slug: "reset" }
 * ```
 *
 * @stability Beta
 */
export function supportScreenOf(path: string, basePath = "/support", zones: readonly string[] = []): SupportScreen | null {
  const base = trimSlash(basePath) || "/support";
  const clean = trimSlash(stripZone(path.split(/[?#]/)[0] ?? "", zones));
  if (!under(clean, base)) return null;
  const rest = clean.slice(base.length).split("/").filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  if (rest.length === 0) return { name: "inbox" };
  const [first, second, ...more] = rest as [string, ...string[]];
  if (more.length) return null;
  if (second === undefined) return STATIC[first] ?? { name: "thread", id: first };
  if (first === "help") return { name: "article", slug: second };
  if (first === "agent") return { name: "agentThread", id: second };
  return null;
}
