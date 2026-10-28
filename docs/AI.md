# Genesis AI: one place for every AI call an app makes

Design v0.1, 2026-10-28. Status: **proposal, for review by the maintainer**. Feature:
`ai-providers` (`idea` in `features.ts`). Context: [PACKAGE-STRATEGY.md](./PACKAGE-STRATEGY.md).

## The problem

AI calls are starting to appear in Genesis one domain at a time:

| Where | What | Provider, written by hand |
|---|---|---|
| `chat/src/server/assistant.ts` | Recap and reply drafts | Anthropic Messages API, by `fetch` or SDK; own model default, fallback beta, timeout and prompt-injection fencing |
| `chat/src/server/moderation.ts` | Message and image moderation | OpenAI moderation, own thresholds |
| `chat/src/server/transcribers.ts` | Voice note transcripts | Deepgram and OpenAI, own timeouts |
| `FORMS.md` (planned) | "Create a form from this description", scoring rules, translation | — |
| `SITES.md` (planned) | Sitemap, sections and copy from a prompt and a brand, validated against section schemas | — |

Every domain that adds AI this way repeats the same work and the same gaps:

- choosing and pinning a model;
- keeping a key;
- writing a prompt with injection defences;
- parsing output;
- handling fallbacks.

None of them records what a call cost, who made it, which prompt version produced it or whether
it was any good. Upgrading a model, tightening a safety rule or adding tracing means editing
every domain.

## The goal

> Every AI call in an app goes through one layer. Upgrading a model, a prompt, a safety rule or
> the tracing happens once, and every feature on every app benefits.

In Genesis terms: an AI feature is **configuration** (a task: a prompt, a schema, a model alias),
not custom code (G1, G2). The provider client, retries, metering, guardrails and UI are written
once (G5).

Non-goals:

