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

import { PREVIEW_PATH, previewLinkChannel, previewPath } from "./updates/preview-links";
import { cleanPath, parseLink, type ParsedLink } from "./link-parse";

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
  /**
   * Preview links (`/preview?channel=pr-42`, `/preview/pr-42`, Expo's development-client QR) open
   * the preview screen at `path` with a checked `channel` (updates/preview-links.ts). On by
   * default at `/preview`; `false` turns it off.
   */
  previews?: false | { path?: string };
}

const clean = cleanPath;

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

function isDotSegment(segment: string): boolean {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Malformed escapes stay as they are.
  }
  return decoded === "." || decoded === "..";
}

function withQuery(path: string, query: string): string {
  if (!query || query === "?") return path;
  return path.includes("?") ? `${path}&${query.slice(1)}` : `${path}${query}`;
}

/** The app path for `url`, `"/"` when it is unknown, or `null` when it is ignored. */
export function normalizeLink(url: string, options: LinkOptions): string | null {
  const { schemes = [], hosts = [], map, ignore = [], onUnknown, previews = {} } = options;
  let parsed: ParsedLink | null;
  try {
    parsed = parseLink(url, schemes, hosts);
  } catch {
    parsed = null;
  }
  // An ignored path stays ignored, a preview's included.
  if (parsed && ignore.some((pattern) => matchPattern(pattern, clean(parsed.path)))) return null;
  // The app's own map comes first: a preview applies only where no app pattern matches the path.
  const mapped = parsed ? Object.keys(map).some((pattern) => matchPattern(pattern, clean(parsed.path))) : false;
  if (previews !== false && !mapped) {
    const path = previews.path ?? PREVIEW_PATH;
    let preview: { channel: string | null } | null = null;
    try {
      preview = previewLinkChannel(url, { schemes, hosts, path });
    } catch {
      preview = null;
    }
    if (preview) return preview.channel ? previewPath(preview.channel, path) : path;
  }
  const unknown = () => {
    onUnknown?.(url);
    return "/";
  };
  if (!parsed) return unknown();
  const path = clean(parsed.path);
  // "." and ".." would let a link climb out of the path it matched (a `*` capture included).
  if (path.split("/").some(isDotSegment)) {
    return unknown();
  }
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
