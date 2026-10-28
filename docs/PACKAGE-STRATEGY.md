# Package strategy: how Genesis is organised, and what to build next

Proposal v0.1, 2026-10-28. Status: **for review by the maintainer**. Nothing here is built yet,
and no package moves until the maintainer signs off on the move.

Genesis exists so a new app starts with what every modern app needs and writes only what is truly
its own ([FRAMEWORK.md](./FRAMEWORK.md), G1–G6). This document:

1. looks at the 27 packages as they stand;
2. proposes a clearer organisation;
3. compares Genesis with what Linear, Cursor and the leading starter kits build once and reuse;
4. ranks what to build next.

The first item on that list, a central AI package, has its own design: [AI.md](./AI.md).

## 1. What Genesis has today

Measured on `main` at 2026-10-28. Line counts are source lines, without tests.

| Group | Package | Lines | What it is |
|---|---|---:|---|
| **Foundation** | `design-system` | 3.8k | Tokens, brands, themes |
| | `core` | 10.8k | DataProvider, hooks, query keys, dates, slots, navigation |
| | `ui` | 28.3k | Web components, patterns, layouts, data views (86 subpaths) |
| | `ui-native` | 14.4k | The same vocabulary on React Native |
| | `features` | 3.1k | Feature registry, flags, gate, blocks |
| **App shells** | `native` | 8.3k | Expo root: boot, errors, persistence, updates, push, **observability**, devtools |
| | `extension` | 2.1k | Chrome MV3 kit |
| **Platform services** | `supabase` | 3.0k | Client kit, plus 12 migrations: account deletion, release policy, tenant features, push, support, **jobs**, feature mirror, web handoff, people, **entitlements** |
| | `connect` | 1.9k | Encrypted secrets, OAuth connector kit |
| | `notifications` | 3.7k | One notifier: push, email, feed, preferences |
| | `data-switchboard` | 4.1k | Move a resource between backends |
| **Domain blocks** | `chat` | 21.6k | Conversations, media, moderation, **AI recap and drafts**, transcription |
| | `forms` (+ `-react`, `-web`, `-native`, `-builder`, `-studio`, `-devtools`) | 30.3k | Forms engine, renderers, builder, workspace, devtools |
| | `sites` | 12.2k | Sites, landing pages, blog, editor |
| | `support` | 3.5k | Feedback, reports, idea board |
| | `collab` | 0.2k | Spaces and visibility (early) |
| | `studio`, `studio-server` | 9.0k | Data Studio |
| | `product` | 2.1k | Product board, triage, release notes |
| **Tooling** | `genesis-cli` | 11.0k | init, add, migrate, upgrade, doctor, introspect |
| | `agents` | docs | Rules of engagement for agent sessions |
| | `genesis` | — | Umbrella: re-exports Foundation, `native` and the forms packages |

### What's working

- **The forms family is the template.** It has a zero-dependency engine, React bindings, web and
  native renderers, a builder, a workspace and devtools. Each layer is a separate package, the
  same definition runs everywhere, and nothing above the engine knows about storage. New
  domains should copy that shape (`chat` already does, through subpaths).
- **Domains own their schema.** `chat`, `support`, `sites` and `notifications` each ship
  migrations into their own Postgres schema and install as blocks through `genesis add`.
- **The feature registry is the spine.** Status, flags, tenant switches and entitlements all
  pass through one `featureOn`. New platform services should gate through it rather than add
  their own switches.

### What isn't

1. **AI is spreading through the domains.** `chat` contains its own Anthropic Messages client
   (`packages/chat/src/server/assistant.ts`), an OpenAI moderator (`moderation.ts`) and
   Deepgram and OpenAI transcribers (`transcribers.ts`). Each has its own key, timeout, model
   default and fallback setting. `FORMS.md` plans "AI assist" and `SITES.md` plans AI page
   generation. Without a shared home, each domain will build its own client, its own prompt
   style and its own cost blind spot. This is the G5 problem in its earliest form. See [AI.md](./AI.md).
2. **Observability exists only on native.** `native/observability` has typed events
   (`defineEvents`), PII scrubbing, vendor-neutral sinks and a Sentry sink. Web apps and server
   code (Edge Functions, runners) get none of it, and AI tracing has nowhere to report.
