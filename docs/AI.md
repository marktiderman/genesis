# Genesis AI: one place for every AI call an app makes

Design v0.2, 2026-10-28. Status: **proposal, for review by the maintainer**. Feature:
`ai-providers` (`idea` in `features.ts`). Context: [PACKAGE-STRATEGY.md](./PACKAGE-STRATEGY.md).
v0.2 folds in three adversarial reviews; what changed from v0.1 is listed at the end.

## Recommendation

Build `genesis-ai` in three steps, and stop there until a second app asks for more:

1. **A thin, server-only policy layer.** Every AI call, generative or not, passes through one
   pipeline: consent, feature gate, budget, server-side loading, guardrails, the model call, a
   usage record and a trace. Its first job is to take over what Growth90 already runs (recap,
   moderation, transcription) with no change in behaviour, proven by a parity test.
2. **A control plane.** This is the "centralised management system": usage and cost per tenant,
   task and model; budgets; kill switches; model rollouts behind flags; tenant guidance; consent
   records.
3. **Then decide.** The conversation surface is `genesis-chat`, with the assistant as a member,
   not a second chat UI. The long-term direction is apps that agents can operate, generated from
   the resource descriptions apps already write. Retrieval, MCP and agents stay `idea` until then.

Model calls go through the Vercel AI SDK, behind Genesis's own task API, so a swap stays inside
one package. A short spike decides it first.

## Consumers today

| Call | Where it lives | Notes |
|---|---|---|
| Recap ("catch me up") and reply drafts | `chat/src/server/assistant.ts`, `createChatAssistant` | Anthropic Messages API: `claude-sonnet-5-5`, `output_config.effort: "low"`, Anthropic's server-side refusal fallback (`fallbacks: "default"`), API version `2026-10-21`, transcript fenced as data |
| The recap's gating and loading | Growth90 `src/lib/chat/assistant.server.ts` | On only when the key is set; coaches only; messages read as the caller under RLS; `observer` from `genesis_chat.i_observe`, never from the request |
| Moderation | `chat/src/server/moderation.ts`, wired in Growth90's chat runner | OpenAI moderation with per-category thresholds |
| Transcription | `chat/src/server/transcribers.ts`, wired in Growth90's chat runner | Deepgram or OpenAI, priced per audio minute |
| The processor list | Growth90 `src/routes/privacy.tsx` | Anthropic, OpenAI and Deepgram named by hand |
| Planned | `FORMS.md` ("AI assist"), `SITES.md` (AI generation from section schemas) | Not built |

There is one generative call site today, and the correct way to call it (server-side loading,
observer from the database, labelled output) lives half in chat and half in one app. Two more
domains plan AI. That is the cheapest moment to give it one home.

## The goal

> Every AI call in an app goes through one layer. Upgrading a model, a prompt, a safety rule or
> the tracing happens once, can be rolled out and rolled back safely, and every app benefits.

In Genesis terms, an AI feature is **configuration**: a task with a loader, a prompt, a schema and
a model alias (G1, G2). The pipeline, metering, consent, guardrails and admin are written once (G5).

Non-goals:

