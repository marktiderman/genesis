import type { AiUsage, AiVendor, Capability } from "./types";

/**
 * What Genesis knows about a model: its vendor, prices, capabilities and API quirks. Aliases
 * resolve to these, so code never sniffs model names. A model with no record fails `defineAi`
 * instead of being billed at a guess. Prices are data: pass `modelRecords` to `defineAi` (from
 * your own config or a table read at startup) to add a model or change a price without a release.
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
  /** What it can do besides text. Tasks that need more are refused at startup, not in production. */
  capabilities: readonly Capability[];
}

/** Anthropic API version Genesis pins (sampling parameters are refused on it). */
export const ANTHROPIC_API_VERSION = "2026-10-21";

const anthropic = (id: string, input: number, output: number, cacheRead: number, rest: Partial<ModelRecord> = {}): ModelRecord => ({
  id,
  vendor: "anthropic",
  price: { input, output, cacheRead, cacheWrite: input * 1.25 },
  refusalFallback: true,
  capabilities: ["structuredOutput", "images", "tools"],
  ...rest,
});

/**
 * Prices from Anthropic's model table as of 2026-10-06, first-party API. Cache reads are 0.05× of
 * input on Opus 5.5 and Sonnet 5.5, 0.025× on Fable 5.1 and 0.1× elsewhere (prompt-caching docs,
 * checked 2026-10-28).
 */
export const MODEL_RECORDS: Record<string, ModelRecord> = {
  "claude-opus-5-5": anthropic("claude-opus-5-5", 4, 20, 0.2),
  "claude-sonnet-5-5": anthropic("claude-sonnet-5-5", 2, 10, 0.1),
  "claude-haiku-5-5": anthropic("claude-haiku-5-5", 0.1, 0.5, 0.01, {
    tier: { aboveInputTokens: 100_000, input: 0.5, output: 2.5 },
    refusalFallback: false,
  }),
  "claude-fable-5-1": anthropic("claude-fable-5-1", 10, 50, 0.25),
};

/** How long a prompt cache entry lives. A 1-hour write costs 2× input; a 5-minute one 1.25×. */
export type CacheTtl = "5m" | "1h";

/** Cost of one call in USD from its usage. `cacheTtl` prices cache writes (default 5 minutes). */
export function costOf(record: ModelRecord, usage: AiUsage, cacheTtl: CacheTtl = "5m"): number {
  const totalInput = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const tiered = record.tier && totalInput > record.tier.aboveInputTokens;
  const input = tiered ? record.tier!.input : record.price.input;
  const output = tiered ? record.tier!.output : record.price.output;
  const perToken = 1 / 1_000_000;
  return (
    usage.inputTokens * input * perToken +
    usage.cacheReadTokens * record.price.cacheRead * perToken +
    usage.cacheWriteTokens * (cacheTtl === "1h" ? input * 2 : record.price.cacheWrite) * perToken +
    usage.outputTokens * output * perToken
  );
}

/** Upper bound for the budget: the prompt at the input price plus the full output cap. */
export function estimateCost(record: ModelRecord, promptChars: number, maxTokens: number): number {
  return costOf(record, { inputTokens: Math.ceil(promptChars / 4), cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: maxTokens });
}