3. **`genesis-supabase` does two jobs.** It is the Supabase client kit and also the platform's
   schema: jobs, entitlements, feature mirror, push, support, release policy. Every new platform
   table ends up there by default.
4. **Uploads are solved four times.** `chat` (attachments, Mux and Cloudflare video), `forms`
   (upload fields), `sites` (asset import) and `native` (pickers) each handle files their own way.
5. **No command registry.** `ui` has `CommandPalette`, `Command` and menus. Nothing lets an app
   declare an action once so that the palette, keyboard shortcuts, menus and (soon) AI tools all
   read the same definition.
6. **The umbrella covers half the system.** `@marktiderman/genesis` pins Foundation, `native` and
   forms, but not `notifications`, `chat`, `supabase` or `connect`. An app installing the umbrella
   still assembles its platform by hand.

## 2. Proposed organisation

Make the four groups in the table above official: name them in `FRAMEWORK.md` Part 2, use them
in the README's package index, and record a package's group in its `package.json`
(`genesis.group`). Then a layering check can enforce the direction:

```
Tooling           genesis-cli · agents
                  ─────────────────────────────────────────────────────────────
Domain blocks     chat · forms* · sites · support · collab · studio · product
                  (may use anything below; never each other except through a seam)
                  ─────────────────────────────────────────────────────────────
Platform services ai · observability · files · notifications · connect
                  · jobs · billing · supabase (client kit)
                  (headless, server-first, gated through features)
                  ─────────────────────────────────────────────────────────────
App shells        native · extension · (web shell: AppShell, today in ui)
                  ─────────────────────────────────────────────────────────────
Foundation        design-system · core · ui · ui-native · features
```

Domain blocks already reach each other in places: `support` uses `chat` for support threads.
That is fine through a declared seam (a block that requires another block), and the layering
check should allow exactly those seams.

### Moves, smallest first

| # | Move | Why | Cost |
|---|---|---|---|
| M1 | **New `genesis-observability`**, with typed events, scrubbing and the sink contract moved out of `native/observability`. `native` keeps the React Native wiring and re-exports, so no app breaks. Add web and server sinks. | Web and server need it; AI tracing and the jobs runner report through it. | Small: an extraction with re-exports. |
| M2 | **New `genesis-ai`**, absorbing chat's AI code. `chat` keeps its `Moderator` and `Transcriber` seams (G2), and their implementations move to `genesis-ai`. | One place to upgrade models, prompts, safety, cost and tracing. | Medium. See [AI.md](./AI.md). |
| M3 | **Commands in `core` and `ui`.** `defineCommands` (headless, in `core`) is read by `CommandPalette`, a shortcut layer and menus (in `ui` and `ui-native`). | The pattern Linear, Superhuman, Raycast and Cursor all share. The same definitions become AI tools and MCP tools. | Small to medium. |
| M4 | **New `genesis-files`**: upload contract (presigned or Supabase Storage), image transforms, a media record, virus and size policy, web dropzone and native pickers. `chat`, `forms` and `sites` move onto it through their existing seams. | Four implementations of one concept. | Medium. |
| M5 | **New `genesis-billing`** when the planned `entitlements` feature starts: Stripe on the web, store purchases (RevenueCat or StoreKit) on native, a paywall, and usage metering. The entitlements tables move from `supabase` to this package, with the migration history kept. | Billing and entitlements are one concept. AI usage is the first metered thing. | Medium to large; already `planned`. |
| M6 | **Umbrella policy.** Either the umbrella covers every stable platform service, or the README says plainly that it covers Foundation only. | Today it is somewhere in between. | Trivial; a decision. |

Things this proposal deliberately does **not** move:

- **The forms family stays seven packages.** The split follows real boundaries: an
  engine with no dependencies, renderers per platform, and tools. Merging them would make every
  forms consumer install the builder.
- **The jobs runner stays in `supabase` for now.** `notifications` and `forms` already share it
  through `/runner`, so it is not duplicated. Revisit if a second backend appears.
- **`collab` stays a small, early package.** It is too new to judge.

## 3. What the leaders build once

Research: Linear's engineering posts and developer docs, Cursor's docs and blog, the Notion,
Figma, Vercel, Raycast and Supabase posts, and the 2025–26 starter kits (Supastarter, Makerkit,
Better-T-Stack, Ignite, Obytes). Sources are listed at the end.

