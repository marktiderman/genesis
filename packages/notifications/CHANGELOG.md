# @marktiderman/genesis-notifications

## 0.4.0

### Minor Changes

- ba4220d: Email is a support ticket channel (ADR 0011). genesis-notifications gains `createInboundEmailHandler` (`/server`): it verifies Resend's `email.received` webhook, fetches the message and hands it to the first route that takes it (`InboundEmail`, `inboundEmailOf`, `parseAddress`). genesis-support gains the `support-email` block (migration 0002: a report's channel, requester and reply token, `support_email_messages`, `support_receive_email`, a queue of staff replies to send) and `/email`: `supportEmailRoute` (files mail to a support address, a ticket's reply address or a ticket's thread) and `runSupportEmail` (sends staff replies threaded through the notifier's Resend provider, once per reply). 0006's reply rule now lets staff answer a ticket with no login and server code write on an email ticket.

### Patch Changes

- 9551c52: First-run fixes from a fresh `genesis init --template native`:

  - `genesis.lock.json` remembers where each package migration was copied (`migrations`), written by `genesis add`, `genesis migrate` and `init --template native`; a run on an older lock records the copies it finds. A copy the app deleted is reported as `deleted` by `genesis migrate` and `genesis add`, the way an edited copy is, and is never copied again (before, it looked new and `genesis upgrade` listed it to copy back). It doesn't make `genesis migrate` exit 1.
  - An Edge Function's `npm:@marktiderman/genesis-*@<range>` imports are pinned to the versions the app has installed when `genesis add` copies the function, and `genesis upgrade` refreshes them the same way. The notifications function's own imports now name `^0.3.0`, not `^0.1.0`.
  - The native starter's Metro test (which reads the monorepo's `metro.config.js`) runs only inside the Genesis monorepo, so `vitest` passes right after `init --template native`.

- 4516ead: The block's setup step and README say to mirror the registry at migration time with `genesis migrate`, keeping `syncNotificationTypes` on deploy.
- 1ed0cba: Package layers. Every package's package.json now says where it sits: `genesis.layer`
  (`foundation`, `primitive`, `module` or `tooling`), `genesis.group` (`core`, `data`, `ai`,
  `forms`, `collaboration`, `shells` or `modules`) and, on the foundation packages, `essential`.
  Dependencies only point down, and the repo's CI fails when one doesn't (docs/PACKAGE-STRATEGY.md,
  "Layers").

  - genesis-features: `PackageMeta`, `ModuleMeta`, `PACKAGE_LAYERS`, `PACKAGE_GROUPS`,
    `readPackageMeta` and `packageLayerProblems` (also from `/blocks`). The feature `layer` that
    meant one component is now `"element"`; `"primitive"` is still accepted as its deprecated name,
    and `findFeatures(…, { layer: "element" })` finds both, until the next major.
  - genesis-sites, genesis-support and genesis-product are modules: each declares a
    `genesis.module` card (name, summary, blocks, schema, install line, docs) and ships a
    `SKILL.md`. genesis-product gains a `product-board` block (`genesis add product-board`), and
    marks `/node` and its `genesis-product` bin as tooling.
  - genesis-cli: `genesis features find --layer element` (`--layer primitive` still works).

- 84dc6c8: Package housekeeping, no code changes. genesis-ui and genesis-design-system ship a README (their
  npm pages were empty). chat, collab, native, notifications, sites and supabase ship the MIT
  LICENSE. core, design-system, ui, ui-native, the umbrella and genesis-cli export
  `./package.json`, so tools can read a package's metadata through `exports`. genesis-switchboard's
  repository folder is now `packages/switchboard` (the package name is unchanged). genesis-studio and
  genesis-forms-studio no longer call themselves a "workspace", which in Genesis means where the
  viewer is working.
- Updated dependencies [6eb984b]
- Updated dependencies [b11005b]
- Updated dependencies [b028861]
- Updated dependencies [c0c573f]
- Updated dependencies [37972e2]
- Updated dependencies [1ed0cba]
- Updated dependencies [f9a11f2]
  - @marktiderman/genesis-features@0.8.0

## 0.3.2

### Patch Changes

