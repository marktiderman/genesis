---
"@marktiderman/genesis-ai": minor
---

New package: `@marktiderman/genesis-ai`, one server-side pipeline for every AI call a Genesis app makes (docs/AI.md, P1).

- `defineAi`: vendors (`anthropic()` from `/anthropic`, `openai()` from `/openai`, or your own adapter), model aliases naming model ids with effort, prompt caching (`cache`), fallbacks and a flag-driven `rollout`, checked against model records (prices and capabilities) that fail on an unknown model; `modelRecords` adds models or changes prices without a release. `defineTask`: a versioned prompt with typed `args` (any schema the AI SDK takes), a server-side `load` that records a context manifest, a string or conversation prompt, text or schema output, `consent` and `needs`. `checkTasks` fails at startup when a task's models lack what it needs.
- `/server`: `runTask` and `streamTask` run consent → gate → `can` → load → safety routing → input guardrails → budget admission → the model (rollout, same-vendor outage fallbacks, Anthropic's server-side refusal fallback priced by the models that ran, structured output as `output_config.format`, one billed repair retry) → output guardrails → a usage row with no content and an OpenTelemetry GenAI span. Every stop is a typed outcome. `wrap` puts a processor (moderation, transcription) through the same steps. `createAiHandler` serves tasks by id over one web-standard endpoint (JSON only, same-origin, server-sent events with `stream: true`). `otelSink`, `evaluate` and `memoryStore`.
- BYOK: a tenant or person brings their own vendor key (`genesis_ai.set_key`, kept in Supabase Vault). The person's key wins over the tenant's; own-key calls are recorded but don't spend the platform budget; a refused key is reported as such.
- `/supabase`: `supabaseStore` over the `genesis_ai` schema (`migrations/0001_genesis_ai.sql`: an append-only consent log with policy versions, monthly budgets with per-person shares and open-call limits, BYOK keys and the calls record), with its pgTAP test.
- `/react`: `useAiTask(id)` and `useAiStream(id)`, which send ids, never content.
- Doctor rules in `genesis.doctor`: browser code never imports the server side (`ai-server-on-server`), and model calls go through a task, not a direct SDK import (`ai-calls-through-genesis-ai`).
