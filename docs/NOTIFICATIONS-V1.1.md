# genesis-notifications v1.1: design for review

Status: **v0.2.1, proposed**, for review before anyone builds. No code or migrations yet.

v1 decides channels from preferences, holds pushes in quiet hours, delays email until it is read,
and sends once. That's enough for a coaching app. It isn't enough for an app whose people are
children, whose tenants keep school hours, or whose reminders arrive in bursts. This note adds the
missing steps to the same notifier and keeps the v1 contract. There is one deliberate compatibility
step: an app now says whether it serves minors (see Migration and compatibility).

It assumes [NOTIFICATIONS.md](NOTIFICATIONS.md) (the contract, the tables, the flow) and the
package [README](../packages/notifications/README.md).

## Changes since v0.2

- **No new due column.** `expires_at` is gone; expiry is worked out from `created_at` and the
  type's `ttl_seconds`. This note says where the jobs table's `run_after` is used, and why
  deliveries keep v1's `send_after`.
- **One tenant time zone.** `notification_tenant_settings.time_zone` is gone. The context hook
  returns `window_time_zone`, read from the app's own tenant or site record.
- **The doctor and release steps:** a deprecated re-export, one runner copy, and a before-and-after
  doctor run on the consuming apps.

## Changes since v0.1

- **Trust boundary.** `genesis_notify` stays service-role only. Domains authorise who may notify
  whom, and `actor` is the domain's, never a client value.
- **Fail closed by data, not by rules.** An unknown age band gets the most restrictive treatment.
  The app declares `people: "adults" | "mixed"`, and the doctor fails when an app serving minors has
  no context hook.
- **The context hook is set-based** and returns `window_owner`, which replaces `home_tenant`.
  `age_band` comes from the person, and the tenant may be null.
- **One consent record for every channel** (`notification_consents`). It backs SMS and
  commercial opt-in.
- **Commercial messages are opt-in:** always for push, and for email by a tenant or region setting.
  Commercial email uses RFC 8058 one-click unsubscribe, honoured on the spot.
- **SMS:**
  - consent is revoked by any reasonable means, through one function;
  - an unknown time zone gets the narrowest window;
  - consent wording is versioned;
  - the webhook dedupes and refuses replays.
- **No parental-consent mechanism.** Genesis ships none; an app that needs one adds its own rule.
  This was decided by the owner, and the v0.1 question is resolved.
- **Caps** are counted under a per-recipient advisory lock.
- **Privacy:**
  - `timeSensitive` and `critical` pushes carry generic text by default, and a rule can make
    pushes generic for an age band;
  - digests render only what the domain gave;
  - consent evidence is kept, minimised, after erasure.
- **The runner move (step 0)** is spelled out: forms' bundling, an outcome contract test, and
  outboxes exempt from recipient steps.
- **Resolved:** questions 1–4 of v0.1. `critical: true` becomes `required`.

## Goals and non-goals

**Goals**

1. Rules that preferences can't undo, from a person's role and age band, plus a `purpose` with
   commercial consent.
2. Urgency per type, send windows composed from several levels, and a send-now path for urgent
   types.
3. Digests by `batchKey`.
4. Throttles and per-channel caps.
5. Doctor and preview checks.
6. In order: web push, SMS, escalation.
7. Large audiences, and one runner engine.

**Non-goals**

- A workflow engine or a general `steps` array. The pipeline is fixed, and a type sets fields on it.
- Marketing segmentation, A/B tests, send-time optimisation.
- More than one provider per channel. Slack, WhatsApp and Teams.
- Server-side presence. v1's on-device suppression covers the open screen.
- Apple Critical Alerts, unless the app holds the entitlement.

**The contract doesn't change.** A domain decides who and what. The notifier decides how and when.
The policy layer only ever takes channels away from the recipients the domain names.

## Trust boundary

- **Only the service role can call `genesis_notify`,** and every function that sends,
  claims or cancels. Nothing in v1.1 opens a path to them from `authenticated` or `anon`, and the
  migration revokes them by name again.