- 9a254df: Each package declares what `genesis doctor` enforces for it in its package.json (`genesis.doctor`): "use X instead" rules such as `core/direct-data-access` (no `supabase.from` / `.rpc` in screens), `ui-native/lists-use-native-resource-view`, `forms-react/forms-use-genesis-forms`, `notifications/notify-through-notifier`, `chat/chat-uses-genesis-chat`, `studio/raw-tables-use-studio`, `studio-server/handler-on-server`, `supabase/client-from-genesis`, `native/app-root`, `connect/secrets-use-connect`, `extension/checked-messaging`, `features/no-env-feature-switches`, `support/feedback-uses-support` and `forms/server-check-on-server`, plus primitives for the catalog; packages with nothing to enforce say why. Apps get the rules on install, with no config. Every rule ships as a warning. `forms/server-check-on-server` and `studio-server/handler-on-server` (a server-only import in a `.tsx`/`.jsx` screen) skip route modules whose server code never reaches the browser: ones that export a `loader` or `action` (declared or in an `export { … }` list), call `createServerFn(`, or start with a `"use server"` directive (`clientLoader` and `loaderData` don't count); they become errors in a later minor release.

  Features: doctor-package-rules

- Updated dependencies [9a254df]
- Updated dependencies [9a254df]
  - @marktiderman/genesis-features@0.7.0

## 0.3.1

### Patch Changes

- 4c5a9f4: Accept genesis-core 2 and genesis-ui-native 3 as peers, beside the versions accepted before. None of these packages used the renamed scope names (`ResourceScope.practiceId`, `timeZone: "practice"`, `practiceTimeZone`), so they work with either. Without the wider ranges, the core and ui-native majors would have forced a major release of every one of them.

## 0.3.0

### Minor Changes

- 80a027a: The outbox engine moved to `@marktiderman/genesis-supabase/runner`. `@marktiderman/genesis-notifications/runner` still works: it re-exports the same values and types, marked `@deprecated`, and stays for at least one more minor release. Change `from "@marktiderman/genesis-notifications/runner"` to `from "@marktiderman/genesis-supabase/runner"`; nothing else changes.

  **It now needs `@marktiderman/genesis-supabase` 0.7.0 or later as a peer dependency** (`>=0.7.0 <1.0.0`), the first version with `/runner`; the notifier's own runner imports the engine from there, with the same behaviour. Install it, or upgrade it to 0.7.0 or later, in every app that uses genesis-notifications (`pnpm add @marktiderman/genesis-supabase@^0.7.0`). As a peer, it gives the app one copy of the engine.

### Patch Changes

- c103d2d: `NotificationsProvider` reports a realtime subscription that throws through `reportError` from `@marktiderman/genesis-core/errors` (`notifications:realtime-subscribe`) instead of `console.warn`; the feed keeps working without live updates. `@marktiderman/genesis-core` is an optional peer, needed by `/react`.

## 0.2.2

### Patch Changes

- Updated dependencies [7cdf0fe]
  - @marktiderman/genesis-features@0.6.0

## 0.2.1

### Patch Changes

- Updated dependencies [bc5a348]
  - @marktiderman/genesis-features@0.5.0

## 0.2.0

### Minor Changes

- 48c4c90: `notificationsPushPreferences(supabase)` (from `/native`): the push block's `loadPreferences` / `savePreferences` on this package's preferences row, for an app that registers devices its own way: `createPush({ backend: { register, forget, ...notificationsPushPreferences(supabase) } })`, and Settings → Notifications reads and saves the notifier's preferences. `notificationsPushBackend` is now built on it (no change in behavior). Type `PushPreferencesBackend`.

### Patch Changes

- e1de4c1: - `native-screen-layout` counts a route as a screen through `NativeLoadingState` only when a full-screen loading state is all it renders (header options and fragments aside). A route that also renders other content, imports it, or uses `fullScreen={false}` still needs a Genesis layout.
  - Docs: `ScreenContainer`'s `loading` is for first loads (the body is unmounted while it's on); `loadingLabel` is visible and read aloud, so pass translated text; spread `notificationsPushPreferences` after your own keys.
- a85f1c7: Docs. genesis-chat: the README covers `/native` (Beta: its screens and their main props), lists migration 0003 and names the push category `messages`. genesis-native: the rich push plugin's first-build steps for the Notification Service Extension (enable Communication Notifications on `<bundle id>.NotificationService`, then `eas credentials` to make its profile). genesis-notifications: a push carries a type's `push.ids` (and, with previews shown, `push.display` and `mutableContent`), and the Notification Service Extension works with it through genesis-native.
- b3b8712: Chat pushes sent through genesis-notifications now get Reply, Mark as read and the Communication Notification:

  - Chat's Mark read action id is `mark_read`, the same as `MESSAGE_ACTIONS` (device ids take no "-"). A notification already on a phone with the old `mark-read` still marks read.
  - The docs and examples put `MESSAGE_ACTIONS` under the `messages` id, the category chat's push handler and genesis-native's notification service extension look for. Before, they said `message`, so on that path Mark read did nothing and the extension skipped the push. If your registry copied the old example, rename `actions: { message: MESSAGE_ACTIONS }` to `messages` and the type's `actions: "message"` to `"messages"`.

## 0.1.2

### Patch Changes

- Updated dependencies [d67b516]
  - @marktiderman/genesis-features@0.4.0

## 0.1.1

### Patch Changes