Every leader builds a handful of shared layers once and makes each feature configuration on top
of them. That is the Genesis way at company scale:

| Shared layer | Who | What it gives them | Genesis today |
|---|---|---|---|
| **Sync / live data** | Linear (local-first object graph over IndexedDB; ordered server deltas), Figma (LiveGraph: live queries filtered by permission) | Instant reads, offline, realtime with no extra work per feature | Query cache, Realtime in chat and notifications, offline outbox for forms. `offline-sync` is an idea. |
| **Command registry** | Linear, Superhuman, Raycast, Cursor | One definition feeds palette, shortcuts, menus and AI tools | Palette UI only (gap, M3) |
| **One AI gateway, routed by task** | Linear (OpenAI and Google per task), Cursor (small in-house models for Tab and apply, frontier models for the agent), Vercel | Upgrade models in one place, with cost per task | None (gap, [AI.md](./AI.md)) |
| **One retrieval layer** | Linear (one semantic search backend under similar issues, triage and search), Cursor (content-hashed incremental index, permission-aware) | Every feature gets "find related" for free | None (part of [AI.md](./AI.md)) |
| **One agent protocol** | Linear (agents as app users, typed Agent Activities, sessions), Raycast (tools need approval), Vercel AI SDK (tool approval) | Third-party and in-house agents behave alike; humans approve risky actions | Agent rules for *developer* agents (`agents`), none in-app |
| **Layered configuration** | Cursor (team → project → user rules), Linear (workspace and team AI guidance) | Admins steer behaviour without code | Tenant switches and flags in `features` |
| **Consistent AI UI** | Linear (suggestions visually distinct from human data, reasoning on hover, trace panel) | Users learn once what AI touched | chat's `labelled: true` convention only |

### The checklist starter kits ship

This checklist compares Genesis with the out-of-the-box modules in Supastarter, Makerkit and the RN templates:

| Capability | Genesis |
|---|---|
| Auth (password, magic link, OAuth, Apple, Google, account deletion) | ✅ `supabase`, `account` (beta) |
| Passkeys, MFA | ❌ |
| Organisations, invites, roles in UI and RLS | 🟡 tenants and people exist; `invites` is an idea |
| Billing, entitlements, paywall, usage metering | 🟡 gate supports entitlements; `entitlements` planned; no billing |
| Onboarding flows | 🟡 forms can do it; no onboarding pattern |
| Settings (profile, org, notifications, appearance) | ✅ native layouts, `SettingsPage` |
| Notifications: in-app, email, push, preferences | ✅ `notifications` |
| Transactional email | ✅ `notifications-email` |
| Files and media | 🟡 four implementations (M4) |
| i18n, RTL | ❌ `i18n` is an idea |
| Analytics, errors, tracing | 🟡 native only (M1) |
| Feature flags and experiments | ✅ `features` (experiments ❌) |
| Super admin, impersonation | ❌ `impersonation` is an idea |
| Audit log | 🟡 Data Studio writes audit entries; no general audit log |
| Jobs, cron, queues | ✅ `genesis_jobs` |
| Webhooks in and out, integrations | 🟡 `connect` (OAuth, secrets), form webhooks; no general webhooks |
| Search (keyword and semantic) | ❌ |
| Command palette and shortcuts | 🟡 palette UI only (M3) |
| Undo/redo, optimistic updates | 🟡 optimistic sends in chat; no app-wide undo |
| Offline and realtime presence | 🟡 forms outbox, chat typing; `offline-sync` is an idea |
| Activity feed and comments | 🟡 notification feed; `collab` is early |
| **AI: gateway, chat UI, tools, embeddings** | ❌ (chat has a private client) |
| Agent readiness: MCP server, AGENTS.md, skills | 🟡 AGENTS.md, skills in tarballs; no app MCP server |
| Marketing, SEO, blog, changelog | ✅ `sites`, `product` release notes |
| CI/CD, OTA updates | ✅ CI templates, EAS workflows |

Genesis is already ahead of the commercial kits in places they skip: native parity, forms,
the feature registry, notifications and doctor. Its gaps are the ones Makerkit and Supastarter
also call their own: **AI, billing, audit, search and the command registry**.

