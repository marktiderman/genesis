/**
 * Preview links: a link that opens the app on an update channel (a pull request's `pr-<number>`,
 * `staging`), so a reviewer taps a link in a pull request, Slack or an email and lands on the
 * preview, in the app they already have.
 *
 * The forms a preview arrives in, all read by `previewLinkChannel`:
 * - `https://<web host>/preview?channel=pr-42` (a universal / app link; the web serves a landing
 *   page at the same path for a phone without the app, and its AASA / assetlinks list `/preview`);
 * - `<scheme>:///preview?channel=pr-42` (the QR code: three slashes, so `preview` is the path, not
 *   a host a router would drop the query with) and `<scheme>://preview?channel=pr-42`;
 * - `/preview/pr-42`, the path form;
 * - Expo's own QR, `<scheme>://expo-development-client/?url=https://u.expo.dev/<project>?channel-name=pr-42`
 *   (EAS's `github-comment` posts it), so the stock comment opens a release build too.
 *
 * A channel name is checked (`isChannelName`): a crafted link can't put anything else in the
 * request header. Pure: no React Native, so it runs anywhere (the web's landing page included).
 */
import { isChannelName } from "./channels";
import { cleanPath, parseLink, trimSlashes } from "../link-parse";

/** The app path a preview link opens. */
export const PREVIEW_PATH = "/preview";

function queryParam(query: string, name: string): string | null {
  for (const part of query.replace(/^\?/, "").split("&")) {
    if (!part) continue;
    const at = part.indexOf("=");
    const key = at < 0 ? part : part.slice(0, at);
    if (decode(key) !== name) continue;
    return decode(at < 0 ? "" : part.slice(at + 1));
  }
  return null;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

export interface PreviewLinkOptions {
  /** App schemes, without `://`. */
  schemes?: readonly string[];
  /** Hosts whose https links are the app's (universal / app links). */
  hosts?: readonly string[];
  /** The app path previews open at. Default `/preview`. */
  path?: string;
}

/**
 * What a link says about a preview: `null` when it isn't a preview link; `{ channel }` when it
 * names a valid channel; `{ channel: null }` when it is a preview link without a usable channel
 * (missing, or not a channel name).
 */
export function previewLinkChannel(url: string, options: PreviewLinkOptions = {}): { channel: string | null } | null {
  const { schemes = [], hosts = [], path: previewPath = PREVIEW_PATH } = options;
  const base = trimSlashes(previewPath) || PREVIEW_PATH;
  const parsed = parseLink(url, schemes, hosts);
  if (!parsed) return null;
  const path = cleanPath(parsed.path);
  const query = parsed.query;

  // Expo's development-client QR names the update URL, whose query names the channel.
  if (path === "/expo-development-client") {
    const inner = queryParam(query, "url");
    if (!inner) return null;
    const at = inner.indexOf("?");
    const channel = at < 0 ? null : queryParam(inner.slice(at), "channel-name");
    if (channel === null) return null;
    return { channel: isChannelName(channel) ? channel : null };
  }
  if (path === base) {
    const channel = queryParam(query, "channel");
    return { channel: channel !== null && isChannelName(channel) ? channel : null };
  }
  if (path.startsWith(`${base}/`)) {
    const channel = decode(path.slice(base.length + 1));
    return { channel: isChannelName(channel) ? channel : null };
  }
  return null;
}

/** The app path for a channel's preview (`/preview?channel=pr-42`). */
export function previewPath(channel: string, path: string = PREVIEW_PATH): string {
  return `${path}?channel=${encodeURIComponent(channel)}`;
}

/**
 * The link to share for a channel: `https://<origin>/preview?channel=…` when the app has a web
 * origin (it opens the app where installed, the landing page elsewhere), else the scheme link.
 */
export function previewLink(channel: string, at: { origin?: string; scheme?: string }, path: string = PREVIEW_PATH): string {
  if (!isChannelName(channel)) throw new Error(`Not a channel name: "${channel}"`);
  if (at.origin) return `${trimSlashes(at.origin)}${previewPath(channel, path)}`;
  if (at.scheme) return `${at.scheme}://${previewPath(channel, path)}`;
  throw new Error("previewLink needs an origin or a scheme");
}
