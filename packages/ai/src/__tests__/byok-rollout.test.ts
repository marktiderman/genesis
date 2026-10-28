// @feat:ai-providers
import { jsonSchema } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineAi, defineTask, type AiContext, type AiSpan } from "../index";
import { createAiHandler, evaluate, memoryStore, otelSink, runTask } from "../server/index";
import { httpError, mockAnthropic, streamOf, text } from "./mock-anthropic";

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

function setup(store = memoryStore({ consents: "all" }), extra: Partial<Parameters<typeof defineAi>[0]> = {}) {
  const mock = mockAnthropic();
  const ai = defineAi({
    vendors: [mock.vendor],
    models: { default: { model: "claude-sonnet-5-5" } },
    store,
    gate: () => true,
    maxRetries: 0,
    ...extra,
  });
  return { ...mock, store, ai };
}

describe("BYOK", () => {
  it("uses the person's own key over the tenant's, and keeps own-key calls off the platform budget", async () => {
    const store = memoryStore({ consents: "all", budgetUsd: 0 });
    const s = setup(store);
    expect(await runTask(s.ai, echo, { id: "x" }, ctx)).toMatchObject({ ok: false, outcome: "over_budget" });

    store.setKey("tenant:t1", "anthropic", "sk-ant-tenant-key-0001");
    s.reply(text("On the tenant's key."));
    expect(await runTask(s.ai, echo, { id: "x" }, ctx)).toMatchObject({ ok: true });
    expect(s.calls[0]!.headers["x-api-key"]).toBe("sk-ant-tenant-key-0001");

    store.setKey("person:p1", "anthropic", "sk-ant-person-key-0002");
    s.reply(text("On my key."));
    await runTask(s.ai, echo, { id: "x" }, ctx);
    expect(s.calls[1]!.headers["x-api-key"]).toBe("sk-ant-person-key-0002");
    expect(store.rows.map((r) => r.keySource)).toEqual(["tenant", "person"]);
    expect(store.spentUsd("t1")).toBe(0);
    expect(JSON.stringify(store.rows)).not.toContain("sk-ant");
  });

  it("says the key was refused instead of calling it an outage, and never falls back to the platform's", async () => {
    const store = memoryStore({ consents: "all" });
    const s = setup(store, { models: { default: { model: "claude-sonnet-5-5", fallbacks: { unavailable: ["backup"] } }, backup: { model: "claude-haiku-5-5" } } });
    store.setKey("person:p1", "anthropic", "sk-ant-revoked-key-0003");
    s.reply(httpError(401));
    expect(await runTask(s.ai, echo, { id: "x" }, ctx)).toMatchObject({ ok: false, outcome: "unavailable", message: expect.stringMatching(/key .* was refused/) });
    expect(s.calls).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ outcome: "unavailable", keySource: "person" });
  });
});

describe("rollouts and conversations", () => {
  it("moves a call to the rollout's model when `when` says so, and records it", async () => {
    let on = false;
    const s = setup(undefined, { models: { default: { model: "claude-sonnet-5-5", rollout: { model: "claude-opus-5-5", when: () => on } } } });
    s.reply(text("Old."), text("New."));
    await runTask(s.ai, echo, { id: "x" }, ctx);
    on = true;
    expect(await runTask(s.ai, echo, { id: "x" }, ctx)).toMatchObject({ ok: true, model: "claude-opus-5-5" });
    expect(s.calls.map((c) => c.body.model)).toEqual(["claude-sonnet-5-5", "claude-opus-5-5"]);
    expect(s.store.rows.map((r) => r.requestedModel)).toEqual(["claude-sonnet-5-5", "claude-opus-5-5"]);
  });

  it("sends a conversation as messages, and takes any schema the SDK takes", async () => {
    const s = setup();
    const chat = defineTask({
      ...echo,
      id: "chat",
      // A JSON Schema with its own validator, as a non-Zod app would write it.
      args: jsonSchema<{ id: string }>({ type: "object", properties: { id: { type: "string" } }, required: ["id"] }, {
        validate: (v) => (typeof (v as { id?: unknown })?.id === "string" ? { success: true, value: v as { id: string } } : { success: false, error: new Error("id") }),
      }),
      prompt: ({ id }) => [
        { role: "user", content: "Earlier question" },
        { role: "assistant", content: "Earlier answer" },
        { role: "user", content: id },
      ],
    });
    expect(await runTask(s.ai, chat, { id: 3 }, ctx)).toMatchObject({ ok: false, outcome: "invalid_input" });
    s.reply(text("Answer."));
    await runTask(s.ai, chat, { id: "Now?" }, ctx);
    expect((s.calls[0]!.body.messages as unknown[]).length).toBe(3);
  });
});

