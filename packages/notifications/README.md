# @marktiderman/genesis-notifications

One notifier for every part of a Genesis app. A domain package (chat, forms,
sites, support) decides **who** is told and **what**: the candidates, its own
mutes and mentions, who may see what. The notifier decides **how and when**:

- the channel: the in-app feed, Expo push, email;
- quiet hours, read in the person's time zone and right across daylight saving;
- preferences by category and channel, with tenant defaults, and `critical` types always on;
- delay-then-skip-if-read for email;
- dedupe, retries, delivery receipts, and pruning dead push tokens.

It never reads a domain's tables. The contract, the tables and a worked example
for a domain are in [docs/NOTIFICATIONS.md](../../docs/NOTIFICATIONS.md).

## Entry points

| Import | What |
|---|---|
| `@marktiderman/genesis-notifications` (`/core`) | `defineNotifications`, the shared types, `MESSAGE_ACTIONS`, `GENESIS_TEST_TYPE`. No dependencies. |
| `/runner` | `createRunner`: the one outbox runner (claim, send in groups, settle, `maxDeferrals`, jitter, `disable` on 410). genesis-forms' destinations run on it too. No dependencies. |
| `/server` | `notify()`, `syncNotificationTypes`, `createNotificationRunner`, `createNotificationsHandler`, `expoPushProvider`, `resendProvider`, `resolveSecretLink`, `checkSenderDomain`, unsubscribe tokens, webhook verification. Service role only. |
| `/email` | React Email: `BrandLayout`, `EmailText`, `EmailButton`, `reactEmailTemplate`, `brandedDefaultTemplate`. |
| `/supabase` | `NOTIFICATIONS_MIGRATIONS` and `notificationsClient(supabase)`, the browser and phone side under row level security. |
| `/react` | `NotificationsProvider`, `useNotifications`, `useUnreadCount`, `usePreferences`. |
| `/web` | `NotificationBell`, `NotificationFeed`, `PreferencesMatrix`, and for admins `DeliveryLog`, `SuppressionList`, `SendTestNotification`, all on genesis-ui. |
| `/native` | `NotificationsFeed` (on genesis-ui-native's `NotificationsPage`), `ChannelPreferences`, `NotificationPreferences`, `notificationsPushBackend`, `pushOptionsFrom`, `notificationAction`. |
| `/blocks` | `notificationsBlock`: routes, nav, a Settings row, the migration and the privacy notes. |

The package ships `migrations/0001_genesis_notifications.sql` with its pgTAP
test, and the `functions/genesis-notifications` Edge Function template.

## Set up

1. Copy the migration into `supabase/migrations/` under a new timestamped name and its test into
   `supabase/tests/database/`. It needs Vault (every Supabase project has it) for the key that
   encrypts one-time secrets.
2. Say who is an admin, in a migration of your own after it:

   ```sql
   create or replace function private.genesis_notifications_admin(p_user uuid, p_tenant uuid)
   returns boolean language sql stable security definer set search_path = '' as $$
     -- Your own rule: here, a tenant's owners and admins see that tenant (p_tenant null, the
     -- whole app and the suppression list, is nobody's).
     select p_tenant is not null and exists (
       select 1 from public.memberships m
       where m.user_id = p_user and m.tenant_id = p_tenant and m.role in ('owner', 'admin'))
   $$;
   ```

   Row level security calls it as the signed-in person, so it stays executable by
   `authenticated`; never grant it to `anon` or `public`. Until you replace it nobody is an admin.
3. Define your types once and import the list everywhere (app, server, function):

   ```ts
   import { defineNotifications, MESSAGE_ACTIONS, GENESIS_TEST_CATEGORY, GENESIS_TEST_TYPE } from "@marktiderman/genesis-notifications";

   export const notifications = defineNotifications({
     categories: { messages: { label: "Messages", android: { importance: "high" } }, ...GENESIS_TEST_CATEGORY },
     actions: { message: MESSAGE_ACTIONS },
     types: {
       "chat.message": {
         category: "messages",
         channels: { in_app: true, push: true, email: true },
         emailDelaySeconds: 600,
         actions: "message",
         render: (d) => ({ title: String(d.sender_name), body: String(d.preview), url: `/messages/${d.conversation_id}` }),
       },
       ...GENESIS_TEST_TYPE,
     },
   });
   ```

4. Mirror it on deploy: `await syncNotificationTypes(admin, notifications)` (types left out are
   retired, never deleted).
5. Deploy `functions/genesis-notifications` (`--no-verify-jwt`), and schedule `POST …/run`
   every minute and `POST …/receipts` every 15 minutes with
   `Authorization: Bearer <GENESIS_NOTIFICATIONS_CRON_SECRET>`, and
   `select public.genesis_notifications_prune()` daily. Point Resend's webhook (bounced,
   complained, delivered) at `…/webhooks/resend`.
6. In the app, wrap the signed-in screens:

   ```tsx
   <NotificationsProvider client={supabase} registry={notifications} userId={session?.user.id ?? null}>
   ```

   On native, give the push block this package's backend and the registry's categories:
   `createPush({ backend: notificationsPushBackend(supabase), ...pushOptionsFrom(notifications), randomUUID: Crypto.randomUUID, … })`.

## Sending

