// @vitest-environment happy-dom
// @feat:chat
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { AccessibilityInfo } from "react-native";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenesisModulesProvider, NativeToastProvider } from "@marktiderman/genesis-ui-native/components";
import type { ChatClient } from "../../core/client";
import type { ChatMessage } from "../../core/types";
import { ChatProvider, useMessageActions } from "../../react/index";
import { chatNativeCopy } from "../copy";
import { ChatNativeProvider } from "../context";
import type { ThreadRow } from "../rows";
import { nearBottom, ChatThreadScreen, threadListMode } from "../thread-screen";

vi.mock("react-native", async (original) => ({ ...(await original<object>()), useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) }));

afterEach(cleanup);

const ME = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";
const CONV = "33333333-3333-4333-8333-333333333333";

function msg(seq: number, senderId: string, createdAt: string): ChatMessage {
  return {
    id: `m${seq}`, conversationId: CONV, seq, clientId: `c${seq}`, senderId, senderRole: "member", kind: "text", body: `body ${seq}`,
    mentions: [], replyToId: null, threadRootId: null, threadCount: 0, threadLastAt: null, topic: null, visibility: "everyone",
    silent: false, meta: {}, createdAt, editedAt: null, deletedAt: null, attachments: [], reactions: [],
  } as ChatMessage;
}

function fakeClient(messages: ChatMessage[], lastReadSeq: number): ChatClient {
  const sub = { unsubscribe: vi.fn(), typing: vi.fn(), recording: vi.fn(), send: vi.fn() };
  return {
    conversation: vi.fn(async () => ({ id: CONV, kind: "direct", title: null, settings: {}, status: "open", archivedAt: null })),
    members: vi.fn(async () => [
      { conversationId: CONV, userId: ME, role: "member", lastReadSeq, joinedAt: "2026-10-01T00:00:00Z" },
      { conversationId: CONV, userId: SAM, role: "member", lastReadSeq: 9, joinedAt: "2026-10-01T00:00:00Z" },
    ]),
    kind: vi.fn(async () => ({ kind: "direct", label: "Direct", maxMembers: 2 })),
    myRole: vi.fn(async () => "member"),
    canPost: vi.fn(async () => true),
    messages: vi.fn(async () => ({ messages, hasEarlier: true })),
    message: vi.fn(async () => null),
    subscribeConversation: vi.fn(() => sub),
    subscribeInbox: vi.fn(() => ({ unsubscribe: vi.fn() })),
    markRead: vi.fn(async () => 0),
    pins: vi.fn(async () => []),
    fileUrls: vi.fn(async () => ({})),
  } as unknown as ChatClient;
}

/** A list that records what it was given (the app's FlashList, as GenesisNativeApp passes it). */
function recordingList() {
  const seen: { props: Record<string, unknown> }[] = [];
  function List(props: Record<string, unknown>) {
    seen.push({ props });
    return null;
  }
  return { List, last: () => seen.at(-1)!.props };
}

function wrap(client: ChatClient, list: unknown, children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <GenesisModulesProvider modules={{ list: list as never }}>
        <ChatProvider client={client} userId={ME}>
          <NativeToastProvider>
            <ChatNativeProvider>{children}</ChatNativeProvider>
          </NativeToastProvider>
        </ChatProvider>
      </GenesisModulesProvider>
    </QueryClientProvider>
  );
}

