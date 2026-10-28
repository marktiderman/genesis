// @vitest-environment happy-dom
// @feat:ai-providers
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAiStream, useAiTask } from "../react";

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

describe("useAiStream", () => {
  const events = (...items: unknown[]) =>
    new Response(items.map((i) => `data: ${JSON.stringify(i)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });

  it("shows text as it arrives, then the result", async () => {
    const fetch = async () => events({ type: "text", text: "Rough " }, { type: "text", text: "night." }, { type: "done", result: { ok: true, output: { text: "Rough night." }, model: "m", taskVersion: 1, usageId: "u", labelled: true } });
    const { result } = renderHook(() => useAiStream("notes.recap", { fetch: fetch as typeof globalThis.fetch }));
    await act(() => result.current.run({ noteId: "n1" }));
    expect(result.current.text).toBe("Rough night.");
    expect(result.current.result).toMatchObject({ ok: true });
    expect(result.current.pending).toBe(false);
  });

  it("drops partial text when the stream ends in a refusal, and passes a stop before the model through", async () => {
    const refused = async () => events({ type: "text", text: "Partial" }, { type: "done", result: { ok: false, outcome: "refused", message: "Declined." } });
    const { result } = renderHook(() => useAiStream("notes.recap", { fetch: refused as typeof globalThis.fetch }));
    await act(() => result.current.run({}));
    expect(result.current.text).toBe("");
    expect(result.current.result).toMatchObject({ outcome: "refused" });

    const over = async () => new Response(JSON.stringify({ ok: false, outcome: "over_budget", message: "Used up." }), { status: 429, headers: { "content-type": "application/json" } });
    const second = renderHook(() => useAiStream("notes.recap", { fetch: over as typeof globalThis.fetch }));
    await act(() => second.result.current.run({}));
    expect(second.result.current.result).toMatchObject({ outcome: "over_budget" });
  });

  it("reassembles frames split across chunks, including inside a multi-byte character", async () => {
    const done = { ok: true, output: { text: "Café olé" }, model: "m", taskVersion: 1, usageId: "u", labelled: true };
    const payload = new TextEncoder().encode(
      [{ type: "text", text: "Café " }, { type: "text", text: "olé" }, { type: "done", result: done }].map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""),
    );
    const fetch = async () =>
      new Response(
        new ReadableStream({
          start(c) {
            for (let i = 0; i < payload.length; i += 5) c.enqueue(payload.slice(i, i + 5));
            c.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    const { result } = renderHook(() => useAiStream("notes.recap", { fetch: fetch as typeof globalThis.fetch }));
    await act(() => result.current.run({}));
    expect(result.current.text).toBe("Café olé");
    expect(result.current.result).toMatchObject({ ok: true });
  });

  it("resolves (never rejects) a run that is stopped or replaced, and leaves the state to the newer run", async () => {
    // A fetch that waits until it is aborted, like a slow server.
    const slow = (_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(new DOMException("aborted", "AbortError"));
        if (init?.signal?.aborted) abort();
        init?.signal?.addEventListener("abort", abort);
      });
    const { result } = renderHook(() => useAiStream("notes.recap", { fetch: slow as typeof globalThis.fetch }));
    let first!: Promise<unknown>;
    act(() => {
      first = result.current.run({});
    });
    act(() => result.current.stop());
    await expect(first).resolves.toMatchObject({ ok: false, outcome: "unavailable", message: "Cancelled." });
    expect(result.current.result).toBeNull();
    expect(result.current.pending).toBe(false);

    const task = renderHook(() => useAiTask("notes.recap", { fetch: slow as typeof globalThis.fetch }));
    let older!: Promise<unknown>;
    act(() => {
      older = task.result.current.run({});
    });
    act(() => {
      void task.result.current.run({});
    });
    await expect(older).resolves.toMatchObject({ message: "Cancelled." });
    task.unmount();
  });
});
