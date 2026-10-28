// @feat:chat
import { createGenesisAnthropic } from "@marktiderman/genesis-ai/anthropic";
import { defineAi, type AiContext } from "@marktiderman/genesis-ai";
import { memoryStore, runTask } from "@marktiderman/genesis-ai/server";
import { describe, expect, it } from "vitest";
import { CHAT_AI_REFUSALS, chatDraftReplyTask, chatRecapTask, type ChatAiDb } from "../ai/index";
import { createChatAssistant, type AssistantMessage } from "../server/assistant";

const CONV = "11111111-1111-4111-8111-111111111111";
const COACH = "c0000000-0000-4000-8000-000000000001";
const CLIENT = "c0000000-0000-4000-8000-000000000002";

type Row = Record<string, unknown>;
const rows: Row[] = [
  { id: "m1", seq: 1, sender_id: CLIENT, body: "Week one done <b>finally</b>", created_at: "2026-10-20T09:00:00Z", kind: "text", visibility: "everyone", deleted_at: null, moderation: null },
  { id: "m2", seq: 2, sender_id: COACH, body: "Great work. Same plan next week?", created_at: "2026-10-20T10:00:00Z", kind: "text", visibility: "everyone", deleted_at: null, moderation: null },
  { id: "m3", seq: 3, sender_id: COACH, body: "Watch her sleep", created_at: "2026-10-20T10:05:00Z", kind: "text", visibility: "observers", deleted_at: null, moderation: null },
  { id: "m4", seq: 4, sender_id: CLIENT, body: "Can we move Thursday to Friday?", created_at: "2026-10-21T08:00:00Z", kind: "text", visibility: "everyone", deleted_at: null, moderation: null },
];

/** A genesis_chat client as the caller: just the queries the loaders make. */
function fakeDb(opts: { member?: Row | null; observer?: boolean; messages?: Row[] } = {}): ChatAiDb {
  const query = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      select: () => builder,
      eq: (col: string, value: unknown) => (filters.push([col, value]), builder),
      is: () => builder,
      order: () => builder,
      limit: async () => ({ data: [...(opts.messages ?? rows)].sort((a, b) => Number(b.seq) - Number(a.seq)), error: null }),
      maybeSingle: async () => ({ data: opts.member === undefined ? { last_read_seq: 2 } : opts.member, error: null }),
    };
    if (table !== "members" && table !== "messages") throw new Error(table);
    return builder;
  };
  return {
    schema: () => ({
      from: query,
      rpc: async (fn: string) => (fn === "i_observe" ? { data: opts.observer ?? false, error: null } : { data: null, error: { code: "42883" } }),
    }),
  };
}

const names: Record<string, string> = { [COACH]: "Mark", [CLIENT]: "Sam" };
const resolveName = async (_db: ChatAiDb, id: string) => names[id];

function recordingFetch() {
  const calls: Array<{ headers: Record<string, string>; body: Record<string, any> }> = [];
  const fetch = async (_url: unknown, init?: RequestInit) => {
    calls.push({ headers: Object.fromEntries(new Headers(init?.headers).entries()), body: JSON.parse(String(init?.body)) });
    return new Response(
      JSON.stringify({ id: "msg", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text: "- Sam asks to move Thursday." }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } }),
      { headers: { "content-type": "application/json" } },
    );
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

function setup(db = fakeDb()) {
  const wire = recordingFetch();
  const anthropic = createGenesisAnthropic({ apiKey: "test", fetch: wire.fetch });
  const store = memoryStore({ consents: "all" });
  const ai = defineAi({ models: { default: { model: anthropic("claude-sonnet-5-5"), effort: "low" } }, store, gate: () => true, maxRetries: 0 });
  const ctx: AiContext<ChatAiDb> = { tenantId: null, personId: COACH, db };
  return { ai, ctx, store, calls: wire.calls };
}

/** What both paths send, normalised: the AI SDK sends system and content as blocks. */
const normalise = (call: { headers: Record<string, string>; body: Record<string, any> }) => {
  const text = (v: unknown) => (typeof v === "string" ? v : (v as Array<{ text: string }>).map((b) => b.text).join(""));
  return {
    version: call.headers["anthropic-version"],
    beta: call.headers["anthropic-beta"]?.split(",").includes("server-side-fallback-2026-07-01"),
    model: call.body.model,
    max_tokens: call.body.max_tokens,
    effort: call.body.output_config?.effort,
    fallbacks: call.body.fallbacks,
    system: text(call.body.system),
    prompt: text(call.body.messages[0].content),
    sampling: ["temperature", "top_p", "top_k"].filter((k) => k in call.body),
  };
};

