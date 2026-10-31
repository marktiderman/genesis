# @marktiderman/genesis-ai

## 0.2.0

### Minor Changes

- ee0100f: The AI contract's "now" items, all additive. `AiContext` gains `actor` (`"person"` by default, `"agent"` or `"system"`), `runId` and `conversationId`; they go on the span (`genesis.ai.actor`, `genesis.ai.run_id`, `gen_ai.conversation.id`) and to the store's `begin`. `RunEvent` is a union named after AG-UI's events (`RUN_STARTED`, `TEXT_MESSAGE_*`, `TOOL_CALL_*`, `STATE_DELTA`, `RUN_FINISHED`, `RUN_ERROR`, and `CUSTOM` named `genesis.interrupt` for an approval pause); `createAiHandler` streams them with `stream: "events"` (`stream: true` is unchanged), `textStreamToRunEvents` converts today's stream, and `useAiStream` reads both. `AiStore` is split into ports (`ConsentStore`, `BudgetStore`, `UsageStore`, `KeyStore`) that it extends. `defineTask` stamps `spec: 1` (`AI_SPEC`) and refuses another spec. A wrapped processor's span is now named `{operation} {id}` (for example `moderation chat.moderate`), as OpenTelemetry's GenAI conventions name spans; it was `{id} {vendor}`.
- e68ba61: `evaluate` takes scorers (`{ scorers: [{ name, score(case, result) => { pass, score?, note? } }] }`) and reports every score (`report.scores`); a case passes when its `check`, now optional, and every scorer pass. A case can carry `expected` for scorers to compare against. The target can be a task or any `{ id, version, run(args, ctx) }`, so agents and tool trajectories evaluate the same way once they exist. `EvalReport` gains `scores` (empty without scorers). Two type changes: `EvalReport.scores` is always present, and `EvalCase.check` is optional (code that calls `c.check(...)` directly checks it first).

### Patch Changes

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

## 0.1.1

### Patch Changes

- 3d249bc: New package: `@marktiderman/genesis-ai`, one server-side pipeline for every AI call a Genesis app makes (docs/AI.md, P1).

  - `defineAi`: vendors (`anthropic()` from `/anthropic`, `openai()` from `/openai`, or your own adapter), model aliases naming model ids with effort, prompt caching (`cache`), fallbacks and a flag-driven `rollout`, checked against model records (prices and capabilities) that fail on an unknown model; `modelRecords` adds models or changes prices without a release. `defineTask`: a versioned prompt with typed `args` (any schema the AI SDK takes), a server-side `load` that records a context manifest, a string or conversation prompt, text or schema output, `consent` and `needs`. `checkTasks` fails at startup when a task's models lack what it needs.
  - `/server`: `runTask` and `streamTask` run consent → gate → `can` → load → safety routing → input guardrails → budget admission → the model (rollout, same-vendor outage fallbacks, Anthropic's server-side refusal fallback priced by the models that ran, structured output as `output_config.format`, one billed repair retry) → output guardrails → a usage row with no content and an OpenTelemetry GenAI span. Every stop is a typed outcome. `wrap` puts a processor (moderation, transcription) through the same steps. `createAiHandler` serves tasks by id over one web-standard endpoint (JSON only, same-origin, server-sent events with `stream: true`). `otelSink`, `evaluate` and `memoryStore`.
  - BYOK: a tenant or person brings their own vendor key (`genesis_ai.set_key`, kept in Supabase Vault). The person's key wins over the tenant's; own-key calls are recorded but don't spend the platform budget; a refused key is reported as such.
  - `/supabase`: `supabaseStore` over the `genesis_ai` schema (`migrations/0001_genesis_ai.sql`: an append-only consent log with policy versions, monthly budgets with per-person shares and open-call limits, BYOK keys and the calls record), with its pgTAP test.
  - `/react`: `useAiTask(id)` and `useAiStream(id)`, which send ids, never content.
  - Doctor rules in `genesis.doctor`: browser code never imports the server side (`ai-server-on-server`), and model calls go through a task, not a direct SDK import (`ai-calls-through-genesis-ai`).
