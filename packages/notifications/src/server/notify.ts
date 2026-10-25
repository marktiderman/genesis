/**
 * `notify()`: what a domain calls, from its server. It checks the input
 * (the registry knows the type, the recipients are well formed, `data`
 * holds no secret) and calls `genesis_notify`, which decides channels from
 * preferences and queues the sends. A domain's own SQL can call
 * `genesis_notify` directly with the same arguments.
 */
import type { NotificationRegistry } from "../core/registry";
import type { NotifyInput, NotifyResult, Recipient } from "../core/types";
import { assertNoSecrets, recipientsToJson } from "../core/validate";
import { NotificationStoreError, type RpcClient } from "./store";

export interface NotifyOptions {
  /** Checks the type against the registry before the database does. */
  registry?: NotificationRegistry;
}

/**
 * Queue a notification for each recipient. Resolves one result per recipient
 * that exists (a deleted login is left out); the same idempotency key again
 * resolves `created: false` and sends nothing more.
 *
 * @stability Beta
 */
export async function notify<K extends string>(client: RpcClient, input: NotifyInput<K>, options: NotifyOptions = {}): Promise<NotifyResult[]> {
  const t = options.registry?.type(input.type);
  if (input.secret !== undefined && t && !t.secretLink) throw new Error(`notify: type ${input.type} carries no secret link`);
  // A one-time secret is one person's: never copied onto another recipient's email.
  if (input.secret !== undefined && input.recipients.length !== 1) throw new Error("notify: a secret goes to exactly one recipient");
  if (!input.idempotencyKey || input.idempotencyKey.length > 200) throw new Error("notify: an idempotency key of 1 to 200 characters is required");
  assertNoSecrets(input.data);
  if (input.badge !== undefined && (!Number.isInteger(input.badge) || input.badge < 0)) throw new Error("notify: badge is a whole number, 0 or more");
  const { data, error } = await client.rpc("genesis_notify", {
    p_type: input.type,
    p_recipients: recipientsToJson(input.recipients),
    p_data: input.data ?? {},
    p_idempotency_key: input.idempotencyKey,
    p_thread_key: input.threadKey ?? null,
    p_collapse_key: input.collapseKey ?? null,
    p_badge: input.badge ?? null,
    p_tenant_id: input.tenantId ?? null,
    p_brand: input.brand ?? null,
    p_secret: input.secret ?? null,
  });
  if (error) throw new NotificationStoreError("genesis_notify", error.code ?? null);
  return ((data as { notification_id: string; recipient_key: string; created: boolean }[] | null) ?? []).map((r) => ({
    notificationId: r.notification_id,
    recipientKey: r.recipient_key,
    created: r.created,
  }));
}

export interface CancelInput {
  /** The key the notifications were made with. */
  idempotencyKey: string;
  /** Only these recipients (as `notify()` takes them). Default: everyone the key reached. */
  recipients?: readonly Recipient[];
  /** Archive the feed rows too. Default false. */
  archive?: boolean;
}

/**
 * Stop what hasn't gone out for an idempotency key (a release rolled back, an
 * event undone): every pending send job is marked cancelled and never claimed.
 * A job already sent, or being sent right now, is left alone. With `archive`,
 * the feed rows are archived too.
 *
 * @stability Beta
 */
export async function cancelNotification(client: RpcClient, input: CancelInput): Promise<{ cancelled: number; archived: number }> {
  if (!input.idempotencyKey || input.idempotencyKey.length > 200) throw new Error("cancelNotification: an idempotency key of 1 to 200 characters is required");
  const { data, error } = await client.rpc("genesis_notifications_cancel", {
    p_idempotency_key: input.idempotencyKey,
    p_recipients: input.recipients ? recipientsToJson(input.recipients) : null,
    p_archive: input.archive ?? false,
  });
  if (error) throw new NotificationStoreError("genesis_notifications_cancel", error.code ?? null);
  const row = (Array.isArray(data) ? data[0] : data) as { cancelled?: number; archived?: number } | undefined;
  return { cancelled: Number(row?.cancelled ?? 0), archived: Number(row?.archived ?? 0) };
}

/**
 * Mirror the registry into `notification_types` (run it on deploy, or the
 * server's first request): types left out are retired, never deleted.
 *
 * @stability Beta
 */
export async function syncNotificationTypes(client: RpcClient, registry: NotificationRegistry): Promise<number> {
  const { data, error } = await client.rpc("genesis_notifications_sync_types", { p_rows: registry.toTypeRows() });
  if (error) throw new NotificationStoreError("genesis_notifications_sync_types", error.code ?? null);
  return Number(data ?? 0);
}
