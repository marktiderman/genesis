# genesis-notifications v1.1: design for review

Status: **proposed**, for review before anyone builds. No code or migrations yet.

v1 decides channels from preferences, holds pushes in quiet hours, delays email until it is read,
and sends once. That's enough for a coaching app. It isn't enough for an app whose people are
children, whose tenants keep school hours, or whose reminders arrive in bursts. This note adds the
missing steps to the same notifier, keeps the v1 contract, and keeps v1 apps working unchanged.

It assumes [NOTIFICATIONS.md](NOTIFICATIONS.md) (the contract, the tables, the flow) and the
package [README](../packages/notifications/README.md).

## Goals and non-goals

**Goals**

1. **Rules that preferences can't undo.** These come from a person's role in the tenant and their
   age band. Each notification also has a `purpose`, and a commercial opt-out covers every tenant.
2. **Urgency.** Each type gets an iOS interruption level, an Android priority and a web push
   urgency. Send windows compose from tenant, role and personal hours, and urgent types get a
   send-now path that takes seconds.
3. **Digests.** Pending notifications that share a `batchKey` go out as one.
4. **Throttles and per-channel caps.**
5. **Checks before a release.** The doctor and a preview catch configuration mistakes.
6. **New channels and steps,** in order: web push, SMS, escalation.
7. **Scale.** Large audiences and one runner engine.

**Non-goals**

- A workflow engine, a visual journey builder or a general `steps` array. The pipeline is fixed,
  and a type only sets fields on it.
- Marketing segmentation, A/B tests, send-time optimisation.
- More than one provider per channel. Slack, WhatsApp and Teams.
- Server-side presence ("hold the push while they're active on the web"). v1's on-device
  suppression covers the screen that's already open.
- Apple Critical Alerts. The `critical` urgency is allowed only for apps that hold the entitlement.

**The contract doesn't change.** A domain decides who and what. The notifier decides how and when.
The new policy layer only ever takes channels away from the recipients the domain names. It never
adds people.

## The model

### The pipeline

```
notify ─▶ policy ─▶ preferences ─▶ digest/batch ─▶ windows ─▶ throttle/caps ─▶ send
          (final)   (v1)           (attach)        (hold)     (at claim)
```

| Step | When | What it decides |
|---|---|---|
| policy | at notify, checked again at claim | `audience` drops a recipient. Role and age rules remove channels and purposes for good. |
| preferences | at notify, checked again at claim | v1's `channel_on`. A policy denial comes first, so nothing in preferences undoes it. |
| digest | at notify | Attaches the send job to the recipient's open batch for `batchKey`, or opens a batch. |
| windows | at notify (`send_after`) and at claim | Holds the job until it's outside every hold. A held job keeps its attempts. A job past its `ttlSeconds` is skipped as `expired`. |
| throttle/caps | at claim | Counts what was sent in the window. Over the limit, the job is skipped (`throttled` or `capped`) or folded into its digest. |
| send | runner | v1, plus the urgency fields, web push and SMS. |

The feed (`in_app`) is decided by policy and preferences only. Windows, digests and caps hold back
interruptions, not the record, so the feed row still appears at once.

### New registry fields (all optional)

```ts
defineNotifications({
  categories: {
    messages: { label: "Messages", communication: true, android: { importance: "high", version: 1 } },
    invites:  { label: "Invites", android: { importance: "high" } },
  },
  policies: [                                   // final: preferences never undo them
    { when: { roles: ["player"] }, deny: { channels: ["email", "sms"] } },
    { when: { ageBand: "under13" }, deny: { channels: ["email", "sms"], purposes: ["commercial"] } },
    { when: { roles: ["player"] }, hold: { window: "school", channels: ["push"],
      except: { types: ["room.invite"], senderRoles: ["teacher"] } } },
  ],
  defaults: { nightQuiet: { start: "21:00", end: "07:00" }, caps: { push: { perDay: 20 } } },
  types: {
    "room.invite": {
      category: "invites", channels: { in_app: true, push: true },
      urgency: "timeSensitive", ttlSeconds: 300,          // send now; stale after 5 minutes
      audience: { roles: ["player", "teacher"] },
      render: (d) => ({ title: `${d.host} invited you`, url: `/rooms/${d.room_id}` }),
      example: { host: "Sam", room_id: "r1" },             // preview and doctor fixtures
    },
    "update-request.due": {
      category: "requests", channels: { in_app: true, push: true, email: true },
      batch: { windowSeconds: 3600, maxItems: 20 },
      escalate: [{ after: 3600, channel: "email", unless: "read" }],
      throttle: { windowSeconds: 86400, max: 3, then: "batch" },
      render: …, renderDigest: (items) => ({ title: `${items.length} updates due`, url: "/updates" }),
    },
    "weekly.summary": { category: "summaries", channels: { push: true, email: true },
      urgency: "passive", batch: { flushAt: { weekday: "mon", time: "08:00" } }, render: …, renderDigest: … },
    "offers.new": { category: "offers", channels: { email: true }, purpose: "commercial", render: … },
  },
});
```

