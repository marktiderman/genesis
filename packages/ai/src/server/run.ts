import { APICallError, generateText, NoObjectGeneratedError, Output, streamText, type LanguageModel } from "ai";
import type { Ai, ResolvedAlias } from "../define";
import { costOf, estimateCost } from "../models";
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

/** Provider options Genesis sets: effort, the refusal fallback, structured output as `output_config.format`. */
function providerOptions(alias: ResolvedAlias): Record<string, Record<string, unknown>> | undefined {
  const own = { ...alias.providerOptions };
  if (alias.record.vendor === "anthropic") {
    own.anthropic = {
      ...(alias.effort ? { effort: alias.effort } : {}),
      ...(alias.record.refusalFallback && alias.fallbacks?.refusal !== "fail" ? { fallbacks: "default" } : {}),
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
  model: ResolvedAlias | null,
  usage: AiUsage | null,
  detail?: string,
): Promise<string> {
  const endedAt = Date.now();
  const costUsd = model && usage ? costOf(model.record, usage) : 0;
  const usageId = await ai.config.store.finish({
    callId: prep.callId,
    outcome,
    model: model?.record.id ?? null,
    usage,
    costUsd,
    latencyMs: endedAt - prep.startedAt,
    manifest: prep.manifest,
    ...(detail ? { detail } : {}),
  });
  ai.config.telemetry?.({
    name: `chat ${model?.record.id ?? prep.alias.record.id}`,
    startTime: prep.startedAt,
    endTime: endedAt,
    attributes: {
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": prep.alias.record.vendor,
      "gen_ai.request.model": prep.alias.record.id,
      ...(model ? { "gen_ai.response.model": model.record.id } : {}),
      ...(usage ? { "gen_ai.usage.input_tokens": usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens, "gen_ai.usage.output_tokens": usage.outputTokens } : {}),
      "genesis.ai.task": task.id,
      "genesis.ai.task_version": task.version,
      "genesis.ai.outcome": outcome,
      "genesis.ai.cost_usd": costUsd,
      "genesis.ai.usage_id": usageId,
    },
  });
  return usageId;
}

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
): Promise<AiResult<Out extends never ? { text: string } : Out>> {
  type R = AiResult<Out extends never ? { text: string } : Out>;
  const prep = await prepare(ai, task, rawArgs, ctx);
  if ("ok" in prep) return prep as R;
  const { config } = ai;
  let lastError = "";
  for (const alias of chain(ai, prep.alias, ctx as AiContext)) {
    let attempt = 0;
    while (true) {
      try {
        const result = await generateText({
          model: alias.model as LanguageModel,
          system: task.system,
          prompt: prep.prompt,
          maxOutputTokens: task.maxTokens,
          maxRetries: config.maxRetries ?? 2,
          abortSignal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
          ...(task.output === "text" ? {} : { output: Output.object({ schema: task.output }) }),
          ...(providerOptions(alias) ? { providerOptions: providerOptions(alias) as never } : {}),
        });
        const usage = usageFrom(result.usage);
        if (result.finishReason === "content-filter") {
          const usageId = await settle(ai, prep as Prepared<Loaded>, task, "refused", alias, usage, result.rawFinishReason ?? "refusal");
          return fail("refused", "The model declined this request.", { usageId }) as R;
        }
        let output: unknown;
        if (task.output === "text") {
          let text = result.text.trim();
          if (!text) {
            const usageId = await settle(ai, prep as Prepared<Loaded>, task, "invalid_output", alias, usage, "empty");
            return fail("invalid_output", "The model answered without text.", { usageId }) as R;
          }
          try {
            text = await applyGuardrails(task.guardrails?.output, text, ctx as AiContext);
          } catch (error) {
            if (!(error instanceof GuardrailError)) throw error;
            const usageId = await settle(ai, prep as Prepared<Loaded>, task, error.outcome, alias, usage, "output guardrail");
            return fail(error.outcome, error.message, { usageId }) as R;
          }
          output = { text };
        } else {
          output = result.output;
        }
        const usageId = await settle(ai, prep as Prepared<Loaded>, task, "ok", alias, usage);
        return { ok: true, output, model: result.response.modelId || alias.record.id, taskVersion: task.version, usageId, labelled: true } as R;
      } catch (error) {
        if (NoObjectGeneratedError.isInstance(error) && attempt === 0) {
          attempt++; // one repair retry for output that didn't match the schema
          continue;
        }
        if (NoObjectGeneratedError.isInstance(error)) {
          const usageId = await settle(ai, prep as Prepared<Loaded>, task, "invalid_output", alias, error.usage ? usageFrom(error.usage) : null, "schema");
          return fail("invalid_output", "The model's output didn't match the schema.", { usageId }) as R;
        }
        if (isOutage(error)) {
          lastError = APICallError.isInstance(error) ? `HTTP ${error.statusCode ?? "?"}` : (error as Error).name;
          break; // next alias in the chain
        }
        await settle(ai, prep as Prepared<Loaded>, task, "unavailable", alias, null, APICallError.isInstance(error) ? `HTTP ${error.statusCode ?? "?"}` : "error");
        throw error;
      }
    }
  }
  const usageId = await settle(ai, prep as Prepared<Loaded>, task, "unavailable", null, null, lastError || "unavailable");
  return fail("unavailable", "The AI service is unavailable right now.", { usageId }) as R;
}

export type StreamResult =
  | { ok: true; textStream: AsyncIterable<string>; done: Promise<AiResult<{ text: string }>> }
  | Failure;

/**
 * Streams a text task. The same steps run before the model; the usage row is written when the
 * stream ends. No outage fallback mid-stream: a conversation keeps one model.
 */
export async function streamTask<Args, L extends Loaded, Db>(
  ai: Ai,
  task: TaskDefinition<Args, L, { text: string }, Db>,
  rawArgs: unknown,
  ctx: AiContext<Db>,
): Promise<StreamResult> {
  if (task.output !== "text") throw new Error(`streamTask ${task.id}: only text tasks stream.`);
  const prep = await prepare(ai, task, rawArgs, ctx);
  if ("ok" in prep) return prep;
  const { config } = ai;
  const alias = prep.alias;
  let settled: (r: AiResult<{ text: string }>) => void = () => {};
  const done = new Promise<AiResult<{ text: string }>>((resolve) => (settled = resolve));
  const result = streamText({
    model: alias.model as LanguageModel,
    system: task.system,
    prompt: prep.prompt,
    maxOutputTokens: task.maxTokens,
    maxRetries: config.maxRetries ?? 2,
    abortSignal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    ...(providerOptions(alias) ? { providerOptions: providerOptions(alias) as never } : {}),
    onFinish: async (event) => {
      const usage = usageFrom(event.totalUsage ?? event.usage);
      if (event.finishReason === "content-filter") {
        const usageId = await settle(ai, prep as Prepared<Loaded>, task, "refused", alias, usage, event.rawFinishReason ?? "refusal");
        settled(fail("refused", "The model declined this request.", { usageId }));
        return;
      }
      const usageId = await settle(ai, prep as Prepared<Loaded>, task, "ok", alias, usage);
      settled({ ok: true, output: { text: event.text }, model: event.response.modelId || alias.record.id, taskVersion: task.version, usageId, labelled: true });
    },
    onError: async ({ error }) => {
      const usageId = await settle(ai, prep as Prepared<Loaded>, task, "unavailable", alias, null, APICallError.isInstance(error) ? `HTTP ${error.statusCode ?? "?"}` : "error");
      settled(fail("unavailable", "The AI service failed mid-stream.", { usageId }));
    },
  });
  return { ok: true, textStream: result.textStream, done };
}