- **The domain authorises before it calls `notify()`.** When a signed-in person triggers a
  notification (a teacher posts an announcement through the domain's own function), the domain:
  - sets `actor` from `auth.uid()` on its side, never from the request body;
  - takes the recipients, or the `audience`, from its own visibility check: who this actor may
    reach, in this tenant;
  - keeps its own rate limits for people.
- **A bypass trusts only the domain's `actor`.** `except.senderRoles` reads the actor's roles
  through the context hook. A spoofed `actor` can only come from a domain bug, never from a client.
- **The notifier renders only what the domain gave.** `render` and `renderDigest` read the payload
  the domain passed, which it has already made privacy-safe. They never re-read the domain's rows to
  add names or content. A digest groups by the domain's payload, so a space that hides authors
  gets a digest that hides authors.

## The model

### The pipeline

```
notify ─▶ policy ─▶ preferences ─▶ digest/batch ─▶ windows ─▶ throttle/caps ─▶ send
          (final)   (v1)           (attach)        (hold)     (at claim, locked)
```

| Step | When | What it decides |
|---|---|---|
| policy | at notify, checked again at claim | `audience` drops the recipient. `deny` and `require` take channels and purposes away for good. |
| preferences | at notify, checked again at claim | v1's `channel_on`, after policy. |
| digest | at notify | Attaches the job to the recipient's open batch for `batchKey`, or opens one. |
| windows | at notify (`send_after`) and at claim | Holds the job until it's outside every hold, with no attempt used. Past `ttlSeconds`, it's skipped as `expired`. |
| throttle/caps | at claim, under a per-recipient lock | Over the limit, the job is skipped (`throttled` or `capped`) or folded into its digest. |
| send | runner | v1, plus the urgency fields, web push and SMS. |

The feed row is decided by policy and preferences only. Windows, digests and caps hold back
interruptions, not the record.

**These are recipient steps.** The runner engine underneath is generic, and the outboxes that
share it (forms destinations: a Sheets append, a webhook) have no recipient, so policy, windows,
digests and caps never apply to them.

### New registry fields (all optional except `people`)

```ts
defineNotifications({
  people: "mixed",                                    // "adults" | "mixed": does the app serve minors?
  categories: {
    messages: { label: "Messages", communication: true, android: { importance: "high", version: 1 } },
    invites:  { label: "Invites", android: { importance: "high" } },
  },
  policies: [                                         // final: preferences never undo them
    { when: { roles: ["player"] }, deny: { channels: ["email", "sms"] } },
    { when: { ageBand: "under13" }, deny: { channels: ["email", "sms"], purposes: ["commercial"] },
      pushPrivacy: "generic" },                       // an app's own rule; Genesis's built-in rule is below
    { when: { roles: ["player"] }, hold: { window: "school", channels: ["push"],
      except: { types: ["room.invite"], senderRoles: ["teacher"] } } },
  ],
  defaults: { nightQuiet: { start: "21:00", end: "07:00" }, caps: { push: { perDay: 20 } } },
  types: {
    "room.invite": {
      category: "invites", channels: { in_app: true, push: true },
      urgency: "timeSensitive", ttlSeconds: 300,       // send now; expires rather than arrives late
      audience: { roles: ["player", "teacher"] },
      render: (d) => ({ title: `${d.host} invited you`, url: `/rooms/${d.room_id}` }),
      example: { host: "Sam", room_id: "r1" },         // preview and doctor fixtures
    },
    "update-request.due": {                            // ordinary purpose: not commercial
      category: "requests", channels: { in_app: true, push: true, email: true }, urgency: "passive",
      batch: { windowSeconds: 3600, maxItems: 20 },
      escalate: [{ after: 3600, channel: "email", unless: "read" }],
      throttle: { windowSeconds: 86400, max: 3, then: "batch" },
      render: …, renderDigest: (items) => ({ title: `${items.length} updates due`, url: "/updates" }),
    },
    "weekly.summary": { category: "summaries", channels: { push: true, email: true },
      urgency: "passive", batch: { flushAt: { weekday: "mon", time: "08:00" } }, render: …, renderDigest: … },
    "offers.new": { category: "offers", channels: { push: true, email: true }, purpose: "commercial", render: … },
  },
});
```

- `purpose`: `"transactional"` or `"commercial"`. Leave it out for an ordinary service notice:
  reminders, recaps and pre-work notices are ordinary, so they keep their windows and digests, and
  a commercial opt-out never silences them. v1's `transactional: true` is an alias.
- `required: true` is v1's `critical: true` (preferences can't turn it off), renamed so it doesn't
  clash with `urgency: "critical"`. `critical` stays as an alias.