- `purpose`: `"transactional"` or `"commercial"`. Leave it out for an ordinary service notification.
  v1's `transactional: true` is kept as an alias for `purpose: "transactional"`.
- `urgency`: `"passive" | "active" | "timeSensitive" | "critical"`, default `"active"`. See item 2.
- `emailDelaySeconds` (v1) becomes shorthand for `escalate: [{ after, channel: "email", unless: "read" }]`.
- The policies are mirrored on deploy by the same `syncNotificationTypes` that mirrors the types,
  into `notification_policies`.

### New tables and columns

| Where | What |
|---|---|
| `notification_types` | New columns: `purpose`, `urgency`, `ttl_seconds`, `audience jsonb`, `batch jsonb`, `throttle jsonb`, `escalate jsonb`. |
| `notification_policies` (new) | Mirrored from code, like the types. The service role writes it, and only the service role reads it. |
| `notification_tenant_settings` (new) | One row per tenant: `time_zone`, `night_quiet`, named `windows` (`{ school: { mon: [["08:00","15:00"]], … } }`), `caps`, `postal_address`. Admins read and set it through the admin hook. |
| `notification_preferences` | New column: `commercial_opt_out boolean`. One switch for every tenant. |
| `notification_suppressions` | New category value: `commercial`. The global commercial unsubscribe for people with no login. |
| `notifications` | New columns: `actor_id`, `reason`, `batch_key`. |
| `notification_deliveries` | New columns: `recipient_key`, `batch_key`, `batched_into` (the batch's carrier job), `unless` (`read` or `seen`), `expires_at`, and the channel check widened to `sms`. |
| `push_devices` | New columns: `runtime_version` and `platform` = `web`. Web push gets its own table (item 6), because its tokens aren't Expo tokens. |
| `notification_sms_consents` (new) | Opt-in evidence (item 7). |

### Who the recipient is in this tenant

The same person can be a teacher in one tenant and a player in another, so rules need the
recipient's context for each tenant. The app answers through one hook, the same pattern as v1's
admin hook:

```sql
-- In the app's own migration, after Genesis's. Who p_user is in p_tenant.
create or replace function private.genesis_notifications_context(p_user uuid, p_tenant uuid)
returns table (roles text[], age_band text, home_tenant uuid)
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.role), '{}'), max(p.age_band), coalesce(max(m.home_tenant_id), p_tenant)
  from public.memberships m
  join public.profiles p on p.user_id = m.user_id
  where m.user_id = p_user and m.tenant_id = p_tenant
$$;
revoke execute on function private.genesis_notifications_context(uuid, uuid) from public, anon, authenticated;
grant execute on function private.genesis_notifications_context(uuid, uuid) to service_role;
```

- **It fails closed.** Genesis's default raises when `notification_policies` has rows. An app with
  rules but no hook therefore can't send at all, rather than send email to a child.
- `home_tenant` is whose hours apply. A league-wide notice to players follows each player's own
  school hours.
- The sender's roles come from the same hook (`notify({ actor })`), so `except.senderRoles` works.

### Rules for the SQL in this design

Every sketch here, and every migration that follows, keeps these rules:

- Policies are scoped `to authenticated`.
- `(select auth.uid())` is used only where the result doesn't depend on the row. For example,
  `private.genesis_notifications_admin((select auth.uid()), tenant_id)` wraps the uid but not the
  whole call, because `tenant_id` comes from the row.
- Every column a policy filters on is indexed.
- Security-definer functions get `set search_path = ''` and schema-qualified names.
- **Definer functions live in `private`, which isn't exposed.** The new callable functions in
  `public` are `security invoker` wrappers. A wrapper the service role calls needs no definer at
  all, because the service role has the table grants. A wrapper a signed-in person calls reaches a
  `private` definer that is granted to `authenticated` by name. v1 has definer functions in
  `public` that are granted to the service role only; moving them is a follow-up, not part of v1.1.
- A person-vs-server check uses `current_setting('role')`. `current_user` works only in an invoker
  function, because inside a definer it is the owner. Never use `request.jwt.claims` or `auth.role()`.
- Functions are granted and revoked by name, and a `private.*` function is never granted to
  `anon` or `public`.

## 1. Policy layer

Rules are code, because an app's roles and age bands are code. A tenant's hours and caps are data.

```ts
await notify(admin, {
  type: "teacher.announcement",
  recipients: playerIds,
  actor: teacherUserId,          // excluded from recipients; their roles feed senderRoles
  tenantId: schoolId,
  reason: "member",              // stored on the feed row: why you're seeing this
  data: { title, class_id },
  idempotencyKey: `announcement:${id}`,
});
```

Order inside `channel_on`:

1. `audience`: the recipient's roles aren't in the type's audience, so they get no row at all. The
   job is skipped as `audience` and logged.
2. Every matching `deny` takes its channel or purpose away. This is final, and it beats a
   `critical` type too, because a legal rule outranks "can't turn off". The doctor warns when a
   critical type has no channel left for some role.
3. `purpose: "commercial"` with `commercial_opt_out` (or a `commercial` suppression) turns email
   and SMS off. The feed stays on.
4. Then v1 runs as it does today: the tenant choice, the category choice, the tenant default,
   the type default.

Commercial email must carry a postal address. The runner reads `postal_address` from the tenant's
settings, falling back to `email.postalAddress`, and fails the job as `no_postal_address` when
there's none. Its unsubscribe link offers both "this category" and "all marketing".

## 2. Urgency, send windows and send now

### The mapping for each channel

| `urgency` | iOS `interruptionLevel` | Expo `priority` (Android) | Web push `Urgency` | Windows and digests |
|---|---|---|---|---|
| `passive` | `passive` (no sound, screen stays dark) | `normal` | `low` | held; can batch |
| `active` (default) | `active` | `high` | `normal` | held; can batch |
| `timeSensitive` | `time-sensitive` (breaks through Focus and the summary; the person can turn it off) | `high` | `high` | send now; no batch; tenant and role holds apply only where the policy says so; personal quiet hours still hold it until `ttlSeconds` |
| `critical` | `critical` (needs Apple's entitlement: `ios.criticalAlerts: true` in the registry, or the doctor fails) | `high` | `high` | bypasses every hold |

- **Android importance is set per channel,** and Android won't change it once the channel exists.
  A category's `android.importance` therefore comes with a `version`. The channel id is the category
  id, or `<category>_v<n>` from version 2, and the push block deletes the old channel. The doctor
  compares the registry against a committed `notifications.lock.json` and fails an importance
  change that has no new version. It also warns when a category holds types whose urgency doesn't
  fit the channel's importance.
- **TTL.** `ttlSeconds` goes to Expo's `ttl` and web push's `TTL`. It also skips a job still held
  past it (`expired`). Keep it long enough for a phone to wake from doze.

### Windows: holds

Expressed as holds rather than as open hours, the allowed time is tenant hours ∩ role hours ∩
personal hours:

- **Role holds** come from the registry, for example `hold: { window: "school", channels, except }`.
  The window's hours come from the home tenant's `windows`, in its `time_zone`.
- **The night window.** A person's own quiet hours apply when they're set. Otherwise the tenant's
  `night_quiet` applies, then `defaults.nightQuiet`. This is the tenant-default night window.
- **SMS** has a fixed extra hold from 21:00 to 08:00, in the recipient's time zone (item 7).

`private.genesis_notifications_hold_until(user, tenant, type, channel, at)` returns the end of the
latest hold that covers `at`. It generalises v1's `quiet_until` and keeps its daylight-saving
handling. `genesis_notify` uses it to set `send_after`, and the claim checks it again, just as it
checks quiet hours today.

A hold can be bypassed in two ways:

- by type: `except.types`;
- by the sender's role: `except.senderRoles`, as with a teacher's announcements.

### Send now

An urgent type (`timeSensitive` or `critical`, or `sendNow: true` on the type) must not wait for
the one-minute cron. Two paths, and either one is enough:

- **From TypeScript:** `notify(admin, input, { registry, runner })`. When it gets a runner, it
  calls `runner.sendNow(notificationIds)` once the database call returns. That claims exactly those
  jobs (`genesis_notifications_claim(..., p_ids)`) in the same process: a Supabase function, a
  server route, or a worker on a job queue.
- **From SQL:** `genesis_notify` calls the jobs block's signed `private.genesis_jobs_call('notifications-now')`
  once per call. pg_net sends that request only after the transaction commits, so a rolled-back
  notify sends nothing.

A worker host that has no pg_net uses the first path, and runs `runner.run()` on its own
repeatable job.

## 3. Digest by `batchKey`

```ts
await notify(admin, {
  type: "update-request.due",
  recipients: [personId],
  data: { request_id: id, item_title },
  idempotencyKey: `update-request:${id}:${due}`,
  threadKey: `update-request:${id}`,
  batchKey: `update-requests:${personId}`,   // or the type's batch.key template
  tenantId,
});
// answered:
await cancelNotification(admin, { type: "update-request.due", idempotencyKey: `update-request:${id}:${due}`, tenantId });
```

- Each event keeps its own feed row, so reads, cancels and erasure stay per item.
- The first event for a recipient, channel and `batchKey` opens a batch. The batch is a *carrier*:
  an extra notification row that isn't in the feed, with one pending job for each channel.
  `send_after` is the end of the window, or the next `flushAt` in the recipient's time zone (a
  weekly summary is a batch with `flushAt`).
- Later events with the same key attach their jobs as `batched` (`batched_into` = the carrier's
  job). A partial unique index on (`recipient_key`, `channel`, `tenant_id`, `batch_key`), over
  pending carriers, keeps it to one open batch.
- At claim, the carrier gathers its live members, up to `maxItems`, and renders `renderDigest(items)`.
  With one member left it renders that member as itself. With none, it is skipped (`empty_batch`).
  Once it's sent, its members settle as `sent` with the carrier's id.
- A batch flushes early once it reaches `maxItems`.
- `unless: "read"` on a carrier means every member was read.
- Transactional, `timeSensitive` and `critical` types never batch.

## 4. Throttles and per-channel caps

- **A type throttle:** `throttle: { windowSeconds, max, key?, then: "drop" | "batch" }`. The default
  key is recipient + type. It's counted at claim, from the `sent` jobs in the window.
- **Channel caps:** `caps: { push: { perDay }, email: { perDay }, sms: { perDay } }`, per recipient,
  counted on the recipient's local day. They come from `defaults.caps`, overridden by the tenant's
  `caps`. Transactional and `critical` types bypass a cap but still count toward it.
- Both caps are soft. Two runners can each send one past the limit in the same second, which is
  acceptable for a cap. There's a new index on `notification_deliveries (recipient_key, channel, sent_at)`.
- A job over a limit is skipped and never held to the next day. **Cut, open to argument:** no
  "hold to next day", because a day-old interruption has lost its value, and the feed has it anyway.

## 5. Doctor and preview checks

These are added to `genesis doctor` as a notifications rule set. Each one reads the registry, the
app config, or both.

| Check | Fails when |
|---|---|
| Device categories | A type names an `actions` set that isn't in the registry, or the app doesn't register `deviceCategories()` (it doesn't use `pushOptionsFrom`). |
| Notification Service Extension | A `communication` category, `push.mutableContent` or `richContent` is used without the rich-push plugin. Communication categories also need the Communication Notifications capability and `INSendMessageIntent` in `NSUserActivityTypes`. |
| Interruption levels | `timeSensitive` is used without the Time Sensitive capability, or `critical` without `ios.criticalAlerts`. |
| Android channels | An importance changed with no new `version` (see `notifications.lock.json`). |
| VAPID | The private key on the server doesn't give the public key the browser uses, or the subject isn't `mailto:` or `https:`. |
| Sender domains | SPF, DKIM or DMARC is missing on a shared domain (`checkSenderDomain`; online, so `genesis notifications check`, not in a build). |
| Postal address | A commercial type exists and neither `email.postalAddress` nor every tenant's settings has one (a database check: `genesis_notifications_readiness()`). |
| Policies | A rule names an age band or role while the context hook is still Genesis's default. |
| SMS | The SMS channel is on and there's no Messaging Service SID or inbound webhook secret. |

**Preview.** `genesis notifications preview` renders every type on every channel from its
`example` data: the feed, the push on iOS and Android, the email, the SMS, and the digest with
three items. The output is a static HTML gallery. A type without an `example` is a warning.

## 6. Web push (VAPID)

- **Storage:** `web_push_subscriptions (id, user_id, endpoint unique, p256dh, auth, installation_id, user_agent, created_at, last_seen_at)`.
  The owner reads and deletes their own rows under row level security. Writes go through
  `genesis_webpush_register` and `_forget`, with the same move rule as v1's push tokens.
- **Sending:** web push is the `push` channel on another kind of device. A push job fans out to
  the person's Expo devices and their web subscriptions, and preferences don't change. Urgency
  becomes the `Urgency` header. The collapse key becomes `Topic`: a hash, 32 base64url characters
  at most. `ttlSeconds` becomes `TTL`. A 404 or 410 means the subscription has expired, so it is
  deleted (`disable`).
- **Provider:** `webPushProvider({ vapid: { subject, publicKey, privateKey } })` signs each request.
- **Web side:** `/web` adds `useWebPush()` and a service worker template. It asks for permission
  only from a button (never when the page loads), and Settings always has the toggle. On iOS, web
  push works only for a web app added to the Home Screen.

## 7. SMS (Twilio)

- **US rules:** a Messaging Service whose number is registered for A2P 10DLC (brand and campaign).
  Genesis checks that the configuration exists. The registration itself is done in Twilio.
- **Consent is evidence, and there's no SMS without it.**
  `notification_sms_consents (user_id, phone_hash, phone_masked, tenant_id, consented_at, source, wording, revoked_at, revoked_via)`
  records when, where and the exact wording shown. A send with no live consent is skipped (`no_consent`).
- **STOP and HELP.** Twilio's Advanced Opt-Out answers the keywords. The inbound webhook (signature
  checked) records them:
  - `STOP` and its synonyms revoke consent for that number in every tenant;
  - `START` is recorded as a new consent from that source;
  - error 21610 on a send does the same as `STOP`.
- **Hours.** An 8am–9pm hold in the recipient's time zone, falling back to the tenant's, then the
  app default.
- **Scope:** logins with a verified phone only. **Cut:** commercial SMS. Policy denies `commercial`
  on SMS by default, because it needs separate written consent.

## 8. Escalation

`escalate: [{ after, channel, unless: "read" | "seen" }]` generalises v1's email delay. At notify
time each step's job is made with `send_after = now + after`, and the claim skips it if `unless`
has happened. **Cut:** `unless: "delivered"`. An Expo receipt says the push reached Apple or Google,
not that a person saw it.

## 9. Topics with reasons: proposed cut

Topic subscriptions would make the notifier decide who hears about something, which breaks the
contract: visibility is the domain's. What v1.1 keeps from the idea:

- `reason` on each feed row (`"watching"`, `"mentioned"`, `"member"`), passed by the domain;
- `actor`, removed from the recipients;
- the audience-resolver hook below, for lists the domain would rather not pass.

## Also in v1.1

- **Large lists.** `notify()` splits recipients into calls of 500 (each call is idempotent, so a
  retry is safe), and `notifyShipped`'s own batching can go. `notify({ audience: { kind, id } })`
  calls an app hook, `private.genesis_notifications_audience(kind, id, tenant) returns setof uuid`,
  inside `genesis_notify`. That handles hundreds. Above `fanoutThreshold` (default 2,000) it
  enqueues a `notifications.fanout` job on the jobs block, which pages through.
- **Device rows.** `push_devices.runtime_version` is set by `genesis_push_register` (a new overload),
  next to `app_version`. A push job can carry `devices: { runtimeVersion?, platform? }`.
- **An OTA release type.** `GENESIS_RELEASE_TYPE` (category `updates`, `passive`), with the body
  taken from the release notes and cut to fit, and the URL pointing to What's new. Its key is
  `release:<update id>`, it's sent only to devices on the update's runtime, and
  `cancelNotification` takes it back after a rollback. An app that announces releases with its own
  trigger switches to this one.
- **Communication categories.** `communication: true` on a category makes its pushes mutable,
  carrying the sender's display values, so the extension can donate `INSendMessageIntent` and the
  push can break through Focus for allowed people. The doctor checks the setup (item 5).

## Jobs block or notifications runner: the one decision

**Recommendation: build notifications on the genesis-supabase jobs block.** Don't fold jobs into
the notifications runner.

| | Build on the jobs block | Fold jobs into the notifications runner |
|---|---|---|
| Layering | Jobs is the lower layer: Apple token revocation, clean-ups and domain jobs all use it. Notifications is one consumer. | Every app that wants a background job takes the notifier with it. |
| Scheduling and auth | One signed route and `genesis_schedule_job`. `GENESIS_NOTIFICATIONS_CRON_SECRET` and the hand-made cron go. | Two schedulers and two secrets for as long as both exist. |
| Send now from SQL | `genesis_jobs_call` already sends one signed request after commit. | It would have to be rebuilt. |
| Fan-out and digest timers | A `notifications.fanout` job is just another kind. | It needs a generic queue inside the notifier. |
| A worker on another queue | It calls `runner.run()` and `runJobs()` on its own clock. Schedules are optional. | The same. |

What stays separate is **the delivery outbox.** `notification_deliveries` remains its own table:
it is the delivery log, with columns admins read under row level security, push receipts, the
rendered email and an encrypted secret. A row in the generic jobs table would lose all of that.

**Merging the queues** therefore means:

- **One engine.** `createRunner` moves to `@marktiderman/genesis-supabase/runner` (still no
  dependencies), and `/notifications/runner` re-exports it. `runJobs` is rebuilt on it, so claim,
  backoff, deferrals and stale settles are written once.
- **One scheduler:** the jobs block.
- **Two kinds of store.** The generic `genesis_jobs`, and outboxes that need their own columns
  (notification deliveries, the forms destinations).
- **The rest.** 0005's push queue is already superseded. Moving chat's `effects` onto `genesis_jobs`
  is a separate proposal (open question 6).

## Migration and compatibility

- **One new migration,** `0002_genesis_notifications_v1_1.sql`, which only adds things. Every new
  column is nullable or has a default that keeps v1's behaviour. It needs genesis-supabase's 0007
  (jobs) only for send-now from SQL and for fan-out; without 0007, both are skipped, and the TS
  path still works.
- **`genesis_notify`** is dropped and recreated with one extra defaulted parameter,
  `p_options jsonb`, which carries `actor`, `reason`, `batchKey`, `audience` and `devices`. Existing
  calls with ten positional or named arguments resolve unchanged. Its grants are made again by name.
- **A v1 registry needs no edits.**
  - With no `policies`, nothing is denied, and the context hook is never called.
  - With no tenant settings and no `defaults.nightQuiet`, there's no night window, as in v1.
  - The default urgency is `active`, which is today's payload with `interruptionLevel: "active"`
    added.
  - `transactional` and `emailDelaySeconds` keep their meaning, as aliases.
- **The cron route stays** for one minor version next to the jobs-block schedule, and the README
  shows the switch.
- **pgTAP covers:**
  - policy finality over preferences and over `critical`;
  - context per tenant;
  - holds across both daylight-saving changes;
  - `expired`;
  - the batch carrier with cancels;
  - caps on the local day;
  - SMS consent and STOP;
  - row level security on every new table.

## Build order

Sizes are rough. S is about a day, M two to three days, L about a week.

| # | Piece | Size | Notes |
|---|---|---|---|
| 0 | `createRunner` into genesis-supabase; `runJobs` on it; the schedule via the jobs block | S | Unblocks send-now and fan-out. |
| 1 | Policy layer: fields, sync, the context hook, `purpose`, the commercial opt-out, the postal address, `actor`/`reason`, notify batching, the audience resolver | L | What the school app needs first. |
| 2 | Urgency and windows: payload mapping, holds, tenant settings, the night window, `ttlSeconds`, send-now, `runtime_version` | L | |
| 3 | Digests (the carrier) | M–L | The update-reminder consumer's `batchKey`. |
| 4 | Throttles and caps | S–M | |
| 5 | Doctor, the lockfile, preview, communication categories, the release type | M | |
| 6 | Web push | M | |
| 7 | SMS | L | No current consumer. It could wait for one. |
| 8 | Escalation | S | Mostly a generalisation of the email delay. |
| 9 | Topics | — | Cut, see item 9. |

## Open questions for review

1. **Where context comes from.** Is a database hook the right source, or should the caller pass
   `role` and `ageBand` per recipient? The hook fails closed and can't be forgotten on one call
   site, but it costs one query per recipient.
2. **Naming.** v1's `critical: true` means "can't be turned off", and urgency now has a value
   called `critical`. Rename the v1 flag to `required`, keeping the old name as an alias?
3. **Home tenant.** Is `home_tenant` the right way for a league-wide notice to follow each school's
   hours, or should windows hang off the tenant tree?
4. **Personal quiet hours.** Should a `timeSensitive` push wait out personal quiet hours (until its
   TTL), as proposed, or break through them as iOS Time Sensitive does?
5. **The runner's home.** Moving `createRunner` gives notifications a dependency on genesis-supabase.
   Is that acceptable, or should the runner become its own tiny package?
6. **Chat's queue.** Should chat's `effects` queue move onto `genesis_jobs` in the same release
   series?
7. **Cuts.** Are the cuts right: topic subscriptions, `unless: "delivered"`, "hold to next day" for
   caps, commercial SMS?
8. **COPPA.** For an app with minors, do push tokens count as persistent identifiers that need
   parental consent? That's a legal question for the app, but if the answer is yes, the policy
   layer would need a "no push without consent" rule as well.

## References

Checked against current documentation for this note:

- Expo, *Send notifications with the Expo push service*: message format (`interruptionLevel`,
  `priority`, `ttl`, `channelId`, `collapseId`, `mutableContent`, `relevanceScore`).
  https://docs.expo.dev/push-notifications/sending-notifications
- Expo, *Notifications SDK*: `setNotificationChannelAsync`, where only the name and description
  can change after a channel is created, and `AndroidImportance`.
  https://docs.expo.dev/versions/latest/sdk/notifications
- Apple, *UNNotificationInterruptionLevel*: passive, active, timeSensitive, and critical (which
  needs an entitlement).
  https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel
- Apple, *Implementing communication notifications*: the capability, `NSUserActivityTypes`,
  donating `INSendMessageIntent` in the extension, `updating(from:)`.
  https://developer.apple.com/documentation/usernotifications/implementing-communication-notifications
- Android, *Create and manage notification channels*: importance can't change after creation;
  `ACTION_CHANNEL_NOTIFICATION_SETTINGS`.
  https://developer.android.com/develop/ui/compose/notifications/channels
- web-push (Node), `sendNotification` options: VAPID details, `TTL`, `urgency`, `topic` (32
  base64url characters at most).
  https://github.com/web-push-libs/web-push
- Twilio, *A2P 10DLC* and *Advanced Opt-Out*.
  https://www.twilio.com/docs/messaging/compliance/a2p-10dlc,
  https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out
- Supabase, *RLS performance and best practices*: index policy columns, and wrap `auth.uid()` in a
  select only when the result doesn't depend on the row.
  https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
- Supabase, *Row Level Security* (security-definer functions: `search_path = ''`, never in an
  exposed schema) and *Database functions* (prefer invoker).
  https://supabase.com/docs/guides/database/postgres/row-level-security,
  https://supabase.com/docs/guides/database/functions

From general knowledge, not checked here (review these):

- the name of the Time Sensitive capability;
- web push on iOS working only from the Home Screen;
- the SMS keyword list beyond STOP, START and HELP;
- the 8am–9pm rule, which TCPA applies to solicitations and which this design uses as the default
  for all SMS.
