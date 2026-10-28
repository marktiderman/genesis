// @feat:ai-providers
// Fixes from the PR 456 review: consent per vendor, guardrails over message parts, billing a
// failed schema attempt across an outage, refusals on structured tasks, and streams that always end.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { costOf, defineAi, defineTask, MODEL_RECORDS, type AiContext, type AiStore } from "../index";
import { createAiHandler, memoryStore, runTask, streamTask } from "../server/index";
import { anthropic } from "../anthropic";
import { httpError, message, mockAnthropic, refusal, sse, streamOf, text } from "./mock-anthropic";

const ctx: AiContext = { tenantId: "t1", personId: "p1", db: null };

const echo = defineTask({
  id: "echo",
  version: 1,
  feature: "ai-providers",
  model: "default",
  maxTokens: 50,
  args: z.object({ id: z.string() }),
  load: async (_c, args) => ({ id: args.id }),
  system: "Echo.",
  prompt: ({ id }) => id,
  output: "text",
});

const openaiVendor = { id: "openai", model: (id: string) => ({ modelId: id, provider: "openai.responses" }) };
const gptRecord = { id: "gpt-x", vendor: "openai", price: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 }, refusalFallback: false, capabilities: [] };

function setup(store: AiStore = memoryStore({ consents: "all" }), extra: Partial<Parameters<typeof defineAi>[0]> = {}) {
  const mock = mockAnthropic();
  const ai = defineAi({
    vendors: [mock.vendor, openaiVendor],
    models: {
      default: { model: "claude-sonnet-5-5", fallbacks: { unavailable: ["elsewhere", "backup"] } },
      backup: { model: "claude-haiku-5-5" },
      elsewhere: { model: "gpt-x" },
    },
    modelRecords: { "gpt-x": gptRecord },
    store,
    gate: () => true,
    maxRetries: 0,
    ...extra,
  });
  return { ...mock, ai };
}

describe("consent covers every vendor a call can reach", () => {
  it("stops a call whose rollout lands on a vendor the person didn't agree to", async () => {
    const store = memoryStore({ consents: [["p1", "anthropic"]] });
    const s = setup(store, { models: { default: { model: "claude-sonnet-5-5", rollout: { model: "gpt-x", when: () => true } } } });
    expect(await runTask(s.ai, echo, { id: "x" }, ctx)).toMatchObject({ ok: false, outcome: "no_consent", message: expect.stringContaining("openai") });
    expect(s.calls).toHaveLength(0);
  });

  it("drops a cross-vendor fallback the person didn't agree to, and keeps the ones they did", async () => {
    const store = memoryStore({ consents: [["p1", "anthropic"]] });
    const s = setup(store, { crossVendorFallback: () => true });
    s.reply(httpError(529), text("From the backup."));
    expect(await runTask(s.ai, echo, { id: "x" }, ctx)).toMatchObject({ ok: true, output: { text: "From the backup." }, model: "claude-haiku-5-5" });
    expect(s.calls.map((c) => c.body.model)).toEqual(["claude-sonnet-5-5", "claude-haiku-5-5"]);
  });
});

describe("input guardrails read every text part", () => {
  const conversation = (content: unknown) =>
    defineTask({
      ...echo,
      id: "echo.parts",
      prompt: () => [{ role: "user", content }] as never,
      guardrails: { input: [(t) => t.replace(/\d/g, "#")] },
    });

  it("guards text parts inside a turn", async () => {
    const s = setup();
    s.reply(text("ok"));
    await runTask(s.ai, conversation([{ type: "text", text: "card 4242" }]), { id: "x" }, ctx);
    expect(JSON.stringify(s.calls[0]!.body.messages)).toContain("card ####");
    expect(JSON.stringify(s.calls[0]!.body.messages)).not.toContain("4242");
  });

  it("stops rather than pass a part it can't read", async () => {
    const s = setup();
    const result = await runTask(s.ai, conversation([{ type: "text", text: "see" }, { type: "image", image: new URL("https://example.test/a.png") }]), { id: "x" }, ctx);
    expect(result).toMatchObject({ ok: false, outcome: "invalid_input" });
    expect(s.calls).toHaveLength(0);
  });
});

