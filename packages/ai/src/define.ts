import { MODEL_RECORDS, type CacheTtl, type ModelRecord } from "./models";
import { AI_SPEC, type AiContext, type AiStore, type AiVendor, type AliasFallbacks, type Capability, type Loaded, type SafetyProtocol, type TaskDefinition, type TelemetrySink } from "./types";

/** An AI SDK language model, structurally (so `.` doesn't import the SDK). */
export interface ModelLike {
  readonly modelId: string;
  readonly provider: string;
}

/**
 * A model vendor: how to build its models (on the platform's key, or a tenant's or person's own)
 * and the provider options a call on an alias sends. `anthropic()` from
 * `@marktiderman/genesis-ai/anthropic` and `openai()` from `/openai` are the two Genesis ships; a
 * vendor of your own is these two functions.
 */
export interface VendorAdapter {
  readonly id: AiVendor;
  /** The model for an id. `apiKey` is a BYOK key; without one, the platform's. */
  model(modelId: string, apiKey?: string): ModelLike;
  /** Provider options for one call on this alias, merged under the alias's own `providerOptions`. */
  options?(alias: ResolvedAlias, record: ModelRecord, call: { structured: boolean }): Record<string, Record<string, unknown>> | undefined;
}

export interface AliasConfig {
  /** A model id with a record (`claude-sonnet-5-5`). Code names the alias, never this. */
  model: string;
  /** Effort for every call on this alias (`output_config.effort` on Anthropic, `reasoningEffort` on OpenAI). */
  effort?: "none" | "low" | "medium" | "high" | "xhigh" | "max" | undefined;
  /**
   * Prompt caching, which is opt-in on Anthropic: the API caches up to the last cacheable block
   * and reuses it while it lives. Worth it when the system prompt and stable context run past
   * the model's minimum (512 tokens on the 5.x models). OpenAI caches on its own. Default: off.
   */
  cache?: CacheTtl | undefined;
  /** Extra provider options, merged over the vendor's (effort, fallbacks, structured output). */
  providerOptions?: Record<string, Record<string, unknown>> | undefined;
  fallbacks?: AliasFallbacks | undefined;
  /**
   * Moves some calls to another model, such as a new release behind a flag: `when` decides per
   * call (`(ctx) => flag("ai-sonnet-6", ctx)`). The usage row records the model that ran, so a
   * rollout's cost and outcomes compare with the alias's own.
   */
  rollout?: { model: string; when: (ctx: AiContext) => boolean | Promise<boolean> } | undefined;
}

export interface AiConfig {
  /** The vendors whose models the aliases use. */
  vendors: readonly VendorAdapter[];
  models: Record<string, AliasConfig>;
  store: AiStore;
  /**
   * The feature gate: is this feature on for this person and tenant? Pass `featureOn` from
   * genesis-features through it, with the global and per-tenant AI switches folded in.
   */
  gate: (ctx: AiContext, feature: string) => boolean | Promise<boolean>;
  /** The app's safety protocol, run before the model on tasks with `safetyText`. */
  safety?: SafetyProtocol | undefined;
  telemetry?: TelemetrySink | undefined;
  /** Whether this tenant allows falling back to another vendor on an outage. Default: never. */
  crossVendorFallback?: ((ctx: AiContext) => boolean) | undefined;
  /** Retries per model before an `unavailable` fallback (the SDK's own retry). Default 2. */
  maxRetries?: number | undefined;
  /** Abort a model call after this long. Default 60 s. */
  timeoutMs?: number | undefined;
  /** Records for models not in Genesis's table, or to override a price. */
  modelRecords?: Record<string, ModelRecord> | undefined;
  /** The version of the consent text people agree to. When set, older consent doesn't count. */
  consentVersion?: string | undefined;
}

export interface ResolvedAlias extends AliasConfig {
  name: string;
  record: ModelRecord;
  rolloutRecord: ModelRecord | null;
}

export interface Ai {
  readonly config: AiConfig;
  alias(name: string): ResolvedAlias;
  /** The record for a model id, such as the one a server-side fallback answered with. */
  record(modelId: string): ModelRecord | undefined;
  vendor(id: AiVendor): VendorAdapter;
}

