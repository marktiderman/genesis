/**
 * `defineNotifications`: the one list of what an app notifies people about,
 * as `defineFeatures` is the list of what it does. Each type names its
 * category, the channels it may use (and which are on by default), and two
 * flags: `critical` (preferences can't turn it off) and `transactional` (no
 * unsubscribe link, no quiet hours, no digest). The registry also defines the
 * device notification categories (iOS action buttons) and the Android
 * channels the app makes on the phone.
 *
 * It is plain data plus small render functions, so the browser, the phone
 * and the server import the same list. `toTypeRows()` is what is mirrored
 * into the database's `notification_types`.
 */

/** Where a notification can go. `in_app` is the feed. */
export const CHANNELS = ["in_app", "push", "email"] as const;
export type Channel = (typeof CHANNELS)[number];

/** Lower case letters, digits, ".", "_" or "-", up to 64 characters: type keys, category ids. */
export const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** Device category and action ids: Expo asks for no ":" or "-". */
export const IOS_ID_PATTERN = /^[A-Za-z0-9_]{1,64}$/;

/** Android channel importance (Expo's `AndroidImportance`). */
export type ChannelImportance = "min" | "low" | "default" | "high" | "max";

export interface NotificationCategoryDef {
  /** What a person sees in their preferences ("Messages"). */
  label: string;
  description?: string;
  /** Preferences can't turn this category off (account security, say). */
  critical?: boolean;
  /** The Android channel made for it (its id is the category id). Default importance `"default"`. */
  android?: { importance?: ChannelImportance; name?: string };
}

/** An action button on a notification. */
export interface NotificationActionDef {
  id: string;
  title: string;
  /** A reply field instead of a plain button. */
  textInput?: { placeholder?: string; submitTitle?: string };
  /** Opens the app (default false: the action is handled in the background). */
  opensApp?: boolean;
  destructive?: boolean;
  /** Needs the phone unlocked. */
  requiresAuth?: boolean;
}

/** A notification category on the device (iOS's word): the actions a notification shows. */
export interface NotificationActionSetDef {
  actions: readonly NotificationActionDef[];
  /** Shown when the person has hidden previews for the app. */
  previewPlaceholder?: string;
}

/** What a notification says, made from its `data`. */
export interface RenderedText {
  title: string;
  body?: string;
  /** The app path a tap opens (`/messages/42`). */
  url?: string;
  /**
   * Push-only extras, for a type whose app reads more than the link: `ids` always travel
   * (a Reply action needs the conversation and message), `display` only when previews are
   * shown (a sender's name and photo for iOS rich push), and `mutableContent` lets the app's
   * Notification Service Extension run (dropped with hidden previews). Flat values only; the
   * notifier's own keys (`notification_id`, `type`, `url`, `thread_key`) can't be replaced.
   */
  push?: {
    ids?: Record<string, string | number>;
    display?: Record<string, string | number>;
    mutableContent?: boolean;
  };
}

/** A notification's `data`: references and display values, never a secret. */
export type NotificationData = Record<string, unknown>;

export interface NotificationTypeDef<C extends string = string, A extends string = string> {
  category: C;
  /**
   * The channels this type may use, and whether each is on for someone who
   * never chose: `{ in_app: true, push: true, email: false }` offers email
   * as an opt-in. A channel left out is never used.
   */
  channels: Partial<Record<Channel, boolean>>;
  /** Preferences can't turn it off: each channel it offers stays as defaulted. */
  critical?: boolean;
  /**
   * Mail the person needs for something they did (a receipt, a reset): no
   * unsubscribe link, never held by quiet hours or folded into a digest.
   * Rate caps are the domain's.
   */
  transactional?: boolean;
  /**
   * Wait this long before emailing, and skip the email if the person read
   * the notification in the app meanwhile. Default 0 (send at once).
   */
  emailDelaySeconds?: number;
  /** The device category (a key of `actions`) its pushes carry. */
  actions?: A;
  /** `"generic"` always sends neutral push text, whatever the person chose. */
  pushPrivacy?: "default" | "generic";
  /**
   * The email holds a secret link (a one-time token). It is never stored in
   * `data` or pushed: the server builds it at send time with
   * `resolveSecretLink(type, ref)`.
   */
  secretLink?: boolean;
  /** What the feed and the push say. */
  render: (data: NotificationData) => RenderedText;
}

export interface NotificationsInput<
  C extends Record<string, NotificationCategoryDef>,
  A extends Record<string, NotificationActionSetDef>,
  T extends Record<string, NotificationTypeDef<Extract<keyof C, string>, Extract<keyof A, string>>>,
> {
  categories: C;
  actions?: A;
  types: T;
  /** Neutral text for hidden previews. Default "New notification". */
  hiddenPreview?: { title: string; body?: string };
}

/** One row of `notification_types`, as `genesis_notifications_sync_types` takes it. */
export interface NotificationTypeRow {
  key: string;
  category: string;
  channels: Partial<Record<Channel, boolean>>;
  critical: boolean;
  transactional: boolean;
  email_delay_seconds: number;
  secret_link: boolean;
  push_privacy: "default" | "generic";
  ios_category: string | null;
}

