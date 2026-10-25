/**
 * Rich push payloads: what a sender adds to an Expo push message so the iOS
 * Notification Service Extension (`@marktiderman/genesis-native/rich-push-plugin`)
 * runs on it. No React, no React Native, no Node APIs: a server, an edge
 * function or Deno imports it from `@marktiderman/genesis-native/push-payload`.
 *
 *   await expo.send([richPushMessage({ to, title, body, data: { url } }, { image })]);
 *
 * iOS runs the extension only when the push says `mutable-content: 1`, which
 * Expo's push service sets from `mutableContent: true`. Without it the
 * notification arrives as sent and the extension never sees it.
 */

/** The image fields the extension reads from `data`. */
export interface RichPushData {
  /** An https image to attach (a photo in the message). Anything but https is dropped. */
  image?: string | null | undefined;
  /** The sender's photo, https. On a `messages` push it is the sender's avatar; on any other it is attached. */
  senderAvatar?: string | null | undefined;
}

/** The part of an Expo push message this touches. */
export interface RichPushMessageLike {
  data?: Record<string, unknown> | undefined;
  mutableContent?: boolean | undefined;
}

export const RICH_PUSH_IMAGE_FIELDS = ["image", "senderAvatar"] as const;

/** The extension downloads only https URLs (no credentials, at most 2048 characters); this is the same check. */
export function isRichPushUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0 && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * The message with `mutableContent: true` and the image fields in its `data`.
 * A field given in `rich` replaces the one in `data`; one that isn't an https
 * URL is left out (the extension would ignore it). `data`'s other fields are
 * kept as they are.
 */
export function richPushMessage<M extends RichPushMessageLike>(
  message: M,
  rich: RichPushData = {},
): Omit<M, "mutableContent" | "data"> & { mutableContent: true; data: Record<string, unknown> } {
  const data: Record<string, unknown> = { ...(message.data ?? {}) };
  for (const key of RICH_PUSH_IMAGE_FIELDS) {
    if (key in rich) data[key] = rich[key];
    if (key in data && !isRichPushUrl(data[key])) delete data[key];
  }
  return { ...message, mutableContent: true, data };
}
