# Package strategy: how Genesis is organised, and what to build next

v0.3, 2026-10-29. Status: **accepted by the maintainer, 2026-10-28**, with the five groups
replaced by package layers on 2026-10-29 (section 5, and [Layers](#layers) below). The inventory
is the baseline of 2026-10-28. Since then the AI core's first phase has been built (see "P1
progress" in [AI.md](AI.md)); every other move is still to come, each as its own pull request,
tracked in `features.ts`. v0.2 folds in three adversarial
reviews; what changed from v0.1 is listed at the end.

## Recommendation

Keep the package list nearly as it is, put each package in a layer (foundation, primitives,
modules, tooling) that decides what it may depend on, and make
most of the next work **extensions of what exists** rather than new packages:

- error reporting grows into observability inside `core`;
- commands grow out of the navigation config in PR #449;
- uploads promote the protocol forms already moved up from an app;
- billing writes through the entitlement grants merged in migration 0017.

The one new package is `genesis-ai`. It starts as a thin, server-only policy layer that takes over
chat's AI code (wired into the main app but not live yet), plus a control plane to manage it
([AI.md](./AI.md)). It is designed for where the apps are going (personalised guidance, client
feedback, and goals, plans and tasks whose progress stacks week over week), but builds that in
order, coach-side first.

## 1. What Genesis has today

Measured on `main` at 2026-10-28: 28 packages. Line counts are source lines, without tests. Each
row shows the package's layer and group from [Layers](#layers).

| Layer · group | Package | Lines | What it is |
|---|---|---:|---|
| foundation · core | `design-system` | 3.8k | Tokens, brands, themes |
| foundation · core | `core` | 10.8k | DataProvider, hooks (including optimistic and **undoable** writes), query keys, dates, slots, navigation, `reportError` |
| foundation · core | `ui` | 28.3k | Web components, patterns, layouts, data views, `CommandPalette` with `useCommandPaletteHotkey` |
| foundation · core | `ui-native` | 14.4k | The same vocabulary on React Native |
| foundation · core | `features` | 3.1k | Feature registry, flags, gate, blocks |
| primitive · shells | `native` | 8.3k | Expo root: boot, errors, persistence, updates, push, observability sinks, devtools |
| primitive · shells | `extension` | 2.1k | Chrome MV3 kit |
| primitive · data | `supabase` | 3.0k | Client kit, plus 12 migrations: account deletion, release policy, tenant features, push, support, jobs, feature mirror, web handoff, people, **person entitlements** (0017, with `grant_person_entitlement`) |
| primitive · data | `connect` | 1.9k | Encrypted secrets, OAuth connector kit |
| primitive · collaboration | `notifications` | 3.7k | One notifier: push, email, feed, preferences |
| primitive · data | `switchboard` | 4.1k | Move a resource between backends |
| primitive · collaboration | `chat` | 21.6k | Conversations, media, moderation, permission-aware search (`search_messages`), AI recap and drafts, transcription |
| primitive · forms | `forms` and six siblings (`-react`, `-web`, `-native`, `-builder`, `-studio`, `-devtools`) | 30.3k | Forms engine, renderers, builder, form management screens, devtools; a signed-upload protocol and a rate limiter, both moved up from an app |
| module · modules | `sites` | 12.2k | Sites, landing pages, blog, editor |
| module · modules | `support` | 3.5k | Feedback, reports, idea board |
| primitive · collaboration | `collab` | 0.2k | Spaces and visibility, designed in [COLLABORATION.md](./COLLABORATION.md) (`building`) |
| primitive · data | `studio`, `studio-server` | 9.0k | Data Studio, with an audit entry per edit |
| module · modules | `product` | 2.1k | Product board, triage, release notes |
| tooling · core | `genesis-cli` | 11.0k | init, add, migrate, upgrade, doctor, introspect |
| tooling · core | `agents` (retired 2026-10-29) | docs | Rules of engagement for agent sessions; now [docs/agents/RULES.md](./agents/RULES.md), checked by `genesis agents --rules` |
| primitive · core | `genesis` | — | Umbrella: re-exports `core`, `ui`, `ui-native`, `design-system`, `features`, `switchboard`, `native` and the forms engine and renderers |

### Consumers today

Genesis promotes what apps prove (G4), so the strategy starts from what the main app
on Genesis actually does (read at its commit `7c0fecd`, 2026-10-27). An earlier app, not
built on these packages, is where AI ran in production; its lessons are in [AI.md](./AI.md).

| What the main app does | Where | What it says about Genesis |
|---|---|---|
| "Catch me up" AI recap through `createChatAssistant`, wired but **not live** (on only when `ANTHROPIC_API_KEY` is set); coaches only, read as the caller under RLS, `observer` from `genesis_chat.i_observe` | `src/lib/chat/assistant.server.ts` | The correct server-side loading for AI is already written, in the app. `genesis-ai` should promote it, not redesign it. |
| OpenAI moderation and Deepgram transcription wired into chat's runner, also off until keys are set | `src/lib/chat-runner.server.ts` | Two more AI processors, which would run unmetered. |
| Goals and projects, tasks, metrics per period, status updates, coaching sessions and **drafts** | its local `work` package (moved out of Genesis) | The data that AI for "progress that stacks" reads and proposes changes to already exists. |
| Anthropic, OpenAI and Deepgram named by hand as processors | `src/routes/privacy.tsx` | Privacy and consent for AI are app code today. |
| Web Sentry set up by hand, with its own scrubbers for events, breadcrumbs, replays and **spans** | `src/instrument.client.ts`, `src/lib/sentry.ts` | Web needs what `native/observability` gives native, including tracing. |
| Command palette built from its navigation (`flattenNav(nav)`) | `src/components/shell/AppCommandPalette.tsx` | Commands want to come from navigation, which is what PR #449 designs. |
| Every Genesis package pinned one by one, no umbrella | `package.json` | The umbrella isn't serving the app that uses Genesis most. |
| Runs on TanStack Start on Vercel (Node) | `package.json` | Server code in Genesis must run on Node first, Edge Functions (Deno) second. |

### What's working

- **The forms family is the template.** A zero-dependency engine, React bindings, web and native
  renderers, a builder, a workspace and devtools, each its own package. New domains should copy
  that shape (`chat` already does, through subpaths).
- **Domains own their schema.** `chat`, `support`, `sites` and `notifications` ship migrations
  into their own Postgres schema and install as blocks through `genesis add`.
- **The feature registry is the spine.** Status, flags, tenant switches and entitlements all pass
  through one `featureOn`. New primitives gate through it rather than add their own
  switches.

### What isn't

1. **AI has no home.** Chat holds one generative call site (recap and drafts) plus moderation and
   transcription, each with its own key, timeout and defaults. Forms and Sites plan AI work
   (`FORMS.md` "AI assist", `SITES.md` AI generation). The main app holds the gating, the
   server-side loading and the privacy list. This is not yet duplication. It is the point where
   a shared layer costs least: before the second and third copies exist. See [AI.md](./AI.md).
2. **Observability is split.** `core/errors.ts` gives every platform `reportError` and
   `setErrorReporter`, already used by chat, forms-native and native. Typed events, scrubbing and
   the sink contract live only in `native/observability`, and nothing has spans or traces.
   The main app hand-builds web Sentry, tracing included.
3. **`genesis-supabase` does two jobs.** It is the Supabase client kit and the platform's schema
   (jobs, entitlements, feature mirror, push, support, release policy). That is acceptable while
   the tables serve the gate, but new platform tables should go to the package that owns the
   concept.
4. **Uploads are solved several times.** `chat` (attachments, Mux and Cloudflare video, its own
   `server/upload.ts`), `forms` (a signed-upload protocol moved up from an app), `sites` (asset
   import), `support` (screenshots), and `ui`'s `FileUploadField`. The pickers are in
   `chat/native` and `forms-native`.
5. **Commands are scattered.** `core` has `RowAction` and `ViewAction` (with `confirm`,
   `destructive` and `can`) and `NavigationNode`; `ui` has the palette and its hotkey. Nothing
   declares an action once for the palette, shortcuts, menus and, later, AI tools.
6. **Small platform pieces exist twice.** Rate limiting is in `forms/src/rate-limit.ts` and in
   chat. Key-value storage is `core/storage` (sync) and forms' `KeyValueStorage` (async).
7. **The umbrella is a half-measure.** It pins Foundation, `native`, `switchboard` and forms, not
   `chat`, `notifications`, `supabase` or `connect`, and the main app doesn't use it.

## 2. Proposed organisation

### Layers

Decided on 2026-10-29; it replaces the five groups accepted on 2026-10-28. Every package records
its layer and group in its package.json, and `pnpm check:package-layers` fails CI on a violation
(feature `package-layering`). Presented simply: **level 1 is the foundation and the primitives;
level 2 is the modules built from them.**

```
Tooling      genesis-cli                                          (beside the layers; may use anything)
Modules      sites · support · product                            (mini apps, installed with genesis add)
Primitives   data · ai · forms · collaboration · shells · umbrella
Foundation   design-system · core · ui · ui-native · features     (essential: every app starts with them)
```

| Layer | May depend on |
|---|---|
| foundation | foundation |
| primitive | foundation, primitive (no cycles) |
| module | foundation, primitive, and a module only when its `genesis.module.requiresModules` lists it |
| tooling | anything; no runtime package depends on tooling, nor on a package's `toolingEntries` |

"Depends on" is the package's `dependencies` and `peerDependencies` plus every Genesis import in
its source, tests aside, so an undeclared import still counts. The rule for where a package goes:
if another package or app embeds it as a part, it is a **primitive**; if someone installs it and
gets a working product surface to switch on for tenants, it is a **module**.

| Package | Layer | Group | Note |
|---|---|---|---|
| design-system, core, ui, ui-native, features | foundation | core | essential |
| genesis (umbrella) | primitive | core | bundles primitives, never modules |
| supabase, switchboard, studio, studio-server, connect | primitive | data | |
| ai | primitive | ai | |
| forms, forms-react, forms-web, forms-native, forms-builder, forms-studio, forms-devtools | primitive | forms | |
| collab, chat, notifications | primitive | collaboration | chat is embedded by support and apps, so a primitive |
| native, extension | primitive | shells | |
| sites | module | modules | owns `genesis_sites`; `genesis add sites` |
| support | module | modules | `genesis add support-feedback`; threads through the chat primitive |
| product | module | modules | the roadmap, idea board and release notes; `genesis add product-board` |
| genesis-cli | tooling | core | `packages/agents` retired: its rules are docs/agents/RULES.md, the checkable ones in genesis-cli; a `genesis-plugin` (idea) takes the seat |

**The metadata.** Each package's `genesis` key in package.json:

```jsonc
"genesis": {
  "layer": "module",               // foundation | primitive | module | tooling
  "group": "modules",              // core | data | ai | forms | collaboration | shells | modules
  "essential": true,               // optional; foundation or tooling only
  "module": {                      // modules only
    "name": "Sites",
    "summary": "Multi-page sites, landing pages and a blog, …",
    "blocks": ["sites"],           // ids in genesis.blocks: migrations, routes, nav and settings live there
    "requiresModules": [],         // the only module-to-module dependencies allowed
    "schema": "genesis_sites",     // the Postgres schema it owns, when it has tables
    "install": "genesis add sites",
    "docs": "https://github.com/marktiderman/genesis/blob/main/docs/SITES.md",
    "skill": "SKILL.md"
  },
  "toolingEntries": ["./node"],    // optional: entry points that are tooling inside a runtime package
  "blocks": { … }, "doctor": { … } // unchanged
}
```

The type is `PackageMeta` in `@marktiderman/genesis-features` (with `readPackageMeta` and
`packageLayerProblems`). Package dependencies are already the record of which primitives a
module is built from, so they are not declared again. Plans and entitlements are left out on
purpose: which plan unlocks a module is the app's decision, in its own `features.ts`
(`access: { plan }`).

**What the check enforces.** Every package has a valid layer and group, a `module` block only and
always on a module, every block it lists exists, and its install line names one of them; the
dependency direction above; no cycles; every module's docs and `SKILL.md` exist and the skill
ships; `essential` only on foundation or tooling. A genesis-cli test runs each module's install
line through `genesis add --dry-run`. **Not yet:** that a module's migrations create objects only
in its schema and no other package writes there (`package-schema-ownership`, planned; support's
tables are still in genesis-supabase's migration 0006).

**Product's two halves.** The board, idea board, roadmap and release notes for an app's own
people are the module (`.`, `/native`, `/server`, block `product-board`). The repo-maintenance
CLI (the `genesis-product` bin and `/node`, which reads git and GitHub issues) is tooling,
declared as `toolingEntries: ["./node"]` in the same package rather than a new package: the two
halves already have separate entry points with no imports between them in that direction, the
release and board workflows keep running unchanged, and no published entry point moves. The
check refuses any runtime package that imports `genesis-product/node`. If the CLI grows, it moves
into `genesis-cli` as `genesis product`.

**On the site and in Storybook** the packages appear in the same bands, grouped by `group`:
Foundation, Primitives (Core, Data, AI, Forms, Collaboration, Shells), Modules, and Tooling.
Storybook titles start with the layer and group: `Foundation/UI/Button`, `Primitives/Forms/Form`.

### What ships as a package, and what is copied in

Accepted by the maintainer, 2026-10-29 (R6). Code ships as npm packages; an app never holds a
copy of a Genesis component, hook or server handler. What an app must own, because it runs or
lives in the app's own project, is copied in by `genesis add`: new migrations later arrive with
`genesis migrate`, and `genesis upgrade` refreshes the files Genesis owns (pgTAP tests, skills,
the AGENTS.md block). Route stubs are written once, on Expo Router apps; elsewhere `genesis add`
prints the step.

| Ships in the package (the app imports it) | Copied into the app (the app owns the file) |
| --- | --- |
| Components, hooks, providers, server handlers, the doctor's rules | Migrations (new timestamped files; an applied one is never rewritten) and their pgTAP tests |
| Types, contracts, views, blocks' declarations | Route stubs, Edge Functions and the config the app's platform runs (`supabase/config.toml`) |
| | Agent skills (`SKILL.md`) and the AGENTS.md block |

There is no eject. An app that needs a component to behave differently uses its props, variants
and slots (FRAMEWORK G2); when no extension point fits, it writes the gap up for Genesis and
works around it locally, and Genesis adds the extension point (`genesis upstream`, an idea, will
make that a register and an issue form). A fix
in a package then reaches every app with `genesis upgrade`, which a copied component never would.
Rejected: shadcn-style ejecting, which recreates the code in each app, breaks G5 and drifts.

**Overlays: the one exception, marked and short-lived.** When an app can't wait for a release, it
may copy a package's source into its own workspace under the package's name (an *overlay*), change
it, ship it, and promote the change upstream. The copy carries a marker in its package.json, which
`readOverlayMarker` (genesis-features) validates and `genesis doctor` reads:

```json
"genesis": {
  "overlay": { "upstream": "@marktiderman/genesis-support@0.2.6", "since": "2026-10-30", "owner": "web team", "reason": "inbox filters, to promote" }
}
```

`upstream` is the package and the exact release it was copied from (`@marktiderman/genesis-*@<semver>`),
`since` the day it was made (`YYYY-MM-DD`), `owner` and `reason` who answers for it and why. An
unmarked copy is an error, and a marker older than 14 days warns (older than 30 fails `--strict`),
so an overlay is a bridge to a release, never an eject. The mechanics are in the
[genesis-cli README](../packages/genesis-cli/README.md#overlays).

### Moves, extending before inventing

| # | Move | Builds on | Size |
|---|---|---|---|
| M1 | **Observability in `core`.** Grow `core/errors.ts` into `core/observability`: one sink contract for errors, breadcrumbs, typed events (`defineEvents`), timings and **spans**, plus the scrubber, all platform-neutral. Web and server sinks (Sentry, console, OpenTelemetry) are subpaths. `native` keeps the React parts (`wrap`, route error boundaries) and its existing exports. | `core/errors.ts`; `native/observability`; The main app's web Sentry, scrubbers included (G4) | M: spans are new design, not an extraction |
| M2 | **`genesis-ai`**, a new primitive, server-first, depending on nothing above it. Chat's provider code stays in chat; chat gains an optional `genesis-chat/ai` subpath with its tasks, and `genesis-ai` is an optional peer dependency of that subpath only. | The main app's recap loading; chat's `Moderator` and `Transcriber` seams; the gate; `connect` | See [AI.md](./AI.md) |
| M3 | **Commands from navigation.** Once #449's `defineNavigation` lands, add `actions` alongside destinations: a `ViewAction`-shaped entry (`confirm`, `destructive`, `can`) with an optional shortcut. The palette, shortcuts and menus read it; AI tools derive from it later. Coordinate with #449's author before building. | #449; `ViewAction`; `useCommandPaletteHotkey`; The main app's nav-driven palette | S after #449 |
| M4 | **One upload protocol.** Promote forms' signed-upload protocol (`forms/src/upload-protocol.ts`, `upload-handler.ts`) to a shared home (types in `core`, the Supabase Storage handler in `supabase`), then move chat, support and sites onto it through their own seams. A `genesis-files` package only if the shared code outgrows those homes. | forms' protocol, `FileUploadField` | M |
| M5 | **Billing writes grants.** When `entitlements` (planned) starts, a billing block (Stripe on the web, store purchases on native, a paywall) writes through `grant_person_entitlement` / `revoke_person_entitlement` with `source` and `source_ref`, which 0017 already reserves for "a billing webhook". The entitlement tables stay with the gate. | Migration 0017; `featureOn` | L |
| M6 | **Small platform pieces, one home each.** Rate limiting moves from forms into a shared module (AI budgets reuse it). The two key-value storage contracts merge. | `forms/src/rate-limit.ts`; `core/storage` | S |
| M7 | **Umbrella policy.** Decide: either the umbrella covers every stable primitive and the main app moves to it, or the README says it is Foundation plus forms and stops there. | — | S, a decision |

Deliberately **not** moved:

- **The forms family stays seven packages.** The split follows real boundaries.
- **Jobs stay in `supabase`.** `notifications` and `forms` already share the runner.
- **`collab` stays as designed** in COLLABORATION.md; it is building, not judged here.

## 3. What the leaders build once

The leaders below build a handful of shared layers once and make each feature configuration on
top of them. That is the Genesis way at company scale. What each actually does:

| Shared layer | Who, and what they do | Lesson for Genesis | Genesis today |
|---|---|---|---|
| **Sync and live data** | Linear: local-first object graph in IndexedDB with ordered server deltas. Figma: LiveGraph, live queries filtered by the viewer's permissions. | Live data with permissions applied, once. | Query cache, Realtime in chat and notifications, forms' offline outbox. `offline-sync` is an idea. |
| **Commands** | Linear, Superhuman, Raycast: one action definition behind the palette, shortcuts and menus. Raycast's extension commands double as AI tools. | Declare actions once; derive the palette, shortcuts, menus and tools. | Pieces in `core` and `ui` (M3). |
| **One AI layer** | Linear started similar-issue and triage features on small models (GPT-4o mini, Gemini 2.0 Flash), found quality fell short, and moved to larger models (GPT-5, Gemini 2.5 Pro) with an agentic step. Cursor trains its own models for high-volume work (Tab, apply) and, since Cursor 2.0, its own Composer agent model, alongside frontier models. | **Measure quality, then pay for it where it matters**, and keep the model choice in one place so that move is cheap. | None ([AI.md](./AI.md)). |
| **One retrieval layer** | Linear rebuilt search as one semantic backend under similar issues, triage and search. Cursor indexes code by content hash, incrementally, and only returns what the client can prove it holds. | One permission-aware search serves search, "similar", AI context and triage. | Chat's `search_messages` (full text, permission-aware) is the seed. |
| **One agent protocol** | Linear: agents are app users (OAuth, `actor=app`), with typed activities (thought, action, elicitation, response, error) in agent sessions. Raycast and Anthropic's Managed Agents: tool permission policies, including an **auto** mode that only asks when a call is risky. | Agents act as people under the same permissions; approvals are risk-based, not "ask every time". | Developer-agent rules only (`agents`). |
| **Layered configuration** | Cursor: team, project and user rules. Linear: natural-language AI guidance per workspace and team. | Tenants steer behaviour without code. | Tenant switches and flags in `features`. |
| **Consistent AI UI** | Linear: suggestions visually separate from human-set data, reasoning on hover, a trace panel. | Users learn once what AI touched. | Chat's `labelled: true`. |

### The checklist starter kits ship

Compared with what Supastarter, Makerkit and the leading React Native templates include out of
the box:

| Capability | Genesis |
|---|---|
| Auth (password, magic link, OAuth, Apple, Google, account deletion) | ✅ `supabase`, `account` (beta) |
| Passkeys, MFA | ❌ |
| Organisations, invites, roles in UI and RLS | 🟡 tenants and people; `invites` is an idea |
| Billing, entitlements, paywall, usage metering | 🟡 person entitlements and the gate shipped (0017); no billing (M5) |
| Onboarding flows | 🟡 forms can do it; no onboarding pattern |
| Settings (profile, org, notifications, appearance) | ✅ native layouts, `SettingsPage` |
| Notifications: in-app, email, push, preferences | ✅ `notifications` |
| Files and media | 🟡 several implementations (M4) |
| i18n, RTL | ❌ `i18n` is an idea |
| Errors, analytics, tracing | 🟡 `reportError` everywhere; events and scrubbing on native; no tracing (M1) |
| Feature flags and experiments | ✅ `features`; no percentage rollouts or experiments |
| Consent and privacy choices | ❌ `consent` is an idea |
| Data export (access requests) | ❌ |
| Rate limiting and abuse protection | 🟡 forms and chat each have one (M6) |
| Super admin, impersonation | ❌ `impersonation` is an idea |
| Audit log | 🟡 Data Studio audits its edits; no general audit log |
| Jobs, cron, queues | ✅ `genesis_jobs` |
| Webhooks and integrations | 🟡 `connect` (OAuth, secrets), form webhooks |
| Search | 🟡 chat's permission-aware full-text search; nothing general, nothing semantic |
| Command palette and shortcuts | 🟡 palette, hotkey and nav tree; no shared actions (M3) |
| Undo, optimistic updates | ✅ `core` mutation modes: optimistic and undoable |
| Offline and presence | 🟡 forms outbox, chat typing; `offline-sync` is an idea |
| **AI: model layer, usage, admin, consent** | ❌ ([AI.md](./AI.md)) |
| Agent readiness: MCP server, AGENTS.md, skills | 🟡 AGENTS.md and skills ship; no app MCP server |
| Marketing, SEO, blog, changelog | ✅ `sites`, `product` |
| CI/CD, OTA updates | ✅ CI templates, EAS workflows |

Genesis is ahead of the commercial kits where they are thin: native parity, forms, the feature
registry, notifications and doctor. Its real gaps are **AI, billing, consent and privacy,
tracing, and a general search**.

## 4. What to build next

Ranked by demand from the apps first, then by what each unblocks. Sizes are for one maintainer
working with agents: S is under a week, M two to four weeks, L longer.

There are 45 features in `building` today. So the list is short on purpose, and the top items
replace or absorb existing code rather than adding surface.

| Rank | Build | Size | Why |
|---|---|---|---|
| 1 | **`genesis-ai` core** (AI.md P0–P1), with **spans in `core`** (M1) built alongside as its prerequisite | M | The owner's priority. Chat's recap, moderation and transcription become metered, gated, consented calls before the main app turns them on and before Forms and Sites add more. |
| 2 | **AI control plane and consent** (AI.md P2) | M | The "centralised management" the owner asked for: usage and cost, budgets, switches, model rollouts, tenant guidance, consent records. It also starts the `consent` block every app needs. |
| 3 | **Commands from navigation** (M3) | S | Cheap once #449 lands; the main app already builds its palette from navigation. |
| 4 | **Billing writes grants** (M5) | L | The planned `entitlements` feature; migration 0017's comments (memberships, class packs, coaching packages) show the demand. |
| 5 | **One upload protocol** (M4) and **one rate limiter** (M6) | M | Consolidation of code that already exists several times. |
| 6 | **Search**: generalise chat's `search_messages` into permission-aware full-text search for any resource, then add semantic search through Supabase's automatic embeddings | M | Linear's lesson, built from the seed Genesis has. |
| 7 | **Teams and access**: invites, impersonation, a general audit log | M | Mostly ideas already in `features.ts`. |
| 8 | **Agent-operable apps**: tools, commands, search and an MCP server generated from the resource descriptions apps already write ([AI.md](./AI.md), "North star") | L | The long-term direction. It waits for 1 to 6 to prove out and a second app to ask. |
| 9 | **i18n** and **offline sync** | L | For offline, evaluate PowerSync (Supabase and React Native) behind a DataProvider seam before inventing a sync engine. |

Not recommended as Genesis packages yet: multiplayer editing and A2A. No app is asking (G4).

## 5. Decisions

Decided by the maintainer on 2026-10-29 (the package-layers research, nine decisions):

1. **Layers:** foundation, primitives and modules, with tooling beside them. The UI tier
   FRAMEWORK called "primitives" is now "elements" (and `features.ts` layer `element`), so
   "primitives" means the package layer.
2. **Three layers,** presented as level 1 (foundation and primitives) and level 2 (modules).
3. **Block** stays the install unit at every layer; a module is a package of blocks forming a
   mini app.
4. **Plans and entitlements** live in each app's `features.ts`, never in package metadata.
5. **support and product are modules;** product's repo CLI is tooling (`toolingEntries`).
6. **cli and agents** are tooling, in the `core` group. (agents was then retired: RULES.md moved to docs/agents/, the checkable rules into genesis-cli, and `genesis-plugin` takes its seat.)
7. **The umbrella** is a primitive that may bundle primitives, never modules.
8. **The layering check fails CI from day one.**
9. **Schema ownership** is a follow-up (`package-schema-ownership`).

Groups on the site and in Storybook: core, data, ai, forms, collaboration, shells and modules,
with no "start here" group: an `essential` badge and the `genesis init` line instead. This
replaces decision 1 of 2026-10-28 below; the declared domain seams (`sites → forms`,
`support → chat`) are now a module depending on a primitive, which the rule allows.

Decided by the maintainer on 2026-10-28:

1. **Accepted, then replaced on 2026-10-29:** the five groups, the declared domain seams and a
   layering check in doctor (`package-layering`).
2. **Accepted:** M1 is observability in `core`, with spans, not a new package
   (`core-observability`).
3. **Accepted:** `genesis-ai` P0–P2 ([AI.md](./AI.md)) is the next build; retrieval, MCP and
   agents stay ideas (`ai-providers`, `ai-control-plane`).
4. **Accepted:** M3 extends #449's `defineNavigation`, and builds after #449 lands
   (`command-registry`).
5. **Narrowed:** the umbrella promises Foundation, the native shell, switchboard and forms; the other
   primitives and every module are installed on their own (an umbrella never bundles a module).
   The README says so. Revisit when those primitives are stable.
6. **Accepted:** the ranked list is in `features.ts` as `planned` and `idea` entries with
   horizons.

## Sources

- Linear: [similar issues](https://linear.app/now/using-ai-to-detect-similar-issues),
  [how we built Triage Intelligence](https://linear.app/now/how-we-built-triage-intelligence),
  [agent developer docs](https://linear.app/developers/agents),
  [agent interaction](https://linear.app/developers/agent-interaction),
  [Linear Agent](https://linear.app/changelog/2026-03-24-introducing-linear-agent),
  [sync engine, reverse-engineered](https://github.com/Aslam97/reverse-linear-sync-engine)
- Cursor: [secure codebase indexing](https://cursor.com/blog/secure-codebase-indexing),
  [rules](https://cursor.com/docs/context/rules), [hooks](https://cursor.com/docs/agent/hooks),
  [Composer, Cursor 2.0](https://simonwillison.net/2025/Oct/29/cursor-composer/)
- Figma: [LiveGraph](https://www.figma.com/blog/livegraph-real-time-data-at-scale/);
  Raycast: [AI extensions](https://manual.raycast.com/ai/ai-extensions);
  Superhuman: [command palette](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)
- Supabase: [AI tools and MCP](https://supabase.com/docs/guides/ai-tools),
  [automatic embeddings](https://supabase.com/docs/guides/ai/automatic-embeddings)
- Starter kits: [Supastarter](https://supastarter.dev/), [Makerkit](https://makerkit.dev/),
  [Better-T-Stack](https://better-t-stack.dev/docs/cli-commands),
  [Ignite](https://github.com/infinitered/ignite), [Obytes](https://starter.obytes.com)
- Sync: [PowerSync with Supabase](https://www.powersync.com/blog/offline-first-apps-made-simple-supabase-powersync)

## What changed from v0.1

- **Facts corrected:**
  - 28 packages, not 27;
  - undo exists (`core` mutation modes);
  - search exists (chat's `search_messages`);
  - `core/errors.ts` is a cross-platform error-reporting seam;
  - the umbrella's contents;
  - where uploads and pickers live;
  - entitlements are partly shipped (0017).
- **New: a "Consumers today" section** grounded in the main app's code.
- **Groups: five, checked against real dependencies,** with the two domain seams declared and
  Part 2 reconciled.
- **Moves extend what exists:**
  - M1 grows `core` and is re-sized for spans;
  - M3 extends #449;
  - M4 promotes forms' protocol;
  - M5 writes grants instead of moving tables;
  - M6 is new;
  - M2 no longer moves chat's code and so creates no dependency cycle.
- **Leaders' lessons corrected:**
  - Linear's model history;
  - Cursor's own Composer agent model;
  - Raycast's and Managed Agents' risk-based auto approval.
- **Ranking re-based on demand and sized,** with a focus note on the 45 features in `building`.
- **The v0.1 PR description said #449 did not overlap.** It does, with M3, and M3 now builds on it.