- `emailDelaySeconds` (v1) is shorthand for `escalate: [{ after, channel: "email", unless: "read" }]`.
- Policies are mirrored on deploy by `syncNotificationTypes`, into `notification_policies`.

### New tables and columns

| Where | What |
|---|---|
| `notification_types` | New columns: `purpose`, `urgency`, `ttl_seconds`, `audience`, `batch`, `throttle`, `escalate`, `required`. |
| `notification_policies` (new) | Mirrored from code. The service role only. |
| `notification_tenant_settings` (new) | `tenant_id`, `night_quiet`, `windows` keyed by window owner (falling back to the tenant row), `caps`, `postal_address`, `commercial_email` (`opt_in` default, or `opt_out` where the law allows it). Admins read and set it through the admin hook. |
| `notification_consents` (new) | One consent record for every channel (item 1). |
| `notification_preferences` | New column: `commercial_opt_out`, a global override across tenants. |
| `notifications` | New columns: `actor_id`, `reason`, `batch_key`. |
| `notification_deliveries` | New columns: `recipient_key`, `batch_key`, `batched_into`, `unless`; the channel check gains `sms`. No new due or expiry column (see the jobs-block decision). A new index on (`recipient_key`, `channel`, `sent_at`). |
| `push_devices` | New column: `runtime_version`. Web push gets its own table (item 6). |

### Who the recipient is: the context hook

The app answers for a whole set of recipients at once, in the same pattern as v1's admin hook:

```sql
-- The app's own migration, after Genesis's.
create or replace function private.genesis_notifications_context(p_users uuid[], p_tenant uuid)
returns table (user_id uuid, roles text[], age_band text, window_owner uuid, window_time_zone text)
language sql stable security definer set search_path = '' as $$
  select u.id,
         coalesce((select array_agg(m.role) from public.memberships m
                   where m.user_id = u.id and m.tenant_id = p_tenant), '{}'),
         p.age_band,                         -- from the person, so it holds with no tenant
         w.id,                               -- the site, else the tenant
         w.time_zone                         -- the app's own record: the one source of the zone
  from unnest(p_users) as u(id)
  left join public.profiles p on p.user_id = u.id
  left join lateral (
    select coalesce(s.id, t.id) as id, coalesce(s.time_zone, t.time_zone) as time_zone
    from public.tenants t
    left join public.memberships m on m.tenant_id = t.id and m.user_id = u.id
    left join public.sites s on s.id = m.site_id
    where t.id = p_tenant limit 1) w on true
$$;
revoke execute on function private.genesis_notifications_context(uuid[], uuid) from public, anon, authenticated;
grant execute on function private.genesis_notifications_context(uuid[], uuid) to service_role;
```

- **It is set-based.** `genesis_notify` calls it once per call, not once per recipient. Genesis
  ships a per-user wrapper, `private.genesis_notifications_context_one(uuid, uuid)`, for simple
  callers.
- **`p_tenant` may be null:** app-wide spaces, personal groups, direct messages. Roles are then
  empty, and person and type defaults apply. `age_band` comes from the person, so the under-13
  rules still hold.
- **`window_owner`** is whose hours apply: a school or a site within a tenant. One tenant can hold
  sites with different hours, and one person can be in several tenants.
- **`window_time_zone` is the one tenant zone.** Genesis keeps no tenant time-zone column. The
  hook reads the zone the app already keeps for the tenant or site, so reminders, digests and the
  app's own "today" agree. Personal quiet hours keep the person's own zone (v1).
  Genesis's default hook returns null, and then only personal quiet hours apply.
- **Fail closed.** Genesis's default hook returns `age_band = 'unknown'`, and the one built-in
  rule denies email, SMS and commercial to an `unknown` band. Push and the feed are untouched. An app with
  `people: "adults"` gets `adult` from the default hook instead. The doctor fails when `people` is
  `"mixed"`, or a policy names an `ageBand`, and the app's migrations don't replace the hook.
