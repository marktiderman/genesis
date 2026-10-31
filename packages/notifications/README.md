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
| `/runner` | **Deprecated:** the outbox engine moved to `@marktiderman/genesis-supabase/runner`. This path re-exports the same values and types for at least one more minor; import from genesis-supabase instead. |
| `/server` | `notify()`, `syncNotificationTypes`, `createNotificationRunner`, `createNotificationsHandler`, `expoPushProvider`, `resendProvider`, `resolveSecretLink`, `checkSenderDomain`, unsubscribe tokens, webhook verification. Service role only. |
| `/email` | React Email: `BrandLayout`, `EmailText`, `EmailButton`, `reactEmailTemplate`, `brandedDefaultTemplate`. |
| `/supabase` | `NOTIFICATIONS_MIGRATIONS` and `notificationsClient(supabase)`, the browser and phone side under row level security. |
| `/react` | `NotificationsProvider`, `useNotifications`, `useUnreadCount`, `usePreferences`. |
| `/web` | `NotificationBell`, `NotificationFeed`, `PreferencesMatrix`, and for admins `DeliveryLog`, `SuppressionList`, `SendTestNotification`, all on genesis-ui. |
| `/native` | `NotificationsFeed` (on genesis-ui-native's `NotificationsPage`), `ChannelPreferences`, `NotificationPreferences`, `notificationsPushBackend`, `notificationsPushPreferences` (its preferences half), `pushOptionsFrom`, `notificationAction`. |
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
     actions: { messages: MESSAGE_ACTIONS },
     types: {
       "chat.message": {
         category: "messages",
         channels: { in_app: true, push: true, email: true },
         emailDelaySeconds: 600,
         actions: "messages",
         render: (d) => ({ title: String(d.sender_name), body: String(d.preview), url: `/messages/${d.conversation_id}` }),
       },
       ...GENESIS_TEST_TYPE,
     },
   });
   ```

4. Mirror it at migration time: name the registry in `genesis.config.json`
   (`"notifications": { "registry": "src/notifications.ts" }`) or pass `--notifications <file>`, and
   `genesis migrate` writes a `<timestamp>_genesis_notification_types.sql` that adds and updates the
   types whenever they change. They are in place once every migration has run, so a trigger never
   meets an unknown type before the deploy. The module is imported, so keep it free of side effects.
   Run it after changing the registry, and commit the file. Keep
   `await syncNotificationTypes(admin, notifications)` on deploy: it is what retires types left out
   (never deleted); the migrations never retire one.
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

   An app that registers devices its own way keeps its `register` and `forget` and takes only the
   preferences: `backend: { register, forget, ...notificationsPushPreferences(supabase) }`. Spread it
   last: keys that come after it (an app's own `loadPreferences` or `savePreferences`) replace its
   functions, and keys before it are replaced by them. The push
   settings screen then reads and saves this package's preferences row (each category switch is that
   category's push channel; quiet hours and previews are the row's own columns).

   If the provider can't listen for feed changes (the realtime subscription throws), the feed still
   works without live updates and the error is reported through `reportError` from
   `@marktiderman/genesis-core/errors` (`notifications:realtime-subscribe`), which the native
   observability block sends to Sentry. `/react` needs `@marktiderman/genesis-core` (a peer).

## Sending

```ts
import { notify } from "@marktiderman/genesis-notifications/server";