describe("ChatThreadScreen's list", () => {
  it("is oldest first and upright, so VoiceOver reads each day's heading and the New messages line before their messages", async () => {
    const messages = [msg(1, SAM, "2026-10-23T09:00:00Z"), msg(2, ME, "2026-10-23T09:01:00Z"), msg(3, SAM, "2026-10-24T10:00:00Z"), msg(4, SAM, "2026-10-24T10:01:00Z")];
    const list = recordingList();
    render(wrap(fakeClient(messages, 3), list.List, <ChatThreadScreen conversationId={CONV} />));
    await waitFor(() => expect((list.last().data as ThreadRow[] | undefined)?.some((r) => r.type === "unread")).toBe(true));
    const rows = list.last().data as ThreadRow[];
    const shape = rows.map((r) => (r.type === "message" ? (r.item.type === "message" ? r.item.message.id : "pending") : r.type));
    expect(shape).toEqual(["day", "m1", "m2", "day", "m3", "unread", "m4"]);
    expect(list.last().inverted).toBeFalsy();
  });

  it("uses FlashList's bottom-anchored chat mode, never the autoscrollToTopThreshold FlashList 2 ignores, and loads earlier at the top", async () => {
    const list = recordingList();
    render(wrap(fakeClient([msg(1, SAM, "2026-10-24T10:00:00Z")], 0), list.List, <ChatThreadScreen conversationId={CONV} />));
    await waitFor(() => expect((list.last().data as ThreadRow[] | undefined)?.length).toBeGreaterThan(0));
    const mvcp = list.last().maintainVisibleContentPosition as Record<string, unknown>;
    expect(mvcp).toMatchObject({ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 });
    expect(mvcp).not.toHaveProperty("autoscrollToTopThreshold");
    expect(typeof list.last().onStartReached).toBe("function");
    expect(list.last().onEndReached).toBeUndefined();
    // "Load earlier" sits at the top, over the oldest message.
    expect(list.last().ListHeaderComponent).toBeTruthy();
  });
});

/** A list that also takes the thread's scroll calls through its ref. */
function scrollingList() {
  const seen: Record<string, unknown>[] = [];
  const scrollToIndex = vi.fn();
  const List = forwardRef<unknown, Record<string, unknown>>(function List(props, ref) {
    seen.push(props);
    useImperativeHandle(ref, () => ({ scrollToIndex, scrollToEnd: vi.fn(), scrollToOffset: vi.fn() }));
    return null;
  });
  return { List, scrollToIndex, last: () => seen.at(-1)! };
}

describe("ChatThreadScreen's jump to a message", () => {
  const messages = [msg(1, SAM, "2026-10-24T10:00:00Z"), msg(2, ME, "2026-10-24T10:01:00Z"), msg(3, SAM, "2026-10-24T10:02:00Z")];

  it("goes to a message by its server id (rows are keyed by client id), centred, and says whose it is", async () => {
    const announce = vi.fn();
    (AccessibilityInfo as { announceForAccessibility?: unknown }).announceForAccessibility = announce;
    const list = scrollingList();
    render(wrap(fakeClient(messages, 3), list.List, <ChatThreadScreen conversationId={CONV} jumpTo={{ messageId: "m2", seq: 2 }} />));
    await waitFor(() => expect(list.scrollToIndex).toHaveBeenCalled());
    const { index, viewPosition } = list.scrollToIndex.mock.calls.at(-1)![0] as { index: number; viewPosition: number };
    const row = (list.last().data as ThreadRow[])[index]!;
    expect(row.key).toBe("c:c2");
    expect(row.type === "message" && row.item.type === "message" ? row.item.message.id : null).toBe("m2");
    expect(viewPosition).toBe(0.5);
    expect(announce).toHaveBeenCalledWith("Message from You: body 2");
  });

  it("says so when the message isn't there and there's no seq to load back to", async () => {
    const list = scrollingList();
    render(wrap(fakeClient(messages, 3), list.List, <ChatThreadScreen conversationId={CONV} jumpTo={{ messageId: "m9" }} />));
    expect(await screen.findByText("That message isn't here any more", {}, { timeout: 2000 })).toBeTruthy();
    expect(list.scrollToIndex).not.toHaveBeenCalled();
  });
});

