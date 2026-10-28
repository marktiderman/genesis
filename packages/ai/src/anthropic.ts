import { createAnthropic, type AnthropicProviderSettings } from "@ai-sdk/anthropic";
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

export { ANTHROPIC_API_VERSION };