await notify(admin, {
  type: "chat.message",
  recipients: memberIds,                    // user ids, or { email, name, ref } for people with no login
  data: { conversation_id, sender_name, preview },
  idempotencyKey: `push:${messageId}`,       // per recipient, type and tenant: the same key again sends nothing more
  threadKey: conversationId,                // groups them on the lock screen
  collapseKey: `conversation:${conversationId}`, // a newer one replaces an unsent older one
  badge: unreadCount,                        // the caller counts
  tenantId,
}, { registry: notifications });
```

`genesis_notify` (the SQL function under it, service role only) can be called with the same
arguments from a domain's own SQL.

To take back what hasn't gone out (a release rolled back, an event undone):

```ts
await cancelNotification(admin, { type: "release.published", idempotencyKey: `release:${releaseId}`, tenantId, archive: true });
```

Every pending send job made with that type, tenant and key (for everyone, or only `recipients`)
becomes `cancelled` and is never claimed; one being sent at that moment ends cancelled unless
that attempt goes out (it is never retried); a job already sent is left alone; `archive: true`
archives the feed rows too (`genesis_notifications_cancel` in SQL). Another tenant's
notifications with the same key are never touched.

### Rules the notifier keeps

- **Secrets never go in `data`, or in a push.** `genesis_notify` (and `notify()` before it)
  refuses any key ending in `token`, `code`, `secret`, `key`, `otp` or `password` (and
  `signature`, `sig`, `invite_link` and the like), and any link, absolute or relative, with a
  query or fragment parameter named that way (`/accept?inviteCode=`, `#access_token=`). This is
  a backstop, not a guarantee: it catches the usual names, so keep secrets out by design, and
  rename a display value it trips on (`country_code` → `country`). Store a reference
  (`{ response_id }`) and mark the type `secretLink: true`; the runner calls your
  `secretLinks[type]` at send time (`resolveSecretLink`). A token that exists only hashed in your
  tables is passed as `notify({ secret })`, to exactly one recipient: encrypted onto the email's
  send job with the Vault key, decrypted only when the runner claims it, cleared once the job
  settles. Keys are matched as words, so `inviteToken` is refused as well as `invite_token`.
- **Retries are byte-identical.** An email is rendered once, at its first claim, and stored with
  its hash; every retry sends the stored copy with the same idempotency key. A secret link is
  built afresh on each attempt, so **a `secretLinks` builder must be deterministic**: the same
  link for the same notification every time. Resend's 409 `invalid_idempotent_request` (the key
  with another body) fails the job loudly (`idempotency_body_changed`), never counting it as
  sent; `concurrent_idempotent_requests` retries in 5 s. `resendProvider` paces its requests
  (`perSecond`, default 5, under Resend's default 10 a second per team); two runners at once each
  keep to their own pace.
- **Links are the app's own.** A type's `render().url` must be a path (`/messages/42`): the push
  carries it as is, the email resolves it against `appUrl`'s origin; anything else (another host,
  `//host`, `javascript:`) is left out.
- **Push stays within its lease.** Jobs are sent in Expo batches of 100 (a job's devices never
  split), each batch's tickets recorded and its jobs settled on its own; no batch starts once the
  lease is about to run out (those jobs come straight back). With `runBudgetMs` (your function's
  wall-clock limit) a run claims again while claims come back full, and stops once the time left
  is under the lease.
- **One unreadable secret fails alone** (`secret_unreadable`); the rest of the claim goes out. No
  Vault key at all raises, since that is the app's to fix.
- **Transactional types** (`transactional: true`) have no unsubscribe link, and their email is
  sent whatever the person chose for the category (an unsubscribe never stops a receipt or a
  reset); they are never held by quiet hours or the email delay, and still reach someone who
  complained (not someone who hard bounced). Rate caps stay in the domain. A critical type's
  email has no unsubscribe link either (preferences can't turn it off).
- **A job is never stuck.** One whose lease ran out `maxAttempts` times (the runner died with it
  each time) fails as `lease_expired`.
- **Erasure.** `genesis_notifications_erase(user, email, ref)` deletes a person's
  notifications (with every send job, and for a login also those addressed to its email),
  devices, receipts, preferences and device moves, logins or not. The suppression list keeps only a hash, so a bounced address stays suppressed.
  `genesis_notifications_prune(keep, keep_rendered, keep_feed)` keeps the delivery log short
  (30 days, rendered bodies a day, by default); notifications that were never in a feed
  (email-only recipients) go with their send jobs.

## Email

One Resend key per app (`RESEND_API_KEY`). Each tenant has a sender identity in
`notification_senders`: without its own domain, mail goes from the app's shared domain with the
tenant's name as the from name and its reply-to; once its own domain is verified, from that
domain. Verifying proves the domain is the tenant's: `genesis_notifications_set_sender` gives
the sender a `domain_token`, the tenant adds the TXT record `senderOwnershipRecord(domain,
token)` (`_genesis-notifications.<domain>` = `genesis-notifications-verify=<token>`) beside
Resend's records, and `checkSenderDomain(domain, { token, reservedDomains })` reads it with SPF,
DKIM and DMARC over DNS over HTTPS; `genesis_notifications_set_sender_dns(tenant, domain,
token, status, dns)` records the result for the domain and token checked. A domain is verified for one tenant at
most, and never the app's own shared domains or one under them (`reservedDomains`; the runner
refuses one too). Transactional and other mail
go from separate shared domains (`domains: { transactional, other }`), tagged `stream`.

