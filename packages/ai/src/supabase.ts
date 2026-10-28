// @feat:ai-providers
import type { AiStore } from "./types";

type RpcResult = { data: unknown; error: { message?: string; code?: string | null } | null };

/**
 * The part of a Supabase client the store uses, signed in with the service role
 * (`SUPABASE_SECRET_KEY`), on the server only. `genesis_ai` must be an exposed schema
 * (`[api] schemas` in `supabase/config.toml`, or the dashboard's API settings).
 */
export interface AiRpcClient {
  // Loose on purpose: a client typed by an app's Database narrows these to its own names.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: (name: any) => { rpc: (fn: any, args?: any) => PromiseLike<RpcResult> };
}

/** A database refusal, with its SQLSTATE; never the row it refused. */
export class AiStoreError extends Error {
  constructor(
    readonly operation: string,
    readonly code: string | null,
  ) {
    super(`genesis_ai.${operation} failed${code ? ` (${code})` : ""}`);
    this.name = "AiStoreError";
  }
}

/**
 * The {@link AiStore} over migration 0001's functions (`genesis_ai.begin_call`, `finish_call`,
 * `has_consent`). People are logins: `AiContext.personId` is the `auth.users` id, and
 * `tenantId` a uuid or null.
 */
export function supabaseStore(client: AiRpcClient): AiStore {
  const call = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await client.schema("genesis_ai").rpc(fn, args);
    if (error) throw new AiStoreError(fn, error.code ?? null);
    return data as T;
  };
  return {
    hasConsent: (personId, vendor) => call<boolean>("has_consent", { p_person: personId, p_vendor: vendor }).then(Boolean),
    async begin(input) {
      const id = await call<string | null>("begin_call", {
        p_tenant: input.tenantId,
        p_person: input.personId,
        p_task: input.taskId,
        p_task_version: input.taskVersion,
        p_vendor: input.vendor,
        p_model: input.model,
        p_estimate_usd: input.estimateUsd,
        p_budget_exempt: input.budgetExempt,
      });
      return id ? { callId: id } : null;
    },
    finish: (input) =>
      call<string>("finish_call", {
        p_call: input.callId,
        p_outcome: input.outcome,
        p_model: input.model,
        p_input_tokens: input.usage?.inputTokens ?? null,
        p_cache_read_tokens: input.usage?.cacheReadTokens ?? null,
        p_cache_write_tokens: input.usage?.cacheWriteTokens ?? null,
        p_output_tokens: input.usage?.outputTokens ?? null,
        p_quantity: input.usage?.quantity ?? null,
        p_cost_usd: input.costUsd,
        p_latency_ms: Math.round(input.latencyMs),
        p_manifest: input.manifest,
        p_detail: input.detail ? input.detail.slice(0, 200) : null,
      }),
  };
}