export interface MatrixRow {
  id: string;
  label: string;
  description?: string;
  critical: boolean;
  /** The channels some type in the category offers, in `CHANNELS` order. */
  channels: Channel[];
  /** Each offered channel's default: on when any type in the category has it on. */
  defaults: Partial<Record<Channel, boolean>>;
}

export interface NotificationRegistry<
  C extends Record<string, NotificationCategoryDef> = Record<string, NotificationCategoryDef>,
  A extends Record<string, NotificationActionSetDef> = Record<string, NotificationActionSetDef>,
  T extends Record<string, NotificationTypeDef> = Record<string, NotificationTypeDef>,
> {
  readonly categories: C;
  readonly actions: A;
  readonly types: T;
  readonly hiddenPreview: { title: string; body?: string };
  /** The type, or throws: an unknown key is a bug, never dropped quietly. */
  type(key: string): NotificationTypeDef;
  has(key: string): boolean;
  /** Preferences can't turn it off: a critical type, or a type in a critical category. */
  isCritical(key: string): boolean;
  /** What the feed and the push say. A render that throws gives the type's key as the title. */
  render(key: string, data: NotificationData): RenderedText;
  /** The rows mirrored into `notification_types`. */
  toTypeRows(): NotificationTypeRow[];
  /** For a preferences matrix: each category with the channels its types offer. */
  matrix(): MatrixRow[];
  /** The device categories to register (`setNotificationCategoryAsync`). */
  deviceCategories(): { identifier: string; actions: NotificationActionDef[]; previewPlaceholder?: string }[];
  /** The Android channels, one per category. */
  androidChannels(): { id: string; name: string; description?: string; importance: ChannelImportance }[];
}

/** Thrown by `defineNotifications`; lists every problem at once. */
export class NotificationRegistryError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid notifications:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "NotificationRegistryError";
  }
}

/** The longest email delay: a week. */
export const MAX_EMAIL_DELAY_SECONDS = 7 * 24 * 3600;

/**
 * The notification registry.
 *
 * ```ts
 * export const notifications = defineNotifications({
 *   categories: { messages: { label: "Messages", android: { importance: "high" } } },
 *   actions: { message: { actions: [{ id: "reply", title: "Reply", textInput: {} }, { id: "mark_read", title: "Mark as read" }] } },
 *   types: {
 *     "chat.message": {
 *       category: "messages",
 *       channels: { in_app: true, push: true, email: true },
 *       emailDelaySeconds: 600,
 *       actions: "message",
 *       render: (d) => ({ title: String(d.sender_name), body: String(d.preview), url: `/messages/${d.conversation_id}` }),
 *     },
 *   },
 * });
 * ```
 *
 * @stability Beta
 */
export function defineNotifications<
  const C extends Record<string, NotificationCategoryDef>,
  const A extends Record<string, NotificationActionSetDef>,
  const T extends Record<string, NotificationTypeDef<Extract<keyof C, string>, Extract<keyof A, string>>>,
