import { APICallError, asSchema, generateText, NoObjectGeneratedError, Output, streamText, type LanguageModel } from "ai";
import type { Ai, ResolvedAlias } from "../define";
import { costOf, estimateCost, type ModelRecord } from "../models";
import {
  GuardrailError,
  type AiContext,
  type AiMessage,
  type AiOutcome,
  type AiResult,
  type AiSchema,
  type AiUsage,
  type BeginInput,
  type ContextLayerRecord,
  type Guardrail,
  type KeySource,
  type Loaded,
  type LoadContext,
  type SafetyRoute,
  type TaskDefinition,
  type VendorKey,
} from "../types";

const DEFAULT_TIMEOUT_MS = 60_000;

type Failure = Extract<AiResult<never>, { ok: false }>;

const fail = (outcome: Failure["outcome"], message: string, extra: Partial<Failure> = {}): Failure => ({ ok: false, outcome, message, ...extra });

/** A model the call may run on: the alias's (or its rollout's), then its outage fallbacks. */
interface Target {
  alias: ResolvedAlias;
  record: ModelRecord;
  /** A tenant's or person's own key; null for the platform's. */
  key: VendorKey | null;
}

/** What the steps before the model produce. */
interface Prepared<L extends Loaded> {
  /** The first target's alias: what the task asked for. */
  alias: ResolvedAlias;
  targets: Target[];
  keySource: KeySource;
  loaded: L;
  prompt: string | AiMessage[];
  promptChars: number;
  manifest: ContextLayerRecord[];
  callId: string;
  startedAt: number;
  /** Who, which run and which conversation: on the span. */
  trace: Record<string, string>;
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

/**
 * Input guardrails over a prompt: the string, or every text part of every turn. A part the
 * guardrails can't read (an image, a file, a tool call) stops the call rather than passing unchecked.
 */
async function guardPrompt(guards: Guardrail[] | undefined, prompt: string | AiMessage[], ctx: AiContext): Promise<string | AiMessage[]> {
  if (!guards?.length) return prompt;
  if (typeof prompt === "string") return applyGuardrails(guards, prompt, ctx);
  const out: AiMessage[] = [];
  for (const m of prompt) {
    if (typeof m.content === "string") {
      out.push({ ...m, content: await applyGuardrails(guards, m.content, ctx) } as AiMessage);
      continue;
    }
    const parts: unknown[] = [];
    for (const part of m.content as Array<{ type: string; text?: string }>) {
      if (part.type !== "text" || typeof part.text !== "string") {
        throw new GuardrailError(`Input guardrails can't read a "${part.type}" part.`, "invalid_input");
      }
      parts.push({ ...part, text: await applyGuardrails(guards, part.text, ctx) });
    }
    out.push({ ...m, content: parts } as AiMessage);
  }
  return out;
}

/** Validates with any schema the AI SDK takes (Zod 3 or 4, Standard Schema, `jsonSchema`). */
async function validate<T>(schema: AiSchema<T>, value: unknown): Promise<{ ok: true; value: T } | { ok: false }> {
  const s = asSchema(schema);
  if (!s.validate) return { ok: true, value: value as T };
  const result = await s.validate(value);
  return result.success ? { ok: true, value: result.value } : { ok: false };
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
  const parsed = await validate(task.args, rawArgs);
  if (!parsed.ok) return fail("invalid_input", "The request's arguments don't match the task.");
  const args = parsed.value;
  const alias = ai.alias(task.model);

  // Every vendor the call can reach needs consent: the primary (an alias's rollout may be another
  // vendor's model) stops the call without it, and a fallback without it is dropped.
  const resolved = await targetsFor(ai, alias, ctx as AiContext);
  const { keySource } = resolved;
  let { targets } = resolved;
  if (task.consent !== "terms") {
    const consented = new Map<string, boolean>();
    for (const t of targets) {
      const vendor = t.record.vendor;
      if (!consented.has(vendor)) consented.set(vendor, await config.store.hasConsent(ctx.personId, vendor, config.consentVersion));
    }
    const primaryVendor = targets[0]!.record.vendor;
    if (!consented.get(primaryVendor)) return fail("no_consent", `This person hasn't agreed to sharing with ${primaryVendor}.`);
    targets = targets.filter((t) => consented.get(t.record.vendor));
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

  let prompt: string | AiMessage[];
  try {
    prompt = await guardPrompt(task.guardrails?.input, await task.prompt(loaded), ctx as AiContext);
  } catch (error) {
    if (error instanceof GuardrailError) return stopped(error);
    throw error;
  }
  const promptChars = task.system.length + (typeof prompt === "string" ? prompt.length : JSON.stringify(prompt).length);

  const first = targets[0]!;
  const began = await config.store.begin({
    tenantId: ctx.tenantId,
    personId: ctx.personId,
    taskId: task.id,
    taskVersion: task.version,
    vendor: first.record.vendor,
    model: first.record.id,
    estimateUsd: estimateCost(first.record, promptChars, task.maxTokens),
    budgetExempt: false,
    keySource,
    ...traceIds(ctx),
  });
  if (!began) return fail("over_budget", "The AI budget for this period is used up.");
  return { alias, targets, keySource, loaded, prompt, promptChars, manifest, callId: began.callId, startedAt, trace: traceAttributes(ctx) };
}

/**
 * The models to try, in order: the alias's (or its rollout's, when `when` says so), then outage
 * fallbacks this tenant allows. A call keeps one kind of key: on a tenant's or person's own key,
 * a fallback whose vendor has no key of theirs is skipped rather than billed to the platform.
 */
async function targetsFor(ai: Ai, alias: ResolvedAlias, ctx: AiContext): Promise<{ targets: Target[]; keySource: KeySource }> {
  const crossVendor = ai.config.crossVendorFallback?.(ctx) ?? false;
  const keys = new Map<string, VendorKey | null>();
  const keyOf = async (vendor: string) => {
    if (!keys.has(vendor)) keys.set(vendor, (await ai.config.store.keyFor?.({ tenantId: ctx.tenantId, personId: ctx.personId, vendor })) ?? null);
    return keys.get(vendor)!;
  };
  const primary = alias.rollout && alias.rolloutRecord && (await alias.rollout.when(ctx)) ? alias.rolloutRecord : alias.record;
  const key = await keyOf(primary.vendor);
  const targets: Target[] = [{ alias, record: primary, key }];
  for (const name of alias.fallbacks?.unavailable ?? []) {
    const next = ai.alias(name);
    if (!crossVendor && next.record.vendor !== primary.vendor) continue;
    const nextKey = key ? await keyOf(next.record.vendor) : null;
    if (key && !nextKey) continue;
    targets.push({ alias: next, record: next.record, key: nextKey });
  }
  return { targets, keySource: key?.source ?? "platform" };
}

/** The model and provider options for one call on a target: the vendor's, then the alias's own over them. */
function modelFor(ai: Ai, target: Target, structured: boolean) {
  const vendor = ai.vendor(target.record.vendor);
  const options: Record<string, Record<string, unknown>> = { ...vendor.options?.(target.alias, target.record, { structured }) };
  for (const [provider, extra] of Object.entries(target.alias.providerOptions ?? {})) options[provider] = { ...options[provider], ...extra };
  return {
    model: vendor.model(target.record.id, target.key?.apiKey) as LanguageModel,
    ...(Object.keys(options).length ? { providerOptions: options as never } : {}),
  };
}

/** The prompt as the AI SDK takes it: a user turn, or a conversation. */
const promptOf = (prompt: string | AiMessage[]) => (typeof prompt === "string" ? { prompt } : { messages: prompt });

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
function bill(ai: Ai, target: Target, usage: AiUsage, responseModelId: string | undefined, metadata: unknown): Bill {
  const alias = target.alias;
  const modelId = responseModelId || target.record.id;
  const record: ModelRecord = ai.record(modelId) ?? target.record;
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

/** A tenant's or person's own key the vendor refused: theirs to fix, not an outage. */
const keyRefused = (error: unknown, target: Target) =>
  target.key !== null && APICallError.isInstance(error) && (error.statusCode === 401 || error.statusCode === 403);

const httpDetail = (error: unknown) => (APICallError.isInstance(error) ? `HTTP ${error.statusCode ?? "?"}` : "error");

/** The context's actor, run and conversation, as the store takes them. */
export function traceIds(ctx: AiContext): Pick<BeginInput, "actor" | "runId" | "conversationId"> {
  return { actor: ctx.actor ?? "person", ...(ctx.runId ? { runId: ctx.runId } : {}), ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}) };
}

/** The same as span attributes: `gen_ai.conversation.id` from OpenTelemetry's GenAI conventions, the rest Genesis's. */
export function traceAttributes(ctx: AiContext): Record<string, string> {
  return {
    "genesis.ai.actor": ctx.actor ?? "person",
    ...(ctx.runId ? { "genesis.ai.run_id": ctx.runId } : {}),
    ...(ctx.conversationId ? { "gen_ai.conversation.id": ctx.conversationId } : {}),
  };
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
    name: `chat ${billed?.modelId ?? prep.targets[0]!.record.id}`,
    startTime: prep.startedAt,
    endTime: endedAt,
    attributes: {
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": prep.targets[0]!.record.vendor,
      "gen_ai.request.model": prep.targets[0]!.record.id,
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
      "genesis.ai.key_source": prep.keySource,
      "genesis.ai.cost_usd": costUsd,
      "genesis.ai.usage_id": usageId,
      ...prep.trace,
    },
  });
  return usageId;
}

