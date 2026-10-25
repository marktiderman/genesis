# Notifications

`@marktiderman/genesis-notifications` is the one place a Genesis app tells people things: in the
app, by push, by email. This page is the contract between it and the domains that use it, the
tables it keeps, how a notification flows, and how a domain adopts it. The package's
[README](../packages/notifications/README.md) has the setup steps and the API.

## The contract

A **domain** (chat, forms, sites, support, or an app's own) decides **who and what**:

- the candidates: who should hear about this event at all;
- its own rules about them: a muted conversation, a mention, a notify level, who may see the
  thing (visibility is the domain's; the notifier never reads a domain's tables);
- what to say: a type key and `data` (references and display values, never a secret);
- the idempotency key, and optionally a thread key, a collapse key and the badge.

The **notifier** decides **how and when**:

- which channels: the type's offered channels, each on or off by the person's choice for the
  category and channel, else the tenant's default, else the type's; a critical type can't be
  turned off;
- when: quiet hours (push), delay-then-skip-if-read (email);
- that it happens once: unique per recipient and idempotency key, byte-identical email
  retries, a collapse key replacing what hasn't gone out;
- what comes back: retries with backoff, push receipts, dead tokens pruned, bounces and
  complaints suppressing an address.

A domain never sends a push or an email itself, and the notifier never decides who should hear
about something.

## The tables

All in `public`, row level security on, migration `0001_genesis_notifications.sql`:

| Table | What | Who reads |
|---|---|---|
| `notification_types` | The types, mirrored from `defineNotifications` (`syncNotificationTypes`); retired, never deleted. | everyone signed in |
| `notifications` | The in-app feed and the outbox: one row per recipient (a login, or an email address for someone with none), unique on (recipient, idempotency key), with `seen_at`, `read_at`, `archived_at`, and `in_feed` (whether the in-app channel was on). | the recipient, their own rows only |
| `notification_deliveries` | One send job per notification and channel (push, email): status, attempts, deferrals, `send_after`, the lease, the provider's id, an error code, the first rendered email and its hash, an encrypted one-time secret. Claimed with `FOR UPDATE SKIP LOCKED`. | admins: the log columns only |
| `push_devices`, `push_receipts` | Expo tokens (with the install id) and the tickets sent to them. Adopted from genesis-supabase's 0005 when it ran. | the owner |
| `push_device_moves` | Every time a token moved to another login on the same phone. | service role |
| `notification_preferences` | Per person: `channels` (category → channel → on), 0005's `categories`, quiet hours with a time zone, `hide_previews`. | the owner |
| `notification_tenant_defaults` | A tenant's default for a category and channel. | the tenant's admins |
| `notification_senders` | A tenant's email identity: from name, reply-to, its own domain once verified. | the tenant's admins |
| `notification_suppressions` | Addresses not to email, by SHA-256 only: bounce (all mail), complaint (all but transactional), unsubscribe of someone with no login (one category). | platform admins |

Realtime is a broadcast with ids only on the private channel `user:<id>` (`realtime.send`), and
the app refetches; there are no Postgres Changes subscriptions.

## The flow

```
domain event
  └─ notify({ type, recipients, data, idempotencyKey, threadKey?, collapseKey?, badge?, tenantId?, secret? })
       └─ genesis_notify (security definer, service role)
            ├─ checks: the type exists and isn't retired; data holds no secret; the secret only for a secret-link type
            ├─ per recipient: insert into notifications … on conflict (recipient, key) do nothing
            │    (seen before: return created = false, queue nothing)
            ├─ in_app on?  in_feed = true, broadcast "notification" on user:<id>
            ├─ push on?    a push job, send now
            ├─ email on?   an email job, send after the type's delay (if the person has it in the app)
            └─ collapse key: cancel the recipient's older unsent jobs with it, archive the older feed row

runner (every minute: POST …/run)
  ├─ genesis_notifications_claim('push' | 'email')   lease + claim id, SKIP LOCKED
  │    decided again at send time: preference changed → skipped; email read in the app → skipped;
  │    suppressed address → skipped; push in quiet hours → back to pending until they end (no attempt);
  │    no devices → skipped. Decrypts the job's secret, if any.
  ├─ push:  every device in Expo batches of 100 → tickets recorded per device (DeviceNotRegistered forgets it)
  ├─ email: first claim renders and stores (genesis_notifications_store_rendered); every send uses the stored copy,
  │         the secret link swapped in at send time, idempotency key genesis-notification-<job id>
  └─ genesis_notifications_settle(job, claim, outcome)   sent | skipped | failed | retry (counted or deferred)
                                                           a settled job's secret is cleared; a stale claim settles nothing

receipts (every 15 minutes: POST …/receipts)   Expo receipts → delivered | failed, dead devices forgotten
webhooks (POST …/webhooks/resend)              delivered; bounced (hard: suppress); complained (suppress)
cancel (genesis_notifications_cancel)          pending jobs for a key → cancelled, never claimed; sent ones untouched
unsubscribe (GET page, POST action)            the person's email off for the category, or a suppression
prune (daily)                                  delivery log after 30 days, rendered bodies after a day
```

The runner is `createRunner` from `/runner`: claim, send in groups, turn each result into an
outcome (sent, filtered, skipped, retry with jittered backoff, a deferral that uses no attempt
until `maxDeferrals`, failed, `disable` for a 410), record. genesis-forms' destinations (Sheets,
webhooks, email) run on the same runner with their own claim.