```ts
import { notify } from "@marktiderman/genesis-notifications/server";

await notify(admin, {
  type: "chat.message",
  recipients: memberIds,                    // user ids, or { email, name, ref } for people with no login
  data: { conversation_id, sender_name, preview },
  idempotencyKey: `push:${messageId}`,       // unique per recipient: the same key again sends nothing more
  threadKey: conversationId,                // groups them on the lock screen
  collapseKey: `conversation:${conversationId}`, // a newer one replaces an unsent older one
  badge: unreadCount,                        // the caller counts
  tenantId,
}, { registry: notifications });
```

`genesis_notify` (the SQL function under it, service role only) can be called with the same
arguments from a domain's own SQL.

### Rules the notifier keeps

- **Secrets never go in `data`, or in a push.** `genesis_notify` refuses keys like `token`,
  `password`, `invite_link` and links carrying `?token=`/`sig=`/`code=`. Store a reference
  (`{ response_id }`) and mark the type `secretLink: true`; the runner calls your
  `secretLinks[type]` at send time (`resolveSecretLink`). A token that exists only hashed in your
  tables is passed as `notify({ secret })`: encrypted onto the email's send job with the Vault
  key, decrypted only when the runner claims it, cleared once the job settles.
- **Retries are byte-identical.** An email is rendered once, at its first claim, and stored with
  its hash; every retry sends the stored copy with the same idempotency key. Resend's 409
  `invalid_idempotent_request` counts as sent; `concurrent_idempotent_requests` retries in 5 s.
- **Transactional types** (`transactional: true`) have no unsubscribe link, are never held by
  quiet hours or the email delay, and still reach someone who complained (not someone who hard
  bounced). Rate caps stay in the domain.
- **Erasure.** `genesis_notifications_erase(user, email, ref)` deletes a person's
  notifications (with every send job), devices, receipts, preferences and device moves, logins
  or not. The suppression list keeps only a hash, so a bounced address stays suppressed.
  `genesis_notifications_prune(keep, keep_rendered, keep_feed)` keeps the delivery log short
  (30 days, rendered bodies a day, by default).

## Email

One Resend key per app (`RESEND_API_KEY`). Each tenant has a sender identity in
`notification_senders`: without its own domain, mail goes from the app's shared domain with the
tenant's name as the from name and its reply-to; once its own domain is verified
(`checkSenderDomain` reads SPF, DKIM and DMARC over DNS over HTTPS, and
`genesis_notifications_set_sender_dns` records it), from that domain. Transactional and other mail
go from separate shared domains (`domains: { transactional, other }`), tagged `stream`.

Everything that isn't transactional carries `List-Unsubscribe` and
`List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) with a signed token; the endpoint
never unsubscribes on a GET (link scanners follow links), only on the POST. A person with a login
has the category's email turned off in their preferences; someone with none is suppressed for it.

The provider is chosen per job (`email.providerFor`), so a tenant-owned Resend key kept in
Vault can be added later without changing the runner. It isn't built.

## Push

The device side stays in genesis-native's push block: registration, the permission, routing, the
badge, and hiding a push for the screen already open (`useSuppressNotifications`, client-side).
The runner sends every due job's devices in Expo batches of 100 with `threadId`, `categoryId`
(the device category with Reply and Mark as read), `badge`, and a `collapseId` (the collapse key,
else the notification id, so a resend after a timeout replaces rather than repeats). The payload's
`data` is `{ url, notification_id, type, thread_key }`, never the notification's own `data`. A
person who hides previews, or a type with `pushPrivacy: "generic"`, gets neutral text. Receipts
are checked about every 15 minutes; `DeviceNotRegistered` forgets the device.

`notificationAction(response)` reads an action button: its id, the typed text, and the
notification id, which an app uses as the reply's client id so a retried reply stays one reply.

## Admins

`DeliveryLog`, `SuppressionList` and `SendTestNotification` (web) read the log columns of
`notification_deliveries` (status, attempts, an error code, a masked address; never content,
the rendered email or a secret) and the suppression list, through
`private.genesis_notifications_admin`.

## Coming from genesis-supabase's push migration (0005)

The migration adopts `push_devices`, `notification_preferences` and `push_receipts` as they are
and only adds to them (`notification_preferences.channels`, `push_receipts.delivery_id`,
`push_devices.installation_id`); no row changes. Then:

- stop calling the `genesis-push-send` function and 0005's sender functions; the runner here
  replaces them;
- remove 0005's pgTAP test from `supabase/tests/database/`: this migration redefines
  `genesis_push_register` so a token another login holds moves only with the same install id
  (0005's test asserts the old move), and `genesis_push_forget` answers the same whether or not
  there was a token (0005's test asserts `false` for an unknown one);
- switch the push block to `notificationsPushBackend(supabase)`, so it registers with the install id.

## Not in v1

- **Digests** (next, v1.1).
- SMS.
- Web push.
- The Notification Service Extension and Communication Notifications (rich pushes, sender avatars).
- Live Activities.
- Slack as a channel.
- Routing auth emails (sign-in links, password resets) through Supabase's send-email hook.
- Per-tenant Resend keys (the provider seam is there; reading a key from Vault isn't).

Also not done yet: nothing has been sent through Expo or Resend with real credentials; the
providers are tested against faked services.

Part of the [Genesis framework](https://github.com/marktiderman/genesis).