/** Adds what an earlier attempt of the same call used (a failed schema attempt) to a bill. */
const withCarry = (billed: Bill, carry: Bill | null): Bill =>
  carry ? { modelId: billed.modelId, usage: addUsage(billed.usage, carry.usage), costUsd: billed.costUsd + carry.costUsd } : billed;

/**
 * Runs a task for a person: consent → gate → load (with a manifest) → safety routing →
 * guardrails → budget → the model (rollout, outage fallbacks, refusals) → output guardrails → a
 * usage row and a span. Content never reaches the usage row or the span.
 */
export async function runTask<Args, L extends Loaded, Out, Db>(
  ai: Ai,
  task: TaskDefinition<Args, L, Out, Db>,
  rawArgs: unknown,
  ctx: AiContext<Db>,
): Promise<AiResult<Out>> {
  type R = AiResult<Out>;
  const prepared = await prepare(ai, task, rawArgs, ctx);
  if ("ok" in prepared) return prepared as R;
  const p = prepared as Prepared<Loaded>;
  const { config } = ai;
  const structured = task.output !== "text";
  let lastError = "";
  // A failed schema attempt is billed like any other: its tokens join whichever row ends the call,
  // even when the retry then hits an outage and another target answers.
  let carry: Bill | null = null;
  for (const target of p.targets) {
    let retried = false;
    while (true) {
      try {
        const result = await generateText({
          ...modelFor(ai, target, structured),
          system: task.system,
          ...promptOf(p.prompt),
          maxOutputTokens: task.maxTokens,
          maxRetries: config.maxRetries ?? 2,
          abortSignal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
          ...(task.output === "text" ? {} : { output: Output.object({ schema: task.output }) }),
        });
        const billed = withCarry(bill(ai, target, usageFrom(result.usage), result.response.modelId, result.providerMetadata), carry);
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
          const attempt = error.usage ? bill(ai, target, usageFrom(error.usage), error.response?.modelId, undefined) : null;
          const spent: Bill | null = attempt ? withCarry(attempt, carry) : carry;
          // A refusal has no object to parse: it is `refused`, not a schema miss, and isn't retried.
          if (error.finishReason === "content-filter") {
            const usageId = await settle(ai, p, task, "refused", spent, "refusal");
            return fail("refused", "The model declined this request.", { usageId }) as R;
          }
          if (!retried) {
            retried = true; // one repair retry for output that didn't match the schema
            carry = spent;
            continue;
          }
          const usageId = await settle(ai, p, task, "invalid_output", spent, "schema");
          return fail("invalid_output", "The model's output didn't match the schema.", { usageId }) as R;
        }
        if (keyRefused(error, target)) {
          const usageId = await settle(ai, p, task, "unavailable", carry, `key refused (${httpDetail(error)})`);
          return fail("unavailable", `The ${target.record.vendor} key for this account was refused. Check it in settings.`, { usageId }) as R;
        }
        if (isOutage(error)) {
          lastError = APICallError.isInstance(error) ? httpDetail(error) : (error as Error).name;
          break; // next target
        }
        await settle(ai, p, task, "unavailable", carry, httpDetail(error));
        throw error;
      }
    }
  }
  const usageId = await settle(ai, p, task, "unavailable", carry, lastError || "unavailable");
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
  const prepared = await prepare(ai, task, rawArgs, ctx);
  if ("ok" in prepared) return prepared;
  const p = prepared as Prepared<Loaded>;
  const { config } = ai;
  const target = p.targets[0]!;
  let resolveDone: (r: AiResult<{ text: string }>) => void = () => {};
  const done = new Promise<AiResult<{ text: string }>>((resolve) => (resolveDone = resolve));
  // onFinish, onAbort and onError can't all close the row: the first one wins.
  let closed = false;
  const close = async (outcome: AiOutcome, billed: Bill | null, detail: string | undefined, result: (usageId: string) => AiResult<{ text: string }>) => {
    if (closed) return;
    closed = true;
    try {
      resolveDone(result(await settle(ai, p, task, outcome, billed, detail)));
    } catch {
      // The row couldn't be written (the store or the trace failed): still end the stream.
      resolveDone(fail("unavailable", "The AI service failed. Try again."));
    }
  };
  const timeout = AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.abortSignal ? AbortSignal.any([timeout, options.abortSignal]) : timeout;
  const result = streamText({
    ...modelFor(ai, target, false),
    system: task.system,
    ...promptOf(p.prompt),
    maxOutputTokens: task.maxTokens,
    maxRetries: config.maxRetries ?? 2,
    abortSignal: signal,
    onFinish: async (event) => {
      const billed = bill(ai, target, usageFrom(event.totalUsage ?? event.usage), event.response.modelId, event.providerMetadata);
      if (event.finishReason === "content-filter") {
        await close("refused", billed, event.rawFinishReason ?? "refusal", (usageId) => fail("refused", "The model declined this request.", { usageId }));
        return;
      }
      await close("ok", billed, undefined, (usageId) => ({ ok: true, output: { text: event.text }, model: billed.modelId, taskVersion: task.version, usageId, labelled: true }));
    },
    onAbort: async () => {
      // An aborted stream reports no tokens. The prompt was sent, so its input is billed.
      const inputTokens = Math.ceil(p.promptChars / 4);
      const billed: Bill = { modelId: target.record.id, usage: { inputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }, costUsd: estimateCost(target.record, p.promptChars, 0) };
      await close("unavailable", billed, "aborted", (usageId) => fail("unavailable", "The request was cancelled.", { usageId }));
    },
    onError: async ({ error }) => {
      const refused = keyRefused(error, target);
      await close("unavailable", null, refused ? `key refused (${httpDetail(error)})` : httpDetail(error), (usageId) =>
        fail("unavailable", refused ? `The ${target.record.vendor} key for this account was refused. Check it in settings.` : "The AI service failed mid-stream.", { usageId }),
      );
    },
  });
  return { ok: true, textStream: result.textStream, done };
}
