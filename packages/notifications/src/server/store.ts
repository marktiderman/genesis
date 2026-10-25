/**
 * The database half, through the service role: what the runner and the
 * handler call. `supabaseNotificationStore(admin)` wraps migration 0001's
 * functions; tests (and an app with another queue) pass their own.
 */
import type { Channel, NotificationTypeRow } from "../core/registry";

type RpcResult = { data: unknown; error: { message?: string; code?: string | null } | null };

/** The part of a Supabase client the store uses, signed in with the service role (`SUPABASE_SECRET_KEY`). */
export interface RpcClient {
  // Loose on purpose: a client typed by an app's Database narrows `rpc`'s names to its own.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: any, args?: any) => PromiseLike<RpcResult>;
}

/** A database refusal, with its SQLSTATE; never the row it refused. */
export class NotificationStoreError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string | null,
  ) {
    super(`${operation} failed${code ? ` (${code})` : ""}`);
    this.name = "NotificationStoreError";
  }
}

export interface ClaimedDevice {
  id: string;
  token: string;
  platform: string;
}

export interface SenderIdentity {
  from_name: string | null;
  reply_to: string | null;
  domain: string | null;
  domain_verified: boolean;
}

/** One claimed send job, as genesis_notifications_claim hands it over. */
export interface ClaimedJob {
  id: string;
  claim_id: string;
  notification_id: string;
  channel: Exclude<Channel, "in_app">;
  attempt: number;
  deferrals: number;
  redelivery: boolean;
  type: string;
  category: string;
  tenant_id: string | null;
  user_id: string | null;
  email: string | null;
  recipient_name: string | null;
  data: Record<string, unknown>;
  thread_key: string | null;
  collapse_key: string | null;
  badge: number | null;
  brand: Record<string, unknown> | null;
  transactional: boolean;
  push_privacy: "default" | "generic";
  ios_category: string | null;
  hide_previews: boolean;
  devices: ClaimedDevice[] | null;
  sender: SenderIdentity | null;
  rendered: RenderedEmail | null;
  rendered_hash: string | null;
  secret: string | null;
}

/** An email as first rendered: what every retry sends. */
export interface RenderedEmail {
  from: string;
  to: string[];
  reply_to?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
}

export type SettleOutcome =
  | { status: "sent"; provider_id?: string | null }
  | { status: "skipped"; reason: string }
  | { status: "filtered" }
  | { status: "failed"; error: string }
  | { status: "retry"; error: string; retry_at: string; counted: boolean };

export interface PushTicketRow {
  device_id: string;
  ticket_id: string | null;
  status: "sent" | "failed";
  error: string | null;
}

export interface NotificationStore {
  claim(channel: "push" | "email", limit: number, leaseSeconds: number): Promise<ClaimedJob[]>;
  storeRendered(id: string, claimId: string, rendered: RenderedEmail, hash: string): Promise<{ rendered: RenderedEmail; hash: string } | null>;
  settle(id: string, claimId: string, outcome: SettleOutcome): Promise<boolean>;
  pushTickets(deliveryId: string, tickets: PushTicketRow[]): Promise<void>;
  receiptsClaim(limit: number): Promise<{ id: number; ticket_id: string }[]>;
  receiptsSettle(results: { id: number; status: "delivered" | "failed"; error: string | null }[]): Promise<void>;
  emailEvent(providerId: string, event: "delivered" | "bounced" | "complained", permanent: boolean): Promise<boolean>;
  unsubscribe(userId: string | null, email: string | null, category: string): Promise<boolean>;
  syncTypes(rows: NotificationTypeRow[]): Promise<number>;
}

/**
 * The store over migration 0001's functions.
 *
 * @stability Beta
 */
export function supabaseNotificationStore(client: RpcClient): NotificationStore {
  const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new NotificationStoreError(fn, error.code ?? null);
    return data as T;
  };
  return {
    claim: (channel, limit, leaseSeconds) => call<ClaimedJob[]>("genesis_notifications_claim", { p_channel: channel, p_limit: limit, p_lease_seconds: leaseSeconds }).then((rows) => rows ?? []),
    async storeRendered(id, claimId, rendered, hash) {
      const rows = await call<{ rendered: RenderedEmail | null; rendered_hash: string | null }[]>("genesis_notifications_store_rendered", { p_id: id, p_claim: claimId, p_rendered: rendered, p_hash: hash });
      const row = rows?.[0];
      return row?.rendered && row.rendered_hash ? { rendered: row.rendered, hash: row.rendered_hash } : null;
    },
    settle: (id, claimId, outcome) => call<boolean>("genesis_notifications_settle", { p_id: id, p_claim: claimId, p_outcome: outcome }).then(Boolean),
    async pushTickets(deliveryId, tickets) {
      await call("genesis_notifications_push_tickets", { p_delivery: deliveryId, p_tickets: tickets });
    },
    receiptsClaim: (limit) => call<{ id: number; ticket_id: string }[]>("genesis_notifications_receipts_claim", { p_limit: limit }).then((r) => r ?? []),
    async receiptsSettle(results) {
      await call("genesis_notifications_receipts_settle", { p_results: results });
    },
    emailEvent: (providerId, event, permanent) => call<boolean>("genesis_notifications_email_event", { p_provider_id: providerId, p_event: event, p_permanent: permanent }).then(Boolean),
    unsubscribe: (userId, email, category) => call<boolean>("genesis_notifications_unsubscribe", { p_user_id: userId, p_email: email, p_category: category }).then(Boolean),
    syncTypes: (rows) => call<number>("genesis_notifications_sync_types", { p_rows: rows }),
  };
}
