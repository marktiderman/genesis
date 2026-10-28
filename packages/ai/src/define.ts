import { MODEL_RECORDS, type CacheTtl, type ModelRecord } from "./models";
import type { AiContext, AiStore, AliasFallbacks, Loaded, SafetyProtocol, TaskDefinition, TelemetrySink } from "./types";

/** An AI SDK language model, structurally (so `.` doesn't import the SDK). */
export interface ModelLike {
  readonly modelId: string;
  readonly provider: string;
}

export interface AliasConfig {
  model: ModelLike;
  /** Effort for every call on this alias (`output_config.effort` on Anthropic). */
  effort?: "low" | "medium" | "high" | "xhigh" | "max" | undefined;
  /**
   * Prompt caching, which is opt-in on Anthropic: the API caches up to the last cacheable block
   * and reuses it while it lives. Worth it when the system prompt and stable context run past
   * the model's minimum (512 tokens on the 5.x models). Default: off.
   */
  cache?: CacheTtl | undefined;
  /** Extra provider options, merged under Genesis's own (effort, fallbacks, structured output). */
  providerOptions?: Record<string, Record<string, unknown>> | undefined;
  fallbacks?: AliasFallbacks | undefined;
}

export interface AiConfig {
  models: Record<string, AliasConfig>;
  store: AiStore;
  /**
   * The feature gate: is this feature on for this person and tenant? Pass `featureOn` from
   * genesis-features through it, with the global and per-tenant AI switches folded in.
   */
  gate: (ctx: AiContext, feature: string) => boolean | Promise<boolean>;
  /** The app's deterministic safety protocol, run before the model on tasks with `safetyText`. */
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
}

export interface ResolvedAlias extends AliasConfig {
  name: string;
  record: ModelRecord;
}

export interface Ai {
  readonly config: AiConfig;
  alias(name: string): ResolvedAlias;
  /** The record for a model id, such as the one a server-side fallback answered with. */
  record(modelId: string): ModelRecord | undefined;
}

/**
 * Checks and freezes an app's AI configuration. Every alias must resolve to a model record
 * (no billing at a guess), and every fallback must name an alias that exists.
 */
export function defineAi(config: AiConfig): Ai {
  const records = { ...MODEL_RECORDS, ...config.modelRecords };
  const aliases = new Map<string, ResolvedAlias>();
  for (const [name, alias] of Object.entries(config.models)) {
    const record = records[alias.model.modelId];
    if (!record) {
      throw new Error(`defineAi: alias "${name}" uses model "${alias.model.modelId}", which has no model record. Add it to modelRecords.`);
    }
    aliases.set(name, { ...alias, name, record });
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
  return Object.freeze(task);
}
