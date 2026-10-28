---
"@marktiderman/genesis-ai": minor
---

New package: `@marktiderman/genesis-ai`, one server-side pipeline for every AI call a Genesis app makes (docs/AI.md, P1).

- `defineAi` (model aliases with effort and fallbacks, checked against a price table that fails on an unknown model) and `defineTask` (a versioned prompt with typed `args`, a server-side `load` that records a context manifest, and text or schema output).
- `/server`: `runTask` and `streamTask` run consent → gate → `can` → load → safety routing → input guardrails → budget admission → the model (same-vendor outage fallbacks, Anthropic's server-side refusal fallback, structured output as `output_config.format`, one repair retry) → output guardrails → a usage row with no content and an OpenTelemetry GenAI span. Every stop is a typed outcome. `wrap` puts a processor (moderation, transcription) through the same consent, gate, budget and usage steps. `createAiHandler` serves tasks by id over one web-standard endpoint. `memoryStore` for tests.
- `/anthropic`: `createGenesisAnthropic`, the AI SDK provider pinned to API version 2026-10-21.
- `/supabase`: `supabaseStore` over the `genesis_ai` schema (`migrations/0001_genesis_ai.sql`: consents, monthly budgets with bounded overshoot and open-call limits, and the calls record), with its pgTAP test.
- `/react`: `useAiTask(id)`, which sends ids, never content.
