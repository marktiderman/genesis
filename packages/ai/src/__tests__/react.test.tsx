// @vitest-environment happy-dom
// @feat:ai-providers
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAiTask } from "../react";

const reply = (body: unknown) => async (_url: string | URL | Request, init?: RequestInit) => {
  reply.sent.push({ url: String(_url), init: init! });
  return new Response(JSON.stringify(body), { status: 200 });
};
reply.sent = [] as Array<{ url: string; init: RequestInit }>;

describe("useAiTask", () => {
  it("posts the task id and ids-only args, and holds the result", async () => {
    const fetch = reply({ ok: true, output: { text: "Recap." }, model: "m", taskVersion: 1, usageId: "u", labelled: true });
    const { result } = renderHook(() => useAiTask("chat.recap", { fetch: fetch as typeof globalThis.fetch, headers: () => ({ authorization: "Bearer t" }) }));
    await act(() => result.current.run({ conversationId: "c1" }));
    expect(result.current.result).toMatchObject({ ok: true, output: { text: "Recap." } });
    expect(result.current.pending).toBe(false);
    const sent = reply.sent.at(-1)!;
    expect(sent.url).toBe("/api/ai");
    expect(JSON.parse(String(sent.init.body))).toEqual({ task: "chat.recap", args: { conversationId: "c1" } });
    expect(new Headers(sent.init.headers).get("authorization")).toBe("Bearer t");
  });

  it("turns a network failure into `unavailable`", async () => {
    const fetch = async () => {
      throw new TypeError("offline");
    };
    const { result } = renderHook(() => useAiTask("chat.recap", { fetch: fetch as typeof globalThis.fetch }));
    await act(() => result.current.run({}));
    await waitFor(() => expect(result.current.result).toMatchObject({ ok: false, outcome: "unavailable" }));
    act(() => result.current.reset());
    expect(result.current.result).toBeNull();
  });
});
