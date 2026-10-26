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
 * stops what hasn't gone out when a release is withdrawn.
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

function renderShipped(data: Record<string, unknown>): { title: string; body: string; url?: string } {
  const name = text(data.featureName) ?? text(data.featureId) ?? "Something you asked for";
  const release = text(data.release);
  const url = text(data.url);
  return {
    title: data.change === "beta" ? `${name} is in beta` : `${name} has shipped`,
    body: text(data.tagline) ?? (release ? `You asked for it, and it's in release ${release}.` : "You asked for it, and it's here."),
    ...(url ? { url } : {}),
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
  /** Everyone who asked for it or voted for it; the same person twice is sent once. */
  recipients: readonly ProductRecipient[];
  /** Default `live`. */
  change?: "live" | "beta";
  /** The app path a tap opens. */
  url?: string;
  /** The workspace or organization, for its sender identity and defaults. Use the same one to cancel. */
  tenantId?: string;
}

/** `shipped:<release>:<feature>`: the same release and feature never notify twice. @stability Experimental */
export function shippedKey(release: string, featureId: string): string {
  if (!release.trim() || !featureId.trim()) throw new Error("shippedKey: a release and a feature id are required");
  const key = `shipped:${release.trim()}:${featureId.trim()}`;
  if (key.length > 200) throw new Error("shippedKey: the release and feature id are too long for an idempotency key (200 characters)");
  return key;
}

const recipientKey = (r: ProductRecipient) => (typeof r === "string" ? `u:${r}` : "userId" in r ? `u:${r.userId}` : `e:${r.email.trim().toLowerCase()}`);

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
    featureId: options.feature.id,
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
 * that haven't gone out (and, with `archive`, take them out of the feed).
 * `cancel` is genesis-notifications' `cancelNotification` with the client
 * bound. Pass the `tenantId` the notifications were sent with.
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
    ...(options.archive !== undefined ? { archive: options.archive } : {}),
  });
}
