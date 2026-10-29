# ADR 0006: AI direction: agents inside genesis-ai, MCP next

- Status: accepted (direction; the items below are built in later PRs)
- Date: 2026-10-29
- Features: `ai-providers`, `ai-control-plane`, `agent-operable-apps`
- Related: [AI.md](../AI.md) (the pipeline, P0 to P2), [ADR 0005](./0005-package-layers.md)
  (layers), [REFERENCES.md](../REFERENCES.md) (Vercel AI SDK, MCP).

## Context

`genesis-ai` runs every AI call an app makes through one pipeline: consent, the feature gate,
`can`, budgets, key resolution (person, then tenant, then platform), a safety check, guardrails, a
usage row with no content, and a trace span. Today it has tasks (`defineTask`), a one-step call
with typed input and output. The next needs are tools, agents (a loop over tools), apps that
outside agents can operate, and agent tooling for the people and coding agents who build Genesis
apps.

The leading agent SDKs (the Vercel AI SDK, OpenAI Agents, Mastra, Google ADK, Pydantic AI,
LangGraph, Cloudflare Agents, the Claude Agent SDK) converge on one core holding the abstractions,
with adapters for vendors, storage, UI and observability versioned around it. They break their APIs
at the same seams: the step loop, the tool context, the event stream and the storage interface.
None of them combines data-sharing consent, tenant budgets, per-tenant keys and loading data as the
person under row-level security; an agent framework with its own loop, storage and memory would
route around all four.

Genesis also has a private `packages/agents` holding contributor rules, whose name collides with
the runtime meaning of "agents" every SDK uses.

## Decision

### 1. One kernel: agents live inside genesis-ai

`genesis-ai` stays the single AI kernel (primitive layer, group `ai`). Tools, toolsets and agents
are new entry points, not new packages:

- root (no SDK, React or secrets): `defineTask`, `defineTool`, `defineToolset`, `defineAgent`;
- `/server` (the only place the AI SDK loads): `runAgent`, `streamAgent`, `evaluate`;
- `/react`: `useAiTask`, `useAiStream`, `useAgentRun`.

Every agent step goes through the existing pipeline. A tool runs with the caller's context (their
RLS client), never a service key, and declares `risk: "read" | "write" | "destructive" |
"external"`, which drives approvals. Vendor adapters stay subpaths (`/anthropic`, `/openai`) until
one needs a heavy SDK. Domain packages contribute tasks and tools through an optional `/ai`
subpath (`genesis-chat/ai`). The name `genesis-ai-agents` is reserved for a split only if durable
execution brings heavy dependencies.

**Mastra is not adopted**, nor any agent framework: its loop, storage and memory would bypass
consent, budgets and RLS loading. Graphs, workflow DSLs, crews and networks are not standardised;
tasks compose as plain TypeScript.

### 2. Contracts fixed now, before agent code exists

- **`AiContext`** gains `actor: "person" | "agent" | "system"`, `runId` and an optional
  `conversationId` (additive).
- **Run events** use AG-UI's names: `RUN_STARTED`, `TEXT_MESSAGE_CONTENT`,
  `TOOL_CALL_START` / `TOOL_CALL_ARGS` / `TOOL_CALL_END`, `TOOL_CALL_RESULT`, `STATE_DELTA`,
  `INTERRUPT` (an approval), `RUN_FINISHED`, `RUN_ERROR`. The vocabulary is adopted now, while only
  `useAiStream` consumes the stream; a dependency on `@ag-ui/core` comes later, if ever.
- **`spec: 1`** on every definition (task, tool, toolset, agent), versioned apart from the package,
  as the AI SDK's provider spec and MCP's dated specs are.
- **Store ports:** the single `AiStore` splits into `KeyStore`, `BudgetStore`, `UsageStore`,
  `ConsentStore`, later `RunStore`, `ApprovalStore` and `MemoryStore`; one `supabaseStore()`
  implements them all.
- **Traces** use the OpenTelemetry GenAI span names (`chat {model}`, `execute_tool {tool}`,
  `invoke_agent {agent}`), with the convention version pinned because it is still in Development
  status.

### 3. genesis-mcp is the next AI package, read-only first

`genesis-mcp` (primitive, group `ai`) serves an app as an MCP server: tools generated from
resources and view actions, plus hand-written `defineTool`s, and resources. It depends on `core`,
`connect` and the SDK-free `genesis-ai` root, never the reverse, and ships in lockstep with
`genesis-ai`. An MCP token is a Supabase user token (Supabase Auth's OAuth 2.1 server), so every
tool runs as that person under RLS; because RLS is then the whole boundary, every generated
function gets pgTAP coverage. It starts with `risk: "read"` tools only and adds writes together
with server-issued, one-use approvals bound to the arguments' hash. Consuming outside MCP servers
comes later, per tenant, behind an allowlist, as `risk: "external"` and untrusted.

### 4. Agent UI stays in the existing packages

Headless state lives in `genesis-ai/react`. Presentational parts (`AiBadge`, `ApprovalSheet`,
`ToolCallCard`, `RunTrace`) go in `genesis-ui` and `genesis-ui-native`, take plain props and import
nothing from `genesis-ai`, so the foundation layer stays clean. The conversation surface stays
`genesis-chat` (the assistant is a chat member). No `genesis-ai-ui` until AI UI needs a dependency
`genesis-ui` must not have.

### 5. Coding-agent tooling: packages/agents retires

- `packages/agents` retires. Its `RULES.md` moves to `docs/agents/RULES.md`; the rules a script
  can check move into `genesis-cli` (doctor, hooks, `genesis agents`).
- A future **`genesis-plugin`** (tooling, group `core`) takes its seat as the distributable kit:
  Agent Skills, hooks (the doctor on PreToolUse), reviewer subagents and a docs MCP server, in the
  Claude Code and Codex layouts, both generated from one source in `genesis-cli`. The generated
  AGENTS.md block stays the floor for tools without plugins.
- Naming rule: runtime AI packages are `genesis-ai` or `genesis-ai-*` (`genesis-mcp` is the
  exception, because MCP covers the whole app); tooling packages never contain "agents" or "ai".

## Consequences

- Build order: the contract items in section 2 first (cheap now, breaking later), then
  `defineTool` and `defineToolset`, then `genesis-mcp` read-only, then `defineAgent` with runs,
  approvals and per-step budgets (`maxSteps` × estimate, so a loop can't pass the limit mid-run).
- Durable runs use a runs table plus `genesis-supabase/jobs`, in the same database under the same
  RLS. `@ai-sdk/workflow` is re-checked when the first run longer than one request appears.
- A2A is not adopted for now (no cross-organisation agent peers). MCP Tasks and Apps are watched.
- `genesis-ai` stays 0.x until these contracts settle.

## Alternatives considered

- **Adopt an agent framework (Mastra).** Rejected: its runtime owns the loop, storage and memory,
  so consent, tenant budgets, BYOK and RLS loading would have to be rebuilt around it.
- **A separate `genesis-agents` runtime package now.** Rejected: tools and agents share the
  pipeline and context with tasks; a split is reserved for heavy durable-execution dependencies.
- **A dedicated AI UI kit (assistant-ui, CopilotKit).** Rejected for now: web-first, each with its
  own runtime and thread model, a second framework beside Genesis.
- **Keep `packages/agents`.** Rejected: the name collides with runtime agents, and rules a script
  can check belong in the CLI.
