// @vitest-environment happy-dom
// @feat:chat
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { Text } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider, NativeToastProvider } from "@marktiderman/genesis-ui-native/components";
import type { ChatClient, ConversationHandlers } from "../../core/client";
import type { ChatMessage } from "../../core/types";
import { ChatProvider, useConversation } from "../../react/index";
import { ChatNativeProvider } from "../context";
import type { ChatNativeModules, NetInfoLike } from "../modules";
import { ChatThreadScreen, connectionState, countUnseenBelow } from "../thread-screen";

vi.mock("react-native", async (original) => ({ ...(await original<object>()), useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) }));

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";
const CONV = "33333333-3333-4333-8333-333333333333";

function msg(seq: number, senderId: string): ChatMessage {
  return {
    id: `m${seq}`, conversationId: CONV, seq, clientId: `c${seq}`, senderId, senderRole: "member", kind: "text", body: `body ${seq}`,
    mentions: [], replyToId: null, threadRootId: null, threadCount: 0, threadLastAt: null, topic: null, visibility: "everyone",
    silent: false, meta: {}, createdAt: `2026-10-24T10:0${seq}:00Z`, editedAt: null, deletedAt: null, attachments: [], reactions: [],
  } as ChatMessage;
}

function fakeClient(over: Partial<Record<keyof ChatClient, unknown>> = {}, onHandlers?: (h: ConversationHandlers) => void) {
  const sub = { unsubscribe: vi.fn(), signal: vi.fn() };
  return {
    conversation: vi.fn(async () => ({ id: CONV, kind: "direct", title: null, settings: {}, status: "open", archivedAt: null })),
    members: vi.fn(async () => [
      { conversationId: CONV, userId: ME, role: "member", lastReadSeq: 9, joinedAt: "2026-10-01T00:00:00Z" },
      { conversationId: CONV, userId: SAM, role: "member", lastReadSeq: 9, joinedAt: "2026-10-01T00:00:00Z" },
    ]),
    kind: vi.fn(async () => ({ kind: "direct", label: "Direct", maxMembers: 2 })),
    myRole: vi.fn(async () => "member"),
    canPost: vi.fn(async () => true),
    messages: vi.fn(async () => ({ messages: [msg(1, SAM)], hasEarlier: false })),
    message: vi.fn(async () => null),
    subscribeConversation: vi.fn((_id: string, _me: string, h: ConversationHandlers) => {
      onHandlers?.(h);
      return sub;
    }),
    subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })),
    markRead: vi.fn(async () => 0),
    pins: vi.fn(async () => []),
    fileUrls: vi.fn(async () => ({})),
    ...over,
  } as unknown as ChatClient;
}

function scrollingList() {
  const seen: Record<string, unknown>[] = [];
  const List = forwardRef<unknown, Record<string, unknown>>(function List(props, ref) {
    seen.push(props);
    useImperativeHandle(ref, () => ({ scrollToIndex: vi.fn(), scrollToEnd: vi.fn(), scrollToOffset: vi.fn() }));
    return null;
  });
  return { List, last: () => seen.at(-1)! };
}

function wrap(client: ChatClient, children: ReactNode, opts: { list?: unknown; modules?: ChatNativeModules } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <GenesisModulesProvider modules={opts.list ? { list: opts.list as never } : {}}>
        <ChatProvider client={client} userId={ME}>
          <NativeToastProvider>
            <ChatNativeProvider modules={opts.modules}>{children}</ChatNativeProvider>
          </NativeToastProvider>
        </ChatProvider>
      </GenesisModulesProvider>
    </QueryClientProvider>
  );
}

describe("the thread when nothing could be read", () => {
  it("shows an error with Retry, not 'No messages yet', and Retry reads again", async () => {
    let fail = true;
    const messages = vi.fn(async () => {
      if (fail) throw new Error("offline");
      return { messages: [msg(1, SAM)], hasEarlier: false };
    });
    const list = scrollingList();
    render(wrap(fakeClient({ messages }), <ChatThreadScreen conversationId={CONV} testID="t" />, { list: list.List }));
    await waitFor(() => expect(screen.getByTestId("t-load-error")).toBeTruthy());
    expect(screen.queryByTestId("t-empty")).toBeNull();
    fail = false;
    await act(async () => fireEvent.click(screen.getByTestId("t-load-error-retry")));
    await waitFor(() => expect((list.last().data as unknown[] | undefined)?.length).toBeGreaterThan(0));
    expect(screen.queryByTestId("t-load-error")).toBeNull();
  });
});

describe("the thread's connection line", () => {
  it("reads offline first, then a dropped channel, else nothing", () => {
    expect(connectionState(false, true)).toBe("offline");
    expect(connectionState(true, false)).toBe("connecting");
    expect(connectionState(null, null)).toBe("online");
    expect(connectionState(true, true)).toBe("online");
  });

  it("says Waiting for network while NetInfo says offline, and Connecting when the live channel drops", async () => {
    let netListener: ((s: { isConnected: boolean | null }) => void) | null = null;
    const netInfo: NetInfoLike = { addEventListener: (l) => ((netListener = l), () => undefined) };
    let handlers: ConversationHandlers | null = null;
    render(wrap(fakeClient({}, (h) => (handlers = h)), <ChatThreadScreen conversationId={CONV} testID="t" />, { modules: { netInfo } as ChatNativeModules }));
    await waitFor(() => expect(handlers).not.toBeNull());
    expect(screen.queryByTestId("t-connection")).toBeNull();
    act(() => netListener!({ isConnected: false }));
    expect(screen.getByTestId("t-connection").textContent).toBe("Waiting for network…");
    act(() => netListener!({ isConnected: true }));
    act(() => handlers!.onLive?.(false));
    expect(screen.getByTestId("t-connection").textContent).toBe("Connecting…");
    act(() => handlers!.onLive?.(true));
    expect(screen.queryByTestId("t-connection")).toBeNull();
  });
});

