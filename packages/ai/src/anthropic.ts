import { createAnthropic, type AnthropicProviderSettings } from "@ai-sdk/anthropic";
import type { ModelLike, VendorAdapter } from "./define";
import { ANTHROPIC_API_VERSION } from "./models";

/**
 * Anthropic's AI SDK provider with the API version Genesis pins. The provider sends 2023-06-01
 * unless told otherwise; Genesis's model records and options (no sampling parameters, effort,
 * server-side fallbacks) are written against {@link ANTHROPIC_API_VERSION}.
 */
export function createGenesisAnthropic(options: AnthropicProviderSettings = {}) {
  return createAnthropic({
    ...options,
    headers: { "anthropic-version": ANTHROPIC_API_VERSION, ...options.headers },
  });
}

/** How many BYOK providers to keep built at once; one per key in use, the oldest dropped first. */
const KEY_CACHE = 64;

/**
 * Anthropic as a Genesis vendor: the pinned API version, effort, the server-side refusal fallback
 * where the model has one, structured output as `output_config.format`, and prompt caching when
 * the alias asks. `apiKey` is the platform's; a tenant's or person's own key replaces it per call.
 */
export function anthropic(settings: AnthropicProviderSettings = {}): VendorAdapter {
  const platform = createGenesisAnthropic(settings);
  const byKey = new Map<string, ReturnType<typeof createGenesisAnthropic>>();
  const providerFor = (apiKey?: string) => {
    if (!apiKey) return platform;
    let provider = byKey.get(apiKey);
    if (!provider) {
      provider = createGenesisAnthropic({ ...settings, apiKey });
      if (byKey.size >= KEY_CACHE) byKey.delete(byKey.keys().next().value!);
      byKey.set(apiKey, provider);
    }
    return provider;
  };
  return {
    id: "anthropic",
    model: (modelId, apiKey) => providerFor(apiKey)(modelId) as ModelLike,
    options: (alias, record) => ({
      anthropic: {
        ...(alias.effort && alias.effort !== "none" ? { effort: alias.effort } : {}),
        ...(record.refusalFallback && alias.fallbacks?.refusal !== "fail" ? { fallbacks: "default" } : {}),
        ...(alias.cache ? { cacheControl: { type: "ephemeral", ttl: alias.cache } } : {}),
        structuredOutputMode: "outputFormat",
      },
    }),
  };
}

export { ANTHROPIC_API_VERSION };
