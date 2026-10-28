# Genesis AI: one place for every AI call an app makes

Design v0.3, 2026-10-28. Status: **accepted by the maintainer, 2026-10-28** (see "Decisions"). Feature:
`ai-providers` (`idea` in `features.ts`). Context: [PACKAGE-STRATEGY.md](./PACKAGE-STRATEGY.md);
research and production lessons: [AI-COACHING-RESEARCH.md](./AI-COACHING-RESEARCH.md).
v0.2 folded in three adversarial reviews; v0.3 adds where the apps are going with AI. What changed
is listed at the end.

## Recommendation

Build `genesis-ai` in three steps, and stop there until a second app asks for more:

1. **A thin, server-only policy layer.** Every AI call, generative or not, passes through one
   pipeline: consent, feature gate, budget, server-side loading, guardrails, the model call, a
   usage record and a trace. Its first job is to take over chat's AI code, wired into the main app but not live yet (recap,
   moderation, transcription) with no change in behaviour, proven by a parity test.
2. **A control plane.** This is the "centralised management system": usage and cost per tenant,
   task and model; budgets; kill switches; model rollouts behind flags; tenant guidance; consent
   records.
3. **Then decide.** The conversation surface is `genesis-chat`, with the assistant as a member,
   not a second chat UI. The long-term direction is apps that agents can operate, generated from
   the resource descriptions apps already write. Retrieval, MCP and agents stay `idea` until then.

Model calls go through the Vercel AI SDK, behind Genesis's own task API, so a swap stays inside
one package. A short spike decides it first.

**Where it is going.** Apps built on Genesis will use AI for three things: **personalised
guidance** for each client, **feedback** for clients, and **goals, projects and tasks whose
progress stacks** week over week. None of that is day one. The core is shaped so it can grow
there, and a **coaching track** after the control plane builds it in order of risk: coach-side
drafts first (the AI never speaks to a client unreviewed), then the weekly loop, then bounded
client-facing guidance, then proactive check-ins.

## Consumers today

| Call | Where it lives | Notes |
|---|---|---|
| Recap ("catch me up") and reply drafts | `chat/src/server/assistant.ts`, `createChatAssistant` | Anthropic Messages API: `claude-sonnet-5-5`, `output_config.effort: "low"`, Anthropic's server-side refusal fallback (`fallbacks: "default"`), API version `2026-10-21`, transcript fenced as data |
| The recap's gating and loading | The main app's `src/lib/chat/assistant.server.ts` | Wired, **not live** (on only when the key is set); coaches only; messages read as the caller under RLS; `observer` from `genesis_chat.i_observe`, never from the request |
| Moderation | `chat/src/server/moderation.ts`, wired in the main app's chat runner | OpenAI moderation with per-category thresholds; off until a key is set |
| Transcription | `chat/src/server/transcribers.ts`, wired in the main app's chat runner | Deepgram or OpenAI, priced per audio minute; off until a key is set |
| Goals, projects, tasks, metrics, status updates, sessions, drafts | The main app's `work` package | Not AI, but the data that guidance, feedback and "progress that stacks" will read and propose changes to |
| The processor list | The main app's `src/routes/privacy.tsx` | Anthropic, OpenAI and Deepgram named by hand |
| Planned | `FORMS.md` ("AI assist"), `SITES.md` (AI generation from section schemas) | Not built |

There is one generative call site in Genesis today, not yet live in any app, and the correct way
to call it (server-side loading, observer from the database, labelled output) lives half in chat
and half in one app. Two more domains plan AI. That is the cheapest moment to give it one home.

An earlier app ran AI in production: companion conversations, a per-person memory,
weekly reports, follow-up questions and a client-approved brief for the practitioner. Its lessons
(what to keep, what to design out) are summarised in
[AI-COACHING-RESEARCH.md](./AI-COACHING-RESEARCH.md) and are folded into this design.

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

## How Genesis apps will use AI

The owner's three uses, what the leading apps do for each, and what Genesis needs to provide.
The research behind this table, with sources, is in
[AI-COACHING-RESEARCH.md](./AI-COACHING-RESEARCH.md).

