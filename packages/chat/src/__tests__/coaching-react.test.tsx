/**
 * @vitest-environment happy-dom
 * @feat:chat
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, configure, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OutboxStore, QueuedMessage } from "../core/outbox";
import {
  ChatProvider,
  useAvailability,
  useBroadcast,
  useChat,
  useConversation,
  useLinkPreviews,
  useScheduled,
  useSearch,
  useTopics,
} from "../react";
import { createMemoryChatClient, type MemoryChatOptions } from "../web";

afterEach(cleanup);
configure({ asyncUtilTimeout: 4000 });

const ME = "00000000-0000-4000-8000-0000000000a1";
const SAM = "00000000-0000-4000-8000-0000000000b2";
const LEE = "00000000-0000-4000-8000-0000000000c3";

function setup(over: Partial<MemoryChatOptions> = {}, store?: OutboxStore) {
  const client = createMemoryChatClient({
    me: ME,
    conversations: [
      {
        id: "c1",
        members: [{ userId: ME, role: "owner" }, { userId: SAM }],
        topics: [{ topic: "w1", title: "Week 1" }],
        messages: [
          { id: "m1", senderId: SAM, body: "Our plan for today", createdAt: "2026-01-01T10:00:00Z" },
          { id: "m2", senderId: ME, body: "Sounds good https://example.test/post", createdAt: "2026-01-01T10:01:00Z" },
          { id: "m3", senderId: SAM, body: "", createdAt: "2026-01-01T10:02:00Z", attachments: [{ kind: "voice", transcript: "the plan is set" }] },
        ],
      },
      { id: "c2", members: [{ userId: ME }, { userId: LEE }] },
    ],
    availability: { [SAM]: { awayMessage: "Back Monday", awayUntil: "2099-01-01T00:00:00Z" } },
    linkPreviews: [{ url: "https://example.test/post", title: "A post", imageUrl: "https://example.test/i.png" }],
    ...over,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ChatProvider client={client} userId={ME} outboxStore={store}>
        {children}
      </ChatProvider>
    </QueryClientProvider>
  );
  return { client, queryClient, wrapper };
}

describe("hooks for 0002", () => {
  it("useTopics lists topics and adds one", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useTopics("c1"), { wrapper });
    await waitFor(() => expect(result.current.topics.map((t) => t.title)).toEqual(["Week 1"]));
    await act(() => result.current.setTopic("w2", { title: "Week 2" }));
    await waitFor(() => expect(result.current.topics.map((t) => t.topic)).toEqual(["w1", "w2"]));
    await act(() => result.current.setTopic("w1", { closed: true }));
    await waitFor(() => expect(result.current.topics[0]!.closedAt).not.toBeNull());
  });

  it("useScheduled schedules and cancels", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useScheduled("c1"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const at = new Date(Date.now() + 3_600_000);
    await act(async () => {
      await result.current.schedule({ conversationId: "c1", body: "Later", sendAt: at });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]).toMatchObject({ body: "Later", status: "scheduled", sendAt: at.toISOString() });
    await act(() => result.current.cancel(result.current.items[0]!.id));
    await waitFor(() => expect(result.current.items).toHaveLength(0));
  });

  it("useAvailability reads a conversation's and saves yours", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useAvailability("c1"), { wrapper });
    await waitFor(() => expect(result.current.forUser(SAM)?.awayMessage).toBe("Back Monday"));
    expect(result.current.mine).toBeNull();
    await act(() => result.current.setMine({ awayMessage: "Off today", timeZone: "Europe/London" }));
    await waitFor(() => expect(result.current.mine?.awayMessage).toBe("Off today"));
  });

  it("useBroadcast sends into each conversation", async () => {
    const { wrapper, client } = setup();
    const { result } = renderHook(() => useBroadcast(), { wrapper });
    let ids: string[] = [];
    await act(async () => {
      ids = await result.current.send(["c1", "c2"], "Hello everyone");
    });
    expect(ids).toHaveLength(2);
    const sends = client.calls.filter((c) => c.method === "send").map((c) => (c.args[0] as { conversationId: string }).conversationId);
    expect(sends).toEqual(["c1", "c2"]);
  });

  it("useSearch waits for typing to stop, then finds text and transcripts", async () => {
    const { wrapper, client } = setup();
    const { result, rerender } = renderHook(({ q }) => useSearch(q, { debounceMs: 40 }), { wrapper, initialProps: { q: "p" } });
    rerender({ q: "pl" });
    rerender({ q: "plan" });
    expect(result.current.isSearching).toBe(true);
    await waitFor(() => expect(result.current.hits).toHaveLength(2));
    // One search, for the final query.
    expect(client.calls.filter((c) => c.method === "search").map((c) => c.args[0])).toEqual(["plan"]);
    expect(result.current.hits.find((h) => h.inTranscript)?.snippet).toContain("«plan»");
  });

  it("useLinkPreviews returns previews by URL", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useLinkPreviews(["https://example.test/post", "https://unknown.test"]), { wrapper });
    await waitFor(() => expect(result.current["https://example.test/post"]?.title).toBe("A post"));
    expect(result.current["https://unknown.test"]).toBeUndefined();
  });

  it("useConversation({ topic }) reads one topic's messages and posts into it", async () => {
    const { wrapper, client } = setup();
    client.receive("c1", SAM, "In week one", { topic: "w1" });
    const { result } = renderHook(() => useConversation("c1", { topic: "w1" }), { wrapper });
    await waitFor(() => expect(result.current.messages.map((m) => m.body)).toEqual(["In week one"]));
    await act(async () => {
      await result.current.send({ body: "Mine too" });
    });
    await waitFor(() => expect(result.current.messages.map((m) => m.body)).toEqual(["In week one", "Mine too"]));
    expect(client.calls.filter((c) => c.method === "send").at(-1)!.args[0]).toMatchObject({ topic: "w1" });
  });
});

describe("review fixes in the hooks", () => {
  it("shows messages that arrived while the thread was closed (catch-up on the first join)", async () => {
    const { wrapper, client } = setup();
    const first = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(first.result.current.messages).toHaveLength(3));
    first.unmount();
    client.receive("c1", SAM, "While you were away");
    const again = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(again.result.current.messages.map((m) => m.body)).toContain("While you were away"));
  });

  it("keeps hasEarlier when a cached thread is opened again", async () => {
    const { wrapper } = setup();
    const first = renderHook(() => useConversation("c1", { pageSize: 2 }), { wrapper });
    await waitFor(() => expect(first.result.current.hasEarlier).toBe(true));
    first.unmount();
    const again = renderHook(() => useConversation("c1", { pageSize: 2 }), { wrapper });
    await waitFor(() => expect(again.result.current.messages).toHaveLength(2));
    expect(again.result.current.hasEarlier).toBe(true);
    await act(() => again.result.current.loadEarlier());
    await waitFor(() => expect(again.result.current.messages).toHaveLength(3));
    expect(again.result.current.hasEarlier).toBe(false);
  });

  it("loadUntil reaches an older message", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useConversation("c1", { pageSize: 1 }), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    let found = false;
    await act(async () => {
      found = await result.current.loadUntil(1);
    });
    expect(found).toBe(true);
    await waitFor(() => expect(result.current.messages[0]!.id).toBe("m1"));
  });

  it("reports a failed access check as an error, with a retry", async () => {
    const { wrapper, client } = setup();
    const real = client.myRole;
    client.myRole = vi.fn(async () => {
      throw new Error("Failed to fetch");
    });
    const { result } = renderHook(() => useConversation("c1"), { wrapper });
    await waitFor(() => expect(result.current.accessError).toBeTruthy());
    client.myRole = real;
    await act(async () => {
      await result.current.refetchAccess();
    });
    await waitFor(() => expect(result.current.accessError).toBeNull());
    expect(result.current.canPost).toBe(true);
  });

  const savedStore = (q: QueuedMessage[]) => {
    let saved = q;
    return { load: async () => saved, save: async (x: QueuedMessage[]) => void (saved = x), get: () => saved };
  };
  const failed = (clientId: string): QueuedMessage => ({
    clientId,
    input: { conversationId: "c1", clientId, body: "Left over" },
    senderId: ME,
    createdAt: new Date().toISOString(),
    status: "failed",
    files: [],
    attempts: 1,
  });

  it("retries what a relaunch left unsent, once, after loading", async () => {
    const store = savedStore([failed("left-1")]);
    const { wrapper, client } = setup({}, store);
    renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(client.calls.some((c) => c.method === "send" && (c.args[0] as { clientId: string }).clientId === "left-1")).toBe(true));
    await waitFor(() => expect(store.get()).toEqual([]));
  });

  it("retries when the browser comes back online, and exposes retryAll and clearOutbox", async () => {
    const { wrapper, client } = setup();
    const { result } = renderHook(() => ({ chat: useChat(), conv: useConversation("c1") }), { wrapper });
    await waitFor(() => expect(result.current.conv.canPost).toBe(true));
    client.failNextSends(1);
    await act(async () => {
      await result.current.chat.outbox.send({ conversationId: "c1", body: "Offline" });
    });
    await waitFor(() => expect(result.current.chat.queue[0]?.status).toBe("failed"));
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.chat.queue).toHaveLength(0));
    expect(typeof result.current.chat.retryAll).toBe("function");

    client.failNextSends(1);
    await act(async () => {
      await result.current.chat.outbox.send({ conversationId: "c1", body: "Gone" });
    });
    await waitFor(() => expect(result.current.chat.queue[0]?.status).toBe("failed"));
    await act(() => result.current.chat.clearOutbox());
    expect(result.current.chat.queue).toEqual([]);
  });
});