describe("the new messages pill", () => {
  it("counts others' messages that came after you scrolled up", () => {
    const ms = [msg(1, SAM), msg(2, ME), msg(3, SAM), msg(4, SAM)];
    expect(countUnseenBelow(ms, null, ME)).toBe(0);
    expect(countUnseenBelow(ms, 1, ME)).toBe(2);
    expect(countUnseenBelow(ms, 4, ME)).toBe(0);
  });

  it("shows while you're scrolled up and new messages came in, and goes to the newest", async () => {
    let handlers: ConversationHandlers | null = null;
    const message = vi.fn(async (id: string) => (id === "m2" ? msg(2, SAM) : null));
    const list = scrollingList();
    render(wrap(fakeClient({ message }, (h) => (handlers = h)), <ChatThreadScreen conversationId={CONV} testID="t" />, { list: list.List }));
    await waitFor(() => expect((list.last().data as unknown[] | undefined)?.length).toBeGreaterThan(0));
    act(() => (list.last().onScroll as (e: unknown) => void)({ nativeEvent: { contentOffset: { y: 0 }, contentSize: { height: 3000 }, layoutMeasurement: { height: 600 } } }));
    expect(screen.queryByTestId("t-new-below")).toBeNull();
    await act(async () => handlers!.onSignal({ type: "message", conversationId: CONV, id: "m2", seq: 2, op: "insert" } as never));
    await waitFor(() => expect(screen.getByTestId("t-new-below").getAttribute("aria-label")).toBe("1 new message"));
    fireEvent.click(screen.getByTestId("t-new-below"));
    await waitFor(() => expect(screen.queryByTestId("t-new-below")).toBeNull());
  });
});

describe("what an app can add without forking the screen", () => {
  it("draws its header strip above the messages and its tools over the composer, with the composer", async () => {
    const accessory = vi.fn(({ canPost }: { canPost: boolean | null }) => <Text testID="tools">{String(canPost)}</Text>);
    render(wrap(fakeClient(), <ChatThreadScreen conversationId={CONV} header={<Text testID="strip">Client</Text>} accessory={accessory} testID="t" />));
    expect(screen.getByTestId("strip")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("tools").textContent).toBe("true"));
    expect(accessory.mock.calls.at(-1)![0]).toMatchObject({ conversationId: CONV, composer: expect.objectContaining({ dispatch: expect.any(Function) }) });
  });

  it("doesn't mark the thread read while it isn't active, and does once it is", async () => {
    const client = fakeClient();
    const { rerender } = render(wrap(client, <ChatThreadScreen conversationId={CONV} active={false} testID="t" />));
    await waitFor(() => expect(client.messages).toHaveBeenCalled());
    await act(async () => undefined);
    expect(client.markRead).not.toHaveBeenCalled();
    rerender(wrap(client, <ChatThreadScreen conversationId={CONV} active testID="t" />));
    await waitFor(() => expect(client.markRead).toHaveBeenCalled());
  });
});

describe("a long press on a bubble", () => {
  it("taps a medium impact as the menu opens", async () => {
    const haptics = { impactAsync: vi.fn(async () => undefined), selectionAsync: vi.fn(async () => undefined), notificationAsync: vi.fn(async () => undefined), ImpactFeedbackStyle: { Light: "l", Medium: "m" }, NotificationFeedbackType: { Success: 1, Warning: 2, Error: 3 } };
    // No list module: FlatList draws the rows.
    render(wrap(fakeClient(), <ChatThreadScreen conversationId={CONV} testID="t" />, { modules: { haptics } as unknown as ChatNativeModules }));
    const bubble = await screen.findByTestId("t-message-m1-bubble");
    act(() => {
      fireEvent.contextMenu(bubble);
    });
    await waitFor(() => expect(haptics.impactAsync).toHaveBeenCalledWith("m"));
  });
});

describe("another conversation in the same screen", () => {
  it("opens at its own first unread, not the last one's read place", async () => {
    const OTHER = "44444444-4444-4444-8444-444444444444";
    const client = fakeClient({
      members: vi.fn(async (id: string) => [
        { conversationId: id, userId: ME, role: "member", lastReadSeq: id === CONV ? 1 : 2, joinedAt: "2026-10-01T00:00:00Z" },
        { conversationId: id, userId: SAM, role: "member", lastReadSeq: 9, joinedAt: "2026-10-01T00:00:00Z" },
      ]),
      messages: vi.fn(async (id: string) => ({ messages: [msg(1, SAM), msg(2, SAM), msg(3, SAM)].map((m) => ({ ...m, id: `${id === CONV ? "a" : "b"}${m.seq}`, conversationId: id })), hasEarlier: false })),
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ChatProvider client={client} userId={ME}>{children}</ChatProvider>
      </QueryClientProvider>
    );
    const { result, rerender } = renderHook(({ id }) => useConversation(id, { markRead: false }), { wrapper, initialProps: { id: CONV } });
    await waitFor(() => expect(result.current.firstUnreadId).toBe("a2"));
    rerender({ id: OTHER });
    await waitFor(() => expect(result.current.firstUnreadId).toBe("b3"));
  });
});