- The sender's roles (`except.senderRoles`) come from the same hook for `actor`.

### Rules for the SQL in this design

- Policies are scoped `to authenticated`.
- `(select auth.uid())` is used only where the result doesn't depend on the row. For example,
  `private.genesis_notifications_admin((select auth.uid()), tenant_id)` wraps the uid, not the call.
- Every column a policy filters on is indexed.
- Security-definer functions have `set search_path = ''`, schema-qualified names, and live in
  `private`, which isn't exposed.
- Callable functions in `public` are `security invoker` wrappers. For the service role that needs
  no definer at all. For a signed-in person, the wrapper reaches a `private` definer granted to
  `authenticated` by name. Moving v1's `public` definers (service role only) is a follow-up.
- A person-vs-server check uses `current_setting('role')`. `current_user` is the owner inside a
  definer. Never use `request.jwt.claims` or `auth.role()`.
- Functions are granted and revoked by name. A `private.*` function is never granted to `anon` or
  `public`.

## 1. Policy layer and consent

```ts
await notify(admin, {
  type: "teacher.announcement",
  recipients,                    // from the domain's own check: whom this teacher may reach
  actor: uid,                    // the domain's auth.uid(), never the request's
  tenantId: schoolId,
  reason: "member",
  data: { title, class_id },
  idempotencyKey: `announcement:${id}`,
});
```

Order inside `channel_on`:

1. **`audience`.** A recipient outside the type's audience gets no row at all, and the skip is logged.
2. **`deny`.** Each matching rule removes channels or purposes for good, even for a `required` type.
   The doctor warns when a required type has no channel left for some role.
3. **`require`.** A channel that needs a consent is off unless a live record exists:
   - `consent:sms`, always;
   - commercial push, always;
   - commercial email, when the tenant's `commercial_email` is `opt_in`.
4. **Overrides.** `commercial_opt_out`, or a `commercial` suppression for someone with no login,
   turns commercial off on every channel.
5. **v1** runs as today.

**One consent record:**

```
notification_consents (id, user_id, channel, purpose, tenant_id,
  phone_hash, phone_masked, wording_id, wording_hash, source_screen, app_version,
  consented_at, revoked_at, revoked_via)
```

- The owner reads their own rows under row level security (`to authenticated`, an index on
  `user_id`).
- Writes go through `genesis_notifications_record_consent` and the one revocation function,
  `private.genesis_notifications_revoke_consent(user, channel, purpose, via)`. Every path calls
  that function: STOP, a free-text opt-out, an email reply, support, or the in-app toggle.
- **No parental-consent mechanism in Genesis** (decided). An app that needs one writes its own
  `deny` rule by age band, or keeps its own consent check before it calls `notify()`.

**Commercial email** carries `List-Unsubscribe` with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
(RFC 8058), as all non-transactional v1 mail already does. The POST takes effect in the same
request, well inside Yahoo's two days and CAN-SPAM's ten business days, and the visible link stays
in the body. The runner fails commercial email with no postal address (`no_postal_address`): it
reads the tenant's `postal_address`, falling back to `email.postalAddress`.

## 2. Urgency, send windows and send now

| `urgency` | iOS `interruptionLevel` | Expo `priority` | Web push `Urgency` | Windows and digests |
|---|---|---|---|---|
| `passive` | `passive` | `normal` | `low` | held; can batch |
| `active` (default) | `active` | `high` | `normal` | held; can batch |
| `timeSensitive` | `time-sensitive` | `high` | `high` | send now; no batch; tenant and role holds apply unless excepted; **personal quiet hours hold it until `ttlSeconds`**, so a late invite expires rather than arrives late |
| `critical` | `critical` (needs `ios.criticalAlerts: true`) | `high` | `high` | bypasses every hold |

- **Generic text by default.** `timeSensitive` and `critical` types send generic push text unless
  they opt out with a reason in the registry. A policy's `pushPrivacy: "generic"` does the same for
  an age band or role. The content is then fetched when the app opens.
- **Android importance is fixed once a channel exists.** A category therefore has `android.version`,
  and the channel id is `<category>_v<n>` from version 2. `genesis notifications lock` writes
  `notifications.lock.json`. With a lock, an importance change without a new version fails. With
  none, the doctor reports info.
