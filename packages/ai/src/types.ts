import type { ZodType } from "zod";

/**
 * Why a call ended. `ok` is the only success; every other value ends the call before or after
 * the model with something the UI can explain. None of them carries content.
 */
export type AiOutcome =
  | "ok"
  | "invalid_input"
  | "off"
  | "no_consent"
  | "forbidden"
  | "safety_routed"
  | "over_budget"
  | "refused"
  | "invalid_output"
  | "unavailable";

/** A vendor that sees a person's data: a model provider, or a processor such as moderation. */
export type AiVendor = string;

/**
 * Who a call runs as, built by the app on the server from a verified session (never from the
 * request body). `db` is whatever the app's loaders read with, as this person (for Supabase, the
 * caller's own client, so row level security applies).
 */
export interface AiContext<Db = unknown> {
  tenantId: string | null;
  personId: string;
  db: Db;
  /** Free for the app: roles, a gate snapshot, a request id. Never read by the pipeline. */
  meta?: Record<string, unknown> | undefined;
}

/** One layer of context a task's `load` used. Recorded on the usage row; never the content. */
export interface ContextLayerRecord {
  name: string;
  /** Rough token count (characters / 4) of what the layer contributed. */
  tokens: number;
  /** Ids of the rows the layer included (messages, check-ins, memories). */
  ids?: string[] | undefined;
}

/** Passed to `load`: the context plus a way to record what went into the prompt. */
export interface LoadContext<Db = unknown> extends AiContext<Db> {
  /** Record a context layer for the manifest. `text` is measured and dropped, never stored. */
  layer(name: string, text: string, ids?: readonly string[]): void;
}

/** A match from the app's safety protocol: the call ends with `safety_routed`. */
export interface SafetyRoute {
  /** A short category for logs and the UI ("crisis", "medical", "minor"). Never the text. */
  category: string;
  /** What the UI should show instead of a generated reply (resources, a message). */
  response?: string | undefined;
}

/** The app's deterministic safety protocol. No model decides; patterns or a classifier do. */
export type SafetyProtocol = (text: string, ctx: AiContext) => SafetyRoute | null | Promise<SafetyRoute | null>;

/** A guardrail over text. Return the text (possibly changed) or throw `GuardrailError`. */
export type Guardrail = (text: string, ctx: AiContext) => string | Promise<string>;

/**
 * Stops a call with a typed outcome and a message the UI can show. Thrown by a guardrail, or by a
 * task's `load` when there is nothing to do ("Nothing to catch up on yet") or the person may not
 * read what it needs (`forbidden`). Before the model, `invalid_output` is reported as `invalid_input`.
 */
export class GuardrailError extends Error {
  readonly outcome: "safety_routed" | "invalid_output" | "invalid_input" | "forbidden";
  constructor(message: string, outcome: "safety_routed" | "invalid_output" | "invalid_input" | "forbidden" = "invalid_output") {
    super(message);
    this.name = "GuardrailError";
    this.outcome = outcome;
  }
}

/** What `load` returns: the material the prompt is built from. */
export type Loaded = Record<string, unknown>;

/**
 * A task: a versioned prompt with typed arguments, a server-side loader and a typed output.
 * Clients send the task id and `args` (ids only); everything the model reads comes from `load`.
 */
export interface TaskDefinition<Args = unknown, L extends Loaded = Loaded, Out = unknown, Db = unknown> {
  id: string;
  /** Bumped on any prompt change; recorded on every usage row. */
  version: number;
  /** The FeatureId the gate checks. */
  feature: string;
  /** A model alias from `defineAi({ models })`. */
  model: string;
  /** The output cap for one call; also bounds the budget estimate. */
  maxTokens: number;
  /** What a client may send. Ids, never content the model will read. */
  args: ZodType<Args>;
  /** The app's rule for who may run it (e.g. "coaches only"). Default: anyone the gate allows. */
  can?: ((ctx: AiContext<Db>, args: Args) => boolean | Promise<boolean>) | undefined;
  /** Reads what the prompt needs, as the person. Record layers with `ctx.layer`. */
  load: (ctx: LoadContext<Db>, args: Args) => Promise<L>;
  /** The stable system prompt (first, so it caches). */
  system: string;
  /** The user turn, built from what `load` returned. */
  prompt: (loaded: L) => string | Promise<string>;
  /**
   * The output: `"text"` returns `{ text }` from plain text, or a schema for structured output
   * (sent as `output_config.format`, never a forced tool call).
   */
  output: "text" | ZodType<Out>;
  /** The text the safety protocol reads (what the person wrote). Omit for tasks that read none. */
  safetyText?: ((loaded: L) => string) | undefined;
  guardrails?: { input?: Guardrail[] | undefined; output?: Guardrail[] | undefined } | undefined;
}

/** Fallback policy for an alias. */
export interface AliasFallbacks {
  /** On 429, 5xx or a timeout, try these aliases in order. Same vendor unless the tenant opted in. */
  unavailable?: string[] | undefined;
  /** On a refusal: the provider's own server-side fallback where it has one, or fail with `refused`. */
  refusal?: "provider" | "fail" | undefined;
}

/** The parts of the result the store and the trace need. */
export interface AiUsage {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  /** For processors billed by quantity (audio minutes, calls). */
  quantity?: number | undefined;
}

/** A call the store has admitted, between `begin` and `finish`. */
export interface BeganCall {
  callId: string;
}

export interface BeginInput {
  tenantId: string | null;
  personId: string;
  taskId: string;
  taskVersion: number;
  vendor: AiVendor;
  model: string;
  /** Upper bound on this call's cost in USD, from `maxTokens` and the prompt size. */
  estimateUsd: number;
  /** Safety checks (moderation) are never stopped by a budget. */
  budgetExempt: boolean;
}

export interface FinishInput {
  callId: string;
  outcome: AiOutcome;
  model: string | null;
  usage: AiUsage | null;
  costUsd: number;
  latencyMs: number;
  manifest: ContextLayerRecord[];
  /** Short and content-free: a refusal category, a safety category, an error status. */
  detail?: string | undefined;
}

/**
 * Where calls are admitted and recorded. `begin` checks consent's partner (budget and
 * concurrency) and returns null when over budget; `finish` writes the usage row and returns its id.
 * `memoryStore()` is for tests and local work; `supabaseStore()` uses the genesis_ai schema.
 */
export interface AiStore {
  hasConsent(personId: string, vendor: AiVendor): Promise<boolean>;
  begin(input: BeginInput): Promise<BeganCall | null>;
  finish(input: FinishInput): Promise<string>;
}

/** One span for the trace, with OpenTelemetry GenAI attribute names. Never content. */
export interface AiSpan {
  name: string;
  startTime: number;
  endTime: number;
  attributes: Record<string, string | number | boolean>;
}

export type TelemetrySink = (span: AiSpan) => void;

/** The result of `run`: the output, or the outcome that ended the call. */
export type AiResult<Out> =
  | { ok: true; output: Out; model: string; taskVersion: number; usageId: string; labelled: true }
  | { ok: false; outcome: Exclude<AiOutcome, "ok">; message: string; usageId?: string | undefined; safety?: SafetyRoute | undefined };
