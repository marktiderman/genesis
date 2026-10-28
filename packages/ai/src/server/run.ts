import { APICallError, generateText, NoObjectGeneratedError, Output, streamText, type LanguageModel } from "ai";
import type { Ai, ResolvedAlias } from "../define";
import { costOf, estimateCost, type ModelRecord } from "../models";
import {
  GuardrailError,
  type AiContext,
  type AiOutcome,
  type AiResult,
  type AiUsage,
  type ContextLayerRecord,
  type Guardrail,
  type Loaded,
  type LoadContext,
  type SafetyRoute,
  type TaskDefinition,
} from "../types";

const DEFAULT_TIMEOUT_MS = 60_000;

type Failure = Extract<AiResult<never>, { ok: false }>;

const fail = (outcome: Failure["outcome"], message: string, extra: Partial<Failure> = {}): Failure => ({ ok: false, outcome, message, ...extra });

/** What the steps before the model produce. */
interface Prepared<L extends Loaded> {
  alias: ResolvedAlias;
  loaded: L;
  prompt: string;
  manifest: ContextLayerRecord[];
  callId: string;
  startedAt: number;
}

/** What one call used and cost, and which model answered it. */
interface Bill {
  /** The model that answered: a server-side fallback's, when one ran. */
  modelId: string;
  usage: AiUsage;
  costUsd: number;
}

function loadContext<Db>(ctx: AiContext<Db>, manifest: ContextLayerRecord[]): LoadContext<Db> {
  return {
    ...ctx,
    layer(name, text, ids) {
      manifest.push({ name, tokens: Math.ceil(text.length / 4), ...(ids?.length ? { ids: [...ids] } : {}) });
    },
  };
}

async function applyGuardrails(guards: Guardrail[] | undefined, text: string, ctx: AiContext): Promise<string> {
  let out = text;
  for (const guard of guards ?? []) out = await guard(out, ctx);
  return out;
}

/** A stop before the model: nothing was generated, so there is no invalid output yet. */
const stopped = (error: GuardrailError): Failure => fail(error.outcome === "invalid_output" ? "invalid_input" : error.outcome, error.message);

/**
 * Consent, gate, `can`, load, safety routing, input guardrails, then admission to the budget.
 * Returns a failure (nothing recorded: no model was called) or what the model call needs.
 */
async function prepare<Args, L extends Loaded, Out, Db>(
  ai: Ai,
  task: TaskDefinition<Args, L, Out, Db>,
  rawArgs: unknown,
  ctx: AiContext<Db>,
): Promise<Failure | Prepared<L>> {
  const startedAt = Date.now();
  const { config } = ai;
  const parsed = task.args.safeParse(rawArgs);
  if (!parsed.success) return fail("invalid_input", "The request's arguments don't match the task.");
  const args = parsed.data;
  const alias = ai.alias(task.model);

  if (!(await config.store.hasConsent(ctx.personId, alias.record.vendor))) {
    return fail("no_consent", `This person hasn't agreed to sharing with ${alias.record.vendor}.`);
  }
  if (!(await config.gate(ctx as AiContext, task.feature))) return fail("off", "This feature is off here.");
  if (task.can && !(await task.can(ctx, args))) return fail("forbidden", "Not allowed for this person.");

  const manifest: ContextLayerRecord[] = [];
  let loaded: L;
  try {
    loaded = await task.load(loadContext(ctx, manifest), args);
  } catch (error) {
    if (error instanceof GuardrailError) return stopped(error);
    throw error;
  }

  if (task.safetyText && config.safety) {
    const route: SafetyRoute | null = await config.safety(task.safetyText(loaded), ctx as AiContext);
    if (route) return fail("safety_routed", "Routed by the safety protocol.", { safety: route });
  }

  let prompt: string;
  try {
    prompt = await applyGuardrails(task.guardrails?.input, await task.prompt(loaded), ctx as AiContext);
  } catch (error) {
    if (error instanceof GuardrailError) return stopped(error);
    throw error;
  }

  const began = await config.store.begin({
    tenantId: ctx.tenantId,
    personId: ctx.personId,
    taskId: task.id,
    taskVersion: task.version,
    vendor: alias.record.vendor,
    model: alias.record.id,
    estimateUsd: estimateCost(alias.record, task.system.length + prompt.length, task.maxTokens),
    budgetExempt: false,
  });
  if (!began) return fail("over_budget", "The AI budget for this period is used up.");
  return { alias, loaded, prompt, manifest, callId: began.callId, startedAt };
}