- **`ttlSeconds`** goes to Expo's `ttl` and web push's `TTL`, and expires held jobs. Keep it long
  enough for a phone to wake from doze.

**Windows are holds.** Expressed as holds, the allowed time is tenant hours ∩ role hours ∩ personal
hours:

- **Role holds,** such as `hold: { window: "school", … }`. The hours come from the window owner's
  `windows`, or else the tenant's, in `window_time_zone`.
- **The night window.** A person's own quiet hours apply when set. Otherwise the tenant's
  `night_quiet` applies, then `defaults.nightQuiet`.
- **SMS** has its own hold (item 7).

`private.genesis_notifications_hold_until(user, tenant, type, channel, at)` generalises v1's
`quiet_until`, including its daylight-saving handling. A hold can be bypassed by type
(`except.types`) or by the domain's actor's role (`except.senderRoles`).

**Send now**, for `timeSensitive`, `critical` or `sendNow: true`:

- `notify(admin, input, { registry, runner })` calls `runner.sendNow(ids)` in the same process.
- From SQL, `genesis_notify` makes one signed `private.genesis_jobs_call('notifications-now')`. It
  goes out only after commit, and through the jobs block's signed route, which carries no body.

## 3. Digest by `batchKey`

- **Each event keeps its own feed row,** so reads, cancels and erasure stay per item. (The
  update-request example is one `notify()` per request, cancelled per item when answered.)
- **The first event opens a batch.** The batch is a carrier: an extra notification row that isn't
  in the feed, with one pending job per channel. `send_after` is the window's end, or the next
  `flushAt` in the recipient's zone.
- **Later events attach as `batched`.** A partial unique index on (`recipient_key`, `channel`,
  `tenant_id`, `batch_key`), over pending carriers, keeps one batch open.
- **At claim,** the carrier renders `renderDigest(items)` over its live members:
  - one member left renders as itself;
  - none is skipped as `empty_batch`;
  - `maxItems` flushes early.
- `items` are the members' own payloads, or their rendered text. Nothing else is read.
- Transactional, `timeSensitive` and `critical` types never batch.

## 4. Throttles and per-channel caps

- **A type throttle:** `throttle: { windowSeconds, max, then: "drop" | "batch" }`. The key defaults
  to recipient + type. **A caller can pass `throttleKey`**, such as `space:<id>`, so a facilitator's
  nudges are limited per space and recipient.
- **Channel caps:** `caps: { push: { perDay }, email: { perDay }, sms: { perDay } }`, counted on
  the recipient's local day, from `defaults.caps` overridden by the tenant. Transactional and
  `critical` types bypass a cap but still count toward it.
- **Counted under a lock.** At claim, before counting, `pg_advisory_xact_lock(hashtextextended(recipient_key || ':' || channel, 0))`
  is taken in `recipient_key` order, so two claims can't deadlock. The count includes jobs that are
  `sending` as well as those `sent`.
  - **Why the lock:** it serialises only claims for the same recipient and channel, for the length
    of one short transaction. Claim order, batch sizes and the carrier stay as they are.
  - **Why not one job per recipient per claim:** that slows a busy recipient to one job a run, and
    fights the Expo batching.
- Over a limit, the job is skipped, never held to the next day.

## 5. Doctor and preview checks

**The `notifications` doctor pack.** It's registered through `builtinChecks()`, warns by default,
and fails under `--strict`. Rules can be set to `off` or given an `allow` with a reason. It's
offline and deterministic, and it reads the app's Expo config through the native pack's reader.
Dynamic config reports nothing.

| Check | Finding |
|---|---|
| Context hook | Fails: `people: "mixed"` or an `ageBand` rule, and the migrations don't replace the hook. |
| Device categories | A type names a missing `actions` set, or the app doesn't use `pushOptionsFrom`. |
| Notification service extension | A `communication` category, or `mutableContent` without the rich-push plugin. Communication categories also need the capability and `INSendMessageIntent` in `NSUserActivityTypes`. |
| Interruption levels | `timeSensitive` without the Time Sensitive capability; `critical` without `ios.criticalAlerts`. |
| Android channels | Info without a lock; fails on an unversioned importance change. |
| VAPID | The server's private key doesn't give the browser's public key, or the subject isn't `mailto:` or `https:`. |
| SMS | No Messaging Service SID, no webhook secret, or no HELP text (program name and contact). |