describe("ChatThreadScreen's jump when it can't load back", () => {
  it("says the load failed, not that the message is gone", async () => {
    const list = scrollingList();
    const client = fakeClient([msg(5, SAM, "2026-10-24T10:00:00Z")], 5);
    (client.messages as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ messages: [msg(5, SAM, "2026-10-24T10:00:00Z")], hasEarlier: true }).mockRejectedValue(new Error("offline"));
    render(wrap(client, list.List, <ChatThreadScreen conversationId={CONV} jumpTo={{ messageId: "m2", seq: 2 }} />));
    expect(await screen.findByText(chatNativeCopy.actionFailed, {}, { timeout: 2000 })).toBeTruthy();
    await act(async () => void (await new Promise((r) => setTimeout(r, 600))));
    expect(screen.queryByText(chatNativeCopy.messageGone)).toBeNull();
  });

  it("with a deep link and a first page that failed: says the read failed, never gone, and goes there once rows come", async () => {
    const list = scrollingList();
    const client = fakeClient([msg(1, SAM, "2026-10-24T10:00:00Z"), msg(2, ME, "2026-10-24T10:01:00Z")], 3);
    (client.messages as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("offline"));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <GenesisModulesProvider modules={{ list: list.List as never }}>
          <ChatProvider client={client} userId={ME}>
            <NativeToastProvider>
              <ChatNativeProvider>
                <ChatThreadScreen conversationId={CONV} jumpTo={{ messageId: "m2" }} />
              </ChatNativeProvider>
            </NativeToastProvider>
          </ChatProvider>
        </GenesisModulesProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(chatNativeCopy.actionFailed, {}, { timeout: 2000 })).toBeTruthy();
    await act(async () => void (await new Promise((r) => setTimeout(r, 600))));
    expect(screen.queryByText(chatNativeCopy.messageGone)).toBeNull();
    expect(list.scrollToIndex).not.toHaveBeenCalled();
    await act(async () => void (await qc.refetchQueries()));
    await waitFor(() => expect(list.scrollToIndex).toHaveBeenCalled());
    expect(screen.queryByText(chatNativeCopy.messageGone)).toBeNull();
  });

  it("keeps a deep link through a failed first page even with a message of yours waiting to send", async () => {
    const list = scrollingList();
    const client = fakeClient([msg(1, SAM, "2026-10-24T10:00:00Z"), msg(2, ME, "2026-10-24T10:01:00Z")], 3);
    (client.messages as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("offline"));
    (client as unknown as { send: unknown }).send = vi.fn(() => new Promise(() => undefined));
    render(wrap(client, list.List, <ChatThreadScreen conversationId={CONV} jumpTo={{ messageId: "m2" }} testID="t" />));
    await screen.findByText(chatNativeCopy.actionFailed, {}, { timeout: 2000 });
    const input = await screen.findByTestId("t-composer-input");
    await waitFor(() => expect(input.hasAttribute("disabled")).toBe(false));
    fireEvent.change(input, { target: { value: "Still here" } });
    fireEvent.click(screen.getByTestId("t-composer-send"));
    await waitFor(() => expect((list.last().data as ThreadRow[] | undefined)?.some((r) => r.type === "message")).toBe(true));
    await act(async () => void (await new Promise((r) => setTimeout(r, 600))));
    expect(screen.queryByText(chatNativeCopy.messageGone)).toBeNull();
  });

  it("finds a deleted message: its tombstone is a row", async () => {
    const list = scrollingList();
    const deleted = { ...msg(2, SAM, "2026-10-24T10:01:00Z"), deletedAt: "2026-10-24T11:00:00Z" } as ChatMessage;
    render(wrap(fakeClient([msg(1, SAM, "2026-10-24T10:00:00Z"), deleted], 3), list.List, <ChatThreadScreen conversationId={CONV} jumpTo={{ messageId: "m2", seq: 2 }} />));
    await waitFor(() => expect(list.scrollToIndex).toHaveBeenCalled());
    expect(screen.queryByText(chatNativeCopy.messageGone)).toBeNull();
  });
});

