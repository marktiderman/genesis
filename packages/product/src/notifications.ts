/**
 * Telling people their idea shipped, through genesis-notifications, for an app
 * whose ideas live in its own database (people with logins or emails, not
 * GitHub accounts).
 *
 * `productNotifications` is a fragment for the app's own `defineNotifications`
 * registry: the app owns the registry and its categories, and spreads this in.
 * `notifyShipped` sends one notification per shipped feature to everyone who
 * asked for it, keyed `shipped:<release>:<feature>`, so a re-run sends nothing
 * twice and a re-ship under a new release name notifies again; `cancelShipped`
 * stops what hasn't gone out when a release is withdrawn. Run genesis-notifications'
 * `syncNotificationTypes` after adding the fragment, or `notify` refuses the type.
 *
 * ```ts
 * import { defineNotifications } from "@marktiderman/genesis-notifications";
 * import { notify, cancelNotification } from "@marktiderman/genesis-notifications/server";
 * import { productNotifications, notifyShipped } from "@marktiderman/genesis-product/server";
 *
 * export const notifications = defineNotifications({
 *   categories: { ...productNotifications.categories },
 *   types: { ...productNotifications.types },
 * });
 * await notifyShipped((input) => notify(supabase, input, { registry: notifications }), {
 *   release: "2026-10-26", feature, recipients: askers,
 * });
 * ```
 *
 * On a repo whose ideas are GitHub issues only, don't call `notify()`: the
 * "Shipped in release …" comment `genesis-product release --notify --yes` posts
 * already tells the issue's author and everyone subscribed to it.
 *
 * Typed structurally, so this package doesn't depend on genesis-notifications;
 * its tests check the shapes against the real one. No I/O and no `node:`
 * imports: the registry is imported by the server, the web and React Native.
 */

/** The notification type of "an idea you asked for shipped". @stability Experimental */
export const PRODUCT_SHIPPED_TYPE = "product.idea_shipped";

/** Its category: what a person turns on or off in their preferences. @stability Experimental */
export const PRODUCT_UPDATES_CATEGORY = "product_updates";

/** What `render` reads from a shipped notification's `data`. @stability Experimental */
export type ShippedData = {
  release: string;
  featureId: string;
  featureName: string;
  /** `live`: shipped to everyone; `beta`: there to try. */
  change: "live" | "beta";
  /** The feature's tagline (or summary), for the body. */
  tagline?: string;
  /** The app path a tap opens (the release notes, the feature). */
  url?: string;
};

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);

/**
 * A path on the app's own origin (`/whats-new`), the only links the notifier's
 * runner puts in a push or an email: not `https://…`, `//host`, `javascript:`
 * or a relative path, and no spaces, control characters or backslashes.
 */
const APP_PATH = /^\/(?![/\\])[^\s\\\u0000-\u001f\u007f]*$/;

/** @stability Experimental */
export function isAppPath(url: string): boolean {
  return APP_PATH.test(url);
}

function renderShipped(data: Record<string, unknown>): { title: string; body: string; url?: string } {
  const name = text(data.featureName) ?? text(data.featureId) ?? "Something you asked for";
  const release = text(data.release);
  const url = text(data.url);
  return {
    title: data.change === "beta" ? `${name} is in beta` : `${name} has shipped`,
    body: text(data.tagline) ?? (release ? `You asked for it, and it's in release ${release}.` : "You asked for it, and it's here."),
    // A stored row with any other link opens nothing, as the runner's push and email do.
    ...(url && isAppPath(url) ? { url } : {}),
  };
}

/**
 * The fragment for the app's `defineNotifications({ categories, types })`.
 * Not critical and not transactional, so preferences, quiet hours and the
 * unsubscribe link all apply. In the feed and by email by default; push is
 * offered as an opt-in. Spread it and override what you need.
 *
 * @stability Experimental
 */
export const productNotifications = {
  categories: {
    [PRODUCT_UPDATES_CATEGORY]: {
      label: "Product updates",
      description: "When something you asked for or voted on ships.",
    },
  },
  types: {
    [PRODUCT_SHIPPED_TYPE]: {
      category: PRODUCT_UPDATES_CATEGORY,
      channels: { in_app: true, email: true, push: false },
      critical: false,
      transactional: false,
      render: renderShipped,
    },
  },
} as const;

/** A recipient as genesis-notifications' `notify()` takes one. @stability Experimental */
export type ProductRecipient = string | { userId: string; badge?: number } | { email: string; name?: string; ref?: string };

/** What `notifyShipped` hands to `notify` (a genesis-notifications `NotifyInput`). @stability Experimental */
export interface ProductNotifyInput {
  type: typeof PRODUCT_SHIPPED_TYPE;
  recipients: ProductRecipient[];
  data: ShippedData;
  idempotencyKey: string;
  tenantId?: string;
}

