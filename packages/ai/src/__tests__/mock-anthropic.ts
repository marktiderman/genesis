import { createGenesisAnthropic } from "../anthropic";

export interface Recorded {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** Stands for "the model this request named" in a canned response. */
export const REQUESTED = "<requested>";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const message = (over: Record<string, unknown> = {}) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  // The model the request named, as the API echoes it; filled in by mockAnthropic's fetch.
  model: REQUESTED,
  content: [{ type: "text", text: "Hello." }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 60, cache_creation_input_tokens: 30 },
  ...over,
});

export const text = (t: string, over: Record<string, unknown> = {}) => json(message({ content: [{ type: "text", text: t }], ...over }));
export const refusal = () => json(message({ content: [], stop_reason: "refusal" }));
export const httpError = (status: number) =>
  json({ type: "error", error: { type: status === 529 ? "overloaded_error" : "api_error", message: "down" } }, status);

export const sse = (events: Array<Record<string, unknown>>) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const e of events) c.enqueue(new TextEncoder().encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
        c.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );

export const streamOf = (chunks: string[]) =>
  sse([
    { type: "message_start", message: message({ content: [], stop_reason: null, usage: { input_tokens: 50, output_tokens: 1 } }) },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ...chunks.map((t) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } })),
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 7 } },
    { type: "message_stop" },
  ]);

/**
 * Anthropic's provider over a fetch that records each request and answers from a queue, so the
 * tests see exactly what goes over the wire without a key or a network.
 */
export function mockAnthropic() {
  const calls: Recorded[] = [];
  const queue: Array<(call: Recorded) => Response> = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const call: Recorded = {
      url: String(url),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: JSON.parse(String(init?.body ?? "{}")),
    };
    calls.push(call);
    const next = queue.shift();
    if (!next) throw new Error("mockAnthropic: no response queued");
    const response = next(call);
    const model = String(call.body.model ?? "");
    const body = (await response.text()).replaceAll(REQUESTED, model);
    return new Response(body, { status: response.status, headers: response.headers });
  };
  const provider = createGenesisAnthropic({ apiKey: "test", fetch: fetch as typeof globalThis.fetch });
  return {
    provider,
    calls,
    reply: (...responses: Array<Response | (() => Response)>) => {
      for (const r of responses) queue.push(typeof r === "function" ? r : () => r);
    },
  };
}