- 79ead0d: `@marktiderman/genesis-notifications`, v1: one notifier for every domain. A domain says who and what; the notifier decides how and when.

  - **`/core`**: `defineNotifications` registers the types (category, channels and their defaults, `critical`, `transactional`, an email delay, a device action category, `secretLink`, a `render`), the device categories (`MESSAGE_ACTIONS`: Reply with a text field, Mark as read) and the Android channels; `toTypeRows()` is mirrored into `notification_types`.
  - **`/runner`**: `createRunner`, the one outbox runner (claim, grouped sends, settle, `maxDeferrals`, jittered backoff, `disable` on 410). No dependencies.
  - **`/server`**: `cancelNotification({ type, idempotencyKey, tenantId?, recipients?, archive? })` takes back what hasn't gone out (pending jobs cancelled and never claimed, one being sent never retried, sent ones untouched, feed rows archived if asked); `notify()` over the security-definer `genesis_notify` (unique per recipient, type, tenant and idempotency key, thread and collapse keys, a caller's badge, a tenant, email-only recipients); `createNotificationRunner` sending Expo push (batches of 100, `threadId`, `categoryId`, `badge`, `collapseId`, private previews, receipts, dead tokens pruned) and Resend email (rendered once at first claim for byte-identical retries; a 409 `invalid_idempotent_request` fails loudly; paced under Resend's rate limit; tenant sender identities on a shared or verified domain (ownership TXT challenge, one tenant per domain, never the shared one); transactional and other mail from separate domains; RFC 8058 one-click unsubscribe); `createNotificationsHandler` (cron, Resend webhooks feeding a suppression list, the unsubscribe page); `resolveSecretLink`; `checkSenderDomain` (ownership, SPF, DKIM, DMARC).
  - **`/email`**: React Email `BrandLayout`, `reactEmailTemplate`.
  - **`/supabase`**: migration `0001_genesis_notifications.sql` with a pgTAP test, and `notificationsClient`. Preferences by category and channel with tenant defaults, quiet hours across daylight saving, delay-then-skip-if-read, erasure of people with or without a login, a short delivery log. It adopts genesis-supabase's 0005 tables in place, and registers tokens so that one moves to another login only from the same phone (audited), with a forget that reveals nothing.
  - **`/react`**, **`/web`**, **`/native`**, **`/blocks`**: `useNotifications`, `useUnreadCount`, `usePreferences`; a bell, a feed, a preferences matrix and admin views (delivery log, suppression list, send a test) on genesis-ui; a feed on genesis-ui-native's `NotificationsPage`, channel switches for `NotificationSettings`, and `notificationsPushBackend` for the push block; `notificationsBlock`.

  Features: notifications, notifications-email

- 41f93eb: A type's `render` can return `push: { ids, display, mutableContent }`: `ids` always reach the push's `data` (a Reply action needs the conversation and message), `display` values and `mutableContent` (for iOS rich push, genesis-native's Notification Service Extension) only when previews are shown. Flat values only, and the notifier's own `data` keys win. `PushMessage` gains `mutableContent`.
- 377d186: Review fixes before the first release:

  - A tenant's sender domain verifies only with an ownership TXT record holding that tenant's own token (`_genesis-notifications.<domain>`, `senderOwnershipRecord`), for one tenant at most (a unique index on verified domains), and never as the app's shared domain or one under it (`checkSenderDomain({ token, reservedDomains })`, and the runner refuses one too). `genesis_notifications_set_sender_dns` takes the domain it checked.
  - A cancel that lands while a job is being sent sticks: the job is never retried, and an expired lease ends it cancelled.
  - Idempotency keys (and cancel, and collapse) are per type and tenant: tenant A's key never finds tenant B's notification. `cancelNotification` takes `type` and `tenantId`.
  - A token registered before install ids (genesis-supabase's 0005, or the three-argument register) is adopted by the first register that brings one, audited, so upgrading strands no phone.
  - The secret backstop also refuses relative links, fragments, and any key or parameter ending in token, code, secret, key, otp or password.
  - An email whose secret won't decrypt fails alone (`secret_unreadable`); the rest of the claim goes out.
  - Resend's 409 `invalid_idempotent_request` fails loudly instead of counting as sent; secret link builders must be deterministic. Requests are paced (`perSecond`, default 5) under Resend's limit.
  - Push settles each Expo batch on its own and starts none once its lease is about to run out; with `runBudgetMs` a run claims again until the time left is under the lease.
  - Erasing a login also erases rows addressed to its email; unsubscribe tokens carry the address's hash, never the address, and unsubscribe from the sending tenant only; only a `Permanent` bounce suppresses; the provider's id is kept before the job settles.
  - The sender function template's `genesis.test` stays critical; push and email links must be paths on the app's own origin.
  - Preferences: an old 0005 switch left on no longer turns on opt-in email; clearing a choice for a category with none no longer fails; the web and native screens read choices back after a save; the feed header shares the feed's query; the push block's switch for a category with no notifier push type is kept, not refused.