**`genesis notifications check`** runs online: sender domains (SPF, DKIM, DMARC) and
`genesis_notifications_readiness()`, which checks postal addresses and consent wording ids that no
longer exist.

**Preview.** `genesis notifications preview` renders every type on every channel from its
`example` data, including a three-item digest, as an HTML gallery.

## 6. Web push (VAPID)

- **Subscriptions:** `web_push_subscriptions (user_id, endpoint unique, p256dh, auth, installation_id, …)`.
  The owner reads and deletes their own rows. Registering and forgetting follow v1's move rule.
- **Sending:** web push is the `push` channel on another kind of device. Urgency becomes the
  `Urgency` header, the collapse key a hashed `Topic` (32 base64url characters at most), and
  `ttlSeconds` the `TTL`. A 404 or 410 disables the subscription.
- **Signing:** `webPushProvider({ vapid })`.
- **Web side:** `/web` adds `useWebPush()` and a service-worker template. It asks for permission
  only from a button, and Settings always has the toggle.

## 7. SMS (Twilio)

- **US rules:** a Messaging Service on a registered A2P 10DLC brand and campaign. Genesis checks
  the configuration exists.
- **No SMS without a live `consent:sms`.** The record stores the wording id and hash, the source
  screen and the app version.
- **Revocation by any reasonable means.**
  - Twilio's Advanced Opt-Out answers STOP and its synonyms, and HELP with the program name and a
    contact.
  - The inbound webhook revokes on any opt-out keyword. It also revokes on free text that reads as
    an opt-out ("stop texting me"), and logs the rest for the app's support queue.
  - Revocations from email, support or the in-app toggle call the same function.
  - Revocation takes effect at once, across every tenant for that number.
  - `START` records a new consent. Error 21610 on a send revokes.
- **The webhook** checks Twilio's signature and dedupes on `MessageSid` with a unique index, so a
  replay changes nothing.
- **Hours:** 8am–9pm in the recipient's time zone. With no known zone, the hours that are 8am–9pm
  across every zone the number could be in (by area code, else every US zone). Never the tenant's.
- **Scope:** logins with a verified phone. **Cut:** commercial SMS.

## 8. Escalation

`escalate: [{ after, channel, unless: "read" | "seen" }]` generalises v1's email delay. **Cut:**
`unless: "delivered"`. An Expo receipt says the push reached Apple or Google, not that a person
saw it.

## 9. Topics with reasons: proposed cut

Subscriptions would move "who" into the notifier. Kept from the idea: `reason` on feed rows,
`actor` removed from recipients, and the audience resolver.

## Also in v1.1

- **Large lists.** `notify()` sends recipients in calls of 500, and `notifyShipped`'s own batching
  can go.
- **The audience resolver** is an app SQL hook:
  `private.genesis_notifications_audience(kind text, id text, tenant uuid) returns setof uuid`.
  A collaboration space's "participants still pending", for example. The domain still decides who;
  the notifier only expands. Above `fanoutThreshold` (default 2,000) it pages through a
  `notifications.fanout` job on the jobs block. Fan-out combines with send-now for live reveals.
- **Device rows:** `push_devices.runtime_version`, through a new overload of `genesis_push_register`.
- **An OTA release type,** `GENESIS_RELEASE_TYPE`: passive; the body is the release notes; the key
  is `release:<update id>`; it goes only to devices on the update's runtime; it's cancelled on a
  rollback.
- **Communication categories:** mutable pushes with the sender's display values, so the extension
  can donate `INSendMessageIntent`.
- **Retention.** When a person is erased, their consent and revocation evidence is kept, as legal
  defence, but minimised to the phone hash, the masked number, the wording id and hash, and the
  timestamps. It's kept for 4 years after revocation (the TCPA limitation period; to confirm), then
  purged by `genesis_notifications_prune`. Delivery logs keep their v1 schedule.

## Jobs block or notifications runner: the one decision

**Recommendation: build notifications on the genesis-supabase jobs block.** Don't fold jobs into
the notifications runner.

