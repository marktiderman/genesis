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
