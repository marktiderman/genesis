// @feat:ai-providers
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineAi, defineTask, costOf, MODEL_RECORDS, type AiContext } from "../index";
import { AiCallError, createAiHandler, memoryStore, wrap } from "../server/index";
import { mockAnthropic, text } from "./mock-anthropic";

const ctx: AiContext = { tenantId: "t1", personId: "p1", db: null };

const echo = defineTask({
  id: "echo",
  version: 1,
  feature: "ai-providers",
  model: "default",
  maxTokens: 50,
  args: z.object({ id: z.string().max(40) }),
  load: async (_c, args) => ({ id: args.id }),
  system: "Echo.",
  prompt: ({ id }) => id,
  output: "text",
});

function ai(store = memoryStore({ consents: "all" })) {
  const mock = mockAnthropic();
  return { ...mock, store, ai: defineAi({ models: { default: { model: mock.provider("claude-haiku-5-5") } }, store, gate: () => true, maxRetries: 0 }) };
}

describe("createAiHandler", () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("https://app.test/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("runs a listed task for a signed-in caller", async () => {
    const s = ai();
    s.reply(text("hi"));
    const handle = createAiHandler({ ai: s.ai, tasks: [echo], context: () => ctx });
    const res = await handle(post({ task: "echo", args: { id: "x" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, output: { text: "hi" } });
  });

  it("answers 405, 401, 400, 404 and 413 before running anything", async () => {
    const s = ai();
    const handle = createAiHandler({ ai: s.ai, tasks: [echo], context: (r) => (r.headers.get("x-anon") ? null : ctx), maxBodyBytes: 100 });
    expect((await handle(new Request("https://app.test/api/ai"))).status).toBe(405);
    expect((await handle(new Request("https://app.test/api/ai", { method: "POST", headers: { "x-anon": "1", "content-type": "application/json" }, body: "{}" }))).status).toBe(401);
    expect((await handle(post("{nope"))).status).toBe(400);
    expect((await handle(post({ task: "other" }))).status).toBe(404);
    expect((await handle(post({ task: "echo", args: { id: "x".repeat(200) } }))).status).toBe(413);
    expect(s.calls).toHaveLength(0);
  });

  it("maps outcomes to statuses", async () => {
    const s = ai(memoryStore({ consents: [] }));
    const handle = createAiHandler({ ai: s.ai, tasks: [echo], context: () => ctx });
    expect((await handle(post({ task: "echo", args: { id: "x" } }))).status).toBe(403);
    expect((await handle(post({ task: "echo", args: { id: 1 } }))).status).toBe(400);
  });

  it("refuses cross-site requests before reading the session", async () => {
    const s = ai();
    let asked = 0;
    const handle = createAiHandler({ ai: s.ai, tasks: [echo], context: () => (asked++, ctx), allowedOrigins: ["https://web.app.test"] });
    const plain = new Request("https://app.test/api/ai", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ task: "echo", args: { id: "x" } }) });
    expect((await handle(plain)).status).toBe(415);
    expect((await handle(post({ task: "echo", args: { id: "x" } }, { origin: "https://evil.test" }))).status).toBe(403);
    expect(asked).toBe(0);
    expect(s.calls).toHaveLength(0);

    s.reply(text("a"), text("b"), text("c"));
    expect((await handle(post({ task: "echo", args: { id: "x" } }, { origin: "https://app.test" }))).status).toBe(200);
    expect((await handle(post({ task: "echo", args: { id: "x" } }, { origin: "https://web.app.test" }))).status).toBe(200);
    // A native app sends a bearer token and no Origin.
    expect((await handle(post({ task: "echo", args: { id: "x" } }))).status).toBe(200);
  });

  it("answers 503 and reports a thrown error instead of leaking it", async () => {
    const s = ai();
    const broken = defineTask({ ...echo, id: "broken", load: async () => { throw new Error("db down: secret detail"); } });
    const seen: unknown[] = [];
    const handle = createAiHandler({ ai: s.ai, tasks: [broken], context: () => ctx, onError: (e) => seen.push(e) });
    const res = await handle(post({ task: "broken", args: { id: "x" } }));
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toContain("unavailable");
    expect(body).not.toContain("secret detail");
    expect(seen).toHaveLength(1);
  });

  it("refuses two tasks with one id", () => {
    expect(() => createAiHandler({ ai: ai().ai, tasks: [echo, echo], context: () => ctx })).toThrow(/share an id/);
  });
});

