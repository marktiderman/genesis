// @feat:ai-providers
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AI_SPEC, defineAi, defineTask, RUN_EVENT_TYPES, textStreamToRunEvents, type AiContext, type AiSpan, type AiStore, type ConsentStore } from "../index";
import { createAiHandler, memoryStore, runTask, wrap } from "../server/index";
import { mockAnthropic, streamOf, text } from "./mock-anthropic";

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

function setup() {
  const mock = mockAnthropic();
  const store = memoryStore({ consents: "all" });
  const spans: AiSpan[] = [];
  const begun: unknown[] = [];
  const watched: AiStore = { ...store, begin: (input) => (begun.push(input), store.begin(input)), finish: (i) => store.finish(i), hasConsent: (...a) => store.hasConsent(...a) };
  const ai = defineAi({ vendors: [mock.vendor], models: { default: { model: "claude-sonnet-5-5" } }, store: watched, gate: () => true, telemetry: (s) => spans.push(s), maxRetries: 0 });
  return { ...mock, ai, spans, begun };
}

describe("the AI contract, spec 1", () => {
  it("stamps every task with spec 1 and refuses another spec", () => {
    expect(AI_SPEC).toBe(1);
    expect(echo.spec).toBe(1);
    // @ts-expect-error only spec 1 exists
    expect(() => defineTask({ ...echo, spec: 2 })).toThrow(/spec 2 isn't supported/);
  });

  it("puts the actor, run and conversation on the span and on begin", async () => {
    const s = setup();
    s.reply(text("Hi."), text("Again."));
    await runTask(s.ai, echo, { id: "x" }, { ...ctx, actor: "agent", runId: "run-1", conversationId: "conv-1" });
    expect(s.spans[0]!.attributes).toMatchObject({ "genesis.ai.actor": "agent", "genesis.ai.run_id": "run-1", "gen_ai.conversation.id": "conv-1" });
    expect(s.begun[0]).toMatchObject({ actor: "agent", runId: "run-1", conversationId: "conv-1" });
    await runTask(s.ai, echo, { id: "x" }, ctx);
    expect(s.spans[1]!.attributes["genesis.ai.actor"]).toBe("person");
    expect(s.spans[1]!.attributes).not.toHaveProperty("gen_ai.conversation.id");
  });

  it("names a wrapped processor's span `{operation} {id}`, as OpenTelemetry GenAI does", async () => {
    const s = setup();
    const moderate = wrap(s.ai, async (t: string) => t.length, { id: "chat.moderate", operation: "moderation", vendor: "openai", feature: "ai-providers", consent: "terms", budget: "exempt", context: () => ctx });
    const tool = wrap(s.ai, async () => 1, { id: "notes.search", vendor: "genesis", feature: "ai-providers", consent: "terms", budget: "exempt", context: () => ({ ...ctx, actor: "system" as const }) });
    await moderate("fine");
    await tool();
    expect(s.spans.map((x) => x.name)).toEqual(["moderation chat.moderate", "execute_tool notes.search"]);
    expect(s.spans[1]!.attributes["genesis.ai.actor"]).toBe("system");
  });

  it("splits the store into ports that a full store satisfies", () => {
    const consent: ConsentStore = memoryStore({ consents: "all" });
    expect(typeof consent.hasConsent).toBe("function");
  });
});

describe("run events (AG-UI names)", () => {
  it("turns the text stream into a run: started, message, finished", () => {
    const to = textStreamToRunEvents({ runId: "r1" });
    const ok = { ok: true as const, output: { text: "Hi." }, model: "m", taskVersion: 1, usageId: "u", labelled: true as const };
    expect([...to({ type: "text", text: "Hi" }), ...to({ type: "text", text: "." }), ...to({ type: "done", result: ok })]).toEqual([
      { type: "RUN_STARTED", threadId: "r1", runId: "r1" },
      { type: "TEXT_MESSAGE_START", messageId: "r1:0", role: "assistant" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "r1:0", delta: "Hi" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "r1:0", delta: "." },
      { type: "TEXT_MESSAGE_END", messageId: "r1:0" },
      { type: "RUN_FINISHED", threadId: "r1", runId: "r1", result: ok },
    ]);
    const failed = textStreamToRunEvents({ runId: "r2", threadId: "c1" })({ type: "done", result: { ok: false, outcome: "refused", message: "No." } });
    expect(failed).toEqual([
      { type: "RUN_STARTED", threadId: "c1", runId: "r2" },
      { type: "RUN_ERROR", message: "No.", code: "refused", result: { ok: false, outcome: "refused", message: "No." } },
    ]);
    expect(RUN_EVENT_TYPES).toContain("TOOL_CALL_START");
  });

  it("streams run events from the handler with stream: \"events\"", async () => {
    const s = setup();
    s.reply(streamOf(["Rough ", "night."]));
    const handle = createAiHandler({ ai: s.ai, tasks: [echo], context: () => ({ ...ctx, runId: "run-9", conversationId: "conv-9" }) });
    const res = await handle(new Request("https://app.test/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: "echo", args: { id: "x" }, stream: "events" }) }));
    const events = (await res.text()).split("\n\n").filter(Boolean).map((e) => JSON.parse(e.replace(/^data: /, "")));
    expect(events.map((e) => e.type)).toEqual(["RUN_STARTED", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "RUN_FINISHED"]);
    expect(events[0]).toEqual({ type: "RUN_STARTED", threadId: "conv-9", runId: "run-9" });
    expect(events.filter((e) => e.type === "TEXT_MESSAGE_CONTENT").map((e) => e.delta).join("")).toBe("Rough night.");
  });

  it("names a run it starts, on the stream and on the span alike", async () => {
    const s = setup();
    s.reply(streamOf(["Hi."]));
    const handle = createAiHandler({ ai: s.ai, tasks: [echo], context: () => ctx });
    const res = await handle(new Request("https://app.test/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: "echo", args: { id: "x" }, stream: "events" }) }));
    const events = (await res.text()).split("\n\n").filter(Boolean).map((e) => JSON.parse(e.replace(/^data: /, "")));
    const runId = events[0].runId as string;
    expect(runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(events.at(-1)).toMatchObject({ type: "RUN_FINISHED", runId });
    expect(s.spans[0]!.attributes["genesis.ai.run_id"]).toBe(runId);
    expect(s.begun[0]).toMatchObject({ runId });
  });
});