/** The aliases to try, in order: the task's, then outage fallbacks this tenant allows. */
function chain(ai: Ai, alias: ResolvedAlias, ctx: AiContext): ResolvedAlias[] {
  const crossVendor = ai.config.crossVendorFallback?.(ctx) ?? false;
  const next = (alias.fallbacks?.unavailable ?? []).map((name) => ai.alias(name));
  return [alias, ...next.filter((a) => crossVendor || a.record.vendor === alias.record.vendor)];
}

/**
 * Provider options Genesis sets: effort, the refusal fallback, structured output as
 * `output_config.format`, and prompt caching (a top-level `cache_control`) when the alias asks.
 */
function providerOptions(alias: ResolvedAlias): Record<string, Record<string, unknown>> | undefined {
  const own = { ...alias.providerOptions };
  if (alias.record.vendor === "anthropic") {
    own.anthropic = {
      ...(alias.effort ? { effort: alias.effort } : {}),
      ...(alias.record.refusalFallback && alias.fallbacks?.refusal !== "fail" ? { fallbacks: "default" } : {}),
      ...(alias.cache ? { cacheControl: { type: "ephemeral", ttl: alias.cache } } : {}),
      structuredOutputMode: "outputFormat",
      ...own.anthropic,
    };
  }
  return Object.keys(own).length ? (own as Record<string, Record<string, unknown>>) : undefined;
}

function usageFrom(raw: {
  inputTokenDetails?: { noCacheTokens?: number | undefined; cacheReadTokens?: number | undefined; cacheWriteTokens?: number | undefined };
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
}): AiUsage {
  const d = raw.inputTokenDetails ?? {};
  const cacheRead = d.cacheReadTokens ?? 0;
  const cacheWrite = d.cacheWriteTokens ?? 0;
  return {
    inputTokens: d.noCacheTokens ?? Math.max(0, (raw.inputTokens ?? 0) - cacheRead - cacheWrite),
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    outputTokens: raw.outputTokens ?? 0,
  };
}

const addUsage = (a: AiUsage, b: AiUsage): AiUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  outputTokens: a.outputTokens + b.outputTokens,
});