describe("structured output", () => {
  const structured = defineTask({ ...echo, id: "echo.structured", output: z.object({ summary: z.string() }) });

  it("bills a failed schema attempt even when the retry hits an outage and another model answers", async () => {
    const store = memoryStore({ consents: "all" });
    const s = setup(store);
    s.reply(text("not json"), httpError(529), text(JSON.stringify({ summary: "From the backup." })));
    expect(await runTask(s.ai, structured, { id: "x" }, ctx)).toMatchObject({ ok: true, output: { summary: "From the backup." } });
    // Each mocked answer reports 100 uncached input and 20 output tokens: two answered attempts.
    expect(store.rows[0]!.usage).toMatchObject({ inputTokens: 200, outputTokens: 40 });
  });

  it("keeps that bill when every later model is down", async () => {
    const store = memoryStore({ consents: "all" });
    const s = setup(store);
    s.reply(text("not json"), httpError(529), httpError(503));
    expect(await runTask(s.ai, structured, { id: "x" }, ctx)).toMatchObject({ ok: false, outcome: "unavailable" });
    expect(store.rows[0]).toMatchObject({ outcome: "unavailable", usage: { inputTokens: 100, outputTokens: 20 } });
    expect(store.rows[0]!.costUsd).toBeGreaterThan(0);
  });

  it("reports a refusal as `refused`, not as a schema miss, and doesn't retry it", async () => {
    const store = memoryStore({ consents: "all" });
    const s = setup(store);
    s.reply(refusal());
    expect(await runTask(s.ai, structured, { id: "x" }, ctx)).toMatchObject({ ok: false, outcome: "refused" });
    expect(s.calls).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ outcome: "refused" });
  });
});

describe("streams always end", () => {
  it("resolves `done` as unavailable when the usage row can't be written", async () => {
    const inner = memoryStore({ consents: "all" });
    const store: AiStore = { ...inner, finish: async () => Promise.reject(new Error("store down")) };
    const s = setup(store);
    s.reply(streamOf(["Hi."]));
    const started = await streamTask(s.ai, echo, { id: "x" }, ctx);
    if (!started.ok) throw new Error(started.outcome);
    for await (const _ of started.textStream) {
      // drain
    }
    expect(await started.done).toMatchObject({ ok: false, outcome: "unavailable" });
  });

  it("aborts the model call and closes the row when the reader cancels", async () => {
    const store = memoryStore({ consents: "all" });
    // A model that starts answering and never finishes; like a real fetch, its body errors on abort.
    let aborted = false;
    const slowFetch = async (_url: unknown, init?: RequestInit) => {
      const opened = sse([
        { type: "message_start", message: message({ content: [], stop_reason: null, usage: { input_tokens: 50, output_tokens: 1 } }) },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } },
      ]);
      const upstream = opened.body!.getReader();
      return new Response(
        new ReadableStream({
          start(c) {
            init?.signal?.addEventListener("abort", () => {
              aborted = true;
              c.error(new DOMException("aborted", "AbortError"));
            });
          },
          async pull(c) {
            const { value, done } = await upstream.read();
            if (done) return new Promise<void>(() => {});
            c.enqueue(value);
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    };
    const ai = defineAi({
      vendors: [anthropic({ apiKey: "test", fetch: slowFetch as typeof globalThis.fetch })],
      models: { default: { model: "claude-sonnet-5-5" } },
      store,
      gate: () => true,
      maxRetries: 0,
    });
    const handle = createAiHandler({ ai, tasks: [echo], context: () => ctx });
    const res = await handle(
      new Request("https://app.test/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: "echo", args: { id: "x" }, stream: true }) }),
    );
    const reader = res.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("Hel");
    await reader.cancel();
    for (let i = 0; i < 100 && store.rows.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
    expect(aborted).toBe(true);
    expect(store.rows[0]).toMatchObject({ outcome: "unavailable", detail: "aborted" });
  });
});

describe("pricing", () => {
  it("scales cache prices with Haiku's long-context tier", () => {
    const haiku = MODEL_RECORDS["claude-haiku-5-5"]!;
    const cached = (cacheReadTokens: number, cacheWriteTokens: number) => ({ inputTokens: 100_001, cacheReadTokens, cacheWriteTokens, outputTokens: 0 });
    const base = costOf(haiku, cached(0, 0));
    // Above 100K input, input is 5× the base price, and so are cache reads and 5-minute writes.
    expect(costOf(haiku, cached(1_000_000, 0)) - base).toBeCloseTo(0.01 * 5);
    expect(costOf(haiku, cached(0, 1_000_000)) - base).toBeCloseTo(0.1 * 1.25 * 5);
  });
});