/**
 * Checks and freezes an app's AI configuration. Every alias and rollout must resolve to a model
 * record (no billing at a guess) whose vendor is configured, and every fallback must name an alias
 * that exists.
 */
export function defineAi(config: AiConfig): Ai {
  const records = { ...MODEL_RECORDS, ...config.modelRecords };
  const vendors = new Map(config.vendors.map((v) => [v.id, v]));
  const recordOf = (alias: string, model: string): ModelRecord => {
    const record = records[model];
    if (!record) throw new Error(`defineAi: alias "${alias}" uses model "${model}", which has no model record. Add it to modelRecords.`);
    if (!vendors.has(record.vendor)) throw new Error(`defineAi: alias "${alias}" uses ${record.vendor}, which isn't in vendors.`);
    return record;
  };
  const aliases = new Map<string, ResolvedAlias>();
  for (const [name, alias] of Object.entries(config.models)) {
    aliases.set(name, { ...alias, name, record: recordOf(name, alias.model), rolloutRecord: alias.rollout ? recordOf(name, alias.rollout.model) : null });
  }
  for (const alias of aliases.values()) {
    for (const next of alias.fallbacks?.unavailable ?? []) {
      if (!aliases.has(next)) throw new Error(`defineAi: alias "${alias.name}" falls back to "${next}", which is not an alias.`);
      if (next === alias.name) throw new Error(`defineAi: alias "${alias.name}" falls back to itself.`);
    }
  }
  return Object.freeze({
    config,
    alias(name: string): ResolvedAlias {
      const found = aliases.get(name);
      if (!found) throw new Error(`genesis-ai: no model alias "${name}".`);
      return found;
    },
    record: (modelId: string) => records[modelId],
    vendor(id: AiVendor): VendorAdapter {
      const found = vendors.get(id);
      if (!found) throw new Error(`genesis-ai: no vendor "${id}".`);
      return found;
    },
  });
}

const TASK_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

/** Checks a task definition. Tasks are server-only modules: never import one into client code. */
export function defineTask<Args, L extends Loaded, Out = { text: string }, Db = unknown>(
  task: TaskDefinition<Args, L, Out, Db>,
): TaskDefinition<Args, L, Out, Db> {
  if (!TASK_ID.test(task.id)) throw new Error(`defineTask: "${task.id}" is not a valid task id (lowercase, dots or dashes).`);
  if (!Number.isInteger(task.version) || task.version < 1) throw new Error(`defineTask ${task.id}: version must be a positive integer.`);
  if (!Number.isInteger(task.maxTokens) || task.maxTokens < 1) throw new Error(`defineTask ${task.id}: maxTokens must be a positive integer.`);
  if (task.spec !== undefined && task.spec !== AI_SPEC) throw new Error(`defineTask ${task.id}: spec ${String(task.spec)} isn't supported (this genesis-ai reads spec ${AI_SPEC}).`);
  return Object.freeze({ ...task, spec: AI_SPEC });
}

/**
 * Checks tasks against the models they can land on (the alias, its rollout and its fallbacks):
 * each must have every capability the task needs. Run at startup, so a model change that drops
 * one fails the deploy, not a call. `createAiHandler` runs it on the tasks it serves.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tasks of every shape
export function checkTasks(ai: Ai, tasks: readonly TaskDefinition<any, any, any, any>[]): void {
  for (const task of tasks) {
    const needs = new Set<Capability>(task.needs ?? []);
    if (task.output !== "text") needs.add("structuredOutput");
    const alias = ai.alias(task.model);
    const reachable = [alias, ...(alias.fallbacks?.unavailable ?? []).map((n) => ai.alias(n))];
    for (const a of reachable) {
      for (const record of [a.record, a.rolloutRecord]) {
        if (!record) continue;
        for (const need of needs) {
          if (!record.capabilities.includes(need)) throw new Error(`checkTasks: ${task.id} needs ${need}, which ${record.id} (alias "${a.name}") lacks.`);
        }
      }
    }
  }
}
