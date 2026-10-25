/**
 * A supabase-js stand-in that records every call. `respond` decides what
 * each query answers, from the table and the chain of calls made on it.
 */
import type { SupportSupabase } from "../client";

export interface Call {
  table: string;
  ops: Array<[string, unknown[]]>;
}

export type Answer = { data: unknown; error: { message: string; code?: string } | null };

export interface FakeOptions {
  userId?: string | null;
  respond?: (call: Call) => Answer | undefined;
  upload?: (bucket: string, path: string, body: unknown, options: unknown) => Answer;
  rpc?: (fn: string, args: unknown) => Answer;
}

export function fakeSupabase({ userId = "00000000-0000-4000-8000-0000000000a1", respond, upload, rpc }: FakeOptions = {}) {
  const calls: Call[] = [];
  const uploads: Array<{ bucket: string; path: string; body: unknown; options: unknown }> = [];
  const rpcs: Array<{ fn: string; args: unknown }> = [];
  const from = (table: string) => {
    const call: Call = { table, ops: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    for (const op of ["insert", "select", "eq", "neq", "in", "order", "limit", "single", "maybeSingle", "delete", "update"]) {
      builder[op] = (...args: unknown[]) => {
        call.ops.push([op, args]);
        return builder;
      };
    }
    builder.then = (resolve: (a: Answer) => unknown, reject: (e: unknown) => unknown) => {
      try {
        return Promise.resolve(resolve(respond?.(call) ?? { data: [], error: null }));
      } catch (e) {
        return Promise.resolve(reject(e));
      }
    };
    return builder;
  };
  const client = {
    from,
    rpc: (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      return Promise.resolve(rpc?.(fn, args) ?? { data: null, error: null });
    },
    auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null }, error: null }) },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: unknown, options: unknown) => {
          uploads.push({ bucket, path, body, options });
          return upload?.(bucket, path, body, options) ?? { data: { path }, error: null };
        },
        createSignedUrls: async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed.test/${p}` })), error: null }),
      }),
    },
  };
  return { client: client as unknown as SupportSupabase, calls, uploads, rpcs };
}

/** The first argument of the first `op` in a call. */
export function arg(call: Call | undefined, op: string): unknown {
  return call?.ops.find(([name]) => name === op)?.[1][0];
}