Everything that isn't transactional carries `List-Unsubscribe` and
`List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) with a signed token; the endpoint
never unsubscribes on a GET (link scanners follow links), only on the POST. The token never
carries an address: someone with no login is named by its SHA-256 (`emailHash`). The unsubscribe
is for the tenant the email came from: a person with a login has that tenant's email of the
category turned off (a choice in Settings turns it back on everywhere); someone with none is
suppressed for the category and tenant. Only a bounce Resend calls `Permanent` suppresses an
address for good. The provider's id is kept the moment a send returns, so a webhook that comes
before the job settles still finds it.

The provider is chosen per job (`email.providerFor`), so a tenant-owned Resend key kept in
Vault can be added later without changing the runner. It isn't built.

## Receiving email

`createInboundEmailHandler` (`/server`) is the way in: it verifies Resend's `email.received`
webhook (signed like its other webhooks), fetches the full message (`GET /emails/receiving/{id}`)
and hands an `InboundEmail` (Message-ID, In-Reply-To, References, from, to, subject, text, SPF,
DKIM and DMARC results, attachment names) to the first route that returns true. Routes are
plain functions: genesis-support's `supportEmailRoute` files tickets; an agent's inbox, an
onboarding address or a forward are routes of your own. A route that throws answers 502 so
Resend retries; an email no route takes goes to `onUnrouted`.

## Push

The device side stays in genesis-native's push block: registration, the permission, routing, the
badge, and hiding a push for the screen already open (`useSuppressNotifications`, client-side).
The runner sends every due job's devices in Expo batches of 100 with `threadId`, `categoryId`
(the device category with Reply and Mark as read), `badge`, and a `collapseId` (the collapse key,
else the notification id, so a resend after a timeout replaces rather than repeats). The payload's
`data` is `{ url, notification_id, type, thread_key }` plus what the type's `render` returns under
`push`, never the notification's whole `data`: `push.ids` always travel (genesis-chat's
`conversationId`, `messageId` and `seq`, so Reply and Mark read work from the notification), and
`push.display` (a sender's name and photo) and `push.mutableContent` (which lets the app's
Notification Service Extension run) only while previews are shown. Only flat strings and numbers
pass, and they can't replace the notifier's own keys. A person who hides previews, or a type with
`pushPrivacy: "generic"`, gets neutral text and no display values. Receipts
are checked about every 15 minutes; `DeviceNotRegistered` forgets the device.

Android shows a push only on a channel the app made: the runner sends the category id as
`channelId`, so build the push block with `pushOptionsFrom(registry)` (one channel per
category, `genesis` included when you spread `GENESIS_TEST_CATEGORY`).

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

A category someone switched off under 0005 (`categories`) still turns its push and email off,
and every screen here shows it so; the first time they change one of its channels, the old
switch becomes explicit channel choices (`genesis_notifications_set_preference`).

## Not in v1

- **Digests** (next, v1.1).
- SMS.
- Web push.
- Live Activities.
- Slack as a channel.
- Routing auth emails (sign-in links, password resets) through Supabase's send-email hook.
- Per-tenant Resend keys (the provider seam is there; reading a key from Vault isn't).

The Notification Service Extension and Communication Notifications (rich pushes with sender
avatars) aren't here but work with it: genesis-native's rich push plugin adds the extension, and a
type opts in through `render`'s `push.display` and `push.mutableContent` (genesis-chat's
`chat.message` does).

Also not done yet: nothing has been sent through Expo or Resend with real credentials; the
providers are tested against faked services.

Part of the [Genesis framework](https://github.com/marktiderman/genesis).