## 4. What to build next

Ranked by leverage: how many apps and domains benefit, and how much later work it unblocks.

| Rank | Build | Kind | Why now |
|---|---|---|---|
| 1 | **`genesis-ai`**: model aliases, tasks (versioned prompts with schemas), usage and budgets, guardrails, tracing; then the chat UI, tools and RAG | New platform service | AI is already duplicating (chat), two domains have planned AI work (forms, sites), and every app will want it. The longer we wait, the more copies we remove later. [AI.md](./AI.md). |
| 2 | **`genesis-observability`** (M1) | Extraction | Small, and a prerequisite for AI tracing and for web apps. |
| 3 | **Command registry** (M3) | Extension of `core` and `ui` | Cheap, high leverage. It also becomes the AI tool and MCP surface, so it should land before AI tools do. |
| 4 | **`genesis-billing` + entitlements** (M5) | New platform service | Already planned; AI usage needs metering to bill. |
| 5 | **Search**: Postgres full-text plus pgvector hybrid, permission-aware through RLS, with `ResourceView` and the command palette as first consumers | Part of `genesis-ai/rag` plus a `ui` pattern | Linear's lesson: one retrieval layer serves search, "similar items", AI context and triage. |
| 6 | **`genesis-files`** (M4) | Consolidation | Four copies today. |
| 7 | **Teams and access**: invites (idea), roles, impersonation (idea), a general audit log | Extension of `supabase` and `features` | Table stakes for B2B; most parts are already ideas in `features.ts`. |
| 8 | **App MCP server**: an app's resources (ResourceView descriptions) and commands, exposed to outside agents under the person's own RLS | Tooling on top of 3 and AI | Linear, Supabase, Granola and Notion all ship one. `FORMS.md` already plans one for forms. |
| 9 | **i18n** (idea) and **offline sync** (idea) | Larger bets | i18n matters for consumer apps. For offline, evaluate PowerSync (works with Supabase and RN) behind a DataProvider seam before inventing a sync engine. |

Not recommended as Genesis packages yet: realtime multiplayer editing and A2A. Neither has a
second app asking for it (G4: promote when it pays).

## 5. Decisions for the maintainer

1. Adopt the four groups (Foundation, Platform services, Domain blocks, Tooling) and the
   layering check?
2. Approve M1 (observability extraction) and M2 (`genesis-ai`) as the next two builds?
3. Should the umbrella grow to cover platform services (M6)?
4. Should the ranked list above become `features.ts` entries (status `idea` or `planned`, with
   horizons), so the product board shows it?

## Sources

- Linear: [similar issues](https://linear.app/now/using-ai-to-detect-similar-issues),
  [how we built Triage Intelligence](https://linear.app/now/how-we-built-triage-intelligence),
  [agent developer docs](https://linear.app/developers/agents),
  [agent interaction](https://linear.app/developers/agent-interaction),
  [Linear Agent](https://linear.app/changelog/2026-03-24-introducing-linear-agent),
  [sync engine, reverse-engineered](https://github.com/Aslam97/reverse-linear-sync-engine)
- Cursor: [secure codebase indexing](https://cursor.com/blog/secure-codebase-indexing),
  [rules](https://cursor.com/docs/context/rules), [hooks](https://cursor.com/docs/agent/hooks)
- Figma: [LiveGraph](https://www.figma.com/blog/livegraph-real-time-data-at-scale/);
  Notion: [data model](https://www.notion.com/blog/data-model-behind-notion);
  Raycast: [AI extensions](https://manual.raycast.com/ai/ai-extensions);
  Superhuman: [command palette](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)
- Supabase: [AI assistant v2](https://supabase.com/blog/supabase-ai-assistant-v2),
  [AI tools and MCP](https://supabase.com/docs/guides/ai-tools)
- Starter kits: [Supastarter](https://supastarter.dev/), [Makerkit](https://makerkit.dev/),
  [Better-T-Stack](https://better-t-stack.dev/docs/cli-commands),
  [Ignite](https://github.com/infinitered/ignite), [Obytes](https://starter.obytes.com)
- Sync: [PowerSync with Supabase](https://www.powersync.com/blog/offline-first-apps-made-simple-supabase-powersync)