describe("threadListMode", () => {
  it("follows new rows by hand only on FlatList, which keeps its place for earlier rows", () => {
    expect(threadListMode(true, false)).toMatchObject({ followsByHand: false });
    expect(threadListMode(true, true).maintainVisibleContentPosition).toMatchObject({ animateAutoScrollToBottom: false });
    expect(threadListMode(false, false)).toEqual({ followsByHand: true, maintainVisibleContentPosition: { minIndexForVisible: 0 } });
  });

  it("counts a position within the slack of the end as the bottom", () => {
    const at = (y: number) => ({ contentOffset: { y }, contentSize: { height: 2000 }, layoutMeasurement: { height: 800 } });
    expect(nearBottom(at(1200))).toBe(true);
    expect(nearBottom(at(1100))).toBe(true);
    expect(nearBottom(at(900))).toBe(false);
  });
});

/** A list that draws its rows and footer, so the bubbles' status and the typing bubble render. */
function drawingList() {
  function List(props: Record<string, unknown>) {
    const data = (props.data as unknown[] | undefined) ?? [];
    const renderItem = props.renderItem as (info: { item: unknown; index: number }) => ReactNode;
    return (
      <>
        {data.map((item, index) => (
          <div key={(item as ThreadRow).key}>{renderItem({ item, index })}</div>
        ))}
        {props.ListFooterComponent as ReactNode}
      </>
    );
  }
  return { List };
}

const LEE = "44444444-4444-4444-8444-444444444444";

function receiptsClient(messages: ChatMessage[], others: { userId: string; lastReadSeq: number; lastReadAt?: string | null }[], maxMembers: number | null = 2) {
  const handlers: { onSignal?: (s: unknown) => void; onActivity?: (a: unknown) => void } = {};
  const client = {
    ...fakeClient(messages, 99),
    members: vi.fn(async () => [
      { conversationId: CONV, userId: ME, role: "member", lastReadSeq: 99, lastReadAt: null, joinedAt: "2026-10-01T00:00:00Z" },
      ...others.map((o) => ({ conversationId: CONV, role: "member", joinedAt: "2026-10-01T00:00:00Z", lastReadAt: null, ...o })),
    ]),
    kind: vi.fn(async () => ({ kind: "direct", label: "Direct", maxMembers })),
    subscribeConversation: vi.fn((_id: string, _me: string, h: typeof handlers) => {
      Object.assign(handlers, h);
      return { unsubscribe: vi.fn(), signal: vi.fn() };
    }),
  } as unknown as ChatClient;
  return { client, handlers };
}

