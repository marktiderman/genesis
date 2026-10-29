import { checkTasks, type Ai } from "../define";
import { textStreamToRunEvents, type RunEvent, type TextStreamEvent } from "../run-events";
import type { AiContext, AiOutcome, AiResult, TaskDefinition } from "../types";
import { runTask, streamTask } from "./run";

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
  /**
   * Origins besides the request's own that may call it from a browser (a web app on another
   * host, or behind a proxy that rewrites the URL). Requests with no `Origin`, such as native
   * apps sending a bearer token, are not checked.
   */
  allowedOrigins?: readonly string[] | undefined;
  /** Told about an error the pipeline threw (a loader, the store); the caller gets `unavailable`. */
  onError?: ((error: unknown, request: Request) => void) | undefined;
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
 * A started stream as server-sent events: text as it arrives, then the result. A reader that
 * cancels aborts the model call (`abort`), and streamTask closes the row as aborted.
 */
function sse(
  started: { textStream: AsyncIterable<string>; done: Promise<AiResult<{ text: string }>> },
  abort: () => void,
  runEvents?: (event: TextStreamEvent) => RunEvent[],
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const event = (data: unknown) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, e: TextStreamEvent) => {
    for (const out of runEvents ? runEvents(e) : [e]) controller.enqueue(event(out));
  };
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const text of started.textStream) send(controller, { type: "text", text });
      } catch {
        // the row is closed by streamTask; `done` says how it ended
      }
      const result = await started.done;
      try {
        send(controller, { type: "done", result });
        controller.close();
      } catch {
        // the reader went away
      }
    },
    cancel() {
      abort();
    },
  });
}

/**
 * One HTTP endpoint for every task: `POST { task, args }` → the task's {@link AiResult} as JSON.
 * A web-standard handler, so it mounts in TanStack Start, Next, Hono or a Supabase Edge Function.
 * With `stream: true`, a text task answers as server-sent events: `{ type: "text", text }` as text
 * arrives, then `{ type: "done", result }` (`useAiStream` reads them). With `stream: "events"`,
 * the same stream as {@link RunEvent}s, named after AG-UI's events (`RUN_STARTED`,
 * `TEXT_MESSAGE_CONTENT`, `RUN_FINISHED` or `RUN_ERROR`). A stop before the model is plain JSON
 * either way. The tasks are checked against their models' capabilities at startup.
 *
 * Cross-site requests are refused before the session is read: the body must be
 * `application/json` (a form or `text/plain` post from another site can't set it without a
 * preflight) and a browser's `Origin` must be this one or listed in `allowedOrigins`. Without
 * that, a page elsewhere could run tasks on a signed-in person's cookie and spend their budget.
 */
export function createAiHandler<Db>(options: AiHandlerOptions<Db>): (request: Request) => Promise<Response> {
  const byId = new Map(options.tasks.map((task) => [task.id, task]));
  if (byId.size !== options.tasks.length) throw new Error("createAiHandler: two tasks share an id.");
  checkTasks(options.ai, options.tasks);
  const maxBytes = options.maxBodyBytes ?? 16_384;
  return async (request) => {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
    if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return error(415, "Send the request as JSON.");
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin && !options.allowedOrigins?.includes(origin)) {
      return error(403, "Requests from another site aren't accepted.");
    }
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
    const { task: id, args, stream } = (body ?? {}) as { task?: unknown; args?: unknown; stream?: unknown };
    const task = typeof id === "string" ? byId.get(id) : undefined;
    if (!task) return error(404, "No such task.");
    if (stream === true || stream === "events") {
      if (task.output !== "text" || task.guardrails?.output?.length) return error(400, "This task doesn't stream.");
      try {
        const cancelled = new AbortController();
        const abortSignal = AbortSignal.any([request.signal, cancelled.signal]);
        const started = await streamTask(options.ai, task, args ?? {}, ctx, { abortSignal });
        if (!started.ok) return json(started, STATUS[started.outcome]);
        const runEvents = stream === "events" ? textStreamToRunEvents({ runId: ctx.runId ?? crypto.randomUUID(), threadId: ctx.conversationId }) : undefined;
        return new Response(sse(started, () => cancelled.abort(), runEvents), { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
      } catch (thrown) {
        options.onError?.(thrown, request);
        return json({ ok: false, outcome: "unavailable", message: "The AI service failed. Try again." }, 503);
      }
    }
    let result: AiResult<unknown>;
    try {
      result = await runTask(options.ai, task, args ?? {}, ctx);
    } catch (thrown) {
      options.onError?.(thrown, request);
      return json({ ok: false, outcome: "unavailable", message: "The AI service failed. Try again." }, 503);
    }
    return json(result, result.ok ? 200 : STATUS[result.outcome]);
  };
}