- **Layering.** Jobs is the lower layer, with consumers other than notifications.
- **One signed route and one scheduler.** Receipts, digests and prune become `genesis_schedule_job`
  schedules (`genesis-job:` cron names), and the separate cron secret goes.
- **Free with the jobs block:** send-now from SQL and fan-out.
- **Worker hosts** still call `run()` themselves.

**`send_after` stays, and `run_after` is used where there is no delivery row.**

- **Why deliveries keep `send_after`.** `notification_deliveries` stays its own outbox: it's the
  delivery log, read by admins under row level security, with receipts, the rendered email and an
  encrypted secret. A delivery's due time is a column of that row, and the claim locks the row and
  decides it in one statement: holds, policy, caps.
  - Putting the due time in `genesis_jobs.run_after` would need a second row per delivery and two
    writes on every hold, collapse and cancel.
  - The two rows could then disagree, and the claim would need a join across tables it can't lock
    together.
  - v1.1 adds no due column. `send_after` is v1's, and expiry is worked out from `created_at` plus
    `ttl_seconds`.
- **`genesis_jobs.run_after`** is used for work that has no delivery row:
  - `notifications.fanout` pages;
  - the receipts poll and prune, through schedules;
  - a retry of send-now when the signed call fails.
- **The digest carrier is a delivery row,** so it uses `send_after`.
- **Send-now is a signed call to the route,** not a queued row.

**Step 0: one engine.**

- **Move the engine.** `createRunner` moves to `@marktiderman/genesis-supabase/runner`. It stays free
  of `@supabase/supabase-js` and of Node built-ins, so it can still be bundled. `runJobs` is rebuilt
  on it and keeps the jobs review's rule that a failed settle is counted as `unsettled`, never an
  abort.
- **Keep the old import.** `/notifications/runner` stays as a `@deprecated` re-export for at least
  one minor. Forms moves to the new path only in a forms release that raises its peer floor.
- **One copy.** Forms would reach the runner through two packages, so the peer ranges are set so
  that both resolve to one genesis-supabase. The doctor's existing `duplicate-genesis-package` and
  `peer-range-mismatch` checks catch a split, and no new rule is needed.
- **Forms, in the same PR.** Forms bundles the runner from source, so the PR repoints forms'
  `esbuild.alias`, its `tsconfig.paths`, and `build-config.test.ts`.
- **A contract test pins forms' outcomes:**
  - `filtered` and `skipped` are never retried;
  - Retry-After defers without counting an attempt, up to `maxDeferrals`;
  - a 410 means `failed` with `disable`;
  - `DEFAULT_MAX_ATTEMPTS`, `DEFAULT_MAX_DEFERRALS` and `DEFAULT_BATCH_SIZE` don't change.
- **Optional for forms:** schedule its destinations as their own kind,
  `genesis_schedule_job('forms', '* * * * *', 'forms.destinations')`, and call
  `genesis_jobs_call('forms.destinations')` after a submit for near-instant delivery. Apps on their
  own cron keep working.
- **Chat's `effects` queue:** open question 3.

## Migration and compatibility

- **One additive migration,** `0002_genesis_notifications_v1_1.sql`. It needs 0007 (jobs) only for
  send-now from SQL and fan-out.
- **`genesis_notify`** is recreated with one defaulted `p_options jsonb`, so old calls resolve
  unchanged. Its grants are made again by name: the service role only.
- **The one deliberate change:** an app declares `people`. Without it, the default hook answers
  `unknown`, and email, SMS and commercial sends to everyone stop (push and the feed go on). An
  adults-only v1 app adds `people: "adults"` (one line) in the same release it takes v1.1, and the
  doctor names the line. Everything else in a v1 registry keeps working:
  - no policies means only the built-in age rule;
  - no tenant settings means no night window;
  - urgency defaults to `active`;
  - the v1 names are aliases.
- **The cron route** stays for one minor next to the jobs-block schedule.
- **pgTAP covers:**
  - policy finality, including over `required`;
  - the set-based hook, including a null tenant;
  - unknown treated as under13;
  - SMS and commercial consent, and revocation through every path;
  - holds across daylight saving, and `expired`;
  - the batch carrier with cancels;
  - caps under concurrent claims;
  - webhook dedupe;
  - row level security on every new table;
  - `genesis_notify` refused to `authenticated`.