>(input: NotificationsInput<C, A, T>): NotificationRegistry<C, A, T> {
  const problems: string[] = [];
  const categories = input.categories as C & Record<string, NotificationCategoryDef>;
  const actions = (input.actions ?? {}) as A & Record<string, NotificationActionSetDef>;
  const types = input.types as T & Record<string, NotificationTypeDef>;
  const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

  for (const [id, c] of Object.entries(categories)) {
    if (!KEY_PATTERN.test(id)) problems.push(`category "${id}": an id is lower case letters, digits, ".", "_" or "-"`);
    if (!c.label?.trim()) problems.push(`category "${id}": needs a label`);
  }
  for (const [id, set] of Object.entries(actions)) {
    if (!IOS_ID_PATTERN.test(id)) problems.push(`actions "${id}": a device category id is letters, digits or "_" (no ":" or "-")`);
    const seen = new Set<string>();
    for (const a of set.actions) {
      if (!IOS_ID_PATTERN.test(a.id)) problems.push(`actions "${id}": action "${a.id}" is letters, digits or "_"`);
      if (seen.has(a.id)) problems.push(`actions "${id}": action "${a.id}" appears twice`);
      seen.add(a.id);
    }
    if (set.actions.length === 0 || set.actions.length > 4) problems.push(`actions "${id}": one to four actions`);
  }
  for (const [key, t] of Object.entries(types)) {
    if (!KEY_PATTERN.test(key)) problems.push(`type "${key}": a key is lower case letters, digits, ".", "_" or "-"`);
    if (!own(categories, t.category)) problems.push(`type "${key}": unknown category "${String(t.category)}"`);
    const offered = Object.keys(t.channels ?? {});
    if (offered.length === 0) problems.push(`type "${key}": offers no channel`);
    for (const ch of offered) if (!(CHANNELS as readonly string[]).includes(ch)) problems.push(`type "${key}": unknown channel "${ch}"`);
    if (t.actions !== undefined && !own(actions, t.actions)) problems.push(`type "${key}": unknown actions "${String(t.actions)}"`);
    const delay = t.emailDelaySeconds ?? 0;
    if (!Number.isInteger(delay) || delay < 0 || delay > MAX_EMAIL_DELAY_SECONDS) {
      problems.push(`type "${key}": emailDelaySeconds is a whole number from 0 to ${MAX_EMAIL_DELAY_SECONDS}`);
    }
    if (delay > 0 && t.channels?.email === undefined) problems.push(`type "${key}": emailDelaySeconds needs the email channel`);
    if (delay > 0 && t.channels?.in_app === undefined) problems.push(`type "${key}": an email delay skips the mail once read in the app, so it needs the in_app channel`);
    if (t.secretLink && t.channels?.email === undefined) problems.push(`type "${key}": secretLink is for email, and it offers no email channel`);
    if (typeof t.render !== "function") problems.push(`type "${key}": needs a render function`);
  }
  if (problems.length) throw new NotificationRegistryError(problems);

  const hiddenPreview = input.hiddenPreview ?? { title: "New notification" };
  const typeOf = (key: string): NotificationTypeDef => {
    if (!own(types, key)) throw new NotificationRegistryError([`unknown notification type "${key}"`]);
    return types[key]!;
  };
  const isCritical = (key: string) => {
    const t = typeOf(key);
    return Boolean(t.critical || categories[t.category]?.critical);
  };

  return {
    categories,
    actions,
    types,
    hiddenPreview,
    type: typeOf,
    has: (key) => own(types, key),
    isCritical,
    render(key, data) {
      try {
        const out = typeOf(key).render(data ?? {});
        return {
          title: typeof out?.title === "string" && out.title ? out.title : key,
          ...(typeof out?.body === "string" ? { body: out.body } : {}),
          ...(typeof out?.url === "string" && out.url ? { url: out.url } : {}),
          ...(out?.push && typeof out.push === "object" ? { push: out.push } : {}),
        };
      } catch {
        return { title: key };
      }
    },
    toTypeRows() {
      return Object.entries(types).map(([key, t]) => ({
        key,
        category: t.category,
        channels: { ...t.channels },
        critical: isCritical(key),
        transactional: Boolean(t.transactional),
        email_delay_seconds: t.emailDelaySeconds ?? 0,
        secret_link: Boolean(t.secretLink),
        push_privacy: t.pushPrivacy ?? "default",
        ios_category: t.actions ?? null,
      }));
    },
    matrix() {
      const rows: MatrixRow[] = [];
      for (const [id, c] of Object.entries(categories)) {
        const defaults: Partial<Record<Channel, boolean>> = {};
        let critical = Boolean(c.critical);
        for (const [key, t] of Object.entries(types)) {
          if (t.category !== id) continue;
          for (const [ch, on] of Object.entries(t.channels) as [Channel, boolean][]) defaults[ch] = Boolean(defaults[ch] || on);
          if (isCritical(key)) critical = true;
        }
        const channels = CHANNELS.filter((ch) => ch in defaults);
        if (channels.length) rows.push({ id, label: c.label, ...(c.description ? { description: c.description } : {}), critical, channels, defaults });
      }
      return rows;
    },
    deviceCategories() {
      return Object.entries(actions).map(([identifier, set]) => ({
        identifier,
        actions: [...set.actions],
        ...(set.previewPlaceholder ? { previewPlaceholder: set.previewPlaceholder } : {}),
      }));
    },
    androidChannels() {
      return Object.entries(categories).map(([id, c]) => ({
        id,
        name: c.android?.name ?? c.label,
        ...(c.description ? { description: c.description } : {}),
        importance: c.android?.importance ?? "default",
      }));
    },
  };
}

/**
 * The actions a message notification shows: Reply (a text field) and Mark as
 * read. Put it in `actions` under an id (`message`) and name that id in the
 * message type's `actions`. A tap on either reaches the push block's
 * `onResponse`; `notificationAction(response)` gives the action id, the typed
 * text and the notification id (use it as the reply's client id, so a
 * retried reply stays one reply).
 */
export const MESSAGE_ACTIONS = {
  actions: [
    { id: "reply", title: "Reply", textInput: { placeholder: "Message", submitTitle: "Send" } },
    { id: "mark_read", title: "Mark as read" },
  ],
} as const satisfies NotificationActionSetDef;

/** The category and type of Admin -> Send a test (`genesis.test`, which the migration creates). Spread them into your registry. */
export const GENESIS_TEST_CATEGORY = { genesis: { label: "Tests", description: "Test notifications an admin sends themself." } } as const satisfies Record<string, NotificationCategoryDef>;
export const GENESIS_TEST_TYPE = {
  "genesis.test": {
    category: "genesis",
    channels: { in_app: true, push: true, email: true },
    critical: true,
    transactional: true,
    render: () => ({ title: "Test notification", body: "If you can read this, this channel works." }),
  },
} as const satisfies Record<string, NotificationTypeDef<"genesis">>;
