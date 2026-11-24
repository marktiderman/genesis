/**
 * @vitest-environment happy-dom
 * @feat:chat
 * The inbox's row actions, built once (`inboxRowActions`) for the phone and the web, run from the
 * row (`useInboxActions`), and refreshed through the named prefix keys.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, configure, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatClient } from "../core/client";
import type { ChatInboxItem } from "../core/types";
import { ChatProvider, chatKeys, defaultInboxActionLabels, inboxRowActions, useConversation, useInboxActions, type ChatInboxActions } from "../react";
import type { ChatMessage } from "../core/types";
import { ChatInbox, createMemoryChatClient, useConfirmDialog } from "../web";

afterEach(cleanup);
configure({ asyncUtilTimeout: 4000 });

const ME = "00000000-0000-4000-8000-0000000000a1";
const C = "00000000-0000-4000-8000-0000000000c1";

const item = (over: Partial<ChatInboxItem> = {}): ChatInboxItem =>
  ({
    conversationId: C, kind: "direct", title: "Sam", subjectType: null, subjectId: null, status: null, role: "member",
    otherUserId: null, memberCount: 2, lastSeq: 7, lastReadSeq: 7, unread: 0, mentioned: false, muted: false, pinned: false,
    archived: false, lastMessageAt: new Date().toISOString(), lastMessage: null, ...over,
  }) as ChatInboxItem;

type Fake = { [K in keyof ChatInboxActions]: ReturnType<typeof vi.fn<ChatInboxActions[K]>> };
const fakeActions = (): Fake =>
  ({
    toggleUnread: vi.fn(async () => undefined),
    togglePinned: vi.fn(async () => undefined),
    toggleMuted: vi.fn(async () => undefined),
    setArchived: vi.fn(async () => undefined),
    deleteForMe: vi.fn(async () => undefined),
  }) as unknown as Fake;

describe("inboxRowActions", () => {
  it("is Messages' set, in its order, sides and colors", () => {
    const actions = inboxRowActions(item(), fakeActions(), defaultInboxActionLabels, { confirm: async () => true });
    expect(actions.map((a) => a.id)).toEqual(["unread", "pin", "alerts", "delete", "archive"]);
    const by = (id: string) => actions.find((a) => a.id === id)!;
    expect(by("unread")).toMatchObject({ tone: "info", swipe: { side: "leading", full: true }, icon: "message-unread", label: "Mark as Unread" });
    expect(by("pin")).toMatchObject({ accent: "orange", swipe: { side: "leading" } });
    expect(by("alerts")).toMatchObject({ accent: "purple", swipe: { side: "trailing" }, label: "Hide Alerts" });
    expect(by("delete")).toMatchObject({ destructive: true, confirms: true, swipe: { side: "trailing", full: true } });
    expect(by("archive")).toMatchObject({ swipe: false });
    // An unread, pinned, muted, archived row offers the other half of each toggle, and no Archive.
    const other = inboxRowActions(item({ unread: 2, pinned: true, muted: true, archived: true }), fakeActions(), defaultInboxActionLabels, { confirm: async () => true });
    expect(other.map((a) => a.label)).toEqual(["Mark read", "Unpin", "Show Alerts", "Delete"]);
  });

  it("asks before Delete for me, and deletes only on yes; a failure reaches onError", async () => {
    const act = fakeActions();
    const confirm = vi.fn(async () => false);
    const onError = vi.fn();
    const row = item();
    const del = () => inboxRowActions(row, act, defaultInboxActionLabels, { confirm, onError }).find((a) => a.id === "delete")!;
    del().onPress();
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("Delete this conversation?", expect.stringMatching(/removed for you/), "Delete"));
    expect(act.deleteForMe).not.toHaveBeenCalled();
    confirm.mockResolvedValueOnce(true);
    act.deleteForMe.mockRejectedValueOnce(new Error("Offline"));
    del().onPress();
    await waitFor(() => expect(act.deleteForMe).toHaveBeenCalledWith(row));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Offline" })));
  });
});

function harness(over: Record<string, unknown> = {}) {
  const client = {
    inbox: vi.fn(async () => []),
    subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })),
    unreadTotal: vi.fn(async () => 0),
    markRead: vi.fn(async () => 7),
    setMySettings: vi.fn(async () => {}),
    deleteConversationForMe: vi.fn(async () => {}),
    ...over,
  } as unknown as ChatClient & Record<string, ReturnType<typeof vi.fn>>;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ChatProvider client={client} userId={ME}>
        {children}
      </ChatProvider>
    </QueryClientProvider>
  );
  return { client, qc, ...renderHook(() => useInboxActions(), { wrapper }) };
}

describe("useInboxActions", () => {
  it("runs from the row: each toggle reads the row's state", async () => {
    const { client, result } = harness();
    await act(() => result.current.toggleUnread(item({ unread: 0 })));
    expect(client.setMySettings).toHaveBeenLastCalledWith(C, { markedUnread: true });
    await act(() => result.current.toggleUnread(item({ unread: 3 })));
    expect(client.markRead).toHaveBeenLastCalledWith(C);
    await act(() => result.current.togglePinned(item({ pinned: true })));
    expect(client.setMySettings).toHaveBeenLastCalledWith(C, { pinned: false });
    await act(() => result.current.toggleMuted(item()));
    expect(client.setMySettings).toHaveBeenLastCalledWith(C, { mutedUntil: "9999-12-31T00:00:00.000Z" });
    await act(() => result.current.toggleMuted(item(), "2026-12-01T00:00:00.000Z"));
    expect(client.setMySettings).toHaveBeenLastCalledWith(C, { mutedUntil: "2026-12-01T00:00:00.000Z" });
    await act(() => result.current.toggleMuted(item({ muted: true })));
    expect(client.setMySettings).toHaveBeenLastCalledWith(C, { mutedUntil: null });
    await act(() => result.current.setArchived(item(), true));
    expect(client.setMySettings).toHaveBeenLastCalledWith(C, { archived: true });
  });

  it("Delete for me goes up to the row's lastSeq and forgets the conversation; every action refreshes through the prefix keys", async () => {
    const { client, qc, result } = harness();
    qc.setQueryData([...chatKeys.conversation(C), "messages", null, null], { pages: [] });
    qc.setQueryData(chatKeys.pins(C), ["m1"]);
    qc.setQueryData(chatKeys.search("hello", null), []);
    qc.setQueryData(chatKeys.inbox({ archived: false }), []);
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    await act(() => result.current.deleteForMe(item({ lastSeq: 9 })));
    expect(client.deleteConversationForMe).toHaveBeenCalledWith(C, 9);
    expect(qc.getQueryData([...chatKeys.conversation(C), "messages", null, null])).toBeUndefined();
    expect(qc.getQueryData(chatKeys.pins(C))).toBeUndefined();
    expect(qc.getQueryData(chatKeys.search("hello", null))).toBeUndefined();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: chatKeys.inboxAll() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: chatKeys.unread() });
    expect(chatKeys.inbox({ archived: false }).slice(0, 2)).toEqual([...chatKeys.inboxAll()]);
    expect(chatKeys.search("hello").slice(0, 2)).toEqual([...chatKeys.searchAll()]);
  });
});

describe("useConfirmDialog", () => {
  it("answers an open question no when it unmounts", async () => {
    const { result, unmount } = renderHook(() => useConfirmDialog());
    let asked!: Promise<boolean>;
    act(() => {
      asked = result.current.confirm("Delete this conversation?", "Gone for you.", "Delete");
    });
    unmount();
    await expect(asked).resolves.toBe(false);
  });

  function Asker({ remove, fallback }: { remove?: boolean; fallback?: () => HTMLElement | null }) {
    const { confirm, dialog } = useConfirmDialog("Cancel", fallback);
    const [gone, setGone] = useState(false);
    return (
      <div>
        <button type="button" data-testid="other">Other</button>
        {gone ? null : (
          <button type="button" data-testid="ask" onClick={() => void confirm("Delete?", "Gone.", "Delete").then((ok) => ok && remove && setGone(true))}>
            Ask
          </button>
        )}
        {dialog}
      </div>
    );
  }

  it("gives focus back to the control that asked when the dialog closes", async () => {
    render(<Asker />);
    const ask = screen.getByTestId("ask");
    ask.focus();
    fireEvent.click(ask);
    fireEvent.click(await screen.findByText("Cancel"));
    await waitFor(() => expect(document.activeElement).toBe(ask));
  });

  it("focuses the fallback when the confirmed action removed the control that asked", async () => {
    render(<Asker remove fallback={() => screen.getByTestId("other")} />);
    const ask = screen.getByTestId("ask");
    ask.focus();
    fireEvent.click(ask);
    fireEvent.click(await screen.findByTestId("genesis-chat-inbox-confirm"));
    await waitFor(() => expect(screen.queryByTestId("ask")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("other")));
  });
});

describe("the memory client's archive", () => {
  it("stores Archive, reports it on the row, leaves it out of the inbox and lists it under archived", async () => {
    const B = "00000000-0000-4000-8000-0000000000b2";
    const client = createMemoryChatClient({
      me: ME,
      conversations: [
        { id: "c1", members: [{ userId: ME }, { userId: B }] },
        { id: "c2", members: [{ userId: ME }, { userId: B }], archived: true },
      ],
    });
    expect((await client.inbox()).map((i) => i.conversationId)).toEqual(["c1"]);
    expect(await client.inbox({ archived: true })).toEqual([expect.objectContaining({ conversationId: "c2", archived: true })]);
    await client.setMySettings("c1", { archived: true });
    expect(await client.inbox()).toEqual([]);
    expect((await client.inbox({ archived: true })).map((i) => i.conversationId).sort()).toEqual(["c1", "c2"]);
    await client.setMySettings("c2", { archived: false });
    expect(await client.inbox()).toEqual([expect.objectContaining({ conversationId: "c2", archived: false })]);
  });
});

describe("Delete for me while a catch-up is under way", () => {
  const msg = (seq: number) => ({ id: `m${seq}`, conversationId: C, seq, threadRootId: null, topic: null, body: `hi ${seq}`, senderId: ME, createdAt: new Date().toISOString() }) as unknown as ChatMessage;
  it("drops what the earlier fetch brings back, and a load started afterwards still fills the thread", async () => {
    let release: (v: { messages: ChatMessage[]; hasEarlier: boolean }) => void = () => {};
    let held = true;
    const client = {
      inbox: vi.fn(async () => []),
      subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })),
      unreadTotal: vi.fn(async () => 0),
      conversation: vi.fn(async () => ({ id: C, kind: "direct" })),
      kind: vi.fn(async () => ({ maxMembers: 2 })),
      members: vi.fn(async () => []),
      myRole: vi.fn(async () => "member"),
      canPost: vi.fn(async () => true),
      markRead: vi.fn(async () => 7),
      deleteConversationForMe: vi.fn(async () => {}),
      messages: vi.fn(async (_id: string, o: { afterSeq?: number }) => {
        if (o.afterSeq === undefined) return { messages: [], hasEarlier: false };
        if (held) return new Promise((r) => (release = r));
        return { messages: [msg(10)], hasEarlier: false };
      }),
      subscribeConversation: vi.fn((_id: string, _u: string, h: { onJoin?: () => void }) => {
        setTimeout(() => h.onJoin?.(), 0);
        return { unsubscribe: vi.fn(), signal: vi.fn() };
      }),
    } as unknown as ChatClient;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ChatProvider client={client} userId={ME}>{children}</ChatProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => ({ convo: useConversation(C, { markRead: false }), actions: useInboxActions() }), { wrapper });
    // The catch-up on join is waiting on its page of messages.
    await waitFor(() => expect(client.messages).toHaveBeenCalledWith(C, expect.objectContaining({ afterSeq: 0 })));
    await act(() => result.current.actions.deleteForMe(item({ lastSeq: 9 })));
    const key = [...chatKeys.conversation(C), "messages", null, null];
    expect(qc.getQueryData(key)).toBeUndefined();
    // The old page arrives after the delete: it holds the deleted history, and is dropped.
    await act(async () => release({ messages: [msg(1), msg(2)], hasEarlier: false }));
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    expect((qc.getQueryData(key) as { messages: ChatMessage[] } | undefined)?.messages.some((m) => m.seq < 10)).not.toBe(true);
    // A catch-up started after the delete (a new message brought the conversation back) fills it.
    held = false;
    await act(() => result.current.convo.refetch());
    await waitFor(() => expect((qc.getQueryData(key) as { messages: ChatMessage[] }).messages.map((m) => m.seq)).toEqual([10]));
  });
});

describe("ChatInbox (web) row actions", () => {
  function mount(ui: ReactNode, client = createMemoryChatClient({ me: ME, conversations: [{ id: "c1", title: "Morning crew", members: [{ userId: ME }, { userId: "00000000-0000-4000-8000-0000000000b2" }], messages: [] }] })) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ChatProvider client={client} userId={ME}>
          {ui}
        </ChatProvider>
      </QueryClientProvider>,
    );
    return client;
  }
  const resolveUser = () => ({ name: "Someone" });
  const openMenu = async (testID: string) => {
    const more = await screen.findByTestId(`${testID}-more`);
    fireEvent.pointerDown(more, new PointerEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }));
  };

  it("offers each row's actions in its More menu, and asks before Delete for me", async () => {
    const client = mount(<ChatInbox resolveUser={resolveUser} onSelect={() => {}} />);
    await openMenu("genesis-chat-inbox-row-c1");
    expect(await screen.findByTestId("genesis-chat-inbox-row-c1-action-unread")).toBeTruthy();
    expect(screen.getByTestId("genesis-chat-inbox-row-c1-action-archive")).toBeTruthy();
    fireEvent.click(screen.getByTestId("genesis-chat-inbox-row-c1-action-delete"));
    const confirm = await screen.findByTestId("genesis-chat-inbox-confirm");
    expect(screen.getByText("Delete this conversation?")).toBeTruthy();
    expect(client.calls.some((c) => c.method === "deleteConversationForMe")).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(client.calls.some((c) => c.method === "deleteConversationForMe")).toBe(true));
  });

  it("leaves focus in the list once a confirmed Delete removes the row, however long the call takes", async () => {
    const B = "00000000-0000-4000-8000-0000000000b2";
    const client = createMemoryChatClient({
      me: ME,
      conversations: [
        { id: "c1", title: "Morning crew", members: [{ userId: ME }, { userId: B }], messages: [] },
        { id: "c2", title: "Evening crew", members: [{ userId: ME }, { userId: B }], messages: [] },
      ],
    });
    // The network: the delete answers a moment after the dialog has closed.
    const deleteNow = client.deleteConversationForMe.bind(client);
    client.deleteConversationForMe = async (...args: Parameters<typeof deleteNow>) => {
      await new Promise((r) => setTimeout(r, 30));
      return deleteNow(...args);
    };
    mount(<ChatInbox resolveUser={resolveUser} onSelect={() => {}} />, client);
    const more = await screen.findByTestId("genesis-chat-inbox-row-c1-more");
    more.focus();
    await openMenu("genesis-chat-inbox-row-c1");
    fireEvent.click(await screen.findByTestId("genesis-chat-inbox-row-c1-action-delete"));
    fireEvent.click(await screen.findByTestId("genesis-chat-inbox-confirm"));
    await waitFor(() => expect(screen.queryByTestId("genesis-chat-inbox-row-c1")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("genesis-chat-inbox-row-c2")));
  });

  it("takes rowActions to reshape them", async () => {
    const rowActions = vi.fn((_item: ChatInboxItem, defaults: { id: string }[]) => defaults.filter((a) => a.id === "pin"));
    mount(<ChatInbox resolveUser={resolveUser} onSelect={() => {}} rowActions={rowActions as never} />);
    await openMenu("genesis-chat-inbox-row-c1");
    expect(await screen.findByTestId("genesis-chat-inbox-row-c1-action-pin")).toBeTruthy();
    expect(screen.queryByTestId("genesis-chat-inbox-row-c1-action-delete")).toBeNull();
    expect(rowActions).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "c1" }), expect.any(Array));
  });
});
