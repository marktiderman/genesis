/**
 * Deep links: turn an incoming universal link or app link into an app path.
 *
 * Meant for expo-router's `app/+native-intent.ts`:
 *
 *   export function redirectSystemPath({ path }: { path: string }) {
 *     return normalizeLink(path, links);
 *   }
 *
 * A link to a path the map doesn't know goes to `"/"` (and `onUnknown`), so a
 * stale or mistyped link opens the app instead of a "not found" screen. It
 * never throws: anything it can't read is unknown.
 */

/** A target path (`"/clients/:id"`, params filled in) or a function of the params. */
export type LinkTarget = string | ((params: Record<string, string>) => string);

export interface LinkOptions {
  /** App schemes, without `://` (`["myapp"]`). `myapp://clients/1` is the path `/clients/1`. */
  schemes?: readonly string[];
  /** Hosts of universal / app links (`["example.com"]`). Other hosts are unknown. */
  hosts?: readonly string[];
  /**
   * Incoming path pattern → app path. A segment `:name` captures one
   * segment, a final `*` captures the rest (as `params["*"]`). The first
   * match wins; `"/"` is always known.
   */
  map: Readonly<Record<string, LinkTarget>>;
  /** Patterns to ignore (return `null`, so expo-router doesn't navigate), e.g. an auth callback. */
  ignore?: readonly string[];
  /** Told about each link that went to `"/"` because nothing matched. */
  onUnknown?: (url: string) => void;
}

const URL_PATTERN = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i;

interface Parsed {
  path: string;
  query: string;
}

function parse(url: string, schemes: readonly string[], hosts: readonly string[]): Parsed | null {
  const trimmed = url.trim();
  const match = URL_PATTERN.exec(trimmed);
  if (!match) {
    // Already a path (expo-router passes paths as well as URLs).
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
    const noHash = trimmed.split("#")[0] ?? "";
    const at = noHash.indexOf("?");
    return at < 0 ? { path: noHash, query: "" } : { path: noHash.slice(0, at), query: noHash.slice(at) };
  }
  const [, scheme = "", host = "", path = "", query = ""] = match;
  const lowerScheme = scheme.toLowerCase();
  if (lowerScheme === "http" || lowerScheme === "https") {
    const bareHost = host.toLowerCase().replace(/:\d+$/, "");
    if (!hosts.some((h) => h.toLowerCase() === bareHost)) return null;
    return { path, query };
  }
  if (!schemes.some((s) => s.toLowerCase() === lowerScheme)) return null;
  // In `myapp://clients/1`, "clients" sits where a host would.
  return { path: `/${host}${path}`, query };
}

function clean(path: string): string {
  const joined = `/${path}`.replace(/\/{2,}/g, "/");
  return joined.length > 1 ? joined.replace(/\/$/, "") : joined;
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const want = clean(pattern).split("/").slice(1);
  const have = path.split("/").slice(1);
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    const segment = want[i]!;
    if (segment === "*" && i === want.length - 1) {
      params["*"] = have.slice(i).join("/");
      return params;
    }
    const value = have[i];
    if (value === undefined) return null;
    if (segment.startsWith(":")) params[segment.slice(1)] = value;
    else if (segment !== value) return null;
  }
  return want.length === have.length ? params : null;
}

function fill(target: LinkTarget, params: Record<string, string>): string {
  if (typeof target === "function") return target(params);
  return target.replace(/:([A-Za-z_][A-Za-z0-9_]*)|\*$/g, (token, name: string | undefined) =>
    name === undefined ? (params["*"] ?? "") : (params[name] ?? token),
  );
}

function withQuery(path: string, query: string): string {
  if (!query || query === "?") return path;
  return path.includes("?") ? `${path}&${query.slice(1)}` : `${path}${query}`;
}

/** The app path for `url`, `"/"` when it is unknown, or `null` when it is ignored. */
export function normalizeLink(url: string, options: LinkOptions): string | null {
  const { schemes = [], hosts = [], map, ignore = [], onUnknown } = options;
  const unknown = () => {
    onUnknown?.(url);
    return "/";
  };
  let parsed: Parsed | null;
  try {
    parsed = parse(url, schemes, hosts);
  } catch {
    parsed = null;
  }
  if (!parsed) return unknown();
  const path = clean(parsed.path);
  if (ignore.some((pattern) => matchPattern(pattern, path))) return null;
  if (path === "/") return withQuery("/", parsed.query);
  for (const [pattern, target] of Object.entries(map)) {
    const params = matchPattern(pattern, path);
    if (!params) continue;
    try {
      return withQuery(fill(target, params), parsed.query);
    } catch {
      return unknown();
    }
  }
  return unknown();
}
