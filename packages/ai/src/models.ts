import type { AiUsage, AiVendor } from "./types";

/**
 * What Genesis knows about a model: its vendor, prices and API quirks. Aliases resolve to these,
 * so code never sniffs model names. A model with no record fails `defineAi` instead of being billed
 * at a guess; add it here (or pass `models` to `defineAi`) when a new one ships.
 */
export interface ModelRecord {
  id: string;
  vendor: AiVendor;
  /** USD per million tokens. Cache writes are for the 5-minute cache. */
  price: { input: number; output: number; cacheRead: number; cacheWrite: number };
  /** Above this many input tokens, a second price applies (Haiku 5.5). */
  tier?: { aboveInputTokens: number; input: number; output: number } | undefined;
  /** Anthropic's server-side refusal fallback (`fallbacks: "default"`) exists for this model. */
  refusalFallback: boolean;
  /** Effort's default when none is set; Genesis always sets one. */
  defaultEffort: "low" | "medium" | "high";
}

/** Anthropic API version Genesis pins (sampling parameters are refused on it). */
export const ANTHROPIC_API_VERSION = "2026-10-21";

const anthropic = (id: string, input: number, output: number, cacheRead: number, rest: Partial<ModelRecord> = {}): ModelRecord => ({
  id,
  vendor: "anthropic",
  price: { input, output, cacheRead, cacheWrite: input * 1.25 },
  refusalFallback: true,
  defaultEffort: "high",
  ...rest,
});

/** Prices from Anthropic's model table as of 2026-10-06, first-party API. */
export const MODEL_RECORDS: Record<string, ModelRecord> = {
  "claude-opus-5-5": anthropic("claude-opus-5-5", 4, 20, 0.2, { defaultEffort: "medium" }),
  "claude-sonnet-5-5": anthropic("claude-sonnet-5-5", 2, 10, 0.2),
  "claude-haiku-5-5": anthropic("claude-haiku-5-5", 0.1, 0.5, 0.01, {
    tier: { aboveInputTokens: 100_000, input: 0.5, output: 2.5 },
    refusalFallback: false,
    defaultEffort: "medium",
  }),
  "claude-fable-5-1": anthropic("claude-fable-5-1", 10, 50, 0.25),
};

/** Cost of one call in USD from its usage. */
export function costOf(record: ModelRecord, usage: AiUsage): number {
  const totalInput = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const tiered = record.tier && totalInput > record.tier.aboveInputTokens;
  const input = tiered ? record.tier!.input : record.price.input;
  const output = tiered ? record.tier!.output : record.price.output;
  const perToken = 1 / 1_000_000;
  return (
    usage.inputTokens * input * perToken +
    usage.cacheReadTokens * record.price.cacheRead * perToken +
    usage.cacheWriteTokens * record.price.cacheWrite * perToken +
    usage.outputTokens * output * perToken
  );
}

/** Upper bound for the budget: the prompt at the input price plus the full output cap. */
export function estimateCost(record: ModelRecord, promptChars: number, maxTokens: number): number {
  return costOf(record, { inputTokens: Math.ceil(promptChars / 4), cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: maxTokens });
}