| Use | What the leading apps do | What Genesis needs |
|---|---|---|
| **Personalised guidance** | WHOOP, Oura and Fitbit's Gemini coach: a daily brief that reflects the person's state; an "ask" over the person's own data; an **explicit memory the person can see and edit**; onboarding by conversation. Google's coach computes every number in code through a data-science agent. | Person context in layers with a manifest (P1); a memory block (coaching track); a metrics tool layer so **the model never does arithmetic**; scope limits and safety routing. |
| **Feedback for clients** | My PT Hub and Everfit draft check-in feedback and replies "in the coach's voice" for the coach to review and send. Omada's dietitians review AI output, and coaches get summaries of members' AI conversations. **No coaching platform closes the loop** from check-in to reviewed feedback to plan change. | Tasks triggered by events (a check-in submitted) and schedules (weekly); a **coach review queue** with per-type auto-apply rules; outputs as drafts the coach edits; audience-aware loading so only what a client shared reaches a coach. |
| **Goals, projects and tasks whose progress stacks** | WHOOP, Fitbit, Peloton, MacroFactor and Sunsama all run a **weekly cycle**: plan, recap, adjust. Lattice's 1:1 agent carries open action items into the next agenda. Todoist and Motion break goals into tasks. | A weekly review task over the main app's `work` model (pursuits, work items, metric values, status updates, sessions) that proposes changes as **drafts**; accepted changes become next week's plan, so progress is explicit and auditable. |

Four principles follow from the research and from the earlier app:

1. **Human plus AI, not AI alone.** Future dropped its AI-only coaching beta in June 2026. In
   BetterUp's survey, 51% of clients want both a human and AI, 34% a human, 15% AI. The AI
   prepares, the coach decides, and every client-facing message says who wrote it.
2. **Specific and actionable, or nothing.** The failures are generic text (Garmin), numbers the
   model got wrong, and verdicts that change on a second ask (a tester's "cardiac grade" swung
   from F to B). Numbers come from code; every claim cites its evidence; output proposes what
   changes next.
3. **One connected state.** WHOOP users reported its coach ignoring their weekly plan and their
   saved preferences, because the features were not wired together. Memory, plan, check-ins and
   the coach read the same person context.
4. **Measure it continuously.** Oura and Google re-run clinician-written scenario tests on every
   model or prompt change and track edge-case recall on its own. The earlier app's evaluations ran
   against canned responses and never caught that personalisation scored 0.08.

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
| **TanStack AI** | 1.0 on 2026-10-23: 23 provider adapters, tools with approval, MCP, middleware, React Native via a server route | A close second, and it fits a TanStack stack (the main app runs TanStack Start). Five days past 1.0. Re-check at P1. |
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

Every vendor that sees a person's data is a processor, including embeddings, speech-to-text and
text-to-speech, which are often a different vendor from chat. Each is wrapped, consented and
metered like a model call.

`wrap` returns the same `Moderator` or `Transcriber` chat already expects (G2). Chat's runner takes
it unchanged, and every moderation and transcription call is now gated, consented, metered and
traced. Moderation is exempt from budgets: a safety check never stops because a tenant ran out.

### Tasks: a loader, a prompt, a schema

The client sends a task id and ids. The task loads its own data on the server, as the person,
under RLS. Nothing the model reads, and no flag that widens what it reads, ever comes from the
request.