- **Our own provider abstraction or agent loop.** Those exist and are well maintained (see "Build
  on").
- **A prompt console as the source of truth.** Prompts are reviewed code. As of 2026-10-28,
  OpenAI's [deprecations page](https://developers.openai.com/api/docs/deprecations) retires its
  hosted prompts, Agent Builder and Evals on 2026-11-30 and points users to keeping prompts in
  application code.
- **Training or hosting models.**

## What the leaders do

| Who | Pattern | What we take |
|---|---|---|
| **Linear** | Picks providers per task (OpenAI and Google; small models first, larger ones later). One semantic search backend serves similar issues, triage and search. AI suggestions are visually distinct from human data, with reasoning on hover and a trace panel. Admins add natural-language guidance per workspace or team. Third-party agents are app users with typed activities (thought, action, elicitation, response, error). | Model aliases by task. One retrieval layer. A standard "AI touched this" UI. Tenant guidance. An activity model for agents. |
| **Cursor** | Small in-house models for high-volume, low-latency work (Tab, apply); frontier models for the agent. Incremental, content-hashed, permission-aware indexing. Rules are advice; hooks are enforcement. | Route by task cost. Index by content hash and respect permissions. Separate prompts (advice) from guardrails (enforced). |
| **Vercel** | AI SDK: one model interface for every provider, `useChat` on web and Expo, tool approvals, OpenTelemetry built in, an optional gateway. | Build on it. |
| **Raycast** | Extension commands double as AI tools; every tool call needs the user's approval by default. Providers are bring-your-own. | Commands become tools. Approval by default. BYOK. |
| **Anthropic**, [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) and [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Start with the simplest thing that works. The unit is the "augmented LLM" (model plus retrieval, tools and memory). Prefer workflows (chaining, routing, parallel, evaluator) over autonomous agents. Invest in tool design. Context is a budget: put a stable prefix first for caching and retrieve just in time. | **Tasks** (workflows) are the main concept; agents are the exception. |
| **OpenAI**, [A practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf) | Agent = model + tools + instructions. Start with a single agent. Layer guardrails (relevance, safety, PII, moderation, tool risk ratings, human handoff). Build evals early, then move to cheaper models where quality holds. | Guardrails as a stack. Tool risk levels. Evals in CI before swapping models. |

What they agree on: keep orchestration in your own code, use workflows before agents, put
guardrails at the edges, trace everything and make evals part of shipping.

## Build on, build ourselves

| Concern | Choice | Why |
|---|---|---|
| Model interface, streaming, tools, structured output, agents | **[Vercel AI SDK 7](https://vercel.com/blog/ai-sdk-7)** (`ai`, `@ai-sdk/*`) | The TypeScript default: every major provider, Zod schemas, `useChat` with an [official Expo path](https://ai-sdk.dev/docs/getting-started/expo), tool approvals, OpenTelemetry built in, a durable `WorkflowAgent`, on-device providers. |
| Chat UI primitives | **[assistant-ui](https://www.assistant-ui.com/)**: `@assistant-ui/react` and `@assistant-ui/react-native`, themed with Genesis components | One runtime on web and native; unstyled, so Genesis supplies the look. AI Elements is web-only. |
| Traces, prompt experiments, datasets, scores | **[Langfuse](https://langfuse.com/)** (MIT, self-hostable; accepts OpenTelemetry), behind the observability sink contract | Open source; AI SDK telemetry plugs straight in. Optional: the console sink works without it. |
| Evals in CI | **[evalite](https://v1.evalite.dev)** (Vitest-based `.eval.ts` files) or **[promptfoo](https://www.promptfoo.dev/)** | Runs under `pnpm test`, and score thresholds fail CI. |
| Gateway | **Optional**, set in config: Vercel AI Gateway or Cloudflare AI Gateway. Calling providers directly must keep working. | Budgets and fallbacks at the gateway are a backstop; the real limits live in our database. |
| External tools | **MCP** (spec 2026-07-28) | The standard; Linear, Supabase and Cursor all use it. |
| Embeddings and retrieval | **pgvector** in the app's Supabase, with Postgres full-text search | No new service; RLS applies to retrieval. |

Avoid (as of 2026-10-28):

- **Helicone.** It has been in maintenance mode since Mintlify acquired it on 2026-03-03
  ([announcement](https://www.mintlify.com/blog/mintlify-acquires-helicone)).
- **Self-hosted LiteLLM** without pinned versions and verified hashes. Malicious PyPI releases
  1.82.7 and 1.82.8 were published on 2026-03-24
  ([NetSPI](https://www.netspi.com/blog/executive-blog/ai-ml-pentesting/litellm-supply-chain-compromise/)).
  A second compromise in October 2026 is reported by
  [Datadog Security Labs](https://securitylabs.datadoghq.com/articles/litellm-compromised-pypi-docker.md),
  which we have not confirmed independently.
- **OpenAI's hosted prompts and Evals**, which are retiring (see Non-goals).
- **Humanloop.** It is reported to have shut down in September 2025 after its team joined
  Anthropic. We found only secondary sources for this, but it is not a candidate either way.

**Genesis owns:** model aliases, the task registry, tool policy, usage and budgets, guardrails,
the gate, tracing attributes, the UI conventions and the `genesis_ai` schema. That is a thin,
typed policy layer over the AI SDK.

## The design

### Package shape

`@marktiderman/genesis-ai`, shaped like `chat` (headless core, hooks, renderers, server):

| Subpath | Contents |
|---|---|
| `.` | `defineAi`, `defineTask`, `defineTool`, aliases and types. No React, no server secrets. |
| `/server` | `createAi(config, ctx)`: `run`, `stream`, `embed`, `agent`. Usage and budgets, guardrails, the gate. Runs in Node and Edge Functions. |
| `/providers` | Moderation, transcription and embedding implementations (moved out of `chat`), and model presets. |
| `/react` | `useAiTask`, `useAiChat` (an AI SDK transport authenticated with the Supabase session; `expo/fetch` on native). |
| `/web`, `/native` | Chat surfaces on assistant-ui, themed with `ui` and `ui-native`. AI UI primitives: `AiLabel`, `AiSuggestion` (accept, edit, reject), `AiReasoning` (trace disclosure), `ToolApproval`. |
| `/rag` | Chunking, `embed`, indexing jobs on `genesis_jobs`, hybrid search SQL functions under RLS. |
| `/evals` | Helpers for `.eval.ts` files: datasets, scorers, thresholds. |
| `/mcp` | Expose tools (and later commands and resources) as an MCP server; consume remote MCP servers as tools. |
| `migrations/` | The `genesis_ai` schema: `usage`, `budgets`, `tenant_settings` (guidance, BYOK key reference, model overrides), `prompt_overrides`, `embeddings`. |

### One config file per app

```ts
// ai.config.ts
import { defineAi } from "@marktiderman/genesis-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

export const ai = defineAi({
  // Aliases by task cost, the Cursor and Linear pattern. Upgrading a model is one line.
  models: {
    fast:    { model: anthropic("claude-haiku-5-5"),  fallbacks: [openai("gpt-…-mini")] },
    default: { model: anthropic("claude-sonnet-5-5"), fallbacks: ["fast"] },
    smart:   { model: anthropic("claude-opus-5-5") },
    embed:   { model: openai.embedding("text-embedding-3-small"), dimensions: 1536 },
  },
  // Server-only. Keys come from the server environment or, per tenant, from `connect` (BYOK);
  // ai.config.ts is imported only by server code, never bundled for the client.
  moderation: openAiModerator({ apiKey: env.OPENAI_API_KEY }),        // the same factory as chat's today
  transcription: deepgramTranscriber({ apiKey: env.DEEPGRAM_API_KEY }),
  budgets: { tenant: { monthlyUsd: 50 }, person: { dailyCalls: 200 } },
  guardrails: [injectionFence(), piiRedaction(), outputModeration()],
  telemetry: { sinks: [langfuseSink()], captureContent: "preview-only" },
  gateway: undefined,                     // or vercelGateway() / cloudflareGateway()
});
```

### Tasks are the unit

A task is a workflow step, in Anthropic's sense: a versioned prompt with typed input and output,
a model alias and the feature it belongs to. Most AI in an app is tasks, not agents.

```ts
// chat's recap, rewritten as configuration
export const recap = defineTask({
  id: "chat.recap",
  version: 3,                 // bumped on any prompt change; recorded on every call and trace
  feature: "chat",            // featureOn decides whether it runs here, for this tenant and person
  model: "fast",
  input: z.object({ messages: z.array(AssistantMessage), since: z.string().nullable() }),
  output: z.object({ text: z.string().min(1) }),   // the same text createChatAssistant returns today
  system: RECAP_SYSTEM,       // the stable prefix first, so it caches
  prompt: (input) => fence("transcript", transcriptLines(input)),   // fenced data, not instructions
  label: "ai",                // results carry provenance; the UI must show it
});
```

On the server, `ai.run(recap, input, ctx)` does the same steps every time, in order:

1. **Gate.** `requireFeature(registry, ctx, task.feature)` for the task. Under `ai.agent`, each
   tool call also checks `requireFeature(registry, ctx, tool.feature)`, so an enabled task cannot
   run a tool whose feature is off. A global AI switch and a per-tenant AI switch apply to both.
   Every AI feature gets a kill switch for free.
2. **Reserve budget.** In one transaction, reserve the call's worst-case cost (input estimate plus
   `maxTokens` at the model's price) against the tenant's and the person's budgets in
   `genesis_ai.budgets`, locking the budget rows. If either would go over, refuse with a typed
   error the UI can explain. Concurrent runs therefore cannot both pass on the same remaining
   budget. Step 6 settles the reservation to the actual cost, or releases it on failure; a
   reservation left open by a crashed run expires after the call's timeout.
3. **Input guardrails.** Run the configured stack: injection fencing, PII redaction, moderation.
4. **Call.** Resolve the alias, including any tenant override or BYOK key from `connect`. Call the
   AI SDK with fallbacks, timeouts and provider caching, and validate the output against the
   schema with one repair retry.
5. **Output guardrails.** Moderation and an allowlist of output formats.
6. **Record and settle.** Write a `genesis_ai.usage` row and settle the reservation in the same
   transaction. The row holds metadata only: tenant, person, task id and version, model, input,
   cached and output **token counts**, cost, latency and outcome. It never holds prompt text,
   messages or output. Rows are readable under RLS by the tenant's admins and by the person for
   their own rows, are written only by the server, and are kept for 13 months by default (an app
   setting). Emit an OpenTelemetry span with GenAI attributes through `genesis-observability`.
   Prompt and response content goes to traces only when `telemetry.captureContent` allows it,
   scrubbed with the observability scrubber.
7. **Return** `{ output, model, taskVersion, labelled: true }`.

`ai.stream` does the same around a streaming chat. `ai.agent` wraps the AI SDK's `ToolLoopAgent`
with the same steps on every tool call, plus the approval check below.

### Tools carry policy

```ts
defineTool({
  id: "tasks.create",
  input: CreateTask,
  risk: "write",              // read | write | destructive | external
  approval: "ask",            // destructive and external always ask
  feature: "tasks",
  run: (input, ctx) => ctx.data.create("tasks", input),   // through the DataProvider, as the person, under RLS
});
```

**Approval is enforced on the server, not in the UI.** When a tool's `approval` is `ask` (and
always for `destructive` and `external` tools), the server executor pauses the agent and issues
a one-use approval token. The token is bound to the authenticated person, the tool id, a hash
of the exact input and the agent run, and it expires after a few minutes. `run` is only invoked
when the executor receives that token back unused and every binding still matches. `ToolApproval`
in the UI is only how a person grants the token; a caller that skips the UI has no token and
cannot reach `run`. This is the approval mechanism the AI SDK provides (`needsApproval`, signed
approvals in v7), with Genesis binding it to the person and the input.

After the command registry lands ([PACKAGE-STRATEGY.md](./PACKAGE-STRATEGY.md), M3), a command
can declare `tool: true` to become a tool. The palette, shortcuts, menus, the in-app assistant
and the app's MCP server then all read one definition.

### UI conventions

Following Linear: anything AI produced is marked, can be explained and is reversible.

- `AiLabel`: one look for "written by AI", on web and native. chat's `labelled: true` becomes
  the rule for every domain.
- `AiSuggestion`: accept, edit or dismiss, kept separate from data a person set.
- `AiReasoning`: a disclosure showing the reasoning or trace summary when the task allows it.
- `ToolApproval`: one approval sheet for tool calls marked to ask.

### Enforcing it

The "upgrade in one place" promise only holds if nothing goes around the layer:

- **A doctor rule.** `genesis-ai` declares a package rule (the mechanism in open PR #454) that
  flags direct imports of `openai`, `@anthropic-ai/sdk`, `@ai-sdk/*` providers or raw provider
  URLs outside `ai.config.ts`. It is the AI version of "no raw `<button>`" (G5).
- **Tasks in the feature registry.** Each task names its feature, so `pnpm features find`
  shows where AI is used.

## Migration of existing code

| Today | After | Breaking? |
|---|---|---|
| `createChatAssistant` (`recap`, `draftReply`), returning `{ text, model, labelled: true }` and throwing on HTTP errors, a refusal or an empty answer | **Unchanged, with its own code path, for one minor release.** New `chat.recap` and `chat.draftReply` tasks are added alongside it, opt-in. Both tasks declare `output: z.object({ text: z.string().min(1) })`, so `{ output: { text }, model }` maps to the old shape. `createChatAssistant` is marked deprecated, and removing it is a **major** change of `genesis-chat`, because the task path can also fail in new ways (feature off, over budget, guardrail refusal). | No while both exist; yes when it is removed |
| `openAiModerator(options)`, `deepgramTranscriber(options)`, `openAiTranscriber(options)` in `chat` | The same functions, with the same signatures, options, thresholds, timeouts, size limits, language detection and errors, move verbatim to `genesis-ai/providers`. `chat` re-exports them, so existing imports keep the same functions. The `Moderator` and `Transcriber` interfaces stay in `chat` (G2). | No |
| Forms "AI assist", Sites AI generation | Built as tasks from the start. Sites' Zod section schemas are already the output schemas. | — |

## Phases

| Phase | Scope | Exit |
|---|---|---|
| **P0 · Spike** (days) | Prove AI SDK 7 on Supabase Edge Functions (Deno; v7 is reported ESM-only and Node 22+), streaming to Expo with `expo/fetch`, and assistant-ui native on the RN starter. Confirm Anthropic structured-output status and prompt-caching behaviour through the AI SDK. | A written yes or no on the stack. If Deno fails, `/server` targets Node routes and the jobs runner, and Edge Functions call through a small proxy. |
| **P1 · Server core** | `defineAi`, aliases, `defineTask`, `run`, gate, budgets, usage migration, guardrail stack, telemetry (needs `genesis-observability`, M1). Move chat's three providers. Doctor rule. | Chat's recap and draft run as tasks; usage rows and traces appear. |
| **P2 · Client and UI** | `/react`, `/web`, `/native`; streaming chat endpoint; AI UI primitives; `defineTool` with approvals. | An assistant in `apps/sample` and the RN starter, on one runtime. |
| **P3 · Retrieval and evals** | `/rag` (pgvector, hybrid search, indexing jobs), `/evals` in CI, the Langfuse sink. | "Similar items" on a ResourceView; eval thresholds gate prompt changes. |
| **P4 · Agents and reach** | `ai.agent`, tools from commands, `/mcp` server and client, BYOK through `connect`, tenant guidance, the on-device provider ([`@react-native-ai/apple`](https://github.com/callstackincubator/ai)). | An outside agent can work in an app as a person, under RLS, with approvals. |

## Open questions

1. **AI SDK or our own `fetch` clients?** Genesis has preferred no dependencies (`connect`,
   `forms`). This proposal takes the AI SDK as a deliberate exception, because the provider
   surface changes monthly and the SDK absorbs that churn. P0 decides.
2. **Where do evals live**: in each domain package next to its tasks, or in the app?
   Proposal: both. Genesis tasks ship evals; apps add their own.
3. **Content capture.** Store prompt and response text for traces in production? Proposal: off
   by default, sampled when on, scrubbed with the observability scrubber.
4. **Cost source of truth.** Use a price table in the package (updated each release), or ask the
   gateway? Proposal: a price table, with the gateway's number recorded alongside when present.
