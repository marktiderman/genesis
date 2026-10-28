import type { Ai } from "../define";
import type { AiContext, AiOutcome, AiVendor } from "../types";

/** A processor call the pipeline stopped before it ran. */
export class AiCallError extends Error {
  readonly outcome: Exclude<AiOutcome, "ok">;
  constructor(outcome: Exclude<AiOutcome, "ok">, message: string) {
    super(message);
    this.name = "AiCallError";
    this.outcome = outcome;
  }
}

export interface WrapOptions<A extends unknown[], R> {
  /** Recorded as the usage row's task id, e.g. `chat.moderate`. */
  id: string;
  version?: number | undefined;
  /** Who sees the data: `openai`, `deepgram`. */
  vendor: AiVendor;
  /** The FeatureId the gate checks. */
  feature: string;
  /**
   * `person`: the person must have agreed to this vendor. `terms`: the app's terms cover it (a
   * safety check every message gets, for example), so no per-person consent is asked.
   */
  consent: "person" | "terms";
  /** `exempt` for safety checks, which a budget must never stop. */
  budget: "exempt" | "counted";
  /** Who the call runs as, from the processor's own arguments. */
  context: (...args: A) => AiContext | Promise<AiContext>;
  /** Upper bound on one call's cost in USD, for admission. Default 0. */
  estimateUsd?: ((...args: A) => number) | undefined;
  /** Billed units (audio minutes, calls). Default 1. */
  quantity?: ((result: R, ...args: A) => number) | undefined;
  /** Cost of the call in USD. Default 0. */
  cost?: ((quantity: number) => number) | undefined;
}

/**
 * Puts a processor (moderation, transcription) through the same steps as a task: consent, the
 * gate, the budget, a usage row and a span. The processor itself is unchanged; the wrapped
 * function has its signature and throws {@link AiCallError} when a step stops it.
 */
export function wrap<A extends unknown[], R>(ai: Ai, impl: (...args: A) => Promise<R>, options: WrapOptions<A, R>): (...args: A) => Promise<R> {
  const { config } = ai;
  return async (...args: A): Promise<R> => {
    const startedAt = Date.now();
    const ctx = await options.context(...args);
    if (options.consent === "person" && !(await config.store.hasConsent(ctx.personId, options.vendor))) {
      throw new AiCallError("no_consent", `This person hasn't agreed to sharing with ${options.vendor}.`);
    }
    if (!(await config.gate(ctx, options.feature))) throw new AiCallError("off", "This feature is off here.");
    const began = await config.store.begin({
      tenantId: ctx.tenantId,
      personId: ctx.personId,
      taskId: options.id,
      taskVersion: options.version ?? 1,
      vendor: options.vendor,
      model: options.vendor,
      estimateUsd: options.estimateUsd?.(...args) ?? 0,
      budgetExempt: options.budget === "exempt",
    });
    if (!began) throw new AiCallError("over_budget", "The AI budget for this period is used up.");

    const finish = async (outcome: AiOutcome, quantity: number | null, detail?: string) => {
      const endedAt = Date.now();
      const costUsd = quantity === null ? 0 : (options.cost?.(quantity) ?? 0);
      const usageId = await config.store.finish({
        callId: began.callId,
        outcome,
        model: options.vendor,
        usage: quantity === null ? null : { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, quantity },
        costUsd,
        latencyMs: endedAt - startedAt,
        manifest: [],
        ...(detail ? { detail } : {}),
      });
      config.telemetry?.({
        name: `${options.id} ${options.vendor}`,
        startTime: startedAt,
        endTime: endedAt,
        attributes: {
          "gen_ai.provider.name": options.vendor,
          "genesis.ai.task": options.id,
          "genesis.ai.outcome": outcome,
          "genesis.ai.cost_usd": costUsd,
          "genesis.ai.usage_id": usageId,
        },
      });
    };

    let result: R;
    try {
      result = await impl(...args);
    } catch (error) {
      await finish("unavailable", null, error instanceof Error ? error.name : "error");
      throw error;
    }
    await finish("ok", options.quantity?.(result, ...args) ?? 1);
    return result;
  };
}