describe("consent and budgets", () => {
  it("counts consent only to the current text, and skips it for tasks the terms cover", async () => {
    const store = memoryStore();
    const s = setup(store, { consentVersion: "2026-10" });
    store.grant("p1", "anthropic", "2026-01");
    expect(await runTask(s.ai, echo, { id: "x" }, ctx)).toMatchObject({ ok: false, outcome: "no_consent" });
    s.reply(text("Covered."));
    expect(await runTask(s.ai, defineTask({ ...echo, consent: "terms" }), { id: "x" }, ctx)).toMatchObject({ ok: true });
    store.grant("p1", "anthropic", "2026-10");
    s.reply(text("Agreed."));
    expect(await runTask(s.ai, echo, { id: "x" }, ctx)).toMatchObject({ ok: true });
  });

  it("caps one person's share of the tenant's budget", async () => {
    const store = memoryStore({ consents: "all", budgetUsd: 1, perPersonUsd: 0.0006 });
    const s = setup(store);
    s.reply(text("One."), text("Two."));
    expect(await runTask(s.ai, echo, { id: "x" }, ctx)).toMatchObject({ ok: true });
    expect(await runTask(s.ai, echo, { id: "x" }, ctx)).toMatchObject({ ok: false, outcome: "over_budget" });
    expect(await runTask(s.ai, echo, { id: "x" }, { ...ctx, personId: "p2" })).toMatchObject({ ok: true });
  });
});

describe("the handler's stream, telemetry and evaluations", () => {
  it("streams a text task as server-sent events, ending with the result", async () => {
    const s = setup();
    s.reply(streamOf(["Rough ", "night."]));
    const handle = createAiHandler({ ai: s.ai, tasks: [echo], context: () => ctx });
    const res = await handle(new Request("https://app.test/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: "echo", args: { id: "x" }, stream: true }) }));
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const events = (await res.text()).split("\n\n").filter(Boolean).map((e) => JSON.parse(e.replace(/^data: /, "")));
    expect(events.filter((e) => e.type === "text").map((e) => e.text).join("")).toBe("Rough night.");
    expect(events.at(-1)).toMatchObject({ type: "done", result: { ok: true, output: { text: "Rough night." } } });
  });

  it("sends spans to an OpenTelemetry tracer", async () => {
    const started: Array<{ name: string; attributes: AiSpan["attributes"]; ended?: number }> = [];
    const tracer = {
      startSpan: (name: string, o: { startTime: number; attributes: AiSpan["attributes"] }) => {
        const span: (typeof started)[number] = { name, attributes: o.attributes };
        started.push(span);
        return { end: (t?: number) => void (span.ended = t) };
      },
    };
    const s = setup(undefined, { telemetry: otelSink(tracer) });
    s.reply(text("Hi."));
    await runTask(s.ai, echo, { id: "x" }, ctx);
    expect(started[0]).toMatchObject({ name: "chat claude-sonnet-5-5", attributes: { "genesis.ai.outcome": "ok", "genesis.ai.key_source": "platform" } });
    expect(started[0]!.ended).toBeTypeOf("number");
  });

  it("evaluates a task over cases with the real pipeline", async () => {
    const s = setup();
    s.reply(text("A short answer."), text("A much, much longer answer than anyone asked for."));
    const report = await evaluate(s.ai, echo, [
      { name: "short", args: { id: "a" }, ctx, check: (r) => (r.ok && r.output.text.length < 20 ? true : "too long") },
      { name: "also short", args: { id: "b" }, ctx, check: (r) => (r.ok && r.output.text.length < 20 ? true : "too long") },
    ]);
    expect(report).toEqual({ task: "echo", version: 1, passed: 1, failed: [{ name: "also short", reason: "too long" }] });
  });
});
