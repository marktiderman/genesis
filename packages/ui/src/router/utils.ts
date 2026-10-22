/**
 * Helpers shared by the router adapters. Router-free on purpose: nothing here
 * may import a router, so either adapter can use it without pulling in the
 * other's peer.
 */

/**
 * True for a href that leaves the app: a scheme (`https:`, `mailto:`, `tel:`)
 * or a protocol-relative `//host/…`. Router adapters hand these to the browser
 * instead of resolving them as an in-app route.
 */
export function isExternalHref(href: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//");
}

/**
 * Split an in-app href into its path, query string (no `?`) and hash (no `#`).
 * Unlike the active-path matcher's splitter this keeps the path exactly as
 * given (no trailing-slash normalisation): it is a navigation target, not a
 * comparison key.
 */
export function splitNavigationHref(href: string): {
  pathname: string;
  search: string;
  hash: string;
} {
  const hashAt = href.indexOf("#");
  const hash = hashAt === -1 ? "" : href.slice(hashAt + 1);
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const searchAt = beforeHash.indexOf("?");
  return {
    pathname: searchAt === -1 ? beforeHash : beforeHash.slice(0, searchAt),
    search: searchAt === -1 ? "" : beforeHash.slice(searchAt + 1),
    hash,
  };
}