/** What `cancelShipped` hands to `cancel` (a genesis-notifications `CancelInput`). @stability Experimental */
export interface ProductCancelInput {
  type: typeof PRODUCT_SHIPPED_TYPE;
  idempotencyKey: string;
  tenantId?: string;
  archive?: boolean;
}

/** The feature that shipped: a `CatalogFeature` fits. @stability Experimental */
export interface ShippedFeature {
  id: string;
  name: string;
  tagline?: string;
  summary?: string;
}

/** Options for {@link notifyShipped}. @stability Experimental */
export interface NotifyShippedOptions {
  /** The release's name, as in the notes (`2026-10-26`). */
  release: string;
  feature: ShippedFeature;
  /** Everyone who asked for it or voted for it. The same user id or email address twice is sent once (a login listed by id and by email is two). */
  recipients: readonly ProductRecipient[];
  /** Default `live`. */
  change?: "live" | "beta";
  /** The app path a tap opens, on the app's own origin (`/whats-new`); anything else throws. */
  url?: string;
  /** The workspace or organization (a uuid), for its sender identity and defaults. Use the same one to cancel. */
  tenantId?: string;
}

/** `shipped:<release>:<feature>`: the same release and feature never notify twice. @stability Experimental */
export function shippedKey(release: string, featureId: string): string {
  if (!release.trim() || !featureId.trim()) throw new Error("shippedKey: a release and a feature id are required");
  // "a:b" + "c" and "a" + "b:c" would be the same key.
  if (release.includes(":") || featureId.includes(":")) throw new Error("shippedKey: a release name or feature id can't contain \":\"");
  const key = `shipped:${release.trim()}:${featureId.trim()}`;
  if (key.length > 200) throw new Error("shippedKey: the release and feature id are too long for an idempotency key (200 characters)");
  return key;
}

const recipientKey = (r: ProductRecipient) =>
  typeof r === "string" ? `u:${r.toLowerCase()}` : "userId" in r ? `u:${r.userId.toLowerCase()}` : `e:${r.email.trim().toLowerCase()}`;

/** The most recipients genesis-notifications' `notify()` takes in one call. @stability Experimental */
export const NOTIFY_BATCH = 1000;

/**
 * One `product.idea_shipped` notification to everyone who asked for a
 * feature, keyed `shipped:<release>:<feature>`. `notify` is
 * genesis-notifications' `notify` with the client and registry bound. It is
 * called once per 1,000 recipients (notify's limit), each call with the same
 * key, which is unique per recipient, so a re-run after a failed batch sends
 * nobody a second one. Resolves each call's result; with no recipients,
 * `notify` isn't called and it resolves `[]`.
 *
 * @stability Experimental
 */
export async function notifyShipped<T>(notify: (input: ProductNotifyInput) => Promise<T>, options: NotifyShippedOptions): Promise<T[]> {
  const idempotencyKey = shippedKey(options.release, options.feature.id);
  if (options.url !== undefined && !isAppPath(options.url)) {
    throw new Error(`notifyShipped: url "${options.url}" isn't a path on the app (like /whats-new); the notifier would send it with no link.`);
  }
  const seen = new Set<string>();
  const recipients = options.recipients.filter((r) => {
    const key = recipientKey(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const tagline = text(options.feature.tagline) ?? text(options.feature.summary);
  const data: ShippedData = {
    release: options.release.trim(),
    featureId: options.feature.id.trim(),
    featureName: options.feature.name,
    change: options.change ?? "live",
    ...(tagline ? { tagline } : {}),
    ...(options.url ? { url: options.url } : {}),
  };
  const results: T[] = [];
  for (let i = 0; i < recipients.length; i += NOTIFY_BATCH) {
    results.push(
      await notify({
        type: PRODUCT_SHIPPED_TYPE,
        recipients: recipients.slice(i, i + NOTIFY_BATCH),
        data,
        idempotencyKey,
        ...(options.tenantId ? { tenantId: options.tenantId } : {}),
      }),
    );
  }
  return results;
}

/**
 * A release was withdrawn: stop the shipped notifications for one feature
 * that haven't gone out yet, and take them out of the feed (`archive`, on by
 * default). Only sends still waiting are stopped: email goes out as soon as
 * the runner picks it up, so most of it has usually gone already. The rows
 * stay, so the same release name and feature never notify again: re-publish a
 * fixed release under a new name. `cancel` is genesis-notifications'
 * `cancelNotification` with the client bound. Pass the `tenantId` the
 * notifications were sent with.
 *
 * @stability Experimental
 */
export function cancelShipped<T>(
  cancel: (input: ProductCancelInput) => Promise<T>,
  options: { release: string; featureId: string; tenantId?: string; archive?: boolean },
): Promise<T> {
  return cancel({
    type: PRODUCT_SHIPPED_TYPE,
    idempotencyKey: shippedKey(options.release, options.featureId),
    ...(options.tenantId ? { tenantId: options.tenantId } : {}),
    archive: options.archive ?? true,
  });
}
