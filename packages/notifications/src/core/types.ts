/**
 * The shapes the notifier's parts share: what a domain passes to `notify()`,
 * a feed row as the database returns it, and a person's preferences.
 */
import type { Channel, NotificationData } from "./registry";

/** A recipient with a login, by user id. */
export interface UserRecipient {
  userId: string;
}

/**
 * Someone with no login (an invitee, a form respondent): email only, never a
 * feed. `ref` is the domain's id for them ("people:42"), so erasing them
 * finds their rows.
 */
export interface EmailRecipient {
  email: string;
  name?: string;
  ref?: string;
}

/** A user id string, or one of the two shapes. */
export type Recipient = string | UserRecipient | EmailRecipient;

/** A brand the caller passes (the tenant's default is used for what it leaves out). */
export interface NotificationBrand {
  name?: string;
  logoUrl?: string;
  /** A CSS colour (`#1d4ed8`), for the email's accent. */
  color?: string;
  /** Where a recipient goes from the email's footer. */
  url?: string;
}

/** What a domain asks for. The notifier decides channel, timing and preferences. */
export interface NotifyInput<K extends string = string> {
  type: K;
  recipients: readonly Recipient[];
  /** References and display values the type's render reads. Never a secret or a secret link. */
  data?: NotificationData;
  /** Unique per recipient: the same key again is the same notification, never a second one. */
  idempotencyKey: string;
  /** Groups pushes on the lock screen (iOS `threadId`): a conversation id. */
  threadKey?: string;
  /** A newer one replaces an older one with the same key that hasn't gone out (and on screen). */
  collapseKey?: string;
  /** The app icon badge, as the caller counts it. */
  badge?: number;
  /** The practice, workspace or organization it belongs to: its sender identity and defaults apply. */
  tenantId?: string;
  brand?: NotificationBrand;
  /**
   * A plaintext token that exists only hashed in the domain's tables (an
   * invite). It travels only on the email's send job, encrypted, and is
   * cleared once the email is sent; `resolveSecretLink` receives it.
   */
  secret?: string;
}

/** One row `notify()` made or found again. */
export interface NotifyResult {
  notificationId: string;
  recipientKey: string;
  /** False when the idempotency key had been used for this recipient already. */
  created: boolean;
}

/** A feed row, as the browser reads it under row level security. */
export interface NotificationRow {
  id: string;
  type: string;
  category: string;
  tenant_id: string | null;
  data: NotificationData;
  thread_key: string | null;
  created_at: string;
  seen_at: string | null;
  read_at: string | null;
  archived_at: string | null;
}

/** Delivery states. */
export const DELIVERY_STATUSES = ["pending", "sending", "sent", "delivered", "failed", "skipped", "cancelled"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** A person's explicit choices: category id → channel → on. Absent means the default. */
export type ChannelChoices = Record<string, Partial<Record<Channel, boolean>>>;