describe("ChatThreadScreen's message status", () => {
  const today = new Date();
  today.setHours(9, 41, 0, 0);
  const sentAt = new Date(today.getTime() - 60_000).toISOString();
  const messages = [msg(1, SAM, sentAt), msg(2, ME, sentAt)];

  it("shows Read with the time under the last message you sent once the other person's lastReadSeq reaches it", async () => {
    const { client } = receiptsClient(messages, [{ userId: SAM, lastReadSeq: 2, lastReadAt: today.toISOString() }]);
    render(wrap(client, drawingList().List, <ChatThreadScreen conversationId={CONV} />));
    const receipt = await screen.findByTestId("chat-thread-message-m2-receipt", {}, { timeout: 2000 });
    expect(receipt.textContent).toBe(`Read ${today.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`);
    expect(screen.queryByTestId("chat-thread-message-m1-receipt")).toBeNull();
  });

  it("turns Delivered into Read when the live read hint comes, from the members read again", async () => {
    const sam = { userId: SAM, lastReadSeq: 1 };
    const { client, handlers } = receiptsClient(messages, [sam]);
    render(wrap(client, drawingList().List, <ChatThreadScreen conversationId={CONV} />));
    await waitFor(() => expect(screen.getByTestId("chat-thread-message-m2-receipt").textContent).toBe("Delivered"), { timeout: 2000 });
    sam.lastReadSeq = 2;
    act(() => handlers.onSignal?.({ type: "read", conversationId: CONV, userId: SAM, seq: 2, at: null }));
    await waitFor(() => expect(screen.getByTestId("chat-thread-message-m2-receipt").textContent).toBe("Read"));
  });

  it("never takes a read hint's payload as the read place: a forged one changes nothing", async () => {
    const { client, handlers } = receiptsClient(messages, [{ userId: SAM, lastReadSeq: 1 }]);
    render(wrap(client, drawingList().List, <ChatThreadScreen conversationId={CONV} />));
    await waitFor(() => expect(screen.getByTestId("chat-thread-message-m2-receipt").textContent).toBe("Delivered"), { timeout: 2000 });
    const fetches = vi.mocked(client.members).mock.calls.length;
    act(() => handlers.onSignal?.({ type: "read", conversationId: CONV, userId: SAM, seq: 1_000_000, at: "2026-01-01T09:41:00Z" }));
    act(() => handlers.onSignal?.({ type: "read", conversationId: CONV, userId: SAM, seq: 1_000_001, at: null }));
    await waitFor(() => expect(vi.mocked(client.members).mock.calls.length).toBe(fetches + 1));
    expect(screen.getByTestId("chat-thread-message-m2-receipt").textContent).toBe("Delivered");
  });

  it("reads the members again when a message of yours is deleted elsewhere (receipts count against your latest)", async () => {
    const { client, handlers } = receiptsClient(messages, [{ userId: SAM, lastReadSeq: 1 }]);
    render(wrap(client, drawingList().List, <ChatThreadScreen conversationId={CONV} />));
    await waitFor(() => expect(screen.getByTestId("chat-thread-message-m2-receipt").textContent).toBe("Delivered"), { timeout: 2000 });
    const fetches = vi.mocked(client.members).mock.calls.length;
    vi.mocked(client.message).mockResolvedValue({ ...messages[1]!, deletedAt: "2026-11-25T09:00:00Z" });
    await act(async () => handlers.onSignal?.({ type: "message", conversationId: CONV, id: "m2", seq: 2, op: "update" }));
    await waitFor(() => expect(vi.mocked(client.members).mock.calls.length).toBeGreaterThan(fetches));
  });

  it("doesn't for someone else's message", async () => {
    const { client, handlers } = receiptsClient(messages, [{ userId: SAM, lastReadSeq: 1 }]);
    render(wrap(client, drawingList().List, <ChatThreadScreen conversationId={CONV} />));
    await waitFor(() => expect(screen.getByTestId("chat-thread-message-m2-receipt").textContent).toBe("Delivered"), { timeout: 2000 });
    const fetches = vi.mocked(client.members).mock.calls.length;
    vi.mocked(client.message).mockResolvedValue({ ...messages[0]!, deletedAt: "2026-11-25T09:00:00Z" });
    await act(async () => handlers.onSignal?.({ type: "message", conversationId: CONV, id: "m1", seq: 1, op: "update" }));
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(vi.mocked(client.members).mock.calls.length).toBe(fetches);
  });

  it("reads the members again when you delete your latest message here", async () => {
    const { client } = receiptsClient(messages, [{ userId: SAM, lastReadSeq: 1 }]);
    (client as unknown as { remove: unknown }).remove = vi.fn(async () => undefined);
    let actions: ReturnType<typeof useMessageActions> | null = null;
    function Grab() {
      actions = useMessageActions();
      return null;
    }
    render(wrap(client, drawingList().List, <><ChatThreadScreen conversationId={CONV} /><Grab /></>));
    await waitFor(() => expect(screen.getByTestId("chat-thread-message-m2-receipt").textContent).toBe("Delivered"), { timeout: 2000 });
    const fetches = vi.mocked(client.members).mock.calls.length;
    await act(async () => actions!.remove(messages[1]!));
    await waitFor(() => expect(vi.mocked(client.members).mock.calls.length).toBeGreaterThan(fetches));
  });

  it('hides it with receipts="hide"', async () => {
    const { client } = receiptsClient(messages, [{ userId: SAM, lastReadSeq: 2 }]);
    render(wrap(client, drawingList().List, <ChatThreadScreen conversationId={CONV} receipts="hide" />));
    await screen.findByTestId("chat-thread-message-m2", {}, { timeout: 2000 });
    expect(screen.queryByTestId("chat-thread-message-m2-receipt")).toBeNull();
  });

  it("in a group, says Read by N, and tapping it lists who", async () => {
    const { client } = receiptsClient(messages, [{ userId: SAM, lastReadSeq: 2 }, { userId: LEE, lastReadSeq: 1 }], null);
    render(wrap(client, drawingList().List, <ChatThreadScreen conversationId={CONV} />));
    await waitFor(() => expect(screen.getByTestId("chat-thread-message-m2-receipt").textContent).toBe("Read by 1"), { timeout: 2000 });
    fireEvent.click(screen.getByTestId("chat-thread-message-m2-receipt"));
    expect(await screen.findByTestId(`chat-thread-readers-${SAM}`)).toBeTruthy();
    expect(screen.queryByTestId(`chat-thread-readers-${LEE}`)).toBeNull();
  });
});

