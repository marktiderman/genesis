/** @feat:chat Fakes for the server tests: a supabase-js shaped object and a fetch. */
import type { ChatSupabase } from "../core/client";

export type Row = Record<string, unknown>;
type RpcHandler = (args: Record<string, unknown>) => unknown;
type Err = { message?: string; code?: string; statusCode?: string } | null;

export interface FakeSupabase {
  client: ChatSupabase;
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
  removed: { bucket: string; paths: string[] }[];
  signed: string[];
  uploaded: { bucket: string; path: string; bytes: number; contentType?: string }[];
}

/** rpc results by function name; tables as arrays of rows, filtered by eq(). */
export function fakeSupabase(opts: {
  rpc?: Record<string, RpcHandler>;
  tables?: Record<string, Row[]>;
  removeError?: Err;
  signedUrlError?: Err;
}): FakeSupabase {
  const rpcCalls: FakeSupabase["rpcCalls"] = [];
  const removed: FakeSupabase["removed"] = [];
  const signed: string[] = [];
  const uploaded: FakeSupabase["uploaded"] = [];
  const builder = (table: string) => {
    const filters: [string, unknown][] = [];
    let orderBy: string | null = null;
    const sorted = (list: Row[]) => (orderBy ? [...list].sort((x, y) => Number(x[orderBy!]) - Number(y[orderBy!])) : list);
    const rows = () => sorted((opts.tables?.[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v)));
    const b = {
      select: () => b,
      eq: (k: string, v: unknown) => (filters.push([k, v]), b),
      order: (k: string) => ((orderBy = k), b),
      limit: () => b,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      // Awaiting the builder itself lists every matching row.
      then: (resolve: (v: { data: Row[]; error: null }) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    };
    return b;
  };
  const client = {
    schema: () => ({
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        const h = opts.rpc?.[fn];
        try {
          return { data: h ? h(args) : null, error: null };
        } catch (e) {
          return { data: null, error: { code: (e as Error).message } };
        }
      },
      from: builder,
    }),
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removed.push({ bucket, paths });
          return { data: opts.removeError ? null : paths.map((name) => ({ name })), error: opts.removeError ?? null };
        },
        upload: async (path: string, body: ArrayBuffer, o?: { contentType?: string }) => {
          uploaded.push({ bucket, path, bytes: body.byteLength, contentType: o?.contentType });
          return { data: { path }, error: null };
        },
        createSignedUrl: async (path: string, seconds: number) => {
          signed.push(`${path}@${seconds}`);
          return opts.signedUrlError
            ? { data: null, error: opts.signedUrlError }
            : { data: { signedUrl: `https://files.test/${path}?token=x` }, error: null };
        },
      }),
    },
  };
  return { client: client as unknown as ChatSupabase, rpcCalls, removed, signed, uploaded };
}

export interface FakeFetch {
  fetch: typeof fetch;
  calls: { url: string; init: RequestInit | undefined }[];
}

/** A fetch answering with `respond(url, init)`. */
export function fakeFetch(respond: (url: string, init: RequestInit | undefined) => Response | Promise<Response>): FakeFetch {
  const calls: FakeFetch["calls"] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return respond(url, init);
  }) as typeof fetch;
  return { fetch: f, calls };
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