/** One hop in Anthropic's `usage.iterations`, as the AI SDK passes it on in `providerMetadata.anthropic.iterations`. */
interface Iteration {
  type?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

/**
 * What a model call cost, priced by the model that answered. With Anthropic's server-side refusal
 * fallback, another model can answer, and `usage.iterations` lists every hop; each is priced at
 * its own model's rate (a hop with no record, at the alias's). That counts the declined hop too,
 * an upper bound: Anthropic bills it only for some refusal categories.
 */
function bill(ai: Ai, alias: ResolvedAlias, usage: AiUsage, responseModelId: string | undefined, metadata: unknown): Bill {
  const modelId = responseModelId || alias.record.id;
  const record: ModelRecord = ai.record(modelId) ?? alias.record;
  const hops = (metadata as { anthropic?: { iterations?: Iteration[] | null } } | undefined)?.anthropic?.iterations ?? [];
  if (hops.length === 0) return { modelId, usage, costUsd: costOf(record, usage, alias.cache) };
  const costUsd = hops.reduce((sum, hop) => {
    const hopUsage = {
      inputTokens: hop.inputTokens ?? 0,
      cacheReadTokens: hop.cacheReadInputTokens ?? 0,
      cacheWriteTokens: hop.cacheCreationInputTokens ?? 0,
      outputTokens: hop.outputTokens ?? 0,
    };
    return sum + costOf((hop.model && ai.record(hop.model)) || record, hopUsage, alias.cache);
  }, 0);
  return { modelId, usage, costUsd };
}

function isOutage(error: unknown): boolean {
  if (APICallError.isInstance(error)) return error.isRetryable || (error.statusCode ?? 0) >= 500 || error.statusCode === 429;
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/** Records the call and emits its span. Returns the usage row's id. */
async function settle(
  ai: Ai,
  prep: Prepared<Loaded>,
  task: { id: string; version: number },
  outcome: AiOutcome,
  billed: Bill | null,
  detail?: string,
): Promise<string> {
  const endedAt = Date.now();
  const costUsd = billed?.costUsd ?? 0;
  const usage = billed?.usage ?? null;
  const usageId = await ai.config.store.finish({
    callId: prep.callId,
    outcome,
    model: billed?.modelId ?? null,
    usage,
    costUsd,
    latencyMs: endedAt - prep.startedAt,
    manifest: prep.manifest,
    ...(detail ? { detail } : {}),
  });
  ai.config.telemetry?.({
    name: `chat ${billed?.modelId ?? prep.alias.record.id}`,
    startTime: prep.startedAt,
    endTime: endedAt,
    attributes: {
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": prep.alias.record.vendor,
      "gen_ai.request.model": prep.alias.record.id,
      ...(billed ? { "gen_ai.response.model": billed.modelId } : {}),
      ...(usage
        ? {
            "gen_ai.usage.input_tokens": usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
            "gen_ai.usage.output_tokens": usage.outputTokens,
            "gen_ai.usage.cache_read.input_tokens": usage.cacheReadTokens,
            "gen_ai.usage.cache_creation.input_tokens": usage.cacheWriteTokens,
          }
        : {}),
      "genesis.ai.task": task.id,
      "genesis.ai.task_version": task.version,
      "genesis.ai.outcome": outcome,
      "genesis.ai.cost_usd": costUsd,
      "genesis.ai.usage_id": usageId,
    },
  });
  return usageId;
}

/** Adds what an earlier attempt of the same call used (a failed schema attempt) to a bill. */
const withCarry = (billed: Bill, carry: Bill | null): Bill =>
  carry ? { modelId: billed.modelId, usage: addUsage(billed.usage, carry.usage), costUsd: billed.costUsd + carry.costUsd } : billed;

/**
 * Runs a task for a person: consent → gate → load (with a manifest) → safety routing →
 * guardrails → budget → the model (outage fallbacks, refusals) → output guardrails → a usage row
 * and a span. Content never reaches the usage row or the span.
 */
export async function runTask<Args, L extends Loaded, Out, Db>(
  ai: Ai,
  task: TaskDefinition<Args, L, Out, Db>,
  rawArgs: unknown,
  ctx: AiContext<Db>,
): Promise<AiResult<Out>> {
  type R = AiResult<Out>;
  const prep = await prepare(ai, task, rawArgs, ctx);
  if ("ok" in prep) return prep as R;
  const { config } = ai;
  const p = prep as Prepared<Loaded>;
  let lastError = "";
  for (const alias of chain(ai, prep.alias, ctx as AiContext)) {
    // A failed schema attempt is billed like any other: its tokens join the final row.
    let carry: Bill | null = null;
    while (true) {
      try {
        const options = providerOptions(alias);
        const result = await generateText({
          model: alias.model as LanguageModel,
          system: task.system,
          prompt: prep.prompt,
          maxOutputTokens: task.maxTokens,
          maxRetries: config.maxRetries ?? 2,
          abortSignal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
          ...(task.output === "text" ? {} : { output: Output.object({ schema: task.output }) }),
          ...(options ? { providerOptions: options as never } : {}),
        });
        const billed = withCarry(bill(ai, alias, usageFrom(result.usage), result.response.modelId, result.providerMetadata), carry);
        if (result.finishReason === "content-filter") {
          const usageId = await settle(ai, p, task, "refused", billed, result.rawFinishReason ?? "refusal");
          return fail("refused", "The model declined this request.", { usageId }) as R;
        }
        let output: unknown;
        if (task.output === "text") {
          let text = result.text.trim();
          if (!text) {
            const usageId = await settle(ai, p, task, "invalid_output", billed, "empty");
            return fail("invalid_output", "The model answered without text.", { usageId }) as R;
          }
          try {
            text = await applyGuardrails(task.guardrails?.output, text, ctx as AiContext);
          } catch (error) {
            if (!(error instanceof GuardrailError)) throw error;
            const usageId = await settle(ai, p, task, error.outcome, billed, "output guardrail");
            return fail(error.outcome, error.message, { usageId }) as R;
          }
          output = { text };
        } else {
          output = result.output;
        }
        const usageId = await settle(ai, p, task, "ok", billed);
        return { ok: true, output, model: billed.modelId, taskVersion: task.version, usageId, labelled: true } as R;
      } catch (error) {
        if (NoObjectGeneratedError.isInstance(error)) {
          const attempt = error.usage ? bill(ai, alias, usageFrom(error.usage), error.response?.modelId, undefined) : null;
          const total = attempt ? withCarry(attempt, carry) : carry;
          if (!carry && attempt) {
            carry = attempt; // one repair retry for output that didn't match the schema
            continue;
          }
          const usageId = await settle(ai, p, task, "invalid_output", total, "schema");
          return fail("invalid_output", "The model's output didn't match the schema.", { usageId }) as R;
        }
        if (isOutage(error)) {
          lastError = APICallError.isInstance(error) ? `HTTP ${error.statusCode ?? "?"}` : (error as Error).name;
          break; // next alias in the chain
        }
        await settle(ai, p, task, "unavailable", carry, APICallError.isInstance(error) ? `HTTP ${error.statusCode ?? "?"}` : "error");
        throw error;
      }
    }
  }
  const usageId = await settle(ai, p, task, "unavailable", null, lastError || "unavailable");
  return fail("unavailable", "The AI service is unavailable right now.", { usageId }) as R;
}

export interface StreamOptions {
  /** The caller's abort (the request's signal): a client that leaves stops the model call. */
  abortSignal?: AbortSignal | undefined;
}

/**
 * A streamed task. `textStream` yields text as it arrives; `done` resolves once the usage row is
 * written. When `done` resolves `refused` (a refusal can arrive mid-stream), discard the text
 * already shown: Anthropic treats partial output before a refusal as incomplete.
 */
export type StreamResult =
  | { ok: true; textStream: AsyncIterable<string>; done: Promise<AiResult<{ text: string }>> }
  | Failure;

/**
 * Streams a text task. The same steps run before the model; the usage row is written when the
 * stream ends, is aborted or fails. No outage fallback mid-stream: a conversation keeps one model.
 * Output guardrails need the whole answer, so a task with them can't stream: use `runTask`.
 */
export async function streamTask<Args, L extends Loaded, Db>(
  ai: Ai,
  task: TaskDefinition<Args, L, { text: string }, Db>,
  rawArgs: unknown,
  ctx: AiContext<Db>,
  options: StreamOptions = {},
): Promise<StreamResult> {
  if (task.output !== "text") throw new Error(`streamTask ${task.id}: only text tasks stream.`);
  if (task.guardrails?.output?.length) throw new Error(`streamTask ${task.id}: a task with output guardrails can't stream; use runTask.`);
  const prep = await prepare(ai, task, rawArgs, ctx);
  if ("ok" in prep) return prep;
  const { config } = ai;
  const alias = prep.alias;
  const p = prep as Prepared<Loaded>;
  let resolveDone: (r: AiResult<{ text: string }>) => void = () => {};
  const done = new Promise<AiResult<{ text: string }>>((resolve) => (resolveDone = resolve));
  // onFinish, onAbort and onError can't all close the row: the first one wins.
  let closed = false;
  const close = async (outcome: AiOutcome, billed: Bill | null, detail: string | undefined, result: (usageId: string) => AiResult<{ text: string }>) => {
    if (closed) return;
    closed = true;
    resolveDone(result(await settle(ai, p, task, outcome, billed, detail)));
  };
  const timeout = AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.abortSignal ? AbortSignal.any([timeout, options.abortSignal]) : timeout;
  const providerOpts = providerOptions(alias);
  const result = streamText({
    model: alias.model as LanguageModel,
    system: task.system,
    prompt: prep.prompt,
    maxOutputTokens: task.maxTokens,
    maxRetries: config.maxRetries ?? 2,
    abortSignal: signal,
    ...(providerOpts ? { providerOptions: providerOpts as never } : {}),
    onFinish: async (event) => {
      const billed = bill(ai, alias, usageFrom(event.totalUsage ?? event.usage), event.response.modelId, event.providerMetadata);
      if (event.finishReason === "content-filter") {
        await close("refused", billed, event.rawFinishReason ?? "refusal", (usageId) => fail("refused", "The model declined this request.", { usageId }));
        return;
      }
      await close("ok", billed, undefined, (usageId) => ({ ok: true, output: { text: event.text }, model: billed.modelId, taskVersion: task.version, usageId, labelled: true }));
    },
    onAbort: async () => {
      // Tokens of an aborted stream aren't reported; the prompt was sent, so its input is billed.
      const input = estimateCost(alias.record, task.system.length + prep.prompt.length, 0);
      const billed: Bill = { modelId: alias.record.id, usage: { inputTokens: Math.ceil((task.system.length + prep.prompt.length) / 4), cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }, costUsd: input };
      await close("unavailable", billed, "aborted", (usageId) => fail("unavailable", "The request was cancelled.", { usageId }));
    },
    onError: async ({ error }) => {
      await close("unavailable", null, APICallError.isInstance(error) ? `HTTP ${error.statusCode ?? "?"}` : "error", (usageId) =>
        fail("unavailable", "The AI service failed mid-stream.", { usageId }),
      );
    },
  });
  return { ok: true, textStream: result.textStream, done };
}