describe("ChatThreadScreen's typing", () => {
  it("draws someone typing as a bubble of dots at the bottom of the thread, read out as the activity line", async () => {
    const { client, handlers } = receiptsClient([msg(1, SAM, "2026-11-22T09:00:00Z")], [{ userId: SAM, lastReadSeq: 1 }]);
    render(wrap(client, drawingList().List, <ChatThreadScreen conversationId={CONV} />));
    await screen.findByTestId("chat-thread-message-m1", {}, { timeout: 2000 });
    expect(screen.queryByTestId("chat-thread-typing")).toBeNull();
    act(() => handlers.onActivity?.({ userId: SAM, activity: "typing", at: Date.now() }));
    const bubble = await screen.findByTestId("chat-thread-typing");
    expect(bubble.getAttribute("aria-label")).toMatch(/is typing…$/);
    expect(screen.getByTestId("chat-thread-typing-dot-2")).toBeTruthy();
    expect(screen.queryByTestId("chat-thread-activity")).toBeNull();
  });

  it("keeps the words for someone recording a voice note", async () => {
    const { client, handlers } = receiptsClient([msg(1, SAM, "2026-11-22T09:00:00Z")], [{ userId: SAM, lastReadSeq: 1 }]);
    render(wrap(client, drawingList().List, <ChatThreadScreen conversationId={CONV} />));
    await screen.findByTestId("chat-thread-message-m1", {}, { timeout: 2000 });
    act(() => handlers.onActivity?.({ userId: SAM, activity: "recording-voice", at: Date.now() }));
    expect((await screen.findByTestId("chat-thread-activity")).textContent).toMatch(/recording a voice message/);
    expect(screen.queryByTestId("chat-thread-typing")).toBeNull();
  });
});

describe("ChatThreadScreen's slots", () => {
  const at = new Date().toISOString();

  it("puts the app's own part under the header (nothing by default), and swaps a bubble for the app's own, given its props", async () => {
    const { client } = receiptsClient([msg(1, SAM, at)], [{ userId: SAM, lastReadSeq: 1 }]);
    const Below = ({ conversationId, testID }: { conversationId: string; testID: string }) => <span data-testid={testID}>{`pill ${conversationId}`}</span>;
    const Bubble = ({ testID, row }: { testID: string; row: { mine: boolean } }) => <span data-testid={testID}>{row.mine ? "mine" : "theirs"}</span>;
    render(wrap(client, drawingList().List, <ChatThreadScreen conversationId={CONV} slots={{ belowHeader: Below, bubble: Bubble }} />));
    expect(screen.getByTestId("chat-thread-below-header").textContent).toBe(`pill ${CONV}`);
    expect((await screen.findByTestId("chat-thread-message-m1", {}, { timeout: 2000 })).textContent).toBe("theirs");
  });
});