```ts
// @marktiderman/genesis-chat/ai — chat's recap, promoted from the main app (G4)
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

**Triggers.** A task runs on a request (a person asks), an **event** (a check-in is submitted, a
journal entry completed) or a **schedule** (every Monday, nightly):

- An event task receives only a row id. It re-reads the row as its owner and re-checks
  preconditions, so a forged or stale event can't drive it.
- A scheduled task runs on the existing jobs runner, over people in batches, with a cap per run
  and an activity gate (for example, only people with a check-in this week).
- A task with several steps (summarise, then extract, then propose) makes each step idempotent
  and retryable on its own, so one failure doesn't redo or lose the others.

**Person context in layers.** A task's `load` builds its context from named **layers**: who the
person is, their profile, their active goals, recent check-ins, open follow-ups, the previous
session. Each layer is typed code with a loader, a token budget and a priority:

- Stable layers come first, so the prompt cache holds them; retrieved, per-message material comes
  last.
- Every layer is fenced as data, never instructions.
- Every call records a **context manifest** on its usage row: which layers, their estimated
  tokens and the ids of the items included, never the content. The earlier app found this manifest is
  what makes a prompt change measurable.
- Less is more: the earlier app's evaluation preferred a short identity, a compact profile and a few
  retrieved items (about 1,000 tokens) to a 3,200-token prompt holding everything.
- Methods a coach or programme follows (a coaching framework, a training philosophy) are
  versioned **method packs**, shipped as code or content packs and chosen per tenant. They are
  not editable prompts.

**Loaders are tested against the schema.** Each loader is typed against the generated database
types and covered by a contract test, so a schema change can't silently change what the model
reads. The earlier app lost two inputs that way without any test failing.

### The pipeline

`ai.run(task, args, ctx)`, `ai.stream(...)` and every `wrap`ped processor do the same steps in
order. Each step can end the call with a **typed outcome** the UI can explain: `off`,
`no_consent`, `over_budget`, `forbidden`, `safety_routed`, `refused`, `invalid_output` or
`unavailable`.

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
4. **Load.** The task's `load` runs as the person. For a task whose output goes to someone else
   (a client's check-in summarised for their coach), the loader keeps only what the person chose
   to share with that audience, checked on the server, **before** anything reaches the prompt.
5. **Safety routing, with no model in the decision.** For tasks that read what a client wrote,
   an app-provided protocol (patterns or a classifier, resources to show, whether to suspend the
   generated reply, who to alert) runs on the input first. A match ends the call with
   `safety_routed`. This covers crisis and self-harm, medical symptoms and injuries, disordered
   eating and minors. California's companion-chatbot law (in force since January 2026) requires
   a crisis protocol for some chatbots; Genesis builds one regardless.
6. **Input guardrails, per task.** PII redaction would wreck a recap that needs names, so each
   task names its own. Untrusted text is fenced as data (chat's `neutralise` is the existing
   fence), and tenant guidance goes in as a separate operator message, never mixed into data.
7. **Call.** The model call:
   - resolve the alias, any per-tenant model rollout (below) and any BYOK key from `connect`;
   - call with the alias's effort and provider options, and with prompt caching;
   - on `unavailable`, try the listed fallbacks; within a conversation, keep the same model
     after the first turn, so the voice doesn't change mid-thread;
   - on a refusal, use the provider's own fallback or return `refused`;
   - validate against the output schema, with one repair retry.
8. **Output guardrails.** Moderation where the task asks for it, and **grounded citations**:
   when output quotes something (a client's own words in a brief, a programme's text, a
   resource), the model cites an id and the verbatim text comes from the store. Anything that
   can't be resolved is removed, fail-closed. A streamed reply gets a correction event.
9. **Record.**
   - Write a `genesis_ai.usage` row holding metadata only: tenant, person, task id and version,
     alias and model, vendor, input, cache-read, cache-write and output tokens (or audio minutes),
     cost, latency, outcome.
   - Never prompt text, messages or output.
   - Rows are readable under RLS by tenant admins, and by each person for their own; written only
     by the server; kept 13 months by default.
   - Emit a span with OpenTelemetry GenAI attributes through `core/observability`
     (PACKAGE-STRATEGY M1).
   - Record the context manifest (step 4) on the same row.
10. **Return** `{ output, model, taskVersion, usageId, labelled: true }`. `usageId` lets
    feedback refer to the exact call.

**Models carry their capabilities.** Each alias resolves to a model record: which parameters it
accepts, how thinking is configured, its prices and its refusal fallback. Code never sniffs model
names. A model missing from the price table fails a test instead of being billed at a guess, and
no test or prompt pins a literal model name.

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

### Numbers come from code

The model never does arithmetic. Adherence, trends against a person's own baseline, personal
records, volume, weight trend, streaks and goal progress come from **metric tools**: plain
functions over the database, exposed to the model as tools or computed in `load`. The model may
only state numbers those tools returned, and structured outputs carry `evidence` references to the
rows behind each claim. An evaluation checks automatically that every number in an output appears
in, or follows from, the tool results. Where a domain has a proven algorithm (MacroFactor's
expenditure model, a load-progression rule), the algorithm decides and the model explains.

### The coach review queue (coaching track)

Outputs meant for a client are **drafts** first. Each task declares its `audience` and its
`review`: `none`, `owner` (the person approves, as with the earlier app's brief, section by section) or
`coach` (the coach approves before the client sees it). The queue is modelled on Linear's triage:

- Each item shows the draft, the reasoning and the evidence, and can be accepted, edited and sent,
  or rejected with a reason.
- **Auto-apply rules per coach and per kind:** for example, encouragement on a low-risk check-in
  sends itself; plan changes and anything flagged always wait.
- **Guarding against rubber-stamping:** flagged items need an explicit look, and there is no
  "approve all" across them.
- Coach guidance cascades from organisation to programme to coach, and is best added when a
  pattern goes wrong.
- **Every edit is kept as a diff.** Acceptance rate and edit distance per kind are the main
  quality signals, and the edits are the best personalisation data there is.

### Memory (coaching track)

What the AI knows about a person is an explicit, editable record, as in WHOOP's My Memory and
The earlier app's memories:

- Items have a category (goals, preferences, constraints and injuries, life events, and so on),
  content, confidence, a source (client said, coach entered, AI suggested, derived), provenance
  links to the messages or check-ins behind them, and when they held (`valid_from`,
  `valid_until`, `superseded_by`).
- **AI-suggested items stay `proposed`** until the person or coach confirms them. Temporary items
  inform but don't steer. Coach-only notes are kept apart from what the client sees, with
  per-item visibility.
- **One extraction path** (an event task), with review states `proposed | accepted | edited |
  rejected`; retrieval reads accepted and edited items; editing re-embeds. Contradictions
  supersede in one SQL function, checked with one model call against the nearest items, not one
  call per existing memory.
- Nightly consolidation merges near-duplicates and lets unreinforced items fade, for people with
  recent activity only.
- The person can see all of it ("what the AI knows about me"), edit it, export it and turn it off.

### Progress that stacks (coaching track)

The main app's `work` model already holds goals and projects (pursuits), tasks and milestones (work
items), metric values per period, status updates, coaching sessions and **drafts**. The weekly
cycle runs over it:

1. **Before a session:** a brief for the coach from the week's check-ins, metric values and
   status updates. It includes only what the client shared, uses metrics computed in code, and
   quotes the client only through grounded citations.
2. **After a session:** a summary with action items that have owners, and a next agenda that
   carries forward anything still open (Lattice's pattern).
3. **Weekly review:** the task reads active pursuits, this week's work items, metric values
   against their goals and status updates. It proposes changes (a task added or moved, a target
   adjusted, a milestone marked at risk) as **draft rows**, through the review queue.
4. **Accepted drafts become next week's plan.** The decisions (accepted, edited, rejected) are
   kept, so the chain from goal to plan to task to check-in to next plan is explicit, auditable
   and evaluable.
5. **Roll-ups:** each week's review becomes a summary memory, then a month's, so the context stays
   small while the history compounds.

### Feedback and evaluations

- **Feedback is an event log** (`genesis_ai.feedback`): up, down, "more like this", or a coach's
  edit, tied to the `usageId` of the call it rates, written by the server.
- **Evaluations follow Oura and Google.** Scenario sets pair synthetic person profiles with
  must-do and must-never criteria written by coaches (clinicians where health is involved).
  Scoring uses judges from more than one model provider, calibrated against human grading, and
  re-runs on every model, prompt or tool change.
- **What is measured:**
  - numeric fidelity;
  - groundedness (never invents personal context);
  - safety recall, tracked on its own;
  - claims compliance (no diagnoses, no therapy framing);
  - specificity (would this output fit another client?);
  - consistency across repeated runs;
  - plan validity;
  - fit with the coach's voice.
- **Evaluations run live.** Evaluations against canned responses gave the earlier app false comfort; the
  CI gate runs against a seeded evaluation tenant.
- **In production,** the north star is coach acceptance rate and edit distance, time saved per
  check-in, and goal attainment week over week.

### Debug capture

Content stays out of usage rows and traces by default. A team still needs to replay a bad answer,
so **debug capture** is an explicit opt-in per tenant or per session: sampled, visible to staff
only, scrubbed, and deleted after a fixed retention (30 days by default).

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
- **Conversation history comes from the server.** The server rebuilds a thread from stored
  messages; a client never sends the history the model reads.
- **Health and coaching claims are configuration, per domain.** These rules come from secondary
  summaries and need a legal read before any client-facing task ships:
  - Wellness language only: under the FDA's general wellness guidance (January 2026), output may
    suggest seeing a professional but may not name a disease, call a reading abnormal, or give
    clinical thresholds.
  - Never diagnose or prescribe.
  - Never present as therapy: Illinois's 2025 law bars AI from providing therapy.
  - Health data never goes to advertising or iCloud (App Store 5.1.3).
  - Consent to collect and consent to share are separate (Washington's My Health My Data Act).
  - Fitness, nutrition and life coaching each get their own rule pack.

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
| **P0 · Spike** | On the main app's runtime first (TanStack Start on Vercel, Node), then Supabase Edge Functions (Deno), with `@ai-sdk/anthropic`, prove: (1) `output_config.effort` and `fallbacks: "default"` with its beta pass through; (2) no `temperature`, `top_p` or `top_k` is sent (400 on `2026-10-21`); (3) structured output uses `output_config.format`, not forced `tool_choice` (400 on Opus and Sonnet 5.5); (4) cache and usage tokens come back; (5) streaming works to Expo with `expo/fetch`. | A written yes or no. If no, the pipeline calls providers through a thin adapter (chat's `fetch` code) behind the same task API. | ≤ 1 week |
| **P1 · Core** | `defineAi`, `defineTask`, `run`, `stream`, `wrap`, the task handler and `useAiTask`; context layers and the manifest; the safety-routing hook; model capability records; the P1 tables; the smallest `consent` block; spans in `core/observability`; `genesis-chat/ai` with `chat.recap` and `chat.draftReply`; doctor rules (no direct provider imports, no client import of tasks or config); one live recap eval in CI. | Chat's recap, moderation and transcription run through `genesis-ai` (in the sample app, and in the main app when it turns them on), the parity test passes, and every AI call has a usage row. | 2–3 weeks |
| **P2 · Control plane** | `/admin` screens; model rollouts by flag; tenant guidance; consent screens on web and native; the generated processor list. | The owner moves one tenant's recap to a new model from the admin, sees the cost and quality difference, and rolls back. | 2–3 weeks |
| **Later (ideas)** | The assistant as a chat member; search and retrieval; agents with approvals; the app MCP server; BYOK at scale; on-device models; a build-vs-adopt decision on Mastra before any agent, memory or evals framework. | Each starts as its own `features.ts` entry when an app asks. | — |

What P0–P2 deliberately do **not** include: a chat UI, retrieval, an MCP server, agents, memory,
on-device models and a hosted gateway.

### P0 result (2026-10-28): yes, with four conditions

`scripts/spikes/ai-sdk-p0.mjs` sends real AI SDK calls through a mock `fetch` that records each
request and answers like the Messages API. It ran with `ai` 7.0.155 and `@ai-sdk/anthropic` 4.0.90
on Node 22 (the main app's server runtime), and on Deno 2.9.6 both from `node_modules` and through
`npm:` imports with `ai` 7.0.148 and `@ai-sdk/anthropic` 4.0.85, as Supabase Edge Functions import
them. **16 of 16 checks passed on all three:**

| Check | Result |
|---|---|
| `output_config.effort` passes through | Yes (`providerOptions.anthropic.effort`) |
| Refusal fallback `fallbacks: "default"` passes through | Yes, and the SDK adds the `server-side-fallback-2026-07-01` beta header itself |
| No `temperature`, `top_p` or `top_k` sent | Yes, none unless set |
| Structured output uses `output_config.format`, never forced `tool_choice` | Yes, explicitly (`structuredOutputMode: "outputFormat"`) and by default on Sonnet 5.5 |
| Usage includes cache tokens | Yes: input split into uncached, cache read and cache write, plus output |
| A refusal is distinguishable | Yes: `finishReason: "content-filter"`, `rawFinishReason: "refusal"`; maps to `refused` |
| Streaming | Yes: text deltas, `effort` and final usage |

The conditions, built into P1:

1. **Pin the API version.** The provider sends `anthropic-version: 2023-06-01` unless told
   otherwise. `createAnthropic({ headers: { "anthropic-version": "2026-10-21" } })` overrides it
   (checked). The pinned version lives in the model capability records.
2. **Pin the structured-output mode** to `outputFormat` rather than relying on `auto`.
3. **Edge Functions import versions at least a day old.** Deno refuses npm versions published in
   the last 24 hours by default, as a supply-chain guard. Keep the guard: Edge code pins versions
   that have aged (the spike used ones at least a week old), the same spirit as the repo's lockfile
   policy.
4. **Footprint.** `ai` plus the Anthropic provider is 12 packages (about 29 MB, mostly `undici`),
   and `ai` pulls in Vercel's gateway client even when no gateway is used. Fine for server code,
   which is the only place `genesis-ai` imports the SDK.

Not yet verified:

- **A live call.** There is no API key in the environment the spike ran in. The same script with
  the real `fetch` and a key is the first step of P1.
- **Streaming to Expo with `expo/fetch` on a device.** P1 tasks are called by id and return whole
  results, so device streaming is first needed for client-facing chat (C3). It is checked then.

TanStack AI is still re-checked at the start of P1, as decided.

### P1 progress (2026-10-28)

Built, in `packages/ai` (`@marktiderman/genesis-ai`) and `packages/chat/src/ai`:

- `defineAi`, `defineTask` and `checkTasks`. Model records carry prices and capabilities; an
  unknown model fails `defineAi`, and a task whose models lack what it needs fails `checkTasks`
  (run by `createAiHandler` at startup). Prices are data through `modelRecords`.
- Vendors are adapters: `anthropic()` (the four P0 conditions: API version pinned, `outputFormat`
  pinned, aged versions, server-only SDK import) and `openai()` (Responses API,
  `reasoningEffort`). Aliases name model ids, with effort, opt-in prompt caching (`cache`),
  fallbacks and a flag-driven `rollout`.
- `runTask` and `streamTask` with every step of the pipeline above and its typed outcomes; a
  task's `load` can stop a call with `forbidden` or `invalid_input` before any model runs.
  Arguments and outputs take any schema the AI SDK takes (Zod 3 or 4, Standard Schema,
  `jsonSchema`); a prompt can be a conversation.
- BYOK: `genesis_ai.keys` in Supabase Vault, the person's key over the tenant's, own-key calls
  recorded with `key_source` and kept off the platform budget, a refused key reported as such.
- `wrap` for processors; `createAiHandler` (one endpoint, tasks by id, JSON only, same-origin,
  server-sent events for text tasks); `useAiTask` and `useAiStream`; `memoryStore`; `otelSink`
  for OpenTelemetry tracers; `evaluate` for task evals with a live key.
- The `genesis_ai` schema (an append-only `consents` log with policy versions, `budgets` with a
  per-person share, `keys`, `calls`) with `supabaseStore`, and its pgTAP test.
- `chat.recap` and `chat.draft-reply`, with the parity test passing: the same model, effort,
  refusal fallback, API version, system prompt and transcript as `createChatAssistant`. They
  import `zod/v4`, so apps on Zod 3.25 or 4 can install them.
- Review fixes: calls are priced by the model that answered, across every hop of a server-side
  fallback (`usage.iterations`); a failed schema attempt is billed; `streamTask` takes the
  caller's abort and closes the row on abort; Sonnet 5.5's cache-read price is $0.10 per million.

Where the build differs from this design, and why:

- **Functions, not a `createAi` object.** `runTask(ai, task, args, ctx)` and the rest take the
  `defineAi` result. One config object, no second wrapper to keep in step.
- **Keys are part of the store** (`keyFor`), not a second config knob: one service-role client
  already reads consent and budgets.
- **One `calls` table** holds open and finished calls, instead of `usage` plus `inflight`. A call
  open for more than 15 minutes stops reserving budget. `tenant_settings` waits for P2, which is
  the first thing that reads it.
- **Consent is an append-only log in `genesis_ai.consents`:** the latest row per person and
  vendor is the answer, the rest is the record. It moves to the `consent` block when that exists.
- **Parity is per field, not per byte.** The AI SDK sends the system prompt and the user turn as
  content blocks where chat's `fetch` sends strings; the test compares the text, model, effort,
  fallbacks, version and beta header.
- **The recap's output is text**, as `createChatAssistant` returns, so parity holds. A schema
  output can come with the recap's next version.

Not built yet, and why:

- **The doctor rules** (no client import of a task module or the AI config). They wait on
  package-declared doctor rules (genesis #454). Until then `/server` throws when it loads in a
  browser.
- **Spans in `core/observability`.** That is a core change (PACKAGE-STRATEGY M1); spans go to the
  `telemetry` sink, and `otelSink` sends them to any OpenTelemetry tracer.
- **A live call and a live recap eval.** They need `ANTHROPIC_API_KEY`, which the environment this
  was built in doesn't have; `evaluate` is the harness for them.
- **The TanStack AI re-check.** Not redone; the AI SDK stays behind the task API, so a later
  switch stays inside this package.

### The coaching track (after P2)

In order of risk, so trust and evaluation data build before the AI speaks to clients. Each stage
starts as a `features.ts` entry when an app is ready to use it.

| Stage | Scope | Exit |
|---|---|---|
| **C1 · Coach-side drafts** | Event and scheduled triggers; the coach review queue; check-in review drafts, reply drafts in the coach's voice, pre-session briefs and session summaries with action items; metric tools; grounded citations; the app's safety protocol; feedback log; scenario evals. **The AI never sends anything to a client unreviewed.** | Coaches accept most drafts with light edits (acceptance rate and edit distance tracked per kind) and save measurable time per check-in. |
| **C2 · The weekly loop and memory** | The weekly review over the `work` model, proposing changes as drafts; next agendas that carry forward open items; roll-ups; the memory block with review states and "what the AI knows about me". | A client's goals, plan and check-ins chain week to week through accepted drafts, and personalisation evaluations clear their bar. |
| **C3 · Bounded client-facing guidance** | A daily or weekly brief and an "ask" over the client's own data, scoped to the programme; safety routing mandatory; summaries of client conversations to the coach; the health-claims rule packs, after a legal read. | Safety-routing recall and claims compliance hold on the regression suite before release, and after every change. |
| **C4 · Proactive check-ins** | Event-triggered messages (missed sessions, a drop in adherence, a goal date approaching), capped per client, with quiet hours, through `notifications`. | Clients respond to them, and opt-outs stay low. |

## Decisions

Decided by the maintainer on 2026-10-28. Each is tracked in `features.ts`.

1. **Accepted:** the Vercel AI SDK is a dependency of `genesis-ai/server`, subject to P0, with
   TanStack AI re-checked at P1.
2. **Accepted:** a new `genesis_ai` schema in the app's Supabase, and the smallest `consent` block
   in P1 (`consent` is planned now).
3. **Accepted, later:** percentage rollouts in `genesis-features` (`flag-rollouts`). Until then,
   model rollouts go tenant by tenant.
4. **Accepted:** P0–P2 committed (`ai-providers` now, `ai-control-plane` next). The coaching track
   is the direction (`ai-coach-drafts`, `ai-weekly-loop`, `ai-memory`, `ai-client-guidance`,
   `ai-proactive-checkins`, all planned later), each stage starting when an app is ready.
   Everything else stays an idea until a second app asks (`agent-operable-apps`).
5. **Accepted:** Langfuse is an optional sink only.
6. **Accepted:** coach-side first. No AI output reaches a client without review until C3, and C3
   waits for a legal read of the health and coaching rules (still open).

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

## What changed in v0.3

- **New section: "How Genesis apps will use AI".** The owner's three uses (personalised
  guidance, client feedback, and progress that stacks) mapped to what the leading apps do and
  what Genesis needs, with four principles.
- **New reference doc:** [AI-COACHING-RESEARCH.md](./AI-COACHING-RESEARCH.md), with lessons from
  The earlier app's production AI and research on the leading fitness, health, coaching and goal apps.
- **The design adds:**
  - event and scheduled triggers;
  - person context in layers with a manifest;
  - audience-aware loading;
  - deterministic safety routing;
  - grounded citations;
  - numbers from code;
  - model capability records;
  - the coach review queue;
  - memory;
  - the weekly loop over the main app's `work` model;
  - feedback and evaluations;
  - debug capture with retention;
  - server-built conversation history;
  - health and coaching claim rules.
- **A coaching track (C1–C4) after P2**, coach-side first.
- **Corrected:** the main app's AI is wired but not live.

## What changed in v0.2

- **Scope cut to P0–P2:** a thin core plus a control plane. Retrieval, MCP, agents and on-device
  models are ideas.
- **The first consumer is the main app's real code**, with a parity test.
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
