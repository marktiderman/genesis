// @feat:ai-providers
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineAi, defineTask, GuardrailError, type AiContext, type AiSpan } from "../index";
import { memoryStore, runTask, streamTask } from "../server/index";
import { httpError, mockAnthropic, refusal, streamOf, text } from "./mock-anthropic";

type Db = { notes: Record<string, string> };

const ctx: AiContext<Db> = {
  tenantId: "practice-1",
  personId: "person-1",
  db: { notes: { n1: "Slept badly, skipped the run.", n2: "I want to hurt myself." } },
};

const recap = defineTask<{ noteId: string }, { note: string }, { text: string }, Db>({
  id: "notes.recap",
  version: 3,
  feature: "ai-coach-drafts",
  model: "default",
  maxTokens: 500,
  args: z.object({ noteId: z.string() }),
  load: async (c, args) => {
    const note = c.db.notes[args.noteId] ?? "";
    c.layer("note", note, [args.noteId]);
    return { note };
  },
  system: "You recap a client's note in one line.",
  prompt: ({ note }) => `Note:\n${note}`,
  output: "text",
  safetyText: ({ note }) => note,
});

function setup(over: { gate?: boolean; budgetUsd?: number; consent?: boolean; crossVendor?: boolean } = {}) {
  const mock = mockAnthropic();
  const store = memoryStore({ consents: over.consent === false ? [] : "all", budgetUsd: over.budgetUsd });
  const spans: AiSpan[] = [];
  const ai = defineAi({
    vendors: [mock.vendor, { id: "openai", model: (id) => ({ modelId: id, provider: "openai.responses" }) }],
    models: {
      default: { model: "claude-sonnet-5-5", effort: "low", fallbacks: { unavailable: ["backup", "elsewhere"] } },
      backup: { model: "claude-haiku-5-5" },
      elsewhere: { model: "gpt-x" },
    },
    modelRecords: {
      "gpt-x": { id: "gpt-x", vendor: "openai", price: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 }, refusalFallback: false, capabilities: [] },
    },
    store,
    gate: () => over.gate ?? true,
    safety: (t) => (/hurt myself/.test(t) ? { category: "crisis", response: "Call or text 988." } : null),
    telemetry: (s) => spans.push(s),
    crossVendorFallback: () => over.crossVendor ?? false,
    maxRetries: 0,
  });
  return { ...mock, store, spans, ai };
}

