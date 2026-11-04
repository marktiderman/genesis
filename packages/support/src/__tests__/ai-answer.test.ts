// @feat:support-helpdesk
// What answerHelpQuestion does with each result of the task (the model's half is mocked).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { answerHelpQuestion } from "../ai";

const run = vi.hoisted(() => vi.fn());
vi.mock("@marktiderman/genesis-ai/server", () => ({ runTask: run }));

const QUESTION = "33333333-3333-4333-8333-333333333333";
const ARTICLE = "11111111-1111-4111-8111-111111111111";

const db = (outcome = "asked") => {
  const builder: Record<string, unknown> = {};
  for (const op of ["select", "eq"]) builder[op] = () => builder;
  builder["maybeSingle"] = async () => ({ data: { tenant_id: "ta", question: "How do I reset?", outcome }, error: null });
  return { from: vi.fn(() => builder), rpc: vi.fn() };
};
const admin = (answer: () => { data: unknown; error: unknown } = () => ({ data: "answered", error: null })) => ({
  rpc: vi.fn(async (_fn: string, args: Record<string, unknown>) => (args["outcome"] === "answered" ? answer() : { data: args["outcome"], error: null })),
});
const ok = (output: unknown) => ({ ok: true, output });
const AI = { config: { safety: () => null } };
const answer = (_ai: unknown, keeper: ReturnType<typeof admin>, onError?: (error: unknown) => void, outcome = "asked", ai: unknown = AI) =>
  answerHelpQuestion(ai as never, { questionId: QUESTION, context: { tenantId: "session", personId: "me", db: db(outcome) as never }, admin: keeper, ...(onError ? { onError } : {}) });

describe("answerHelpQuestion", () => {
  beforeEach(() => run.mockReset());

  it("keeps a confident, cited answer, and spends the question's tenant's budget", async () => {
    run.mockResolvedValue(ok({ answer: " Open Settings. ", citations: [ARTICLE], confident: true }));
    const keeper = admin();
    expect(await answer({}, keeper)).toEqual({ status: "answered", answer: "Open Settings.", articleIds: [ARTICLE] });
    expect(run.mock.calls[0]?.[3]).toMatchObject({ tenantId: "ta", personId: "me" });
    expect(keeper.rpc).toHaveBeenCalledWith("support_record_answer", { question: QUESTION, outcome: "answered", answer: "Open Settings.", article_ids: [ARTICLE] });
  });

  it("treats an unsure answer as none, and never returns its words", async () => {
    run.mockResolvedValue(ok({ answer: "Probably this", citations: [ARTICLE], confident: false }));
    const keeper = admin();
    expect(await answer({}, keeper)).toEqual({ status: "none" });
    expect(keeper.rpc).toHaveBeenCalledWith("support_record_answer", expect.objectContaining({ outcome: "no_answer", answer: null }));
  });

  it("treats no citation as none", async () => {
    run.mockResolvedValue(ok({ answer: "From memory", citations: [], confident: true }));
    expect(await answer({}, admin())).toEqual({ status: "none" });
  });

  it("shows nothing the database refused to keep", async () => {
    run.mockResolvedValue(ok({ answer: "Elsewhere", citations: [ARTICLE], confident: true }));
    expect(await answer({}, admin(() => ({ data: null, error: { code: "22023" } })))).toEqual({ status: "none" });
  });

  it("takes a safety route's words from where the pipeline puts them", async () => {
    run.mockResolvedValue({ ok: false, outcome: "safety_routed", message: "Routed by the safety protocol.", safety: { category: "crisis", response: "Please call the line." } });
    expect(await answer({}, admin())).toEqual({ status: "safety", response: "Please call the line." });
  });

  it("gives no words when the protocol gave none", async () => {
    run.mockResolvedValue({ ok: false, outcome: "safety_routed", message: "Routed by the safety protocol.", safety: { category: "crisis" } });
    expect(await answer({}, admin())).toEqual({ status: "safety", response: null });
  });

  it("gives no words for a blank response, so the fixed line shows", async () => {
    run.mockResolvedValue({ ok: false, outcome: "safety_routed", message: "Routed by the safety protocol.", safety: { category: "crisis", response: "  " } });
    expect(await answer({}, admin())).toEqual({ status: "safety", response: null });
  });

  it("leaves a question another call has taken to that call", async () => {
    const { HELP_AI_REFUSALS } = await import("../ai");
    run.mockResolvedValue({ ok: false, outcome: "invalid_input", message: HELP_AI_REFUSALS.answered });
    const keeper = admin();
    expect(await answer({}, keeper)).toEqual({ status: "none" });
    expect(keeper.rpc).not.toHaveBeenCalled();
  });

  it("gives the fixed line to a retry of what the protocol already took", async () => {
    const keeper = admin();
    expect(await answer({}, keeper, undefined, "safety_routed")).toEqual({ status: "safety", response: null });
    expect(run).not.toHaveBeenCalled();
  });

  it("gives the loser of a double submit the protocol's words", async () => {
    const { HELP_AI_REFUSALS } = await import("../ai");
    run.mockResolvedValue({ ok: false, outcome: "invalid_input", message: HELP_AI_REFUSALS.answered });
    const keeper = admin();
    const ai = { config: { safety: () => ({ category: "crisis", response: "Please call." }) } };
    expect(await answer({}, keeper, undefined, "answering", ai)).toEqual({ status: "safety", response: "Please call." });
    expect(keeper.rpc).not.toHaveBeenCalled();
  });

  it("never hands onError the request, which holds the prompt", async () => {
    run.mockResolvedValue({ ok: false, outcome: "over_budget", message: "Used up." });
    const error = Object.assign(new Error("Bad request"), { requestBodyValues: { messages: ["their words"] } });
    const keeper = { rpc: vi.fn(async () => Promise.reject(error)) };
    const onError = vi.fn();
    expect(await answer({}, keeper as never, onError)).toEqual({ status: "none" });
    const reported = onError.mock.calls[0]?.[0] as Error;
    expect(reported.message).toBe("Bad request");
    expect(Object.getOwnPropertyNames(reported)).not.toContain("requestBodyValues");
  });

  it("ends at none when the first read throws", async () => {
    const onError = vi.fn();
    const throwing = { from: () => { throw new Error("offline"); }, rpc: vi.fn() };
    expect(await answerHelpQuestion(AI as never, { questionId: QUESTION, context: { tenantId: "t", personId: "me", db: throwing as never }, admin: admin(), onError })).toEqual({ status: "none" });
    expect(onError).toHaveBeenCalled();
  });

  it("still gives a safety route's words when recording it fails", async () => {
    run.mockResolvedValue({ ok: false, outcome: "safety_routed", message: "x", safety: { category: "crisis", response: "Please call." } });
    const keeper = { rpc: vi.fn(async () => Promise.reject(new Error("down"))) };
    expect(await answer({}, keeper as never)).toEqual({ status: "safety", response: "Please call." });
  });

  it("ends at none on any other stop", async () => {
    run.mockResolvedValue({ ok: false, outcome: "over_budget", message: "The AI budget for this period is used up." });
    expect(await answer({}, admin())).toEqual({ status: "none" });
  });
});
