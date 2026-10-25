/**
 * Where a tapped notification goes. The sender puts an app path in
 * `data.url` (`/messages/42`); it goes through the same `normalizeLink` as
 * every deep link, so a path the app doesn't know opens `/` and an ignored
 * one goes nowhere. Without link options, only a plain app path is followed.
 */
import { normalizeLink, type LinkOptions } from "../links";
import type { NotificationLike, NotificationResponseLike } from "./modules";

const ANY_PATH: LinkOptions = { map: { "/*": "/*" } };

/** The data a notification carries (`content.data`), or `{}`. */
export function notificationData(notification: NotificationLike): Record<string, unknown> {
  const data = notification.request?.content?.data;
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

/** The app path a tap should open, or null. */
export function pathForResponse(response: NotificationResponseLike, links?: LinkOptions): string | null {
  const url = notificationData(response.notification).url;
  if (typeof url !== "string" || url.length === 0 || url.length > 2048) return null;
  if (links) return normalizeLink(url, links);
  // No link map: an app path only (never another app's URL), with "." and ".." refused as normalizeLink does.
  if (!url.startsWith("/") || url.startsWith("//") || url.includes("\\")) return null;
  const path = normalizeLink(url, ANY_PATH);
  return path === "/" && url.split(/[?#]/)[0] !== "/" ? null : path;
}
