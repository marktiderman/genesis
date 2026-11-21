/**
 * The one link parser genesis-native's link handling shares (normalizeLink and preview links):
 * `scheme://host/path?query#hash` split by index, so a link from outside never meets a
 * backtracking regex.
 */
const SCHEME = /^[a-z][a-z0-9+.-]*$/i;

export interface ParsedLink {
  path: string;
  query: string;
}

/** `s` without its trailing slashes. */
export function trimSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 47) end--;
  return s.slice(0, end);
}

/** A path with one leading slash, no empty segments and no trailing slash (`/` stays `/`). */
export function cleanPath(path: string): string {
  return `/${path.split("/").filter(Boolean).join("/")}`;
}

function splitQuery(rest: string): ParsedLink {
  const hash = rest.indexOf("#");
  const noHash = hash < 0 ? rest : rest.slice(0, hash);
  const at = noHash.indexOf("?");
  return at < 0 ? { path: noHash, query: "" } : { path: noHash.slice(0, at), query: noHash.slice(at) };
}

/**
 * The path and query of `url` when it is one of the app's: an `http(s)` link on one of `hosts`,
 * a link with one of `schemes` (`acme://clients/1`: "clients" sits where a host would), or
 * already a path. `null` for anything else.
 */
export function parseLink(url: string, schemes: readonly string[], hosts: readonly string[]): ParsedLink | null {
  const trimmed = url.trim();
  const sep = trimmed.indexOf("://");
  if (sep > 0 && SCHEME.test(trimmed.slice(0, sep))) {
    const scheme = trimmed.slice(0, sep).toLowerCase();
    const { path: hostAndPath, query } = splitQuery(trimmed.slice(sep + 3));
    const slash = hostAndPath.indexOf("/");
    const host = slash < 0 ? hostAndPath : hostAndPath.slice(0, slash);
    const path = slash < 0 ? "" : hostAndPath.slice(slash);
    if (scheme === "http" || scheme === "https") {
      const colon = host.lastIndexOf(":");
      const bare = (colon >= 0 && /^\d+$/.test(host.slice(colon + 1)) ? host.slice(0, colon) : host).toLowerCase();
      return hosts.some((h) => h.toLowerCase() === bare) ? { path, query } : null;
    }
    if (!schemes.some((s) => s.toLowerCase() === scheme)) return null;
    return { path: `/${host}${path}`, query };
  }
  // Already a path (expo-router passes paths as well as URLs); another scheme's link isn't ours.
  const colon = trimmed.indexOf(":");
  if (colon > 0 && SCHEME.test(trimmed.slice(0, colon))) return null;
  return splitQuery(trimmed);
}
