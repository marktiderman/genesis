// @feat:ai-providers
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AiStoreError, supabaseStore } from "../supabase";

const sql = readFileSync(new URL("../../migrations/0001_genesis_ai.sql", import.meta.url), "utf8");

/** The parameter names a function in the migration takes. */
function params(fn: string): string[] {
  const match = new RegExp(`create function genesis_ai\\.${fn}\\(([\\s\\S]*?)\\)\\s*returns`).exec(sql);
  if (!match) throw new Error(`no ${fn} in the migration`);
  return match[1]!.split(",").map((p) => p.trim().split(/\s+/)[0]!);
}

function fakeClient(answer: (fn: string, args: Record<string, unknown>) => unknown) {
  const calls: Array<{ schema: string; fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    client: {
      schema: (schema: string) => ({
        rpc: async (fn: string, args: Record<string, unknown>) => {
          calls.push({ schema, fn, args });
          const data = answer(fn, args);
          return data instanceof Error ? { data: null, error: { code: data.message } } : { data, error: null };
        },
      }),
    },
  };
}

describe("supabaseStore", () => {
  it("calls the migration's functions with their exact parameters", async () => {
    const { client, calls } = fakeClient((fn) =>
      fn === "has_consent" ? true : fn === "key_for" ? [{ api_key: "sk-ant-own-key-1234", source: "person" }] : "call-1",
    );
    const store = supabaseStore(client);
    expect(await store.hasConsent("p", "anthropic", "2026-10")).toBe(true);
    expect(await store.keyFor!({ tenantId: "t", personId: "p", vendor: "anthropic" })).toEqual({ apiKey: "sk-ant-own-key-1234", source: "person" });
    expect(await store.begin({ tenantId: null, personId: "p", taskId: "t", taskVersion: 1, vendor: "anthropic", model: "m", estimateUsd: 0.1, budgetExempt: false, keySource: "person" })).toEqual({ callId: "call-1" });
    expect(
      await store.finish({ callId: "call-1", outcome: "ok", model: "m", usage: { inputTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 3, outputTokens: 4 }, costUsd: 0.01, latencyMs: 12.7, manifest: [], detail: "x".repeat(300) }),
    ).toBe("call-1");

    for (const c of calls) {
      expect(c.schema).toBe("genesis_ai");
      expect(Object.keys(c.args).sort()).toEqual(params(c.fn).sort());
    }
    expect(calls[0]!.args).toMatchObject({ p_policy_version: "2026-10" });
    expect(calls[2]!.args).toMatchObject({ p_key_source: "person" });
    expect(calls[3]!.args).toMatchObject({ p_latency_ms: 13, p_input_tokens: 1, p_quantity: null });
    expect((calls[3]!.args.p_detail as string).length).toBe(200);
  });

  it("returns null when the budget refuses, and throws the SQLSTATE on an error", async () => {
    const refused = supabaseStore(fakeClient(() => null).client);
    expect(await refused.begin({ tenantId: "t", personId: "p", taskId: "t", taskVersion: 1, vendor: "a", model: "m", estimateUsd: 1, budgetExempt: false, keySource: "platform" })).toBeNull();
    expect(await refused.keyFor!({ tenantId: null, personId: "p", vendor: "openai" })).toBeNull();
    const broken = supabaseStore(fakeClient(() => new Error("P0002")).client);
    await expect(broken.finish({ callId: "x", outcome: "ok", model: null, usage: null, costUsd: 0, latencyMs: 0, manifest: [] })).rejects.toEqual(new AiStoreError("finish_call", "P0002"));
  });
});