## Build order

Sizes: S is about a day, M two to three days, L about a week.

| # | Piece | Size |
|---|---|---|
| 0 | One engine: the move, the forms repoint and its contract test, `runJobs` on it, schedules via the jobs block | M |
| 1 | Policy layer and consent: `people`, the hook, `audience`, `deny`, `require`, `notification_consents`, commercial opt-in, `actor`/`reason`, batched notify, the audience resolver | L |
| 2 | Urgency, windows, send-now, generic push text, `runtime_version` | L |
| 3 | Digests | M–L |
| 4 | Throttles and caps (locked) | S–M |
| 5 | Doctor pack, lock, preview, `check`, the release type | M |
| 6 | Web push | M |
| 7 | SMS | L. No consumer yet; it can wait for one. |
| 8 | Escalation | S |

**Release step for every piece:** run the doctor pack on each consuming app (web and mobile) before
and after, and put both counts in the PR. A change must never report fewer findings than main
unless the PR says which finding it fixed.

## Questions

**Resolved in v0.2**

- *Where context comes from:* a set-based database hook, with a per-user wrapper.
- *Naming:* `critical: true` becomes `required`, keeping an alias.
- *League-wide hours:* `window_owner` from the hook, not `home_tenant` or the tenant tree.
- *Time-sensitive in quiet hours:* it waits until its TTL, and short TTLs make it expire.
- *Minors and push:* decided: Genesis ships no parental-consent mechanism; apps that need one add
  their own rule.

**Still open**

1. **The runner's home.** `createRunner` in genesis-supabase gives notifications a dependency on
   it. Acceptable, or should it be a package of its own?
2. **The compatibility step.** Is asking every app to declare `people` the right price for failing
   closed?
3. **Chat.** Should chat's `effects` queue move onto `genesis_jobs`?
4. **Cuts.** Are these right: topic subscriptions, `unless: "delivered"`, holding to the next day,
   commercial SMS?

## References

Checked against current documentation:

- **Expo:**
  - *Sending notifications*: `interruptionLevel`, `priority`, `ttl`, `channelId`, `collapseId`, `mutableContent`.
    https://docs.expo.dev/push-notifications/sending-notifications
  - *Notifications SDK*: a channel's importance is fixed after creation.
    https://docs.expo.dev/versions/latest/sdk/notifications
- **Apple:**
  - *UNNotificationInterruptionLevel*; *Implementing communication notifications*.
    https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel,
    https://developer.apple.com/documentation/usernotifications/implementing-communication-notifications
  - *App Store Review Guidelines* 4.5.4: marketing push only after explicit opt-in shown in the
    app's UI, with an in-app opt-out.
    https://developer.apple.com/app-store/review/guidelines/
- **Android:** *Notification channels*: importance can't change after creation.
  https://developer.android.com/develop/ui/compose/notifications/channels
- **web-push:** `sendNotification` options (VAPID, `TTL`, `urgency`, `topic`).
  https://github.com/web-push-libs/web-push
- **Resend:** *Add an unsubscribe link*, and bulk-sender requirements. RFC 8058 one-click
  (`List-Unsubscribe-Post`) is required by Gmail and Yahoo for bulk senders; honour it within two
  days; keep a visible link in the body.
  https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails
- **Twilio:** *A2P 10DLC*; *Advanced Opt-Out* (index entries only: Context7 has no page content).
  https://www.twilio.com/docs/messaging/compliance/a2p-10dlc,
  https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out
- **Supabase:**
  - *RLS performance and best practices*.
    https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv
  - *Row Level Security*: definers with `search_path = ''`, never in an exposed schema.
    https://supabase.com/docs/guides/database/postgres/row-level-security
  - *Database functions*.
    https://supabase.com/docs/guides/database/functions

Not checked here, so legal or the reviewers should confirm:

- the FCC's 2025 revocation rule ("any reasonable means", ten business days) and its scope;
- the EU and UK ePrivacy prior-consent rule for commercial email;
- the TCPA 8am–9pm hours and its four-year limitation period;
- the Time Sensitive capability name;
- iOS web push working only from the Home Screen;
- the full SMS keyword list.
