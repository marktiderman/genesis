# @marktiderman/genesis-support

Support and feedback for Genesis apps, kept in **the app's own Supabase**:

- a **feedback record** (bug, idea, question or praise; the message; the version signature,
  route, platform and device; screenshots) behind two seams, a `ContextCollector` and a
  `FeedbackSink`, with a Supabase sink;
- **web**: a feedback panel and a floating launcher built from Genesis UI, a screenshot of the tab
  (the browser asks first) with pen marks and hidden areas, and pins on the page;
- **native**: a feedback screen, screenshot capture with mark-up that can hide private parts, and
  **shake to report**; the person's reports as an inbox with staff replies and read receipts; an
  **idea board** with one vote per person, and "you asked, we shipped" tied to FeatureIds;
- **diagnostics**: a context dump (`genesis.diagnostics/1`) to the app's own server, on demand, on
  a shake and with every piece of feedback, scrubbed on the device and again on the server, with a
  `/server` handler for apps with their own API;
- a `defineBlock` declaration (`support-feedback`) that adds **Send feedback** and **Help** to
  Settings, names its routes and its migration.

The database half is migration `0006_genesis_support.sql` in `@marktiderman/genesis-supabase`,
with its pgTAP test and three Edge Function templates (see that package's README).

## Install

```bash
pnpm add @marktiderman/genesis-support @marktiderman/genesis-supabase
# native, for screenshots and shake to report (both optional):
npx expo install react-native-view-shot expo-sensors
```

Copy `migrations/0006_genesis_support.sql` (and `migrations/tests/0006_genesis_support.test.sql`)
from `@marktiderman/genesis-supabase` into your app's `supabase/` under a new timestamped name.

## Settings and zero config

Every support option is a Genesis setting (`@marktiderman/genesis-config`'s
`defineSettings`), in three namespaces: `support.*` (the features: `feedback`, `inbox`,
`messenger`, `agentDesk`, `helpCenter`, `aiAnswers`, `ideas`, `chatThreads`, `email`,
`replyByEmail`, `desks`, `staffAlerts`; the form's `screenshots`, `pins` and `severity`; the
GitHub sink's `githubRepo` and `githubIssueDetail`, `webhookUrl`, `contactEmail`, `contactUrl`,
`replyExpectation`, `verifyPrompt`), `diagnostics.*` (`enabled`, `dumpOnShake`, `dumpOnFeedback`,
`sendFromSettings`, `offlineQueue`, `maxBytes`, `perHour`, `retentionDays`) and `shake.*`
(`enabled`, a person's own switch, and `threshold`, `jolts`, `windowMs`, `cooldownMs`). Each has a
default per preset. Each is read where it applies. The database's own gates read them through
genesis-supabase's `private.genesis_setting(key, tenant)` (migration 0023), the server's copy of
`resolveSettings` with the tenant layer, so a tenant's `support.helpCenter` closes its help center on
the server as on screen (migration 0029):

- `support.messenger`: `SupportMessenger` and its launcher (`settings`) show nothing when off; on
  the phone `SupportRoute` leaves out the messenger's Home and new message.
- `support.helpCenter`: the messenger leaves Help out; `SupportRoute` leaves out help and articles.
- `support.agentDesk`: `SupportAgentInbox` says the agent desk is off; `SupportRoute` leaves out
  `agent` and `agent/<id>`.
- `support.desks`: migration 0029 (desks off is 0004's rule), and the desk card, picker and switch.
- `support.staffAlerts`: migration 0030 (no `support.message` to staff), the notify Edge Function and
  `supportNotifiersFromSettings` (no webhook).
- `support.githubRepo`, `support.githubIssueDetail`, `support.webhookUrl`: the notify Edge Function
  and `supportNotifiersFromSettings` (`/server`) when the environment doesn't set them; the
  tokens and signing secrets stay in the environment.
- `support.replyByEmail` (with `support.email`): `supportReplyConfig`, `supportEmailOptions` and
  `handleSupportInbound`.
- `support.email`: `supportReplyConfig` (reply by email) is off while it is off.
- `support.aiAnswers`: migration 0029 turns off a tenant's AI answers (`support_ai_enabled`, which
  `support_ask`, the help screens and `answerHelpQuestion` all ask) while it is off for that tenant.
- `support.chatThreads`: off, threads stay on support_replies even with a chat client
  (`createSupport`, and `createSupportClient`'s `settings`).
- `support.verifyPrompt`: migration 0033 (the verify prompt; see below).
- `support.contactEmail`, `support.contactUrl`: `supportContact(settings)`; the messenger's Help and
  error states (`SupportContact`), the phone's help center (`SupportContactRow`), and
  genesis-native's fatal screens through `contact: support.contact()`.

`support.severity` is off by default: the form asks a bug's severity only when it is turned on (or
`FeedbackPanel`'s `severity` prop says so).

| Preset | On |
|---|---|
| `max` (Genesis's default) | everything |
| `standard` | everything but AI answers, email (and reply by email) and desks |
| `min` | the feedback form, the dump and shake to report; no inbox, messenger, agent desk, help center, idea board, chat threads or staff alerts |

`min` is meant to be the smallest useful support: feedback still lands in the app's database (and
a GitHub issue or webhook still goes out where the app set one up), but the person has no inbox of
replies and staff get no alerts, so someone reads new reports in the admin view.

The keys that need a secret name it and its store, never its value: `support.githubRepo`
(`GITHUB_TOKEN`, an Edge Function secret), `support.webhookUrl` (`SUPPORT_WEBHOOK_SIGNING_SECRET`),
`support.email` (`RESEND_API_KEY`, an Edge Function secret), `support.replyByEmail`
(`SUPPORT_REPLY_SIGNING_SECRET`) and `support.aiAnswers` (`ANTHROPIC_API_KEY`, an Edge Function secret). The declarations
are also in this package's package.json (`genesis.settings`), so `genesis doctor` checks an app's
`genesis.config.json` against them.

`createSupport`, `createDiagnostics`, `FeedbackPanel` and `createDiagnosticsHandler` take
`appSettings`: what `resolveSettings` (or genesis-supabase's `resolveAppSettings`) returned, or the
values alone. An option the app passes still wins over its setting. With neither, the `max`
preset: everything on.

```ts
import { resolveSupportSettings, supportSettingValues } from "@marktiderman/genesis-support";

const settings = resolveSupportSettings({ preset: "standard", person: { "shake.enabled": { value: false } } });
supportSettingValues(settings).support.aiAnswers; // false
```

`createSupport`, `createDiagnostics` and `createDiagnosticsHandler` also take a function, read when
a setting is used, so a change in the database applies without a restart: `createSupport` reads
`shake.enabled` and the dump's switches (`diagnostics.enabled`, `dumpOnShake`, `dumpOnFeedback`,
`sendFromSettings`) each time, `createDiagnostics` reads `enabled` and `maxBytes` each time a dump
is made or sent, and `createDiagnosticsHandler` reads its function (it may be async, such as
`resolveAppSettings`) at most once every `settingsCacheMs` (30 seconds by default). With
`diagnostics.enabled` off, the handler refuses a dump (403 `diagnostics_off`) and stores feedback
without its dump. The rest (the idea board, the Settings rows, shake thresholds, the offline
queue) is read when support is created. `diagnostics.maxBytes` goes up to 512 KB, the most the
database stores. The database reads two of them itself (migration
`0020_genesis_support_settings.sql`, read through genesis-supabase's `private.genesis_setting` since
`0033_genesis_support_settings_resolver.sql`): the dumps a person may send an hour
(`diagnostics.perHour`) and how long a dump is kept (`diagnostics.retentionDays`), from
genesis-supabase's settings when they're there, else 10 and 90 as before.

A shake makes a dump at once and hands it to the feedback screen it opens: sent with the report
(one dump, linked both ways), or on its own when the person leaves without sending one (or after
15 seconds, if no feedback screen takes it).

**Who reads a dump** (migration `0026_genesis_support_diagnostics_access.sql`): its sender; for a
dump sent with a ticket, whoever handles that ticket (a business's dumps stay with its agents); for
a dump with no ticket, support staff. The short-id lookup follows the same rule.

**No SQL of your own.** Support runs without any hook of the app's:

- **The app's own tenant** is Genesis's reserved zero-config tenant,
  `bda1457d-053b-422c-8887-e046e54b8344`, a fixed random UUID, so a hand-written seed id such as
  `…0001` never lands on it. It is never an organisation's id: don't give one to a real
  organisation. Migration `0021_genesis_support_default_hooks.sql` (before 0004) defines a stand-in
  `private.genesis_support_default_tenant()` only so 0004 can run; `0023` (right after 0004) drops it
  again, but only while it is still exactly that stand-in (its body and its "Genesis default:"
  comment), and answers from Genesis's own wrapper. An app's hook written over the stand-in with
  `create or replace` before 0023 runs keeps its own body, so it is kept.
- **Staff** are the app's platform admins (genesis-supabase's `private.genesis_platform_admin`, or,
  without that hook, the people in genesis-supabase 0022's `genesis_platform_admins` list), asked in
  Genesis's own wrapper (0023, 0032); without either nobody is staff.
- **No viewer-people default.** `private.genesis_viewer_people` is the tenancy boundary chat, work
  and entitlements read, so Genesis never defines it. Without it a ticket goes to the app's own desk,
  and organisations' help desks stay closed until the app defines it.

Genesis never keeps a function of the app's hook names, so the app's own
`private.genesis_support_default_tenant()` or `private.genesis_support_staff(person uuid)` can come
in a migration of its own at any time, with a plain `create function` and its own parameter names,
and takes over. Tickets filed before the app's own default tenant existed stay in the reserved one:
move them in the same migration if the app's tenant should own them.

## Native

```ts
// src/lib/support.ts
import * as ViewShot from "react-native-view-shot";
import { Accelerometer } from "expo-sensors";
import { router, usePathname } from "expo-router";
import { createSupport } from "@marktiderman/genesis-support/native";

export const support = createSupport({
  supabase,
  navigate: (href) => router.push(href),
  appVersion: () => versionSignature({ application, updates, platform }).short,
  useCurrentRoute: usePathname,
  viewShot: ViewShot,          // screenshots and mark-up
  accelerometer: Accelerometer, // shake to report
  basePath: "/settings/support",
});

// app.ts
<GenesisNativeApp blocks={[support]} appFeatures={["account"]} … />
```

Settings gets the two rows through `useBlockSettings` (section `support`). The screens are your
route files, each a genesis-ui-native layout fed by a hook:

| Route (under `basePath`) | File | Renders |
|---|---|---|
| `/` | `support/index.tsx` | `<InboxPage {...useSupportInbox()} />` |
| `/new` | `support/new.tsx` | `<SettingsSubPage><FeedbackForm /></SettingsSubPage>` |
| `/[id]` | `support/[id].tsx` | `<ThreadPage {...useSupportThread(id)} />` |
| `/ideas` | `support/ideas.tsx` | `<InboxPage {...useIdeaBoard()} />` |
| `/shipped` | `support/shipped.tsx` | `<InboxPage {...useShippedIdeas()} />` |

The hooks return the layout's props plus `headerTitle` for `<Stack.Screen>`. Data is cached with
TanStack Query under the `genesis-support` key root; leave it out of query persistence.

**Every screen from one route file, in every zone** (`SupportRoute`). Instead of a file per
screen, put two one-line files under `basePath`, and the same two under each other navigation
zone's copy of it:

```tsx
// src/app/(tabs)/settings/support/index.tsx and src/app/(tabs)/settings/support/[...route].tsx
// (and src/app/admin/settings/support/index.tsx, src/app/admin/settings/support/[...route].tsx, …)
export { SupportRoute as default } from "@marktiderman/genesis-support/native";
```

```ts
export const support = createSupport({
  // …as above, plus:
  zones: ["/admin", "/coach"], // the route prefixes of the app's other zones (each its own Stack)
  router: { Screen: Stack.Screen, useSearchParams: useLocalSearchParams },
});
```

`SupportRoute` reads the path, takes the zone off (`zoneOf`, `stripZone`), works out the screen
(`supportScreenOf`: the inbox, `new`, a report's thread, `ideas`, `shipped`, the messenger's
`home`, `message`, `help` and `help/<slug>`, and an agent's `agent` and `agent/<id>`) and renders
Genesis's screen for it, with its header through `router.Screen`. Every link support opens
(`navigate`) stays in the zone the person is in (`inZone`), so a screen opened from the admin zone
opens its next screen there too. A screen of the app's own replaces one of Genesis's with
`<SupportRoute screens={{ thread: MyThread }} />` (it gets `{ screen, params }`).

*Moving from re-export files.* An app that copied each screen into every zone (`admin/…/support/
ideas.tsx` re-exporting `(tabs)/…/support/ideas.tsx`, and so on) deletes those copies, and its own
`zonePath` wrapper around `navigate`, and adds `zones` and `router` to `createSupport`. Its own
screens that differ from Genesis's go in `screens`, once, rather than in each zone. Keep a file
only for a route outside support that the zone needs.

**Shake to report.** With an accelerometer, a shake (two strong jolts within a second, then a
three second rest) captures the screen and opens the feedback screen with it. The screenshot is
sent only if the person turns on **Include this screenshot** (off by default); **Mark up** lets them draw on it and **Hide** paints solid boxes
over anything private. The marks are flattened into the image (`captureRef`) before it is sent; if
flattening fails, the unmarked image is never sent in its place, and leaving the mark-up
without saving turns Include off again. On the web, marks stay a list until Send and are drawn
into the image once.

**From anywhere** (a devtools overlay's "Send feedback" slot, a help icon):
`<SendFeedbackButton />`, or `useSupport().openFeedback()`.

## Web

```tsx
import { createSupportClient } from "@marktiderman/genesis-support";
import { FeedbackLauncher, mountSupportWidget } from "@marktiderman/genesis-support/web";

const client = createSupportClient(supabase);
<FeedbackLauncher client={client} />;              // in a React app
const unmount = mountSupportWidget({ client });   // on any page (needs Genesis UI's styles)
```

`FeedbackPanel` is the panel on its own. A screenshot uses `getDisplayMedia` with
`preferCurrentTab`: the browser asks, and when the person says no there is no screenshot (never a
placeholder). Routes are sent as paths only: query strings and fragments are dropped on the client,
in the contract's validation and by a database check, and path segments that look private (an
email, an id, a long token) become `:email`, `:id` or `:token`.

What the panel takes besides the client:

- `about={{ label, context }}`: what the app thinks the feedback is about (the screen's feature,
  say), shown as "About: …" with a way to drop it; kept, its `context` and the label join the
  report's context, and the report's thread (with `reportHeading`) shows "Sent from <label> (<route>)".
- `severity`: a bug gets a severity choice (Minor, Annoying, Blocks me, Broken), sent as
  `severity`. Default off.
- `draft` (from `useFeedbackDraft()`): what the person has written, captured and pinned, held by the
  host, so a host that unmounts the panel while the browser captures or the person pins (closing a
  Sheet on `onHide`) loses nothing. `FeedbackLauncher` holds one already.
- `captureOnOpen` takes a screenshot as the panel opens; `captureRequest` (a counter) takes one each
  time it goes up, once per value across remounts, keeping what the person wrote.
- `thanksReplacesForm`: after Send the thanks takes the form's place, with Send another (and
  `onOpenHelp`'s button, which opens your Help). Default off: the thanks shows under the form.
- Always on: a screenshot the browser didn't allow says so, and a placed pin shows as a row with
  Remove.

`useFeedbackShortcut(open, shortcut?)` opens feedback from anywhere with a key press (default
⌘⇧. on a Mac, Ctrl+Shift+. elsewhere; `false` turns it off); a held key and rich-text editors are
ignored. The press counts as the person's gesture, so the panel may ask to capture right away.

## Core

```ts
import { createSupportClient, createContextCollector, createIntakeClient, createIntakeSink } from "@marktiderman/genesis-support";

const client = createSupportClient(supabase);
await client.submit({ type: "bug", message, context: await collector.collect(), attachments: [{ kind: "screenshot", contentType: "image/jpeg", base64 }] });
// → { id, attachmentsDropped }
```

- `createSupportClient(supabase)`: `submit` (the Supabase sink), `myReports`, `report`,
  `replies`, `reply`, `markRead`, `deleteReport`, `attachments` (signed URLs), `ideas`,
  `suggestIdea`, `vote`, `unvote`, `shippedForMe`, `verify` (the person confirms a fix or reopens
  the report), `handles` (does the signed-in person handle this report), and for staff `isStaff`,
  `setStatus` and (support-chat block) `assign`; `thread`, `conversationId` and `subscribe` for a thread on
  genesis-chat (see below). Errors are `SupportError` with the database's code (`rateLimited` for
  `GS429`). `verify` and `handles` need migration 0003 and are optional on the `SupportClient`
  type (a client of your own may leave them out), so check for them before calling.
- A report's severity always goes into its context (`context.severity`). With migration 0003
  applied, pass `severityColumn: true` to `createSupportClient` (or `createSupabaseSink`) and it
  is written to the `severity` column as well; for the intake function, set
  `GENESIS_SUPPORT_SEVERITY_COLUMN=true`.
- `createIntakeClient` + `createIntakeSink`: the wire contract over HTTP, for code without
  supabase-js (it takes no screenshots, and says so in `attachmentsDropped`). For feedback with
  screenshots to the app's own API, use `httpTransport({ url }).feedbackSink` and
  `createDiagnosticsHandler` (see "Diagnostics").
- `contract.ts` is the wire contract (`CONTRACT_VERSION`, headers, `SubmitFeedbackInput`,
  `validateSubmitInput`), byte-identical to the intake function's copy (a test checks).
- `isSitePath(route)`: whether a report's route is a path on this site, safe to link (one leading
  `/`, no other host or scheme, no `:id` placeholder). `cleanLabel`, `pageOf` and `reportHeading`
  are how the web thread shows a report's about label, page and heading.
- `resolveSupportCopy(overrides)`: every string, in English, overridable key by key.

A GitHub issue per report, or a signed webhook, is a server-side sink: the
`genesis-support-notify` function template in `@marktiderman/genesis-supabase`.

## Diagnostics: the context dump

A **dump** is one JSON object (`genesis.diagnostics/1`) with everything a developer wants to see
about the app at a moment: the build and update (commit, OTA number, release), the device
(model, OS, locale, time zone, screen, network, permission states), the person (an id and a role,
nothing else), the current route and the ones before it, the flags and blocks in effect, recent
errors, breadcrumbs and console lines, Sentry's last event and replay ids, and the app's own
sections. It goes to **the app's own server**:

- on demand: "Send diagnostics" on a Development or About screen (`SendDiagnosticsRow`) and in the
  devtools overlay, beside "Copy debug info";
- on a shake (`createSupport({ diagnostics })`);
- with every piece of feedback, both linked: the report's context holds `diagnosticsId`, the
  dump's `feedbackId` is the report.

The person sees a short id (`3F2A9C1B`) to quote to support.

### Set it up: an app on Supabase

Apply migration `0019_genesis_support_diagnostics.sql` (`genesis add support-feedback` lists it),
then build the dump once, at module scope:

```ts
import { createDiagnostics, supabaseTransport, defineDiagnosticSection } from "@marktiderman/genesis-support";
import { createSupport, nativeSections, observabilitySection } from "@marktiderman/genesis-support/native";

export const diagnostics = createDiagnostics({
  app: { id: "acme", name: "Acme" },
  transport: supabaseTransport(supabase),
  sections: [
    ...nativeSections({ application: Application, updates: Updates, device: Device, netInfo: NetInfo, buildMetadata }),
    observabilitySection(observability),
    defineDiagnosticSection("cart", () => ({ items: cart.items.length }), { maxBytes: 8192 }),
  ],
  user: () => ({ id: session?.user.id, role }),
  offline: { storage: AsyncStorage },
});

export const support = createSupport({ supabase, navigate: router.push, diagnostics });
```

On the web, `webSections()` from `@marktiderman/genesis-support/web` reads the browser, the path
and a console ring buffer, and `<FeedbackPanel client={client} diagnostics={diagnostics} />` sends
a dump with every report.

### Set it up: an app with its own API (a NestJS backend, say)

The app sends dumps and feedback, screenshots included, to its API with `httpTransport`. Feedback
and its dump go in one multipart request, so the server stores both and alerts staff with both:

```ts
import { createDiagnostics, httpTransport } from "@marktiderman/genesis-support";
import { createSupport, nativeSections } from "@marktiderman/genesis-support/native";

const transport = httpTransport({ url: `${API}/support/diagnostics`, auth: () => token() });
export const diagnostics = createDiagnostics({
  app: { id: "acme" },
  transport,
  sections: nativeSections({ application: Application }),
  user: () => ({ id: currentUserId() }), // who made a dump or a report: queued ones go only under them
  offline: { storage: AsyncStorage },
});
export const support = createSupport({ supabase, navigate: router.push, diagnostics, feedbackSink: transport.feedbackSink });
```

The server mounts one handler. It authenticates, rate limits (10 dumps and 20 reports an hour per
person; 5 requests a minute per IP when you give `clientIp`), counts the body as it arrives and
refuses a dump over 512 KB, scrubs and caps it again, stores it through your adapters and runs the
notifiers:

```ts
import { createDiagnosticsHandler, githubIssueNotifier, messengerNotifier, webhookNotifier } from "@marktiderman/genesis-support/server";

export const handleSupport = createDiagnosticsHandler({
  authenticate: async (request) => verifyToken(request.headers.get("authorization")),
  store: drizzleSupportStore(db),       // your DiagnosticsStore: saveReport, saveFeedback, attachFile
  files: s3SupportFiles(s3),            // your DiagnosticsFiles: put(path, bytes, contentType)
  notify: [
    githubIssueNotifier({ token: env.GITHUB_TOKEN, repo: "acme/app", detail: "summary" }),
    webhookNotifier({ url: env.SUPPORT_WEBHOOK_URL, secret: env.SUPPORT_WEBHOOK_SECRET }),
    messengerNotifier({ staffAlert: (alert) => emailStaff(alert), thankReporter: (thanks) => pushThanks(thanks) }),
  ],
});
```

Mount it where your server takes requests. It is a Fetch handler, `Request → Promise<Response>`:

<!-- docs-check: skip -->
```ts
// NestJS (Express adapter)
@Post("support/diagnostics")
async diagnostics(@Req() req: ExpressRequest, @Res() res: ExpressResponse) {
  const response = await handleSupport(toFetchRequest(req)); // new Request(url, { method, headers, body: req as a stream })
  res.status(response.status).set(Object.fromEntries(response.headers)).send(await response.text());
}
```

```ts
// A Supabase Edge Function (supabase/functions/support-diagnostics/index.ts)
import { createClient } from "@supabase/supabase-js";
import { createDiagnosticsHandler, supabaseAuthenticate, supabaseDiagnosticsFiles, supabaseDiagnosticsStore } from "@marktiderman/genesis-support/server";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
Deno.serve(createDiagnosticsHandler({ authenticate: supabaseAuthenticate(admin), store: supabaseDiagnosticsStore(admin), files: supabaseDiagnosticsFiles(admin) }));
```

<!-- docs-check: skip -->
```ts
// A TanStack Start server route (src/routes/api/support/diagnostics.ts)
export const Route = createFileRoute("/api/support/diagnostics")({
  server: { handlers: { POST: ({ request }) => handleSupport(request) } },
});
```

**What your store must check.** The store writes with the server's rights, so it holds the checks
the database's row rules would: a dump's `feedbackId` must be one of the caller's own reports
(give the store `ownsFeedback` and the handler asks first), and feedback's `tenantId` must be a
tenant the caller belongs to with its help desk on (refuse with `DiagnosticsStoreError(…, 403)`).
Feedback that names a dump it didn't bring keeps the name only if `ownsReport` says it's the
caller's. The Supabase store does all three (with `support_ticket_tenant_allowed`, migration 0019).

**Per-IP limits.** There is no default `clientIp`: `x-forwarded-for` and `cf-connecting-ip` are
whatever the client sent unless your proxy overwrites them, so trusting them would let anyone dodge
the limit or lock out a shared network. Pass the address your platform vouches for.

**CORS.** A web app on another origin than its API needs `cors: { origins: ["https://app.example.com"] }`
(the handler answers the preflight and adds the headers), or CORS from the framework you mount it in.

**CommonJS.** `@marktiderman/genesis-support/server` ships ESM and CommonJS (`require` works in a
NestJS app on CommonJS).

**Receiving the webhook.** `webhookNotifier` sends `x-genesis-timestamp` and `x-genesis-signature`
(the HMAC of `<timestamp>.<body>`). Check them with `verifyWebhookSignature({ secret, body, signature, timestamp })`,
which compares in constant time and refuses a timestamp more than 5 minutes off.

The in-memory rate limiter suits one server process. Behind several instances, pass `rateLimit`
backed by a shared store; the database (migration 0019) holds 10 dumps an hour per person either
way. On an Edge runtime, pass `waitUntil` so notifiers run after the answer.

### What a GitHub issue carries (D8)

`githubIssueNotifier` opens an issue per report with the **summary only** by default: type,
title, message (fenced, so it can't mention or link anyone), route, version, the report id and the
dump's short id. `detail: "full"` adds the build, device, route and recent errors and breadcrumbs,
**and only on a repository GitHub says is private**: it asks once, and on a public repository (or
when it can't tell) it falls back to the summary. Dumps on their own open no issue unless
`on: ["diagnostics"]`. An app on Supabase without a server keeps using the
`genesis-support-notify` function (summary only).

### Privacy and caps

On the device, and again on the server (`redactReport`, `parseDiagnosticReport`):
- the person is an id and a role: no email, name or tenant name;
- every string goes through the same scrubber as genesis-native's observability (`scrubString`:
  emails, phone numbers, JWTs, Supabase keys, bearer tokens, long hex runs, query strings), and a
  value under a key that names a secret or a contact detail (`password`, `token`, `cookie`,
  `email`, …) becomes `[Filtered]`;
- routes are paths, with ids, emails, phone numbers, tokens and short codes in them replaced
  (`cleanRoute`); a name written as a slug (`/u/jane-doe`) reads like any word, so keep names out
  of paths;
- no key is trusted to hold an id: a value under `release`, `environment` or `event_id` in your
  data is scrubbed like any other (`scrubValueStrict`);
- console lines are scrubbed as they arrive, objects key by key before they become text;
- no request headers, cookies, storage contents, contacts or clipboard; a dump never carries a
  screenshot (screenshots stay on a report, sent only when the person includes them).

An app section can be declared `pii: "none"` (numbers, counts) to skip the text patterns on the
device; keys are still checked, and the server applies every rule.

| Item | Cap (`DIAGNOSTICS_DEFAULTS`) |
|---|---|
| The whole dump | 256 KB of JSON (`maxBytes`); the server refuses over 512 KB (`serverMaxBytes`) |
| One string | 4,096 characters (`maxString`) |
| Errors, breadcrumbs, console lines | the last 50, 100 and 200 (`maxErrors`, `maxBreadcrumbs`, `maxConsoleLines`); a console line 1 KB |
| An app section | 32 KB (`sectionMaxBytes`, or `maxBytes` per section) |
| Rate | 10 dumps an hour per person (`ratePerHour`), 5 requests a minute per IP (`ipRatePerMinute`) |
| Kept | 90 days (`retentionDays`): `support_purge_diagnostics`, which `genesis-support-cleanup` calls |

Over a cap the oldest entries go first, and what was cut is named in `truncated`. A dump is always
sent, never refused for size. Every option and its default is in `DIAGNOSTICS_DEFAULTS`, one
object, so the settings layer can declare them as `diagnostics.*` settings.

### Offline

With `offline: { storage }` (`localStorage` on the web, AsyncStorage on the phone, or MMKV through a
three-method adapter), a dump that failed for a reason that may pass (no network, a server error,
a rate limit) is kept and tried again with doubling backoff (5 s up to an hour, 12 tries, 20 kept
at most, and 1 MB of storage in all); `send` answers `{ queued: true }` with the id it will have.
The queue is tried when `createDiagnostics` runs, and on reconnect and coming to the front:
`createSupport({ appState: AppState, netInfo: NetInfo })` on the phone, `flushDiagnosticsOnReconnect(diagnostics)`
on the web. A refusal (403, a bad dump) isn't kept. Each queued dump remembers who was signed in,
and is dropped rather than sent under someone else (a shared device); call `diagnostics.clearQueue()`
on sign-out.

Feedback goes in the same queue: `diagnostics.submitFeedback` (what `FeedbackForm` and
`FeedbackPanel` call when a dump goes with feedback) keeps a report written offline, with its dump,
and answers `{ queued: true, id: "" }`; the forms say it goes when the person is back online. It is
kept without its screenshots (they don't fit the queue), and sent later through the transport's own
sink. So it follows the dump's switches: no queue without `offline`, `diagnostics.enabled` or
`diagnostics.offlineQueue`, and with `diagnostics.dumpOnFeedback` off the forms send feedback
directly and nothing is queued. Feedback is queued only when:

- its author is known (`user`, or the Supabase transport's session), so a flush never files it as
  whoever signs in next (someone else signed in: it is dropped). Without one, the send fails as it
  always did. Still call `diagnostics.clearQueue()` on sign-out: a person's reports shouldn't wait
  on a shared device;
- it lands in the same help desk: the form's sink is the transport's own, or it names its tenant
  (a support client's `currentTenant`, which the queued record then carries), or the record names
  one. The severity column (`severityColumn`) follows the transport's options; severity is always
  in the report's context.

A queued report goes last when the queue is full, and is kept (not dropped with the dumps) when
diagnostics are switched off; it goes when they are back on.

### Finding a dump by its short id

A short id is 8 hex digits of an id the device makes, so two dumps can share one. Staff look one up
with `support_diagnostics_by_short_id(short)` (migration 0019), which lists every match with its
owner and time; check the person before trusting a match.

### The staff dump viewer

The web agent inbox's details panel and the phone's agent thread (`useAgentThread`'s header, behind
"Show diagnostics") show a ticket's dumps, newest first, each in sections (summary, build, device,
session, health checks, errors, breadcrumbs, console, the app's sections) of plain text. They read
through `client.ticketDiagnostics(ticketId)`, so migration 0026's rule applies: whoever handles the
ticket. A dump is scrubbed on the device and again on the server; the viewers render it as text
only. `SupportTicketDiagnostics` (`/web-chat`) and `AgentTicketDiagnostics` (`/native`) work on
their own too, and `diagnosticsViewSections(report)` gives the sections as text.

### Health checks

`healthChecks` is a registry packages and the app register named checks into; each answers `ok`,
`warn` or `fail` with a message, within 5 seconds. genesis-native's devtools overlay runs them when
it opens (`createDevtools({ checks: healthChecks })`), and `healthChecksSection()` puts the latest
results in the dump's `checks` (running them once if nothing has yet):

```ts
import { createDiagnostics, healthChecks, healthChecksSection, supabaseHealthChecks, supabaseTransport } from "@marktiderman/genesis-support";

healthChecks.register(...supabaseHealthChecks(supabase)); // supabase.reachable, auth.session
healthChecks.register({ name: "socket", run: () => ({ status: "ok" }) });
export const diagnostics = createDiagnostics({
  app: { id: "acme" },
  transport: supabaseTransport(supabase),
  sections: [healthChecksSection()],
  user: () => ({ id: session?.user.id }),
});
```

### Build metadata

`nativeSections({ buildMetadata })` and genesis-native's `versionSignature({ buildMetadata })` (and
`createUpdates({ buildMetadata })`) read the commit, OTA number and release the app writes into its
bundle when it publishes: a generated module such as `export default { commit: "3f2a9c1", otaNumber: 42, release: "2026.11.19" }`.
Without it those fields are null.

`genesis build-stamp` writes one: `build-metadata.json` with the version, the git commit and
branch, the build time and the channel (`--channel`, else `GENESIS_CHANNEL`). Import it and pass it
as `buildMetadata`; the devtools overlay's Build section and the dump's `build` then show them. Run
it before the bundle is made: EAS Build runs an app's `eas-build-post-install` script by itself
(`"eas-build-post-install": "genesis build-stamp"`), and before an update,
`genesis build-stamp --channel production && eas update --channel production`. Commit a first copy
so the import resolves in development.

## Threads on genesis-chat (the `support-chat` block)

With `@marktiderman/genesis-chat` installed, a report's conversation can run on genesis-chat
instead of `support_replies`: live updates instead of a 30 second re-read, photos, files and
voice notes, push, an assignee (pushed every message) and internal notes staff write and the
person never sees. The report stays the record (type, status, message, screenshots, device).

1. Apply this package's `migrations/0001_genesis_support_chat.sql` (and its test) after
   `0006_genesis_support.sql` and genesis-chat's `0001` and `0002`. It registers the chat kind
   `support` (the reporter its only member, staff observers who post, no threads), gives every
   report its conversation, and copies the replies already in `support_replies` into it, in
   order and with their times, sending no push.
2. Give support genesis-chat's client:

   ```ts
   import { createChatClient } from "@marktiderman/genesis-chat";
   const chat = createChatClient(supabase);
   createSupport({ supabase, chat, … });                 // native
   const client = createSupportClient(supabase, { chat }); // web
   ```

   The client asks the database once (`support_chat_conversation`). With the block, `replies`,
   `reply`, `markRead` and the new `subscribe` go through the report's conversation; without it
   (or without `chat`) they use `support_replies` as before, and a `chat` client given to a
   database without the block says so once (`onChatUnavailable`, default `console.warn`).
3. Native: `useSupportThread(id)` needs no change. On chat it updates live (no polling), shows
   photos in replies and names voice notes and files; it also returns `mode` and
   `conversationId`. `useSupportConversation(id)` gives a screen of your own the conversation id,
   for genesis-chat's native `ChatThreadScreen`.
4. Web (`@marktiderman/genesis-support/web-chat`, under genesis-chat's `ChatProvider` in a
   QueryClientProvider): `<SupportReportThread client={client} reportId={id} />` is the person's
   view, the report above genesis-chat's `ChatThread`. `<SupportStaffThread client reportId
   resolveUser staff />` adds the status and assignee pickers; the composer's note toggle writes
   internal notes. Both take, each default off: `reportHeading` (head the report with its own
   words in an `h2`, show its message only when that adds something, and say which page it was
   sent from, a link only when it's a path on this site), `focusHeading` (focus that heading once
   it shows, for a sheet or dialog; it turns `reportHeading` on) and `plainChatTitle` (title the
   conversation "Report" rather than the report's title).

**The agent inbox** (`genesis add support-chat` copies migration 0009). `<SupportAgentInbox>` is a
tenant's whole help desk inbox on genesis-ui's `InboxLayout`, `InboxViews`, `InboxPage` and
`ThreadPage`: the views Mine, Unassigned and All, the tickets, the open ticket's thread with reply
and internal note, its status and assignee, and a details panel. Keep the open ticket in your
router; the inbox only needs a TanStack `QueryClientProvider` and a support client made with the
`chat` option. Point Tailwind at its classes as you do for genesis-ui (`@source
"../node_modules/@marktiderman/genesis-support/dist";`), or the view picker meant for narrow screens
also shows on wide ones.

```tsx
import { SupportAgentInbox } from "@marktiderman/genesis-support/web-chat";
import type { SupportClient } from "@marktiderman/genesis-support";

declare const support: SupportClient;
declare const workspaceId: string;
declare const ticketId: string | null;
declare const navigate: (to: string) => void;
declare const people: Map<string, string>;
declare const agents: { id: string; name: string }[];

export const inbox = (
  <SupportAgentInbox
    client={support}
    tenantId={workspaceId} // leave out for the app's own tickets
    ticketId={ticketId}
    onTicketChange={(id) => navigate(id ? `/help/inbox/${id}` : "/help/inbox")}
    resolveUser={(id) => ({ name: people.get(id) ?? "Someone" })}
    agents={agents} // { id: login, name }: who a ticket can be given to
    context={(ticket) => <p>{ticket.userId}</p>} // your own cards in the details panel
  />
);
```

**Or as a view's inbox.** The same queue can be a Genesis view drawn by
`<ResourceView type="inbox">` (genesis-ui), beside its table and with saved views, when your app
reads it through the data provider. This package exports the pieces: `supportQueueSource()` (the
provider `source` over migration 0018's `support_agent_queue`, which pages and counts every ticket; pass `{ tenant }`, or scope the view by `tenant_id`), `ticketInbox` (which column is the title, preview,
time, requester, unread and status) and `ticketSegments` (Mine, Unassigned, Open, Pending, Closed, All; Mine,
Unassigned, Pending and Closed pass the queue's view as a segment's `args`). Each segment's page, Open's status filter included, is read inside the function: it picks the page and the count from the tickets' own columns and builds the message preview for the page's rows only, and a segment's count builds none. A text search, or a sort other than newest activity, reads every ticket in the segment and builds each one's preview, by design: the database can only search or sort what the function returned (about 130 to 210 ms a page at 5,000 tickets with 20,000 messages, against 6 to 28 ms for a paged page). The reading pane is the ticket's
thread with its reply box, through `renderReading`:

<!-- docs-check: skip -->
```tsx
createSupabaseProvider(supabase, { resources: { support_queue: { source: supportQueueSource(), writeColumns: [] } } });
export const queueView = defineView(supportQueueContract, { inbox: ticketInbox, segments: ticketSegments, types: ["inbox", "table"] });

<ResourceView
  view={queueView}
  type="inbox"
  inbox={{
    selected: ticketId,
    onSelectedChange: (id) => navigate(id ? `/help/inbox/${id}` : "/help/inbox"),
    renderReading: (ticket) => <SupportStaffThread client={support} reportId={String(ticket.id)} resolveUser={resolveUser} staff={agents} />,
  }}
/>;
```

Only a tenant's agents get in: `client.agentTickets`, `agentTicket` and `agentTicketCounts` read
through `support_agent_tickets` and `support_agent_ticket_counts`, which refuse anyone else. An
agent's own ticket isn't in their queue, since another agent answers it.

**The agent's desk** (migrations `0013_genesis_support_queues.sql` and
`0014_genesis_support_agent_tools.sql`, then `0015_genesis_support_agent_tools_bounds.sql`, which
`genesis add support-chat` copies after 0009). The desk (the agent inbox, saved replies, reports)
is web only, like the inbox before it:

- **Pending.** An agent sets a ticket `pending` when they're waiting on the requester; it goes back
  to `open` by itself when the requester writes. Mine and Unassigned hold active tickets (not
  pending, not closed), Pending and Closed are views of their own, and the counts on Mine,
  Unassigned and All are active tickets only. Each row says who wrote, the status, who has it and,
  while the requester waits for an answer, for how long (`waitingSince`).
- **Earlier conversations.** The details panel lists the requester's other tickets in the tenant
  (`client.agentEarlierTickets`, `support_agent_requester_tickets`), each opening in the inbox,
  under your own `context` cards.
- **The composer.** In an internal note `@` mentions a teammate from `agents`; the database records
  it (`ticket_mentions`, read with `client.agentMentions`) and calls your optional
  `private.genesis_support_agent_mentioned(report, agent, author, message)` hook, which is where
  you notify them. A mention is readable only while the agent still handles the ticket. `!`
  inserts a saved reply with `{first_name}`, `{name}` and `{email}` filled (`replyVariables` adds
  your own), and `?` inserts a help article's title and link (`articleHref`), in a reply or a
  note. `!` and `?` open their list only once a letter follows them, so "Merci !" and "Prix ?1"
  stay words. Enter inserts only after the arrow keys move into the list (Tab inserts the option
  they're on, or the first). While the list offers something, or is still loading, and the arrows
  haven't moved into it, Enter does nothing, so "!refund" isn't sent by habit: the list says "Esc
  to close", and Enter sends once it's closed. With no match, Enter sends.
- **Names in saved replies.** Without a real name for the requester (an email with none, or
  `resolveUser` naming them `""`), `{first_name}` and `{name}` fill as nothing, with the separator
  that joined them. At the start of a line the comma, colon or semicolon after them goes:
  "{first_name}, thanks" reads "thanks". Elsewhere the space before them goes, and a comma before
  them too, unless a word follows them: "Hi {first_name}," reads "Hi,", "Thanks, {first_name}." and
  "Thanks, {first_name} 🙂" read "Thanks." and "Thanks 🙂", but "As discussed, {first_name} will call
  you." reads "As discussed, will call you.". A name used as a sentence's subject can't be taken
  out cleanly: give it a stand-in in `replyVariables`. The names follow `resolveUser` as it learns
  them. A `resolveUser` that names unknown people ("Someone") should return `""` for them, or set
  `first_name` in `replyVariables`.
- **A held reply.** If someone writes while an agent is writing, Send first says so, with Send
  anyway and Review.
- **Saved replies** are a tenant's own, written in `<SupportSavedRepliesAdmin>`
  (`client.savedReplies`, `saveSavedReply`, `deleteSavedReply`).
- **Reports.** `<SupportAgentReports>` (`client.agentReport`, `support_agent_report`): opened,
  closed, median first response and time to close over a range of days, open now, and open by
  the requester's company when you define the label hook
  `private.genesis_support_requester_labels(reports uuid[]) returns table (report_id uuid, label
  text)`, called once for every open ticket (0015). Since 0034 the one-ticket
  `private.genesis_support_requester_label(report)` is no longer asked (docs/MIGRATION.md shows the
  one-line set-based hook that wraps it), so every open ticket is labelled.

```tsx
import { SupportAgentReports, SupportSavedRepliesAdmin } from "@marktiderman/genesis-support/web-chat";
import type { SupportClient } from "@marktiderman/genesis-support";

declare const support: SupportClient;
declare const workspaceId: string;
declare const replyId: string | null;
declare const navigate: (to: string) => void;

export const savedReplies = (
  <SupportSavedRepliesAdmin client={support} tenantId={workspaceId} replyId={replyId} onReplyChange={(id) => navigate(id ? `/help/replies/${id}` : "/help/replies")} />
);
export const reports = <SupportAgentReports client={support} tenantId={workspaceId} />;
```

Kept in step by the migration: the report's status and the conversation's (open and submitted
are open, in_progress pending, addressed solved, wont_fix closed; a status set in chat moves the
report the same way), the report's reply times and read state from messages and
`genesis_chat.mark_read` (so `unread` and the Help badge keep working), assignees (staff only:
`client.assign` or `support_assign_report`), and deletion (a deleted report, or account, takes its
conversation; files follow each package's own cleanup). Staff set statuses with `client.setStatus`.

**`support_replies`, for one release.** App builds from before the block still read and write
`support_replies`, so the two are mirrored: a reply written there becomes a chat message, and a
chat message (never an internal note) becomes a reply there, edits and deletes included. While
the mirror runs, 0006's reply limit (60 an hour) counts every message. The next release drops the
mirror and moves the limit onto chat messages; then `support_replies` can go.

One difference: a chat message carries its sender's id, so the person can learn which staff
member answered (support_replies hid it). Name staff as "Support" in `resolveUser` (the web views
do by default for the person).

## The help desk (the `support-helpdesk` block)

`genesis add support-helpdesk` copies `migrations/0010_genesis_support_help_center.sql`. It's on for a
tenant once `support-helpdesk` is enabled for it in `tenant_features`; the app's own tenant is always
on.

**The messenger.** `<SupportMessenger>` is Home (greeting, article search, the latest conversation),
Messages and Help. A first message becomes a ticket in the tenant, and the reply arrives live.
`<SupportMessengerLauncher>` is a button with the unread count that opens it in the chat dock when
the app has `ChatDockProvider`, else in a sheet. The dock's windows sit bottom-right, so there use
`position="bottom-left"`, or `"inline"` and place it yourself. On the phone: `useMessengerHome`,
`useHelpCenter`, `useHelpArticle` with `HelpArticleBody`, and `useStartConversation`, at the block's
routes, with `tenantId` and `askAi` given to `createSupport`. Home and the help center open the help
route with `?q=` or `?collection=`: read them there and pass `initialQuery` and `collectionId`.

Set expectations with `replyExpectation` (your words after "We usually reply") and `officeHours`
(a time zone and spans of days, "HH:MM" up to "24:00"): the compose screen and an unanswered
conversation say how soon people hear back or, outside your hours, when someone is back, in the
person's own time. On the web they're props of `SupportMessenger` and the launcher; on the phone,
options of `createSupport`, which `useStartConversation` and `useSupportThread` say above the
composer (and return as `expectation` and `awaiting`). On the phone the line under an unanswered
thread shows only with one of the two set, since `useSupportThread` shows bug reports too, and
never on a closed one. `officeHoursState(hours, now)` is the same check anywhere. When it can't
read the hours (an unknown zone, or a phone engine whose `Intl` has no time zones) it says the desk
is open rather than away, and in a development build it says why with `console.warn`, once.

```tsx
import { SupportMessengerLauncher } from "@marktiderman/genesis-support/web-chat";
import type { SupportClient } from "@marktiderman/genesis-support";

declare const support: SupportClient;
declare const workspaceId: string;

export const help = (
  <SupportMessengerLauncher
    client={support}
    tenantId={workspaceId}
    replyExpectation="within a few hours"
    officeHours={{ timeZone: "America/New_York", hours: [{ days: [1, 2, 3, 4, 5], open: "09:00", close: "17:00" }] }}
  />
);
```

**The help center.** Articles are a tenant's own: collections, drafts, and published articles its
people can read. Agents write them in `<SupportHelpCenterAdmin>`, or with `client.saveHelpArticle`. A
body is plain text, and a blank line starts a paragraph. Anon reads nothing through the database: for
a public help center, `helpCenterPages({ collections, articles })` gives genesis-sites pages to add
to the tenant's site and publish.

**AI answers have never run against a real model.** Keep them off: a tenant shouldn't turn them on
until a live run passes success, refusal, schema miss and safety route.

They're off until a tenant opts in, with an enabled `support-helpdesk-ai` row in `tenant_features`
and a monthly budget, its own or the `default` (`genesis_ai.set_budget`). Without a limit genesis-ai
admits every call, so neither counts alone, and a tenant on its own key still needs a budget row.
Anonymous sign-ins can't ask. That's the reverse of most features, where no row means on, so show it as off in
your Settings when there's no row. A tenant admin can turn it on, and it spends that tenant's AI
budget. The person asks for an answer after searching; only then do their
words go to the vendor. The AI answers only from that tenant's published articles and cites them; an
answer that cites anything else isn't kept, and every outcome offers a person.

1. Give `defineAi` your `safety` protocol, which sees what the person wrote before any model: nothing
   runs without one. It runs even when they haven't agreed to share with the vendor, so keep it local
   (patterns), or put a model it calls through `wrap` with `consent: "person"`, which refuses without
   their agreement and counts as no route. Install `@marktiderman/genesis-ai` and `zod`.
2. Serve the answer from your server. It runs the task as the person and records what came of it with
   a service-role client, so nobody can write an answer of their own, and spends the question's
   tenant's budget.

   Don't register `supportHelpAnswerTask` with `createAiHandler`: that hands a client the task's raw
   output and records nothing. `answerHelpQuestion` doesn't throw: failures end at no answer, and
   reach `onError`.

   ```ts
   import type { Ai } from "@marktiderman/genesis-ai";
   import { answerHelpQuestion, type HelpAiAdmin, type HelpAiDb } from "@marktiderman/genesis-support/ai";

   declare const ai: Ai;
   declare const serviceClient: HelpAiAdmin;
   declare function userFrom(req: Request): Promise<{ id: string; tenantId: string; db: HelpAiDb } | null>;

   export async function POST(req: Request) {
     const user = await userFrom(req);
     if (!user) return new Response(null, { status: 401 });
     const { questionId } = (await req.json()) as { questionId: string };
     return Response.json(await answerHelpQuestion(ai, { questionId, context: { tenantId: user.tenantId, personId: user.id, db: user.db }, admin: serviceClient }));
   }
   ```

3. Pass `askAi` to the messenger, or to `createSupport` on the phone, as a plain call to it, with the
   person's token where it needs one:
   `(questionId) => fetch(url, { method: "POST", headers, body: JSON.stringify({ questionId }) }).then((r) => r.json())`.
4. People agree to share with the vendor first (genesis-ai's consent), unless your terms cover it:
   `supportHelpAnswerTask({ consent: "terms" })`, passed as `task`. Until they agree, the messenger
   says so and offers a person; `onAiConsent` opens your screen for agreeing. Their words aren't kept
   meanwhile; once they've agreed, "Ask again" asks anew.
5. Run `support_purge_stuck_questions()` daily with the service role: a server that stops mid-answer
   leaves a question unfinished, with the person's words, which agents can't read.

A resolution is a question whose person said the answer helped: `help_questions.outcome = 'resolved'`,
readable by the tenant's agents, beside genesis-ai's usage row for each call. It's what people said,
counted, not a billing record.

## Staff tools, boards and the phone's agent desk

**Who's who, for agents** (migration `0022_genesis_support_staff_tools.sql`, in the
`support-chat` block). An agent's screens name people row security hides from them:

- `client.staffList({ tenantId })`: who handles a tenant's tickets (null: the app's own staff),
  with a name, for an assignee picker; only that tenant's agents may ask;
- `client.reporters(ids)`: the name and email of the people among `ids` who wrote a ticket the
  caller handles (anyone else is left out);
- `client.requesterTenants(personId)` and `requesterTenantsLabel(tenants)`: the tenants a requester
  belongs to, with the app's label, as one line ("Acme, Northside");
- `client.setIdeaStatus(ideaId, status, featureId)`: staff set an idea's status and the FeatureId
  that delivers it (`setStatus` does the same for a report).

Names come from two optional hooks, `private.genesis_person_name(person uuid) returns text` and
`private.genesis_tenant_label(tenant uuid) returns text`; without them, the login's
`full_name` / `name` metadata, and no tenant label.

`staffList` checks candidates, never every login: the caller, the tenant's agent rows whose person
is a login, and the logins the app's optional `private.genesis_support_staff_list() returns setof
uuid` gives (its staff; a platform-admin or hook-named staff member is listed only through it).
The `support.agentListScan` setting checks every login instead, which is slow on a big app.
Anonymous logins are never listed. `reporters` and `requesterTenants` answer whoever handles the
ticket, the same check as reading it (an agent, or a handler the app's report hook names). The
SQL functions have new names (`support_agents_list`, `support_ticket_requesters`,
`support_requester_tenants`), so an app's own function under an older name is never replaced.

The phone's query keys are scoped by the signed-in login (`supportAgentKeys.user(id)`), so signing
in as someone else never shows the last person's queue.

**Web boards** (`@marktiderman/genesis-support/web-boards`, its own entry so `/web` stays light; each a `ResourceView` under the app's
`GenesisProvider` and `QueryClientProvider`, every string in `copy.boards`):
`SupportMyReports` (the person's reports, delete with a confirm, a detail render prop for the
thread), `SupportIdeaBoard` (votes, suggest an idea, `SupportIdeaStatusControl` for staff),
`SupportShippedIdeas` ("you asked, we shipped"), `SupportReportFeatureControl` (staff: the FeatureId
a report is about, keeping its status) and `SupportHelpArticle` (one article by slug, with a
`footer` for the app's own link).

**The agent desk on the phone** (`@marktiderman/genesis-support/native`): `useIsSupportAgent`,
`useAgentUnreadCount` (a badge), `useAgentInbox({ view, tenantId })` (InboxPage props: Mine,
Unassigned, All, Pending, Closed with counts, paged) and `useAgentThread(ticketId)` (ThreadPage
props: reply or internal note, status, take it / hand it back, the requester's name, email and
tenants; it marks the ticket read). Query keys are `supportAgentKeys`.

## Desks: each tenant's own help desk (migration 0029)

`0029_genesis_support_desks.sql` (in the `support-helpdesk` block, after 0022) makes a tenant's
help desk something its admins run, and lets a ticket move between desks:

- **The switch.** `client.setDesk(tenantId, enabled, reason)` (its tenant admins only, never the
  app's own desk, which is always on). A desk's row decides; without one, `tenant_features`'
  `support-helpdesk` row does, as before. Every change is in its log (`client.deskHistory`).
  `<SupportDeskSwitch client tenantId />` (`/web-chat`) is the switch for a tenant's settings.
- **Routing.** A question sent to no tenant in particular, by someone who belongs to exactly one
  tenant whose desk is on and handles no desk themselves, goes to that desk. The app can decide
  instead with `private.genesis_support_desk_for(person uuid, ticket_type text) returns uuid`.
- **Moving.** A handler sends a ticket up to the app's own desk (`client.escalateTicket`), the
  app's desk hands it back to the desk that sent it up (`client.returnTicket`), or a handler moves
  it to another desk its person belongs to (`client.moveTicket`, among `client.deskMoveTargets`).
  The same ticket and thread; nobody has it at the new desk, it is unread there, and a pending one
  opens again. Each move is logged; `client.ticketDesk(id)` says where it is and its last move.
- **The inbox.** `client.myDesks()` lists the desks the signed-in person works; `chooseDesk`,
  `pickerDesks`, `workedDesks` and `deskTenant` pick among them, and `<SupportDeskPicker>` is the
  picker for someone who works more than one. `SupportAgentInbox`'s details panel shows
  `SupportRequesterPanel` (name, email, tenants with the person's role there) and
  `SupportDeskControls` (where it is, its last move, escalate / return / move with a reason);
  turn them off with `requesterPanel={false}` / `deskControls={false}`, and `onTicketMoved` hears a
  move. Roles come from `private.genesis_tenant_role(tenant uuid, person uuid) returns text`, else
  `admin`, `agent` or `member`.
- **The messenger across desks.** `<SupportMessenger allTenants>` (and the launcher) lists the
  person's conversations at every desk; a new one still goes to `tenantId`, or where routing sends it.
  `client.myTicketDesks()` (`support_my_ticket_desks`) gives each of the person's own tickets its
  desk and the desk's name from `private.genesis_tenant_label`.
- **Managing agents** (migration 0034, the support-chat block). Whoever manages a desk's agents (its
  tenant admins and admin agents; the app's staff for the app's own desk) is one rule:
  `client.canManageAgents` (`support_can_manage_agents`) answers exactly as `client.setAgent` decides.
  `client.staffList` gives each agent's `role` and `removable` (only an agent row the caller can
  remove). They search the people in that tenant by name or email with `client.searchPeople`
  (`support_people_search`, at most 25), to add an agent or link an email requester. A tenant's
  people are those `private.genesis_tenant_member(tenant, person)` names, else
  `private.genesis_viewer_people`; anonymous logins never show.

With the `support.desks` setting off (the `standard` and `min` presets) it is 0004 exactly:
`tenant_features` alone decides, and nothing is switched, routed or moved.

## Notifications: support.message, support.reply, support.verify (migration 0030)

`0030_genesis_support_notifications.sql` (in the support block) tells people through
genesis-notifications' `genesis_notify`, with no code of the app's own:

- **`support.message`** to the ticket's desk's agents: a new ticket, the person writing again, a
  ticket moved to the desk (`escalated`, `returned`, `moved`). Nobody else once someone who still
  handles it has it (genesis-chat tells them). Only while `support.staffAlerts` is on. Whom it tells
  is the app's `private.genesis_support_staff_to_notify(ticket uuid) returns uuid[]` when it has one
  (the app answers for that list: it is used as given). Without it, the logins that are agents of the
  ticket's tenant among (never a scan of every login, unless `support.agentListScan` is on):
  - the tenant's `ticket_agents` rows, each person resolved to its login through the optional
    `private.genesis_person_login(person uuid) returns uuid` (without it, the person id is the login,
    as in zero config);
  - for the app's own desk, `private.genesis_support_staff_list() returns setof uuid` (the app's
    staff; a staff predicate alone can't be listed, so an app whose staff are only
    `genesis_support_staff` names them here);
  - `private.genesis_tenant_admin_list(tenant uuid) returns setof uuid`, the tenant's admins.
  At most 200; never the ticket's own person or an anonymous login.
- **`support.reply`** to the person when support answers (not on an email ticket, whose answers go
  out as email already), one email per ticket however many replies.
- **`support.verify`** to the person with the verify prompt.

Add the types to the app's registry and sync them as every type is:

```ts
import { defineNotifications } from "@marktiderman/genesis-notifications";
import { supportNotificationTypes } from "@marktiderman/genesis-support";

const support = supportNotificationTypes({ basePath: "/support" });
export const notifications = defineNotifications({ categories: { ...support.categories }, types: { ...support.types } });
```

Their links open the agent's ticket (`/support/agent/<id>`, with `?desk=` at a tenant's desk) and
the person's thread; `agentUrl` and `personUrl` change them. `support.reply` offers no push while
threads run on genesis-chat (`chatPushes: false` for an app without it). The emails:
`supportEmailTemplates({ replies })` from `/email-notifications`, as the runner's `templates`, put the whole
message in under a subject the ticket's emails share. A notification that can't be sent (no
genesis-notifications, a type not synced) is a warning, never a failed ticket or message.

## Email tickets (the `support-email` block)

Email is a ticket channel (ADR 0011). `genesis add support-email` copies
`migrations/0002_genesis_support_email.sql` (after 0006). Mail to a support address opens a
ticket; a reply to the ticket's reply address (`support+<token>@your-reply-domain`) or to its
email joins it and reopens an answered one; a staff reply, written in the app or in
support-chat, goes back by email in the same thread. An email ticket may have no login: staff
see it, and nothing links a login from an address (a From header can be forged).

```ts
// The inbound webhook route (server only)
import { createInboundEmailHandler, resendProvider } from "@marktiderman/genesis-notifications/server";
import { runSupportEmail, supportEmailRoute } from "@marktiderman/genesis-support/email";

export const handleInbound = createInboundEmailHandler({
  webhookSecret: env.RESEND_INBOUND_WEBHOOK_SECRET,
  apiKey: env.RESEND_API_KEY,
  routes: [supportEmailRoute(admin, { addresses: ["support@acme.test"], replyDomain: "reply.acme.test" })],
});

// Every minute, from your jobs: send staff replies on email tickets, threaded.
await runSupportEmail(admin, { email: resendProvider({ apiKey: env.RESEND_API_KEY }), from: "Acme Support <support@acme.test>", replyDomain: "reply.acme.test" });
```

Point the reply domain's MX record at Resend so replies come back. Inbound attachments are
listed (name, type, size) but not stored yet.

- Staff link an email ticket to a login with `support_link_requester(report, person)` (with
  support-chat, the person joins the conversation), and mark it read as usual.
- Automatic mail (out-of-office, bounces, lists) and mail from your own addresses never open or
  reopen a ticket; a sender past 20 emails an hour is dropped.
- A reply keeps its text and thread ids when it is queued (a retry sends the same email); one
  deleted before it goes out is cancelled.


**Reply by email, statelessly** (`@marktiderman/genesis-support/email`, server only):
`replyAddress(replyKeyring(replyKey(SUPPORT_REPLY_SIGNING_SECRET)), replyDomain, { ticketId, userId })`
is a Reply-To that names the ticket, the one person the email went to and the week it was made,
signed (nothing stored). A keyring holds keys by letter, so a new key signs while old ones still
verify, and removing a key revokes its addresses; addresses expire after `maxAgeWeeks` (26).
An app that made reply addresses in the earlier format (ticket, login, a 7-byte MAC, no week) keeps
them working by putting its old key, derived under its own label, in the ring's `legacy` under its
old letter, and giving the new key another letter: `{ current: "b", keys: { b: replyKey(secret) },
legacy: { a: replyKey(secret, { label: oldLabel }) } }`. Old addresses usually start with `a`,
which is also `replyKeyring()`'s default letter, so don't use `replyKeyring()` for such an app: a
letter in both `keys` and `legacy` throws rather than quietly breaking every old address. Legacy
addresses never expire and are never made again.
`claimsFromAddresses(ring, replyDomain, recipients)` reads it back from an inbound email (bare or
`Name <address>`). **A valid token says who the email went to, not who answered:** the inbound route
must check, when the reply arrives, that `userId` is still the ticket's requester or a handler, and
that the sender is that login's email with DMARC passing (aligned with the From domain). And
`stripReply(text, html)` keeps what the person wrote, without the quoted history, the
`REPLY_MARKER` line or their signature. Auto-replies are already dropped by genesis-notifications'
inbound router.

**Wired end to end** (migration `0031_genesis_support_email_reply.sql`, in the support-email block,
and `/email-notifications`, which imports genesis-notifications; `/email` doesn't):

```ts
import { supportEmailRoute } from "@marktiderman/genesis-support/email";
import { handleSupportInbound, supportEmailOptions } from "@marktiderman/genesis-support/email-notifications";

// POST /api/support/email-inbound (Resend's `email.received` webhook)
export const POST = ({ request }: { request: Request }) =>
  handleSupportInbound(request, { env: process.env, client: admin, settings, routes: [supportEmailRoute(admin, { addresses: ["support@acme.test"] })] });

// The notifications job: support's templates, and each support email's own Reply-To
createNotificationRunner({ store, registry, email: { provider, appName: "Acme", domains, ...supportEmailOptions({ env: process.env, provider, settings }) } });
```

- **Out.** `supportEmailOptions` gives `support.message` and `support.reply` emails their
  recipient's signed address as Reply-To (`replyAddress`) and a References header naming the
  ticket, through the runner's `providerFor`, and puts `REPLY_MARKER` at the top.
- **In.** `supportReplyRoute` (inside `handleSupportInbound`) verifies the token, drops automatic
  mail and senders the receiving server didn't authenticate (`senderAuthenticated`: DMARC, aligned
  with the From domain; a From naming several addresses is no sender), strips the quote (`stripReply`: Gmail, Outlook and Apple Mail forms, signatures) and calls
  `support_email_reply`, which posts it as the login the email went to: the ticket's person, or one
  of its handlers (as support), only from that login's own address, once per Message-ID, at most 20 a
  ticket an hour. A refusal is logged and dropped; a failure worth retrying makes Resend retry.
- **Set-up.** `SUPPORT_REPLY_DOMAIN` (receiving through Resend, only for these replies; its MX at
  Resend), `SUPPORT_REPLY_SIGNING_SECRET`, `RESEND_INBOUND_WEBHOOK_SECRET` and `RESEND_API_KEY` (a key
  that reads received email). `supportReplyConfig(env, { settings })` says what is missing; until it
  is all set, emails carry no reply address and the endpoint answers 503. The `support.replyByEmail`
  setting (with `support.email`) turns it off. An app with earlier addresses passes `legacyLabel`.

## Access, in the database

A person sees, edits (while open) and deletes their own reports, replies on them and sees their
own screenshots. Every signed-in person reads the idea board (not who suggested an idea); one vote per person and idea, and a
Supabase anonymous sign-in can neither vote nor suggest. Staff are whoever your
`private.genesis_support_staff(person uuid)` hook says (none until you add it). Status, owner,
feature id, vote counts and read receipts are the server's. See the migration's header.

`migrations/0003_genesis_support_findings.sql` (this package, applied after 0006) adds:

- `severity` (low, medium, high, critical) as a column the person sends with the report. The
  client and the intake function write it only when told the column is there (`severityColumn:
  true`, `GENESIS_SUPPORT_SEVERITY_COLUMN=true`); both always keep severity in `context` too.
- Report handlers: your optional `private.genesis_support_report_handler(report uuid, person uuid)`
  hook names who else handles a report besides staff (a team that owns the screen, say). They read
  it and its screenshots, reply as support and set its status; they don't observe its
  support-chat thread, so internal notes stay staff-only.
- The verify loop: `support_verify_report` lets the person confirm a fix (`verified_at`) or reopen
  the report (`in_progress`, `reopened_at`). Addressed and wont_fix stamp `resolved_at`.
- The verify prompt, off by default. Turn it on with the `support.verifyPrompt` setting (migration
  0033). The older hook `private.genesis_support_verify_prompt_enabled()` returning true still turns
  it on for one release (deprecated). Then when someone else marks a report addressed, its person is asked in the thread to check the
  fix (once an hour at most; the reply has `prompt = 'verify'` and isn't counted against anyone's
  limit). It is a staff reply: it marks the report unread for its person, ends their editing, and
  with support-chat is pushed as the marker's message. If it can't be posted, the status change
  still goes through without it.

  Genesis sends no notification of its own for it. An app that notifies on new replies tells the
  verify prompt apart by `support_replies.prompt = 'verify'`, never by the reply's words: the words
  are a sentence an app may translate or change.

It also replaces the reply trigger that `0002_genesis_support_email.sql` (support-email) replaces;
its version keeps the email rules when that block is already installed. Adding support-email after
it, handlers can't reply (their status changes still work, without the prompt) until 0003's
`genesis_support_new_reply` is applied again.

## Fixes to tickets (migration 0016) and to help answers (migration 0017)

- 0016 (with the support block, after 0004): the Data Studio's audit log and outbox move from the
  old table names to `public.tickets` and `public.ticket_attachments`, wherever those tables exist,
  so a ticket's history reads on past the rename. `support_agent_unread_count(tenant)` is an
  agent's count of active tickets (not pending, not closed) with a requester's message no agent has read (`client.agentUnreadCount`),
  for a badge without reading the queue.
- 0017 (with support-helpdesk, after 0010): a question the safety protocol routes elsewhere, or one
  asked before the person agreed, keeps no answer and no cited articles, as well as no words.

## Tickets and tenants (migration 0004)

`migrations/0004_genesis_support_tickets.sql` (applied after 0006 and 0003; ADR 0015) turns
reports into **tickets** that each belong to a **tenant**, so every business on your app can run
its own help desk and your app runs its own support the same way. With the support-chat block add
`0005_genesis_support_chat_on_tickets.sql` and `0006_genesis_support_chat_tenants.sql`, and with support-email `0007_genesis_support_email_on_tickets.sql` and `0008_genesis_support_email_tenants.sql`.

- `support_reports` is now `tickets` and `support_attachments` `ticket_attachments`. For one
  minor the old names are views over the new tables (they run as the caller, so row security
  applies), so older clients and your SQL keep working. Compare a conversation's subject against
  `TICKET_SUBJECT`, never the literal.
- **The tenant** is whatever your `private.genesis_viewer_people` hook returns (genesis-supabase
  0016): in a single-tenant app one fixed id, in a multi-tenant app one per organization. Add your
  own tenant before applying 0004 (it stops without it):

  ```sql
  create function private.genesis_support_default_tenant() returns uuid
  language sql stable set search_path = '' as $$ select '…your tenant id…'::uuid $$;
  revoke execute on function private.genesis_support_default_tenant() from public, anon, authenticated;
  ```

  A new ticket goes to the tenant it is sent with (`createSupportClient(supabase, { tenantId })`,
  usually the viewer's current workspace; refused if the sender isn't in it or its help desk is
  off), else yours. Nothing is guessed from which tenants the sender belongs to. Existing reports go to yours, or where your optional
  `private.genesis_support_tenant_for(report uuid) returns uuid` puts them.
- **Agents**: `ticket_agents` (tenant, person, `agent` or `admin`), set with
  `support_set_agent(tenant, person, role)` (`client.setAgent`) by a tenant admin (genesis-supabase
  0004's `genesis_tenant_admin` hook) or an agent admin. A tenant's agents and admins read and
  handle its tickets and nobody else's. Your staff hook now means "an agent of your own tenant".
  With genesis-chat 0004, support chats keep their ticket's tenant (0005 and 0006 move any that
  chat placed by their members), and support turns chat's own tenant gate off for its kind, since
  its observer check already reads the ticket's tenant: your staff read your tickets' chats without
  being listed as people of your tenant.
- **Reading and handling stay apart**: the requester reads their ticket and never handles it; your
  report-handler hook only answers for your own tenant's tickets.
- **Opt-in per tenant**: a tenant takes tickets only once `support-helpdesk` is enabled for it in
  genesis-supabase 0004's `tenant_features` (`set_tenant_feature`); without that table, only your
  own tenant does. Your own tenant always takes tickets.
- **Screenshots** keep their `<user>/<ticket>/<file>` paths; who may open one comes from its
  ticket row (tenant and handlers), not the path.
- **Old names**: `support_reports` and `support_attachments` stay as views until every phone
  build you support sends to the new names; they are dropped in a later minor, announced in its
  changeset. `genesis doctor` warns about app SQL (`support-old-names-in-sql`) and code
  (`tickets-through-support-client`) that still name them.
- **Chat subject**: support conversations keep the stored subject `support_report`; compare with
  `TICKET_SUBJECT`, which replaces `SUPPORT_CHAT_SUBJECT`, never the literal. With genesis-chat's
  subject registry installed, 0006 registers the subject's tenant resolver; without it, nothing
  changes.
- **Email** (0008): route inbound mail with an optional
  `private.genesis_support_email_tenant(recipients text[]) returns uuid`; a ticket's emails are
  read by its handlers.
- **Ideas** get a tenant too: your own board is open to everyone signed in, a tenant's board to
  its members.

## Not yet

- No agent desk or article editor on the phone yet: `SupportAgentInbox` (with its pickers, held
  reply and earlier conversations), `SupportSavedRepliesAdmin`, `SupportAgentReports` and
  `SupportHelpCenterAdmin` are web only. The requester's side has both: the messenger's reply
  expectation and office hours are on the web and the phone. Without the support-chat block, staff work through the
  database functions.
- Collections can be added and deleted in `SupportHelpCenterAdmin`; to rename or reorder one, call
  `client.saveHelpCollection`. Search leaves out common English words only.
- Articles are plain text, with no images or formatting. A messenger's person is signed in: there's
  no anonymous or signed-token identity yet.
- The agent inbox shows a ticket's latest 200 messages, and its queues refresh on a timer, not live.
  An open ticket's thread is live.
- The agent inbox doesn't list who can be assigned: pass `agents`, with each agent's login. Agent
  rows hold a tenant's person records, and only the app can map those to logins.
- Without the support-chat block there are no live updates: the thread re-reads every 30 seconds
  while open.
- No ratings, no web idea board, no notification when an idea ships.
- The CDN (script-tag) build of the web loader isn't published; `mountSupportWidget` is the loader.
- Diagnostics: the dump viewer has no search and no lookup by short id (use
  `support_diagnostics_by_short_id`); the devtools overlay's "Copy debug info" is still its own
  text, not a view of a dump. Dumps go to the app's own server through `httpTransport` and
  `createDiagnosticsHandler`, so `genesis-support-intake` takes none. Feedback queued offline loses
  its screenshots, and may arrive twice if a send reached the server but its answer didn't.
