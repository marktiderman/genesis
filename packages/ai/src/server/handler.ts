import type { Ai } from "../define";
import type { AiContext, AiOutcome, AiResult, TaskDefinition } from "../types";
import { runTask } from "./run";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a registry holds tasks of every shape
type AnyTask = TaskDefinition<any, any, any, any>;

export interface AiHandlerOptions<Db> {
  ai: Ai;
  /** The tasks clients may call, by id. A task not listed here can't be reached over HTTP. */
  tasks: readonly AnyTask[];
  /** Who is calling, from the verified session (cookie or bearer token). Null means 401. */
  context: (request: Request) => AiContext<Db> | null | Promise<AiContext<Db> | null>;
  /** Largest request body accepted, in bytes. Default 16 KB: args are ids, not content. */
  maxBodyBytes?: number | undefined;
}

const STATUS: Record<Exclude<AiOutcome, "ok">, number> = {
  invalid_input: 400,
  off: 403,
  no_consent: 403,
  forbidden: 403,
  // A safety route and a refusal are answers the UI shows, not errors.
  safety_routed: 200,
  refused: 200,
  over_budget: 429,
  invalid_output: 502,
  unavailable: 503,
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const error = (status: number, message: string) => json({ ok: false, outcome: "invalid_input", message }, status);

/**
 * One HTTP endpoint for every task: `POST { task, args }` → the task's {@link AiResult} as JSON.
 * A web-standard handler, so it mounts in TanStack Start, Next, Hono or a Supabase Edge Function.
 */
export function createAiHandler<Db>(options: AiHandlerOptions<Db>): (request: Request) => Promise<Response> {
  const byId = new Map(options.tasks.map((task) => [task.id, task]));
  if (byId.size !== options.tasks.length) throw new Error("createAiHandler: two tasks share an id.");
  const maxBytes = options.maxBodyBytes ?? 16_384;
  return async (request) => {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
    const ctx = await options.context(request);
    if (!ctx) return error(401, "Sign in to use this.");
    if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return error(413, "The request is too large.");
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > maxBytes) return error(413, "The request is too large.");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return error(400, "The request isn't JSON.");
    }
    const { task: id, args } = (body ?? {}) as { task?: unknown; args?: unknown };
    const task = typeof id === "string" ? byId.get(id) : undefined;
    if (!task) return error(404, "No such task.");
    const result: AiResult<unknown> = await runTask(options.ai, task, args ?? {}, ctx);
    return json(result, result.ok ? 200 : STATUS[result.outcome]);
  };
}
