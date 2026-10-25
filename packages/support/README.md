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

## Core

```ts
import { createSupportClient, createContextCollector, createIntakeClient, createIntakeSink } from "@marktiderman/genesis-support";

const client = createSupportClient(supabase);
await client.submit({ type: "bug", message, context: await collector.collect(), attachments: [{ kind: "screenshot", contentType: "image/jpeg", base64 }] });
// → { id, attachmentsDropped }
```

- `createSupportClient(supabase)`: `submit` (the Supabase sink), `myReports`, `report`,
  `replies`, `reply`, `markRead`, `deleteReport`, `attachments` (signed URLs), `ideas`,
  `suggestIdea`, `vote`, `unvote`, `shippedForMe`. Errors are `SupportError` with the database's
  code (`rateLimited` for `GS429`).
- `createIntakeClient` + `createIntakeSink`: the wire contract over HTTP, for code without
  supabase-js (it takes no screenshots, and says so in `attachmentsDropped`).
- `contract.ts` is the wire contract (`CONTRACT_VERSION`, headers, `SubmitFeedbackInput`,
  `validateSubmitInput`), byte-identical to the intake function's copy (a test checks).
- `resolveSupportCopy(overrides)`: every string, in English, overridable key by key.

A GitHub issue per report, or a signed webhook, is a server-side sink: the
`genesis-support-notify` function template in `@marktiderman/genesis-supabase`.

## Access, in the database

A person sees, edits (while open) and deletes their own reports, replies on them and sees their
own screenshots. Every signed-in person reads the idea board (not who suggested an idea); one vote per person and idea, and a
Supabase anonymous sign-in can neither vote nor suggest. Staff are whoever your
`private.genesis_support_staff(person uuid)` hook says (none until you add it). Status, owner,
feature id, vote counts and read receipts are the server's. See the migration's header.

## Not yet

- No staff (operator) screens: staff work through the database functions or a tool of yours.
- No live updates (Realtime): the thread re-reads every 30 seconds while open.
- No ratings, no web idea board, no notification when an idea ships.
- The CDN (script-tag) build of the web loader isn't published; `mountSupportWidget` is the loader.