- **Our own provider abstraction or agent loop.** FRAMEWORK rule 4 ("Don't rebuild the
  ecosystem") applies.
- **Prompts edited at runtime.** Prompts are reviewed code. Tenants add *guidance*; they never
  replace a prompt. As of 2026-10-28, OpenAI's
  [deprecations page](https://developers.openai.com/api/docs/deprecations) retires its hosted
  prompts, Agent Builder and Evals on 2026-11-30 and points users to prompts in application code.
- **A second chat UI.** `genesis-chat` already has web and native threads, composers, realtime,
  moderation and RLS.
- **Training or hosting models.**

## What the leaders and the vendors recommend

### Leaders

| Who | What they do | What we take |
|---|---|---|
| **Linear** | Similar issues and Triage Intelligence started on small models (GPT-4o mini, Gemini 2.0 Flash). Quality fell short, so they moved to GPT-5 and Gemini 2.5 Pro with an agentic step. Suggestions are visually separate from human data, with reasoning on hover and a trace panel. Admins add guidance per workspace and team. Agents are app users with typed activities in sessions. | Measure quality, then pay for it where it matters. One place to change models. A standard "AI touched this" UI. Tenant guidance. Agents act as people. |
| **Cursor** | Its own models for high-volume, low-latency work (Tab, apply) and, since Cursor 2.0, its own Composer agent model, alongside frontier models. Content-hashed, permission-aware indexing. Rules advise; hooks enforce. | Model choice per task. Retrieval that respects permissions. Prompts advise; guardrails enforce. |
| **Raycast** | Commands double as AI tools. On paid plans the default approval mode is **Auto**: it reviews each action and asks only when needed. Bring-your-own provider. | Commands become tools. Risk-based approval. BYOK. |

### Anthropic

- **Guidance:** [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
  and [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).
  - Start with the simplest thing.
  - Prefer workflows (chaining, routing, parallel steps, evaluator loops) to autonomous agents.
  - Invest in tool design.
  - Treat context as a budget: a stable prefix first for caching, retrieval just in time.
- **Products that map onto this design:**
  - the Messages API for tasks;
  - the SDK's tool runner for custom-tool agents;
  - the Claude Agent SDK, the Claude Code harness as a library, for coding and filesystem agents;
  - Managed Agents, with versioned agent configs and **tool permission policies**: `always_allow`,
    `always_ask` and `auto`, where `auto` runs a call, denies it as high-risk, or pauses it when
    the risk is indeterminate.
- **API mechanics that shape the pipeline** (from Anthropic's current docs):
  - `output_config.effort` is the first cost lever. Its default is `medium` on Opus 5.5 and
    Haiku 5.5, `high` elsewhere.
  - Refusals come back as `stop_reason: "refusal"`. The server-side fallback
    (`fallbacks: "default"`) runs on the Claude API for Opus 5.5, Sonnet 5.5, Opus 5 and
    Fable 5.1. Haiku 5.5 has none.
  - On Opus 5.5 and Sonnet 5.5, forced `tool_choice` returns a 400.
  - On API version `2026-10-21`, `temperature`, `top_p` and `top_k` return a 400 on every model.
  - Structured output is `output_config.format`.
  - Prompt caches are per model.
  - A mid-conversation `system` message is the injection-safe channel for operator instructions.

### OpenAI

- **Guidance:** [A practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf).
  - An agent is model, tools and instructions. Start with one agent.
  - Layer guardrails: relevance, safety, PII, moderation, tool risk ratings, human handoff.
  - Build evals early, then move to cheaper models where quality holds.
- **Products:** the Agents SDK for TypeScript (agents, handoffs, guardrails, sessions, tracing)
  on the Responses API.

### Where they agree

- Keep orchestration in your own code.
- Use workflows before agents.
- Rate tools by risk.
- Put guardrails at the edges.
- Trace everything.
- Make evals part of shipping.

## Alternatives considered

| Option | What it is | Fit for Genesis |
|---|---|---|
| **[Vercel AI SDK 7](https://vercel.com/blog/ai-sdk-7)** | Provider-neutral model calls, streaming, structured output, tools with approval (opt-in HMAC-signed in v7), a durable `WorkflowAgent`, OpenTelemetry through `@ai-sdk/otel`, an [Expo path](https://ai-sdk.dev/docs/getting-started/expo), and on-device providers | **Chosen for model calls.** It has the largest ecosystem and absorbs monthly provider churn. It sits behind the task API, so a swap is local. |
| **TanStack AI** | 1.0 on 2026-10-23: 23 provider adapters, tools with approval, MCP, middleware, React Native via a server route | A close second, and it fits a TanStack stack (Growth90 runs TanStack Start). Five days past 1.0. Re-check at P1. |
| **Mastra** | Open-source TypeScript framework (license reported as Apache-2.0; 1.0 reported January 2026) bundling agents, workflows, memory, RAG, evals, tracing and a studio, on AI SDK providers | The nearest thing to a ready-made "central AI package". Too much for P1, where Genesis needs its own gate, consent and RLS loading. **A build-vs-adopt decision before any agent, memory or evals work.** |
| **OpenAI Agents SDK** (TS) | Agents, handoffs, guardrails, sessions, tracing | Good ideas (guardrails as a stack); OpenAI-centred. Not chosen. |
| **Claude Agent SDK / Managed Agents** | Anthropic's harness as a library / Anthropic-hosted agents with versioned configs and permission policies | For back-office or long-running agents. Their permission policies inform ours. Not the in-app layer. |
| **LangGraph.js** | Durable graph workflows | Heavy and less idiomatic TypeScript; `WorkflowAgent` covers durable runs. |
| **CopilotKit / AG-UI** | An event protocol between agent backends and app UI | Web-first; revisit if the chat-member surface needs a standard event stream. |
| **assistant-ui** | Chat UI primitives for web and React Native | **Not chosen.** It would duplicate `genesis-chat`'s UI, and its React Native package is pre-1.0 (0.1.x). |
| **Our own fetch clients** | What chat does today | The fallback if the P0 spike fails: chat's Anthropic `fetch` code already works and stays the reference. |

Operations tools:

- **[Langfuse](https://langfuse.com/)** (MIT) for traces, datasets and scores. It joined
  ClickHouse in January 2026, and self-hosting needs ClickHouse, Redis, S3 and Postgres. **Optional**:
  traces go to whatever sink the app has (Sentry, console, OpenTelemetry).
- **Evals: [evalite](https://v1.evalite.dev)** (Vitest-based, so it runs under `pnpm test`) or
  **[promptfoo](https://www.promptfoo.dev/)**. OpenAI announced it would acquire promptfoo on
  2026-03-09; both say it stays open source.

Avoid, as of 2026-10-28:

- **Helicone.** Since Mintlify acquired it on 2026-03-03 it gets security updates, bug fixes and
  new-model support only ([announcement](https://www.mintlify.com/blog/mintlify-acquires-helicone)).
- **Self-hosted LiteLLM** without pinned versions and verified hashes. Malicious PyPI releases
  1.82.7 and 1.82.8 were published on 2026-03-24
  ([NetSPI](https://www.netspi.com/blog/executive-blog/ai-ml-pentesting/litellm-supply-chain-compromise/)).
  A second compromise in October 2026 is reported by
  [Datadog Security Labs](https://securitylabs.datadoghq.com/articles/litellm-compromised-pypi-docker.md);
  we have not confirmed it independently.
- **Humanloop.** Its team joined Anthropic in August 2025
  ([TechCrunch](https://techcrunch.com/2025/08/13/anthropic-nabs-humanloop-team-as-competition-for-enterprise-ai-talent-heats-up));
  the product is reported shut down.

## The design

### Package shape and dependencies

`@marktiderman/genesis-ai` is a platform service. It depends only on Foundation (`core`,
`features`) and `connect`, never on a domain block.

| Subpath | Contents | Phase |
|---|---|---|
| `.` | `defineAi`, `defineTask`, types and typed outcomes. No React, no provider SDK, no secrets. | P1 |
| `/server` | `createAi(config)`: `run`, `stream`, `wrap`, and the request handler that serves tasks by id. The AI SDK is imported here only. Runs on Node; Edge Functions (Deno) after P0 proves it. | P1 |
| `/react` | `useAiTask(id)`: calls a task by id with ids as arguments. It never imports a task module, so prompts never ship in a bundle. | P1 |
| `/admin` | The control plane's screens on `ResourceView`: usage and cost, budgets, switches, model rollouts, tenant guidance, BYOK keys. Mountable in Data Studio or an app's admin. | P2 |
| `migrations/` | The `genesis_ai` schema (below). | P1–P2 |

Domain blocks bring their own tasks. Chat gains `@marktiderman/genesis-chat/ai`, the only part of
chat that imports `genesis-ai`, which is an optional peer dependency of that subpath (FRAMEWORK
rule 6). Chat's `Moderator` and `Transcriber` seams, and their implementations, stay in chat. No
code moves, so there is no cycle and no chat install pulls in the AI SDK.

### One config file per app, server-only

```ts
// ai.config.ts — imported by server code only (a doctor rule enforces it)
import { defineAi, wrap } from "@marktiderman/genesis-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openAiModerator, deepgramTranscriber } from "@marktiderman/genesis-chat/server";

export const ai = defineAi({
  models: {
    // An alias is more than a model name: effort and provider options travel with it.
    default: {
      model: anthropic("claude-sonnet-5-5"),
      effort: "low",
      fallbacks: {
        unavailable: [],          // 429, 5xx, timeout: retry on these, in order (same vendor unless the tenant opts in)
        refusal: "provider",      // Anthropic's server-side fallback where it exists; otherwise a typed `refused`
      },
    },
    smart: { model: anthropic("claude-opus-5-5"), effort: "medium", fallbacks: { refusal: "provider" } },
  },
  // Non-generative processors go through the same pipeline: gated, consented, metered.
  processors: {
    moderation: wrap(openAiModerator({ apiKey: env.OPENAI_API_KEY }), {
      vendor: "openai", feature: "chat", unit: "call", budget: "exempt",
    }),
    transcription: wrap(deepgramTranscriber({ apiKey: env.DEEPGRAM_API_KEY }), {
      vendor: "deepgram", feature: "chat", unit: "audio-minute",
    }),
  },
  vendors: { anthropic: { region: "us" }, openai: {}, deepgram: {} },   // the processor list, for consent and the privacy page
  budgets: { tenant: { monthlyUsd: 50 }, person: { dailyCalls: 200 }, concurrencyPerTenant: 4 },
  telemetry: { captureContent: "off" },                                  // traces carry metadata only by default
});
```

`wrap` returns the same `Moderator` or `Transcriber` chat already expects (G2). Chat's runner takes
it unchanged, and every moderation and transcription call is now gated, consented, metered and
traced. Moderation is exempt from budgets: a safety check never stops because a tenant ran out.

### Tasks: a loader, a prompt, a schema

The client sends a task id and ids. The task loads its own data on the server, as the person,
under RLS. Nothing the model reads, and no flag that widens what it reads, ever comes from the
request.

```ts
// @marktiderman/genesis-chat/ai — chat's recap, promoted from Growth90 (G4)
export const chatRecap = (opts: { canUse: (ctx: AiContext) => Promise<boolean> }) =>
  defineTask({
    id: "chat.recap",
    version: 1,
    feature: "chat",
    model: "default",                                      // Sonnet 5.5 at low effort: exactly today's call
    maxTokens: 4000,
    args: z.object({ conversationId: z.string().uuid() }), // what the client may send: ids only
    can: opts.canUse,                                      // the app's rule, e.g. "coaches only"
    load: async (ctx, { conversationId }) => {
      // As the caller (ctx.db carries their token): membership and last-read position, then the
      // messages RLS lets them read. `observer` comes from the database, never from the request.
      const observer = await isObserver(ctx.db, conversationId);         // genesis_chat.i_observe
      return { ...(await readSinceLastRead(ctx.db, conversationId)), observer, me: ctx.personId };
    },
    system: RECAP_SYSTEM,                                  // unchanged from assistant.ts
    prompt: (loaded) => recapPrompt(loaded),               // the existing async builder: <earlier> and <new>
    output: z.object({ text: z.string().min(1) }),
    label: "ai",
  });
```

- **Parity test.** In P1 the task must produce byte-identical request bodies to
  `createChatAssistant` for the same conversation: model, effort, fallbacks, system and prompt.
  `createChatAssistant` stays as it is for a deprecation window, and removing it is a major change.
- **Task modules are server-only.** A doctor rule flags any client import of a task module or of
  `ai.config.ts`.

### The pipeline

`ai.run(task, args, ctx)`, `ai.stream(...)` and every `wrap`ped processor do the same steps in
order. Each step can end the call with a **typed outcome** the UI can explain: `off`,
`no_consent`, `over_budget`, `forbidden`, `refused`, `invalid_output` or `unavailable`.

1. **Consent.** The person (or the tenant, for tenant-level processing) has agreed to sharing
   with this vendor. Since November 2025, App Store guideline
   [5.1.2(i)](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing)
   requires an app to disclose and get permission before sharing personal data with a
   third-party AI. A fallback to another vendor needs consent for that vendor too.
2. **Gate.** `requireFeature(registry, ctx, task.feature)`, the task's `can`, a global AI switch
   and a per-tenant AI switch. When agents arrive, every tool call also checks its own feature.
3. **Budget, with bounded overshoot.**
   - Check spent plus in-flight against the tenant's and the person's limits, and refuse at the
     limit.
   - In-flight calls are rows with an expiry; the existing jobs runner sweeps abandoned ones.
   - A per-tenant concurrency cap bounds the worst overshoot to cap × the task's maximum cost.
   - There are no row locks per call and no worst-case reservation, so ordinary calls aren't
     refused for headroom they will never use.
4. **Load.** The task's `load` runs as the person.
5. **Input guardrails, per task.** PII redaction would wreck a recap that needs names, so each
   task names its own. Untrusted text is fenced as data (chat's `neutralise` is the existing
   fence), and tenant guidance goes in as a separate operator message, never mixed into data.
6. **Call.** The model call:
   - resolve the alias, any per-tenant model rollout (below) and any BYOK key from `connect`;
   - call with the alias's effort and provider options, and with prompt caching;
   - on `unavailable`, try the listed fallbacks;
   - on a refusal, use the provider's own fallback or return `refused`;
   - validate against the output schema, with one repair retry.
7. **Output guardrails.** Moderation where the task asks for it.
8. **Record.**
   - Write a `genesis_ai.usage` row holding metadata only: tenant, person, task id and version,
     alias and model, vendor, input, cache-read, cache-write and output tokens (or audio minutes),
     cost, latency, outcome.
   - Never prompt text, messages or output.
   - Rows are readable under RLS by tenant admins, and by each person for their own; written only
     by the server; kept 13 months by default.
   - Emit a span with OpenTelemetry GenAI attributes through `core/observability`
     (PACKAGE-STRATEGY M1).
9. **Return** `{ output, model, taskVersion, labelled: true }`.

Cost comes from a price table in the package, updated each release. It covers tiers (Haiku 5.5's
rate changes above 100K input tokens), cache reads and writes, thinking billed as output, and fast
mode. A gateway's own figure is recorded alongside when one is used.

### Changing models and prompts safely

"Upgrading a model is one line" is only half the promise; the other half is rolling it out safely.

- **Model rollouts are flags.** An alias can name a candidate model behind a flag
  (`rollout: { flag: "ai.default.next", model: anthropic("…") }`).
  - Today flags take per-tenant values, so rollouts go tenant by tenant.
  - Percentage bucketing, stable per tenant and person, is a proposed extension to
    `genesis-features` (G2), useful well beyond AI.
  - Rollback is flipping the flag.
  - The admin compares cost, latency, refusals and invalid outputs by model.
- **Prompt changes are code.** A new prompt is a new task version, shipped like any change and
  gated by its evals in CI. Two reviewed versions can run side by side behind a flag.
- **Tenant guidance is the only runtime text.** It is short, fenced and stored per tenant. Its
  hash is recorded on every call. It is sent as a mid-conversation `system` message where the
  model supports it: Anthropic's injection-safe operator channel.

### The control plane (P2)

`genesis-ai/admin` gives the owner and each tenant's admins one place to manage AI, built on
`ResourceView` and mountable in Data Studio:

- **Usage and cost** by tenant, task, model and day, from `genesis_ai.usage`.
- **Budgets:** edit tenant and person limits.
- **Switches:** global AI off, per tenant, per task, through the existing tenant feature switches
  and flags.
- **Model rollouts:** which tenants are on which model, with the comparison above.
- **Tenant guidance** and **BYOK keys** (sealed with `connect`).
- **Consent:** who has agreed to which vendors. The app's privacy page lists processors
  generated from `vendors` instead of hand-written.

### Schema

The `genesis_ai` schema:

- **P1:** `usage`, `budgets` (limits only; the config holds defaults), `inflight` and
  `tenant_settings` (guidance, BYOK key reference, cross-vendor opt-in, region).
- **Consent records** belong to the `consent` block (an `idea` in `features.ts`), which P1 starts
  in its smallest form: a person's agreement per vendor, on web and native.
- **Later, only with agents or retrieval:** `runs`, `approvals`, `embeddings` (with model and
  version on every row, so changing the embedding model is a re-index job, not a migration).

### Security rules, written down now

These are rules for what comes after P2, recorded so later work can't skip them:

- **Approvals are enforced by the server.**
  - A tool that asks issues a one-use token, stored in `approvals` with a nonce and `used_at`.
  - The token is bound to the person, the tool, a hash of the exact arguments and the run, and
    it expires in minutes.
  - The approval sheet shows the raw arguments, not a model-written summary.
  - Risk comes from what the action already declares: `ViewAction.destructive` and `confirm`.
  - The default policy is risk-based **auto**, as in Raycast and Managed Agents: reads run,
    writes ask, destructive and external calls always ask.
- **The lethal trifecta.** Private data, untrusted content and a way to send data out must not
  all be present at once. Once a run has read untrusted content, external and destructive tools
  are forced to ask.
- **Rendering AI output.** It never loads remote images, shows links with their full URL, and
  auto-links only allowlisted hosts. Markdown with remote images is a known exfiltration channel.

### The conversation surface: the assistant is a chat member

When an app wants a conversational assistant, it is a member of a `genesis-chat` conversation,
which is Linear's "agents are app users":

- AI turns are labelled messages.
- Linear's activity types (thought, action, elicitation, response, error) map to message kinds.
- Approvals are elicitation messages that grant the server token.
- Tokens stream over a side channel and the finished message is stored.
- Chat's realtime, moderation, attachments, transcription, web and native UI and RLS all come for
  free, and so do mixed threads (a coach, a client and the assistant).
- Apps without chat get a thin `useAiChat` hook later.
- The risk is coupling AI to chat's coaching-shaped schema. Chat would need an agent-member kind
  and a cost per message.

### North star: apps that agents can operate

Everything Genesis already asks an app to describe can become AI surface without per-feature code:

- **Resources** (`defineView` and `ResourceView`, the introspected contract) → typed list, search,
  get, create and update tools, run as the person under RLS, gated by `featureOn`.
- **`ViewAction`s** → tools, with approval derived from `destructive` and `confirm`.
- **Navigation destinations and actions** (#449, PACKAGE-STRATEGY M3) → the command palette and
  commands.
- **`embed: ["title", "body"]` on a resource** → Supabase automatic embeddings and a hybrid
  full-text and vector search function, generalising chat's `search_messages`.
- **All of the above** → the app's MCP server. The 2026-07-28 spec is stateless, which suits a
  serverless endpoint.

The risks:

- RLS becomes the whole security model, so every generated function needs pgTAP coverage.
- Generated tools need curated descriptions to be usable by a model.
- Tool counts grow, which calls for deferred loading or tool search.

This is the direction, not the next build. It waits for P1–P2 to prove out and a second app to
ask.

## Phases

| Phase | Scope | Exit | Size |
|---|---|---|---|
| **P0 · Spike** | On Growth90's runtime first (TanStack Start on Vercel, Node), then Supabase Edge Functions (Deno), with `@ai-sdk/anthropic`, prove: (1) `output_config.effort` and `fallbacks: "default"` with its beta pass through; (2) no `temperature`, `top_p` or `top_k` is sent (400 on `2026-10-21`); (3) structured output uses `output_config.format`, not forced `tool_choice` (400 on Opus and Sonnet 5.5); (4) cache and usage tokens come back; (5) streaming works to Expo with `expo/fetch`. | A written yes or no. If no, the pipeline calls providers through a thin adapter (chat's `fetch` code) behind the same task API. | ≤ 1 week |
| **P1 · Core** | `defineAi`, `defineTask`, `run`, `stream`, `wrap`, the task handler and `useAiTask`; the P1 tables; the smallest `consent` block; spans in `core/observability`; `genesis-chat/ai` with `chat.recap` and `chat.draftReply`; doctor rules (no direct provider imports, no client import of tasks or config); one recap eval in CI. | Growth90's recap, moderation and transcription run through `genesis-ai`, the parity test passes, and 100% of its AI calls have usage rows. | 2–3 weeks |
| **P2 · Control plane** | `/admin` screens; model rollouts by flag; tenant guidance; consent screens on web and native; the generated processor list. | The owner moves one tenant's recap to a new model from the admin, sees the cost and quality difference, and rolls back. | 2–3 weeks |
| **Later (ideas)** | The assistant as a chat member; search and retrieval; agents with approvals; the app MCP server; BYOK at scale; on-device models; a build-vs-adopt decision on Mastra before any agent, memory or evals framework. | Each starts as its own `features.ts` entry when an app asks. | — |

What P0–P2 deliberately do **not** include: a chat UI, retrieval, an MCP server, agents, memory,
on-device models and a hosted gateway.

## Decisions for the maintainer

1. **Take the Vercel AI SDK as a dependency** of `genesis-ai/server`, subject to P0, with
   TanStack AI re-checked at P1?
2. **A new `genesis_ai` schema** in the app's Supabase, and the smallest `consent` block in P1?
3. **Extend `genesis-features`** with percentage rollouts, for model rollouts and beyond?
4. **Scope:** P0–P2 committed; everything else stays an idea until a second app asks?
5. **Langfuse** as an optional sink only, not a dependency?

## Open questions

1. **Where evals live.** Proposal: each domain's tasks ship evals next to them (chat's recap
   first); apps add their own.
2. **Content capture in production traces.** Proposal: off by default; when on, sampled and
   scrubbed, never in usage rows.
3. **Moderation when consent is missing.** Moderation sends a person's message to a vendor.
   Proposal: moderation is a disclosed processor that the app's terms cover (tenant-level
   consent), not a per-person opt-in, because turning it off per person would weaken safety for
   everyone in the conversation. This needs a legal read.

## Sources

- Vercel AI SDK 7: [announcement](https://vercel.com/blog/ai-sdk-7),
  [migration guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0),
  [Expo](https://ai-sdk.dev/docs/getting-started/expo)
- TanStack AI 1.0: [announcement](https://tanstack.com/blog/tanstack-ai-1-0)
- Mastra: [v1](https://mastra.ai/blog/mastrav1) (details from secondary sources)
- Anthropic: [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents),
  [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents),
  [refusals and fallback](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback),
  [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs),
  [prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- OpenAI: [practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf),
  [Agents SDK (JS)](https://openai.github.io/openai-agents-js),
  [deprecations](https://developers.openai.com/api/docs/deprecations),
  [promptfoo acquisition](https://openai.com/index/openai-to-acquire-promptfoo)
- Linear: [Triage Intelligence](https://linear.app/now/how-we-built-triage-intelligence),
  [agents](https://linear.app/developers/agents)
- Raycast: [AI extensions](https://manual.raycast.com/ai/ai-extensions)
- Cursor: [Composer](https://simonwillison.net/2025/Oct/29/cursor-composer/)
- Apple: [App Review Guidelines 5.1.2](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing)
- Supabase: [automatic embeddings](https://supabase.com/docs/guides/ai/automatic-embeddings)
- Langfuse: [joining ClickHouse](https://langfuse.com/blog/joining-clickhouse)
- MCP: [protocol blog](https://blog.modelcontextprotocol.io/tags/protocol/)

## What changed from v0.1

- **Scope cut to P0–P2:** a thin core plus a control plane. Retrieval, MCP, agents and on-device
  models are ideas.
- **The first consumer is Growth90's real code**, with a parity test.
- **Tasks load their own data on the server;** clients send ids only. v0.1's recap example would
  have let the client supply the transcript and dropped the observer check.
- **Chat's code no longer moves.** `wrap` meters it in place, which removes the dependency cycle
  and keeps the AI SDK out of every chat install.
- **"Every call through one layer" now covers moderation and transcription.**
- **Consent added**, as the first step of the pipeline.
- **Model aliases carry effort and provider options.**
  - Outage fallbacks are separate from refusal fallbacks.
  - Cross-vendor fallback needs a tenant opt-in and consent.
  - The recap keeps Sonnet 5.5 at low effort.
- **Budgets use bounded overshoot** instead of worst-case reservations with row locks.
- **`prompt_overrides` is removed;** tenant guidance replaces it.
- **assistant-ui is dropped;** the assistant is a chat member.
- **New sections:** "Alternatives considered" (Mastra, TanStack AI and others), the vendors'
  products and API mechanics, safe rollouts, the control plane, and security rules for later work.
- **Facts corrected:**
  - Raycast's Auto default;
  - Cursor's Composer;
  - Linear's model history;
  - AI SDK 7's signed approvals and `@ai-sdk/otel`;
  - Helicone's status;
  - the Langfuse and promptfoo acquisitions;
  - P0 now targets Node first.