describe("wrap", () => {
  const moderate = async (text: string) => ({ flagged: text.includes("bad") });

  it("records a processor call with its quantity and cost", async () => {
    const s = ai(memoryStore());
    const wrapped = wrap(s.ai, moderate, {
      id: "chat.moderate",
      vendor: "openai",
      feature: "ai-providers",
      consent: "terms",
      budget: "exempt",
      context: () => ctx,
      cost: (n) => n * 0.0001,
    });
    expect(await wrapped("fine")).toEqual({ flagged: false });
    expect(s.store.rows[0]).toMatchObject({ taskId: "chat.moderate", vendor: "openai", outcome: "ok", budgetExempt: true, costUsd: 0.0001, usage: { quantity: 1 } });
  });

  it("asks for consent when told to, and stops on the budget unless exempt", async () => {
    const store = memoryStore({ budgetUsd: 0 });
    const s = ai(store);
    const opts = { id: "chat.transcribe", vendor: "deepgram", feature: "ai-providers", context: () => ctx, estimateUsd: () => 0.01 } as const;
    const personal = wrap(s.ai, moderate, { ...opts, consent: "person", budget: "counted" });
    await expect(personal("x")).rejects.toMatchObject({ outcome: "no_consent" });
    store.grant("p1", "deepgram");
    await expect(personal("x")).rejects.toBeInstanceOf(AiCallError);
    await expect(personal("x")).rejects.toMatchObject({ outcome: "over_budget" });
    const exempt = wrap(s.ai, moderate, { ...opts, consent: "person", budget: "exempt" });
    await expect(exempt("x")).resolves.toEqual({ flagged: false });
  });

  it("records a failure and rethrows it", async () => {
    const s = ai(memoryStore());
    const broken = wrap(s.ai, async () => { throw new TypeError("boom"); }, { id: "x", vendor: "openai", feature: "f", consent: "terms", budget: "exempt", context: () => ctx });
    await expect(broken()).rejects.toThrow("boom");
    expect(s.store.rows[0]).toMatchObject({ outcome: "unavailable", detail: "TypeError", usage: null });
  });
});

describe("memoryStore", () => {
  it("admits while spend plus open estimates stays within the budget", async () => {
    const store = memoryStore({ budgetUsd: 1 });
    const base = { tenantId: "t", personId: "p", taskId: "x", taskVersion: 1, vendor: "anthropic", model: "m", budgetExempt: false };
    const a = await store.begin({ ...base, estimateUsd: 0.6 });
    expect(await store.begin({ ...base, estimateUsd: 0.6 })).toBeNull(); // a is still open
    await store.finish({ callId: a!.callId, outcome: "ok", model: "m", usage: null, costUsd: 0.1, latencyMs: 1, manifest: [] });
    expect(await store.begin({ ...base, estimateUsd: 0.6 })).not.toBeNull();
    expect(store.spentUsd("t")).toBeCloseTo(0.1);
  });

  it("limits open calls per tenant", async () => {
    const store = memoryStore({ concurrencyPerTenant: 1 });
    const base = { tenantId: "t", personId: "p", taskId: "x", taskVersion: 1, vendor: "anthropic", model: "m", budgetExempt: false, estimateUsd: 0 };
    expect(await store.begin(base)).not.toBeNull();
    expect(await store.begin(base)).toBeNull();
    expect(await store.begin({ ...base, tenantId: "u" })).not.toBeNull();
  });
});

describe("definitions", () => {
  it("defineAi refuses a model with no record and a fallback to nowhere", () => {
    const store = memoryStore();
    const model = (id: string) => ({ modelId: id, provider: "anthropic.messages" });
    expect(() => defineAi({ models: { a: { model: model("claude-x") } }, store, gate: () => true })).toThrow(/no model record/);
    expect(() =>
      defineAi({ models: { a: { model: model("claude-opus-5-5"), fallbacks: { unavailable: ["b"] } } }, store, gate: () => true }),
    ).toThrow(/not an alias/);
  });

  it("defineTask checks the id, version and output cap", () => {
    expect(() => defineTask({ ...echo, id: "Echo Task" })).toThrow(/not a valid task id/);
    expect(() => defineTask({ ...echo, version: 0 })).toThrow(/version/);
    expect(() => defineTask({ ...echo, maxTokens: 1.5 })).toThrow(/maxTokens/);
  });

  it("prices Haiku's long-context tier", () => {
    const haiku = MODEL_RECORDS["claude-haiku-5-5"]!;
    const usage = (inputTokens: number) => ({ inputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1_000_000 });
    expect(costOf(haiku, usage(100_000))).toBeCloseTo(0.01 + 0.5);
    expect(costOf(haiku, usage(200_000))).toBeCloseTo(0.1 + 2.5);
  });
});