const asAssistant = (r: Row[], observer: boolean): AssistantMessage[] =>
  r.map((m) => ({
    senderId: m.sender_id as string,
    body: m.body as string,
    createdAt: m.created_at as string,
    kind: "text" as const,
    visibility: m.visibility as "everyone" | "observers",
    deletedAt: null,
    moderation: null,
  })).filter((m) => observer || m.visibility === "everyone");

describe("chat.recap", () => {
  it("sends what createChatAssistant sends for the same conversation", async () => {
    const { ai, ctx, calls, store } = setup();
    const result = await runTask(ai, chatRecapTask({ resolveName }), { conversationId: CONV }, ctx);
    expect(result).toMatchObject({ ok: true, output: { text: "- Sam asks to move Thursday." } });

    const legacy = recordingFetch();
    await createChatAssistant({ apiKey: "test", fetch: legacy.fetch }).recap({
      messages: asAssistant(rows, false),
      since: "2026-10-20T10:00:00Z",
      me: COACH,
      resolveName: (id) => names[id],
    });
    expect(normalise(calls[0]!)).toEqual(normalise(legacy.calls[0]!));
    expect(normalise(calls[0]!)).toMatchObject({ version: "2026-10-21", beta: true, model: "claude-sonnet-5-5", max_tokens: 4000, effort: "low", fallbacks: "default", sampling: [] });
    expect(normalise(calls[0]!).prompt).toContain("Can we move Thursday to Friday?");
    expect(normalise(calls[0]!).prompt).not.toContain("Watch her sleep");
    expect(normalise(calls[0]!).prompt).toContain("‹b›finally‹/b›");
    expect(store.rows[0]!.manifest).toEqual([{ name: "messages", tokens: expect.any(Number), ids: ["m1", "m2", "m3", "m4"] }]);
  });

  it("includes internal notes only when the database says the caller observes", async () => {
    const { ai, ctx, calls } = setup(fakeDb({ observer: true, member: { last_read_seq: 0 } }));
    await runTask(ai, chatRecapTask({ resolveName }), { conversationId: CONV }, ctx);
    expect(normalise(calls[0]!).prompt).toContain("You (internal note): Watch her sleep");
  });

  it("stops before the model for a non-member, and when nothing is new", async () => {
    let s = setup(fakeDb({ member: null }));
    expect(await runTask(s.ai, chatRecapTask(), { conversationId: CONV }, s.ctx)).toEqual({ ok: false, outcome: "forbidden", message: CHAT_AI_REFUSALS.notMember });
    s = setup(fakeDb({ member: { last_read_seq: 4 } }));
    expect(await runTask(s.ai, chatRecapTask(), { conversationId: CONV }, s.ctx)).toEqual({ ok: false, outcome: "invalid_input", message: CHAT_AI_REFUSALS.empty });
    expect(s.calls).toHaveLength(0);
  });

  it("takes only a conversation id from the client", async () => {
    const { ai, ctx, calls } = setup();
    expect(await runTask(ai, chatRecapTask(), { conversationId: "not-a-uuid" }, ctx)).toMatchObject({ ok: false, outcome: "invalid_input" });
    expect(await runTask(ai, chatRecapTask({ can: () => false }), { conversationId: CONV }, ctx)).toMatchObject({ ok: false, outcome: "forbidden" });
    expect(calls).toHaveLength(0);
  });
});

describe("chat.draft-reply", () => {
  it("sends what createChatAssistant sends, with the coach's voice from the server", async () => {
    const { ai, ctx, calls } = setup();
    const task = chatDraftReplyTask({ resolveName, voice: async () => "warm, brief" });
    expect(await runTask(ai, task, { conversationId: CONV }, ctx)).toMatchObject({ ok: true });
    const legacy = recordingFetch();
    await createChatAssistant({ apiKey: "test", fetch: legacy.fetch }).draftReply({
      messages: asAssistant(rows, false),
      voice: "warm, brief",
      me: COACH,
      resolveName: (id) => names[id],
    });
    expect(normalise(calls[0]!)).toEqual(normalise(legacy.calls[0]!));
  });
});