describe("runTask", () => {
  it("runs a text task and records usage without content", async () => {
    const { ai, reply, calls, store, spans } = setup();
    reply(text("  Rough night; run skipped.  "));
    const result = await runTask(ai, recap, { noteId: "n1" }, ctx);

    expect(result).toMatchObject({ ok: true, output: { text: "Rough night; run skipped." }, model: "claude-sonnet-5-5", taskVersion: 3, labelled: true });
    const call = calls[0]!;
    expect(call.headers["anthropic-version"]).toBe("2026-10-21");
    expect(call.body).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 500, fallbacks: "default", output_config: { effort: "low" } });
    expect(call.headers["anthropic-beta"]).toMatch(/server-side-fallback/);
    for (const k of ["temperature", "top_p", "top_k"]) expect(call.body).not.toHaveProperty(k);

    const row = store.rows[0]!;
    expect(row).toMatchObject({ outcome: "ok", taskId: "notes.recap", taskVersion: 3, model: "claude-sonnet-5-5", tenantId: "practice-1" });
    expect(row.usage).toEqual({ inputTokens: 100, cacheReadTokens: 60, cacheWriteTokens: 30, outputTokens: 20 });
    // 100 × $2 + 60 × $0.10 + 30 × $2.50 + 20 × $10, per million
    expect(row.costUsd).toBeCloseTo((200 + 6 + 75 + 200) / 1e6, 10);
    expect(row.manifest).toEqual([{ name: "note", tokens: Math.ceil(ctx.db.notes.n1!.length / 4), ids: ["n1"] }]);
    const stored = JSON.stringify(store.rows) + JSON.stringify(spans);
    expect(stored).not.toContain("Slept badly");
    expect(stored).not.toContain("Rough night");
    expect(spans[0]!.attributes).toMatchObject({ "gen_ai.request.model": "claude-sonnet-5-5", "genesis.ai.outcome": "ok", "genesis.ai.task": "notes.recap" });
  });

  it("stops before the model without consent, with the gate off, or when `can` says no", async () => {
    let s = setup({ consent: false });
    expect(await runTask(s.ai, recap, { noteId: "n1" }, ctx)).toMatchObject({ ok: false, outcome: "no_consent" });
    expect(s.calls).toHaveLength(0);
    expect(s.store.rows).toHaveLength(0);

    s = setup({ gate: false });
    expect(await runTask(s.ai, recap, { noteId: "n1" }, ctx)).toMatchObject({ ok: false, outcome: "off" });

    s = setup();
    const coachesOnly = defineTask({ ...recap, can: () => false });
    expect(await runTask(s.ai, coachesOnly, { noteId: "n1" }, ctx)).toMatchObject({ ok: false, outcome: "forbidden" });
    expect(s.calls).toHaveLength(0);
  });

  it("rejects arguments that don't match the task", async () => {
    const { ai, calls } = setup();
    expect(await runTask(ai, recap, { noteId: 7 }, ctx)).toMatchObject({ ok: false, outcome: "invalid_input" });
    expect(calls).toHaveLength(0);
  });

  it("routes on the safety protocol before any model sees the text", async () => {
    const { ai, calls, store } = setup();
    const result = await runTask(ai, recap, { noteId: "n2" }, ctx);
    expect(result).toMatchObject({ ok: false, outcome: "safety_routed", safety: { category: "crisis", response: "Call or text 988." } });
    expect(calls).toHaveLength(0);
    expect(store.rows).toHaveLength(0);
  });

  it("applies input and output guardrails", async () => {
    const { ai, reply } = setup();
    const blocked = defineTask({
      ...recap,
      guardrails: {
        input: [
          (t) => {
            throw new GuardrailError(`too long: ${t.length}`);
          },
        ],
      },
    });
    expect(await runTask(ai, blocked, { noteId: "n1" }, ctx)).toMatchObject({ ok: false, outcome: "invalid_input" });

    const redacting = defineTask({ ...recap, guardrails: { output: [(t) => t.replace(/run/g, "[activity]")] } });
    reply(text("Run skipped; no run today."));
    expect(await runTask(ai, redacting, { noteId: "n1" }, ctx)).toMatchObject({ ok: true, output: { text: "Run skipped; no [activity] today." } });
  });

  it("refuses admission over budget, counting calls still open", async () => {
    const { ai, calls } = setup({ budgetUsd: 0.001 });
    // 500 output tokens at $10/M alone is $0.005.
    expect(await runTask(ai, recap, { noteId: "n1" }, ctx)).toMatchObject({ ok: false, outcome: "over_budget" });
    expect(calls).toHaveLength(0);
  });

  it("reports a refusal as `refused`, with a usage row", async () => {
    const { ai, reply, store } = setup();
    reply(refusal());
    const result = await runTask(ai, recap, { noteId: "n1" }, ctx);
    expect(result).toMatchObject({ ok: false, outcome: "refused" });
    expect(store.rows[0]).toMatchObject({ outcome: "refused", detail: "refusal" });
    expect(result.ok === false && result.usageId).toBe(store.rows[0]!.id);
  });

  it("an empty answer is invalid output", async () => {
    const { ai, reply } = setup();
    reply(text("   "));
    expect(await runTask(ai, recap, { noteId: "n1" }, ctx)).toMatchObject({ ok: false, outcome: "invalid_output" });
  });

  it("returns structured output through output_config.format, with one repair retry", async () => {
    const { ai, reply, calls, store } = setup();
    const schema = z.object({ summary: z.string(), mood: z.enum(["low", "ok", "high"]) });
    const structured = defineTask({ ...recap, id: "notes.structured", output: schema });
    reply(text(JSON.stringify({ summary: "Rough night", mood: "low" })));
    expect(await runTask(ai, structured, { noteId: "n1" }, ctx)).toMatchObject({ ok: true, output: { summary: "Rough night", mood: "low" } });
    expect(calls[0]!.body.output_config).toHaveProperty("format");
    expect(calls[0]!.body.tool_choice).toBeUndefined();

    reply(text("not json"), text(JSON.stringify({ summary: "Second try", mood: "ok" })));
    expect(await runTask(ai, structured, { noteId: "n1" }, ctx)).toMatchObject({ ok: true, output: { summary: "Second try" } });
    // The failed attempt was billed too: both attempts' tokens are on the row.
    expect(store.rows.at(-1)!.usage).toMatchObject({ inputTokens: 200, outputTokens: 40 });

    reply(text("not json"), text(JSON.stringify({ mood: "bad" })));
    expect(await runTask(ai, structured, { noteId: "n1" }, ctx)).toMatchObject({ ok: false, outcome: "invalid_output" });
    expect(store.rows.at(-1)).toMatchObject({ outcome: "invalid_output", detail: "schema" });
  });

  it("falls back to the next same-vendor alias on an outage", async () => {
    const { ai, reply, calls, store } = setup();
    reply(httpError(529), text("From the backup."));
    const result = await runTask(ai, recap, { noteId: "n1" }, ctx);
    expect(result).toMatchObject({ ok: true, output: { text: "From the backup." } });
    expect(calls.map((c) => c.body.model)).toEqual(["claude-sonnet-5-5", "claude-haiku-5-5"]);
    // Haiku has no server-side refusal fallback; the backup alias sets no effort.
    expect(calls[1]!.body).not.toHaveProperty("fallbacks");
    expect(store.rows[0]).toMatchObject({ outcome: "ok", model: "claude-haiku-5-5", requestedModel: "claude-sonnet-5-5" });
  });

  it("bills a server-side refusal fallback at the rates of every model that ran", async () => {
    const { ai, reply, store } = setup();
    const hop = (type: string, model: string, input: number, output: number) => ({ type, model, input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
    reply(
      text("From the fallback.", {
        model: "claude-opus-5-5",
        usage: { input_tokens: 412, output_tokens: 264, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, iterations: [hop("message", "claude-sonnet-5-5", 535, 0), hop("fallback_message", "claude-opus-5-5", 412, 264)] },
      }),
    );
    expect(await runTask(ai, recap, { noteId: "n1" }, ctx)).toMatchObject({ ok: true, model: "claude-opus-5-5" });
    // The declined Sonnet hop at Sonnet's input price, the answer at Opus's.
    expect(store.rows[0]).toMatchObject({ model: "claude-opus-5-5", requestedModel: "claude-sonnet-5-5", usage: { inputTokens: 412, outputTokens: 264 } });
    expect(store.rows[0]!.costUsd).toBeCloseTo((535 * 2 + 412 * 4 + 264 * 20) / 1e6, 10);
  });

  it("sends cache_control when the alias caches, and prices 1-hour writes at 2× input", async () => {
    const mock = mockAnthropic();
    const store = memoryStore({ consents: "all" });
    const cached = defineAi({ vendors: [mock.vendor], models: { default: { model: "claude-sonnet-5-5", cache: "1h" } }, store, gate: () => true, maxRetries: 0 });
    mock.reply(text("Cached."));
    await runTask(cached, recap, { noteId: "n1" }, ctx);
    expect(mock.calls[0]!.body.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    // 100 × $2 + 60 × $0.10 + 30 × $4 (1-hour write) + 20 × $10, per million
    expect(store.rows[0]!.costUsd).toBeCloseTo((200 + 6 + 120 + 200) / 1e6, 10);

    const { ai, reply, calls } = setup();
    reply(text("Not cached."));
    await runTask(ai, recap, { noteId: "n1" }, ctx);
    expect(calls[0]!.body).not.toHaveProperty("cache_control");
  });

  it("is unavailable when every allowed alias is down, and never crosses vendors unasked", async () => {
    const { ai, reply, calls, store } = setup();
    reply(httpError(500), httpError(429));
    expect(await runTask(ai, recap, { noteId: "n1" }, ctx)).toMatchObject({ ok: false, outcome: "unavailable" });
    expect(calls).toHaveLength(2); // the openai alias was skipped
    expect(store.rows[0]).toMatchObject({ outcome: "unavailable", model: null, costUsd: 0, detail: "HTTP 429" });
  });

  it("records and rethrows an error that isn't an outage", async () => {
    const { ai, reply, store } = setup();
    reply(httpError(400));
    await expect(runTask(ai, recap, { noteId: "n1" }, ctx)).rejects.toThrow();
    expect(store.rows[0]).toMatchObject({ outcome: "unavailable", detail: "HTTP 400" });
  });
});

describe("streamTask", () => {
  it("streams text and writes the usage row when the stream ends", async () => {
    const { ai, reply, calls, store } = setup();
    reply(streamOf(["Rough ", "night."]));
    const result = await streamTask(ai, recap, { noteId: "n1" }, ctx);
    if (!result.ok) throw new Error(result.outcome);
    let streamed = "";
    for await (const t of result.textStream) streamed += t;
    expect(streamed).toBe("Rough night.");
    expect(await result.done).toMatchObject({ ok: true, output: { text: "Rough night." } });
    expect(calls[0]!.body).toMatchObject({ stream: true, output_config: { effort: "low" } });
    expect(store.rows[0]).toMatchObject({ outcome: "ok", usage: { outputTokens: 7 } });
  });

  it("won't stream a task with output guardrails", async () => {
    const { ai, calls } = setup();
    const guarded = defineTask({ ...recap, guardrails: { output: [(t) => t] } });
    await expect(streamTask(ai, guarded, { noteId: "n1" }, ctx)).rejects.toThrow(/output guardrails/);
    expect(calls).toHaveLength(0);
  });

  it("closes the usage row when the caller aborts", async () => {
    const { ai, reply, store } = setup();
    reply(streamOf(["Rough ", "night."]));
    const controller = new AbortController();
    controller.abort();
    const result = await streamTask(ai, recap, { noteId: "n1" }, ctx, { abortSignal: controller.signal });
    if (!result.ok) throw new Error(result.outcome);
    try {
      for await (const _ of result.textStream) void _;
    } catch {
      // an aborted stream may throw on read
    }
    expect(await result.done).toMatchObject({ ok: false, outcome: "unavailable" });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]!.outcome).toBe("unavailable");
  });

  it("runs the same checks before streaming", async () => {
    const { ai, calls } = setup();
    expect(await streamTask(ai, recap, { noteId: "n2" }, ctx)).toMatchObject({ ok: false, outcome: "safety_routed" });
    expect(calls).toHaveLength(0);
  });
});

describe("stopping in load", () => {
  it("returns the loader's typed stop without calling the model", async () => {
    const { ai, calls, store } = setup();
    const empty = defineTask({
      ...recap,
      load: async () => {
        throw new GuardrailError("Nothing to catch up on yet.", "invalid_input");
      },
    });
    expect(await runTask(ai, empty, { noteId: "n1" }, ctx)).toEqual({ ok: false, outcome: "invalid_input", message: "Nothing to catch up on yet." });
    const outsider = defineTask({
      ...recap,
      load: async () => {
        throw new GuardrailError("Not a member.", "forbidden");
      },
    });
    expect(await runTask(ai, outsider, { noteId: "n1" }, ctx)).toMatchObject({ ok: false, outcome: "forbidden" });
    expect(calls).toHaveLength(0);
    expect(store.rows).toHaveLength(0);
  });
});
