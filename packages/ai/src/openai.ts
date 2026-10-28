// @feat:ai-providers
import { createOpenAI, type OpenAIProviderSettings } from "@ai-sdk/openai";
import type { ModelLike, VendorAdapter } from "./define";

const KEY_CACHE = 64;

/**
 * OpenAI as a Genesis vendor, on the Responses API: effort as `reasoningEffort`, strict JSON
 * schemas for structured output. OpenAI caches prompts on its own, so `cache` sends nothing.
 * Genesis ships no OpenAI price records: add the models you use to `defineAi({ modelRecords })`
 * from OpenAI's price page, so nothing is billed at a guess.
 */
export function openai(settings: OpenAIProviderSettings = {}): VendorAdapter {
  const platform = createOpenAI(settings);
  const byKey = new Map<string, ReturnType<typeof createOpenAI>>();
  const providerFor = (apiKey?: string) => {
    if (!apiKey) return platform;
    let provider = byKey.get(apiKey);
    if (!provider) {
      provider = createOpenAI({ ...settings, apiKey });
      if (byKey.size >= KEY_CACHE) byKey.delete(byKey.keys().next().value!);
      byKey.set(apiKey, provider);
    }
    return provider;
  };
  return {
    id: "openai",
    model: (modelId, apiKey) => providerFor(apiKey).responses(modelId) as ModelLike,
    options: (alias, _record, call) => ({
      openai: {
        ...(alias.effort ? { reasoningEffort: alias.effort } : {}),
        ...(call.structured ? { strictJsonSchema: true } : {}),
      },
    }),
  };
}