## Adopting it in a domain

1. **Register the types** in the app's `defineNotifications` list: a category for the
   preferences screen, the channels and their defaults, `critical` or `transactional`, an email
   delay, the device action category, `secretLink`, and a `render` for the feed and the push.
2. **Call `notify()` from the domain's server** (or `genesis_notify` from its SQL) after the
   event is committed, with an idempotency key made from the event (`push:<message id>`), so a
   retried event is the same notification.
3. **Keep the domain's own rules in the domain**: who the candidates are, mutes, mentions, notify
   levels, visibility, rate caps.
4. **Give the email a template** (`reactEmailTemplate` on `BrandLayout`), or let the default
   one use `render`.
5. **For a link that is a credential**, store a reference in `data`, mark the type
   `secretLink: true`, and give the runner a `secretLinks[type]` builder.
6. **Take back what hasn't gone out** with `cancelNotification({ idempotencyKey, recipients?,
   archive? })` when the event is undone (a release rolled back): pending jobs are cancelled,
   sent ones are left as they are.
7. **Erase with the domain's person**: call `genesis_notifications_erase(user, email, ref)` from
   the domain's own erasure, with the `ref` it passed for recipients with no login.

### Worked example: a new message

The registry entry:

```ts
categories: { messages: { label: "Messages", android: { importance: "high" } } },
actions: { message: MESSAGE_ACTIONS },            // Reply (text input) and Mark as read
types: {
  "chat.message": {
    category: "messages",
    channels: { in_app: true, push: true, email: true },
    emailDelaySeconds: 600,                       // email only if still unread after 10 minutes
    actions: "message",
    render: (d) => ({ title: String(d.sender_name), body: String(d.preview), url: `/messages/${d.conversation_id}` }),
  },
},
```

The domain, when a message is saved, after it has removed the sender, members who muted the
conversation and anyone who can't see it:

```ts
await notify(admin, {
  type: "chat.message",
  recipients,
  data: { conversation_id, sender_name, preview },
  idempotencyKey: `push:${message.id}`,
  threadKey: conversation_id,                     // one stack per conversation on the lock screen
  collapseKey: `conversation:${conversation_id}`, // a newer message replaces an older unsent one
  badge: unread,                                  // the domain counts unread conversations
  tenantId,
});
```

The phone hides the push for the conversation already on screen (`useSuppressNotifications`, in
the push block), and handles the action buttons:

```ts
createPush({
  …,
  onResponse: (response) => {
    const action = notificationAction(response);
    if (action?.actionId === "reply" && action.text) sendReply(action.url, action.text, { clientId: action.notificationId });
    if (action?.actionId === "mark_read") markConversationRead(action.url);
  },
});
```

Using the notification id as the reply's client id keeps a retried reply one reply.

### Worked example: a form receipt

The registry entry (email only, transactional, with a link that lets the respondent edit their
answers):

```ts
"forms.receipt": {
  category: "forms",
  channels: { email: true },
  transactional: true,          // no unsubscribe, no quiet hours, no digest
  secretLink: true,
  render: (d) => ({ title: `Your answers to ${String(d.form_title)}` }),
},
```

The domain, when a response is submitted by someone with no login:

```ts
await notify(admin, {
  type: "forms.receipt",
  recipients: [{ email: respondentEmail, name: respondentName, ref: `responses:${response.id}` }],
  data: { response_id: response.id, form_title: form.title },   // a reference, never the edit link
  idempotencyKey: `receipt:${response.id}`,
});
```

The runner builds the link at send time, signed by the forms server:

```ts
secretLinks: {
  "forms.receipt": async ({ data }) => `https://forms.example.com/r/${data.response_id}?sig=${await sign(data.response_id)}`,
},
```

If the token exists only hashed in the domain's tables (an invite), the domain passes the
plaintext as `notify({ secret })`, to exactly one recipient, and the builder gets it as
`ref.secret`; it is encrypted on the email's job and cleared once the email settles. Because the
type is transactional, an unsubscribe from the category never stops it.

## Security

- `genesis_notify`, the runner's functions, erasure, unsubscribe and the type mirror are the
  service role's; a signed-in person can read and mark only their own feed and set their own
  preferences. Every function is granted and revoked by name; no `private.*` function is granted
  to `anon` or `public`.
- A push token moves to another login only when that login registers it with the same install id
  (the same phone); every move is recorded in `push_device_moves`. `genesis_push_forget` works
  signed out with the token as the proof, deletes only that exact token's row, and answers the
  same whether or not there was one.
- The pgTAP test (`migrations/tests/0001_genesis_notifications.test.sql`) covers row level
  security on the feed, idempotency, preference resolution, quiet hours across both
  daylight-saving changes, the transactional bypass, erasure, secrets kept out of `data`, and both
  device rules.
