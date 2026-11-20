/**
 * `ai.key-budget`: the AI provider key as the Edge Function secret ANTHROPIC_API_KEY, with the
 * provider's spend limit set in its console. Verified by listing the models with the key (`GET /v1/models`
 * spends no tokens).
 */
import { defineSetupStep } from "@marktiderman/genesis-config/setup";
import { needsSecret, OFFLINE, request, secretSetters, type StepRunner } from "./framework.js";

export const aiKeyBudgetStep = defineSetupStep({
  id: "ai.key-budget",
  title: "Add the AI provider key and a budget",
  package: "@marktiderman/genesis-ai",
  tools: ["supabase"],
  needs: [{ name: "ANTHROPIC_API_KEY", store: "edge", help: "An Anthropic API key from the console." }],
  links: [
    { label: "Anthropic API keys", url: "https://console.anthropic.com/settings/keys" },
    { label: "Anthropic limits", url: "https://console.anthropic.com/settings/limits" },
  ],
  instructions: [
    "Make an API key for this app (a workspace of its own keeps its spend apart).",
    "Set a spend limit on that workspace in the console: the provider's cap, under the app's own budget.",
    "The step asks for the key when it runs: it goes to the Supabase Edge Function secrets on stdin and is never shown again.",
  ],
});

export const aiKeyBudget: StepRunner = {
  step: aiKeyBudgetStep,
  plan(ctx) {
    const { commands, manual } = secretSetters(ctx.root, "ANTHROPIC_API_KEY", "edge");
    return { summary: "keeps the AI provider key as the Edge Function secret ANTHROPIC_API_KEY", commands, ...(manual.length ? { manual: manual.join("\n") } : {}) };
  },
  async verify(ctx, secrets) {
    if (!ctx.network) return OFFLINE;
    if (!secrets?.has("ANTHROPIC_API_KEY")) return needsSecret("ANTHROPIC_API_KEY");
    const res = await secrets.use("ANTHROPIC_API_KEY", (key) => request(ctx, "https://api.anthropic.com/v1/models", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } }));
    if (res.status === 0) return { ok: false, message: `The provider couldn't be reached: ${res.error ?? "no answer"}` };
    if (res.status === 401 || res.status === 403) return { ok: false, message: `The provider refused the key (${res.status}).` };
    if (!res.ok) return { ok: false, message: `The provider answered ${res.status}.` };
    return { ok: true, message: "The key lists the models (no tokens spent)." };
  },
};
