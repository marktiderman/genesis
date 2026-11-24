/**
 * @vitest-environment happy-dom
 * @feat:chat
 * The inbox's row actions, built once (`inboxRowActions`) for the phone and the web, run from the
 * row (`useInboxActions`), and refreshed through the named prefix keys.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, configure, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatClient } from "../core/client";
import type { ChatInboxItem } from "../core/types";
import { ChatProvider, chatKeys, defaultInboxActionLabels, inboxRowActions, useInboxActions, type ChatInboxActions } from "../react";
import { ChatInbox, createMemoryChatClient } from "../web";

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

  it("takes rowActions to reshape them", async () => {
    const rowActions = vi.fn((_item: ChatInboxItem, defaults: { id: string }[]) => defaults.filter((a) => a.id === "pin"));
    mount(<ChatInbox resolveUser={resolveUser} onSelect={() => {}} rowActions={rowActions as never} />);
    await openMenu("genesis-chat-inbox-row-c1");
    expect(await screen.findByTestId("genesis-chat-inbox-row-c1-action-pin")).toBeTruthy();
    expect(screen.queryByTestId("genesis-chat-inbox-row-c1-action-delete")).toBeNull();
    expect(rowActions).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "c1" }), expect.any(Array));
  });
});
